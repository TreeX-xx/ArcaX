'use client';

import { useEffect, useState } from 'react';
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
  Tooltip,
  Typography,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { BaseDialog } from '../common/BaseDialog';
import { sqliteApi, type SqliteCatalog, type SqliteTablePage } from '@/lib/tauri';
import { sqliteCellLabel } from '@/lib/sqlitePreview';
import { formatSize } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const PAGE_SIZE = 100;

interface SqlitePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  bucketName: string;
  bucketRegion: string;
  objectKey: string;
}

export default function SqlitePreviewDialog({
  open,
  onClose,
  bucketName,
  bucketRegion,
  objectKey,
}: SqlitePreviewDialogProps) {
  const { t } = useI18n();
  const [reload, setReload] = useState(0);
  const filename = objectKey.split('/').pop() || objectKey;

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
          <Chip label={t('SQLite')} size="small" sx={{ fontWeight: 600, fontSize: '0.65rem', height: 20 }} />
          <Chip
            label={t('Read-only')}
            size="small"
            variant="outlined"
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
      {open && (
        <SqliteBrowser
          key={`${objectKey}:${reload}`}
          bucketName={bucketName}
          bucketRegion={bucketRegion}
          objectKey={objectKey}
          onReload={() => setReload((value) => value + 1)}
        />
      )}
    </BaseDialog>
  );
}

function SqliteBrowser({
  bucketName,
  bucketRegion,
  objectKey,
  onReload,
}: {
  bucketName: string;
  bucketRegion: string;
  objectKey: string;
  onReload: () => void;
}) {
  const { t, locale } = useI18n();
  const [catalog, setCatalog] = useState<SqliteCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    sqliteApi
      .listTables(bucketName, bucketRegion, objectKey)
      .then((result) => {
        if (cancelled) return;
        setCatalog(result);
        setSelected(result.tables[0]?.name ?? null);
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
  }, [bucketName, bucketRegion, objectKey]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0 }}>
      {loading && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <CircularProgress size={36} />
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
            {t('Reading database...')}
          </Typography>
        </Box>
      )}

      {!loading && error && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Alert severity="error">{error}</Alert>
          <Box>
            <Button size="small" variant="outlined" onClick={onReload}>
              {t('Retry')}
            </Button>
          </Box>
        </Box>
      )}

      {!loading && !error && catalog && (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {t('{count} tables', { count: catalog.tables.length.toLocaleString(locale) })}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('{size} database', { size: formatSize(catalog.byte_size) })}
            </Typography>
            {catalog.truncated && (
              <Chip
                size="small"
                color="warning"
                label={t('Listing truncated')}
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            )}
            <Box sx={{ flex: 1 }} />
            <Tooltip title={t('Refresh')}>
              <IconButton size="small" onClick={onReload} aria-label={t('Refresh')}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
            <Box
              role="listbox"
              aria-label={t('Tables')}
              sx={{
                width: { xs: '100%', sm: 220 },
                maxHeight: { xs: 160, sm: 'none' },
                overflow: 'auto',
                flexShrink: 0,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.default',
              }}
            >
              {catalog.tables.length === 0 && (
                <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                  {t('No tables in this database')}
                </Typography>
              )}
              {catalog.tables.map((table) => {
                const active = table.name === selected;
                return (
                  <Button
                    key={`${table.kind}:${table.name}`}
                    role="option"
                    aria-selected={active}
                    fullWidth
                    onClick={() => {
                      setSelected(table.name);
                      setPage(0);
                    }}
                    sx={{
                      justifyContent: 'space-between',
                      gap: 1,
                      px: 1.5,
                      py: 1,
                      borderRadius: 0,
                      color: 'text.primary',
                      fontWeight: active ? 700 : 500,
                      bgcolor: active ? 'action.selected' : 'transparent',
                    }}
                  >
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
                      {table.name}
                      {table.kind === 'view' && (
                        <Box component="span" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 500, color: 'text.secondary' }}>
                          {t('SQL view')}
                        </Box>
                      )}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {table.row_count === null ? '—' : table.row_count.toLocaleString(locale)}
                    </Box>
                  </Button>
                );
              })}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {selected && (
                <SqliteRows
                  key={`${selected}:${page}`}
                  bucketName={bucketName}
                  bucketRegion={bucketRegion}
                  objectKey={objectKey}
                  table={selected}
                  page={page}
                  onPageChange={setPage}
                />
              )}
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}

function SqliteRows({
  bucketName,
  bucketRegion,
  objectKey,
  table,
  page,
  onPageChange,
}: {
  bucketName: string;
  bucketRegion: string;
  objectKey: string;
  table: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const [tablePage, setTablePage] = useState<SqliteTablePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    sqliteApi
      .readTable(bucketName, bucketRegion, objectKey, table, page * PAGE_SIZE, PAGE_SIZE)
      .then((result) => {
        if (!cancelled) setTablePage(result);
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
  }, [bucketName, bucketRegion, objectKey, table, page]);

  if (loading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={32} />
      </Box>
    );
  }
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (!tablePage) return null;

  const totalRows = tablePage.total_rows;
  const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  return (
    <>
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
        <Table stickyHeader size="small" aria-label={tablePage.name}>
          <TableHead>
            <TableRow>
              {tablePage.columns.map((column) => (
                <TableCell key={column.name} sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ fontWeight: 700 }}>{column.name}</Box>
                  {column.declared_type && (
                    <Box sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 500 }}>
                      {column.declared_type}
                    </Box>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {tablePage.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={Math.max(1, tablePage.columns.length)}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {t('No rows in this table')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {tablePage.rows.map((row, rowIndex) => (
              <TableRow key={`${tablePage.offset + rowIndex}`} hover>
                {row.map((cell, cellIndex) => (
                  <TableCell
                    key={`${tablePage.columns[cellIndex]?.name ?? cellIndex}`}
                    sx={{
                      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
                      fontSize: '0.8rem',
                      maxWidth: 360,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: cell.kind === 'null' ? 'text.disabled' : 'text.primary',
                    }}
                  >
                    {sqliteCellLabel(cell, t)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {totalRows > PAGE_SIZE && (
        <TablePagination
          component="div"
          count={totalRows}
          page={currentPage}
          onPageChange={(_, nextPage) => onPageChange(nextPage)}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
          sx={{ borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}
        />
      )}
    </>
  );
}
