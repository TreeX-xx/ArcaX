'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Refresh as RefreshIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { save } from '@tauri-apps/plugin-dialog';
import { BaseDialog } from '../common/BaseDialog';
import {
  archiveApi,
  type ArchiveEntry,
  type ArchiveEntryContent,
  type ArchiveListing,
} from '@/lib/tauri';
import { buildArchiveRows, type ArchiveRow } from '@/lib/archiveView';
import { formatSize } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/store/toastStore';

const PAGE_SIZE = 100;
const IMAGE_PREVIEW_BYTES = 10 * 1024 * 1024;
const TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif)$/i;

interface ArchivePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  bucketName: string;
  bucketRegion: string;
  objectKey: string;
  objectSize?: number;
}

export default function ArchivePreviewDialog({
  open,
  onClose,
  bucketName,
  bucketRegion,
  objectKey,
  objectSize,
}: ArchivePreviewDialogProps) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const [listing, setListing] = useState<ArchiveListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('');
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ArchiveEntry | null>(null);
  const [entryContent, setEntryContent] = useState<ArchiveEntryContent | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const filename = objectKey.split('/').pop() || objectKey;

  useEffect(() => {
    if (!open || !objectKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setListing(null);
    setFilter('');
    setCurrentPrefix('');
    setPage(0);
    setSelected(null);
    setEntryContent(null);
    setEntryError(null);

    archiveApi
      .list(bucketName, bucketRegion, objectKey)
      .then((result) => {
        if (!cancelled) setListing(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(String(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, bucketName, bucketRegion, objectKey, reload]);

  const rows = useMemo(
    () => (listing ? buildArchiveRows(listing.entries, currentPrefix, filter) : []),
    [listing, currentPrefix, filter]
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [currentPrefix, filter]);

  const breadcrumbs = useMemo(() => {
    const segments = currentPrefix.split('/').filter(Boolean);
    return segments.map((segment, index) => ({
      name: segment,
      path: `${segments.slice(0, index + 1).join('/')}/`,
    }));
  }, [currentPrefix]);

  const openEntry = async (entry: ArchiveEntry) => {
    setSelected(entry);
    setEntryContent(null);
    setEntryError(null);
    if (entry.unsafe_path || entry.encrypted || entry.is_symlink) {
      setEntryError(t('This entry cannot be previewed. Extract it to inspect it.'));
      return;
    }

    const maxBytes = IMAGE_EXTENSION.test(entry.path) ? IMAGE_PREVIEW_BYTES : TEXT_PREVIEW_BYTES;
    if (entry.size > maxBytes) {
      setEntryError(
        t('This entry is too large to preview ({size}). Extract it to inspect it.', {
          size: formatSize(entry.size),
        })
      );
      return;
    }

    setEntryLoading(true);
    try {
      const content = await archiveApi.readEntry(
        bucketName,
        bucketRegion,
        objectKey,
        entry.id,
        maxBytes
      );
      setEntryContent(content);
    } catch (readError) {
      setEntryError(String(readError));
    } finally {
      setEntryLoading(false);
    }
  };

  const handleRowOpen = (row: ArchiveRow) => {
    if (row.kind === 'dir') {
      setCurrentPrefix(row.path);
      setSelected(null);
      setEntryContent(null);
      setEntryError(null);
      return;
    }
    if (row.entry) void openEntry(row.entry);
  };

  const handleExtract = async () => {
    if (!selected) return;
    let destination: string | null = null;
    try {
      destination = await save({
        defaultPath: selected.path.split('/').pop() || 'entry',
        title: t('Extract entry'),
      });
    } catch (dialogError) {
      toast.error(t('Extraction failed'), String(dialogError));
      return;
    }
    if (!destination) return;

    setExtracting(true);
    try {
      const result = await archiveApi.extractEntry(
        bucketName,
        bucketRegion,
        objectKey,
        selected.id,
        destination
      );
      toast.success(
        t('Entry extracted'),
        t('Saved {size} to {path}', {
          size: formatSize(result.bytes_written),
          path: result.path,
        })
      );
    } catch (extractError) {
      toast.error(t('Extraction failed'), String(extractError));
    } finally {
      setExtracting(false);
    }
  };

  const goToRoot = () => {
    setCurrentPrefix('');
    setSelected(null);
    setEntryContent(null);
    setEntryError(null);
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Typography
            component="span"
            sx={{
              fontSize: '1.1rem',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {filename}
          </Typography>
          <Chip
            label="ZIP"
            size="small"
            sx={{ fontWeight: 600, fontSize: '0.65rem', height: 20 }}
          />
        </Box>
      }
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: '82vh',
          maxHeight: 1000,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
      sx={{
        '& .MuiDialogContent-root': {
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0 }}>
        {loading && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress size={36} />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {t('Reading archive contents...')}
            </Typography>
          </Box>
        )}

        {!loading && error && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="error">{error}</Alert>
            <Box>
              <Button size="small" variant="outlined" onClick={() => setReload((value) => value + 1)}>
                {t('Retry')}
              </Button>
            </Box>
          </Box>
        )}

        {!loading && !error && listing && !selected && (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t('{count} entries', { count: listing.entry_count.toLocaleString(locale) })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('{size} uncompressed', { size: formatSize(listing.total_uncompressed) })}
              </Typography>
              {objectSize !== undefined && (
                <Typography variant="caption" color="text.secondary">
                  {t('{size} archive', { size: formatSize(objectSize) })}
                </Typography>
              )}
              {listing.truncated && (
                <Chip
                  size="small"
                  color="warning"
                  label={t('Listing truncated')}
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                onClick={goToRoot}
                sx={{ minWidth: 0, color: currentPrefix ? 'text.secondary' : 'text.primary', fontWeight: 600 }}
              >
                {t('Archive root')}
              </Button>
              {breadcrumbs.map((crumb) => (
                <Box key={crumb.path} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography color="text.disabled">/</Typography>
                  <Button
                    size="small"
                    onClick={() => setCurrentPrefix(crumb.path)}
                    sx={{ minWidth: 0, color: 'text.primary', fontWeight: 600 }}
                  >
                    {crumb.name}
                  </Button>
                </Box>
              ))}
              <Box sx={{ flex: 1 }} />
              <TextField
                size="small"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('Filter entries')}
                sx={{ width: { xs: '100%', sm: 220 } }}
              />
              <Tooltip title={t('Refresh')}>
                <IconButton size="small" onClick={() => setReload((value) => value + 1)} aria-label={t('Refresh')}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            <TableContainer
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.default',
              }}
            >
              <Table stickyHeader size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '46%' }}>{t('Name')}</TableCell>
                    <TableCell align="right" sx={{ width: '14%' }}>{t('Size')}</TableCell>
                    <TableCell align="right" sx={{ width: '14%' }}>{t('Compressed')}</TableCell>
                    <TableCell sx={{ width: '16%' }}>{t('Modified')}</TableCell>
                    <TableCell sx={{ width: '10%' }}>{t('Method')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                          {t('No entries in this folder')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {pageRows.map((row) => (
                    <TableRow
                      key={`${row.kind}:${row.path}`}
                      hover
                      onClick={() => handleRowOpen(row)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                          {row.kind === 'dir' ? (
                            <FolderIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
                          ) : (
                            <FileIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
                          )}
                          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: row.kind === 'dir' ? 600 : 500 }}>
                            {row.name}
                          </Box>
                          {row.unsafe && (
                            <Tooltip title={t('Unsafe archive path')}>
                              <WarningIcon fontSize="small" sx={{ color: 'warning.main', flexShrink: 0 }} />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {formatSize(row.size)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                        {row.kind === 'file' && row.compressedSize > 0 ? formatSize(row.compressedSize) : '—'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                        {row.modified || '—'}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                        {row.method || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {rows.length > PAGE_SIZE && (
              <TablePagination
                component="div"
                count={rows.length}
                page={currentPage}
                onPageChange={(_, nextPage) => setPage(nextPage)}
                rowsPerPage={PAGE_SIZE}
                rowsPerPageOptions={[PAGE_SIZE]}
                sx={{ borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}
              />
            )}
          </>
        )}

        {!loading && !error && selected && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setSelected(null)}>
                {t('Back')}
              </Button>
              <Typography sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.path}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t('Size: {size}', { size: formatSize(selected.size) })}
              </Typography>
              {selected.compressed_size > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {t('Compressed: {size}', { size: formatSize(selected.compressed_size) })}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {t('Method: {method}', { method: selected.method })}
              </Typography>
            </Box>

            {entryLoading && (
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress size={32} />
              </Box>
            )}
            {!entryLoading && entryError && <Alert severity="warning">{entryError}</Alert>}
            {!entryLoading && entryContent?.is_text && (
              <Box
                component="pre"
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                  m: 0,
                  p: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'background.default',
                  fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
                  fontSize: '0.8rem',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {entryContent.text}
              </Box>
            )}
            {!entryLoading && entryContent?.data_base64 && (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: alpha(theme.palette.common.black, 0.2) }}>
                <Box
                  component="img"
                  alt={entryContent.path}
                  src={`data:${entryContent.content_type || 'application/octet-stream'};base64,${entryContent.data_base64}`}
                  sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </Box>
            )}
            {!entryLoading && entryContent && !entryContent.is_text && !entryContent.data_base64 && (
              <Alert severity="info">
                {t('Preview not available for this entry. Extract it to inspect it.')}
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExtract}
                disabled={extracting || selected.unsafe_path || selected.encrypted || selected.is_symlink}
              >
                {extracting ? t('Extracting...') : t('Extract')}
              </Button>
              {(selected.encrypted || selected.is_symlink || selected.unsafe_path) && (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  {t('This entry cannot be extracted safely.')}
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </BaseDialog>
  );
}
