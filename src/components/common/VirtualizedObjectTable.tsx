'use client';

import { memo, useMemo, useCallback } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Typography,
  Stack,
  Divider,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  Folder as FolderIcon,
  Image as ImageIcon,
  VideoFile as VideoIcon,
  AudioFile as AudioIcon,
  PictureAsPdf as PdfIcon,
  Code as CodeIcon,
  DataObject as JsonIcon,
  TextSnippet as TextIcon,
  InsertDriveFile as FileIcon,
  Archive as ArchiveIcon,
  Visibility as PreviewIcon,
  Edit as EditIcon,
  MoreVert as MoreVertIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { TableVirtuoso, type TableComponents } from 'react-virtuoso';
import { S3Object } from '@/lib/tauri';
import { formatDateTime, formatSize } from '@/lib/utils';
import { StyledCheckbox } from './StyledCheckbox';
import { compareSortable } from '@/lib/objectSort';
import { canObjectBeEdited, canObjectBePreviewed } from '@/lib/objectCapabilities';
import { useI18n } from '@/lib/i18n';

// Get extension - simple and fast
const getExt = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

// File icon lookup - cached for performance
const ICON_STYLES = { fontSize: 18 };
const ICON_MAP: Record<string, React.ReactNode> = {
  // Images
  jpg: <ImageIcon sx={{ color: '#6BBF7B', ...ICON_STYLES }} />,
  jpeg: <ImageIcon sx={{ color: '#6BBF7B', ...ICON_STYLES }} />,
  png: <ImageIcon sx={{ color: '#6BBF7B', ...ICON_STYLES }} />,
  gif: <ImageIcon sx={{ color: '#6BBF7B', ...ICON_STYLES }} />,
  webp: <ImageIcon sx={{ color: '#6BBF7B', ...ICON_STYLES }} />,
  svg: <ImageIcon sx={{ color: '#6BBF7B', ...ICON_STYLES }} />,
  ico: <ImageIcon sx={{ color: '#6BBF7B', ...ICON_STYLES }} />,
  // Videos
  mp4: <VideoIcon sx={{ color: '#A78BFA', ...ICON_STYLES }} />,
  webm: <VideoIcon sx={{ color: '#A78BFA', ...ICON_STYLES }} />,
  mov: <VideoIcon sx={{ color: '#A78BFA', ...ICON_STYLES }} />,
  avi: <VideoIcon sx={{ color: '#A78BFA', ...ICON_STYLES }} />,
  mkv: <VideoIcon sx={{ color: '#A78BFA', ...ICON_STYLES }} />,
  // Audio
  mp3: <AudioIcon sx={{ color: '#F0A36B', ...ICON_STYLES }} />,
  wav: <AudioIcon sx={{ color: '#F0A36B', ...ICON_STYLES }} />,
  ogg: <AudioIcon sx={{ color: '#F0A36B', ...ICON_STYLES }} />,
  flac: <AudioIcon sx={{ color: '#F0A36B', ...ICON_STYLES }} />,
  aac: <AudioIcon sx={{ color: '#F0A36B', ...ICON_STYLES }} />,
  // Documents
  pdf: <PdfIcon sx={{ color: '#E06C75', ...ICON_STYLES }} />,
  json: <JsonIcon sx={{ color: '#E5C07B', ...ICON_STYLES }} />,
  // Code
  js: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  ts: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  jsx: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  tsx: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  py: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  go: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  rs: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  java: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  cpp: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  c: <CodeIcon sx={{ color: '#61AFEF', ...ICON_STYLES }} />,
  // Text
  txt: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  md: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  log: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  csv: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  xml: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  html: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  css: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  yaml: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  yml: <TextIcon sx={{ color: '#8B95A5', ...ICON_STYLES }} />,
  // Archive
  zip: <ArchiveIcon sx={{ color: '#B08968', ...ICON_STYLES }} />,
  tar: <ArchiveIcon sx={{ color: '#B08968', ...ICON_STYLES }} />,
  gz: <ArchiveIcon sx={{ color: '#B08968', ...ICON_STYLES }} />,
  rar: <ArchiveIcon sx={{ color: '#B08968', ...ICON_STYLES }} />,
  '7z': <ArchiveIcon sx={{ color: '#B08968', ...ICON_STYLES }} />,
};

const FOLDER_ICON = <FolderIcon sx={{ color: '#D7A657', fontSize: 20 }} />;
const DEFAULT_FILE_ICON = <FileIcon sx={{ color: '#8B8B96', ...ICON_STYLES }} />;

const getIcon = (name: string, isFolder: boolean): React.ReactNode => {
  if (isFolder) return FOLDER_ICON;
  const ext = getExt(name);
  return ICON_MAP[ext] || DEFAULT_FILE_ICON;
};

// Row data type
interface RowData {
  key: string;
  name: string;
  isFolder: boolean;
  size: number;
  modified: string;
  modifiedTimestamp: number;
  storageClass: string;
}

// Context type for Virtuoso table
interface ContextType {
  selectedKeys: Set<string>;
  onSelect: (key: string, checked: boolean) => void;
  onNavigate: (prefix: string) => void;
  onPreview?: (key: string, size: number) => void;
  onEdit?: (key: string) => void;
  onMenuOpen: (event: React.MouseEvent<HTMLElement>, key: string, isFolder: boolean) => void;
}

interface Props {
  folders: string[];
  objects: S3Object[];
  folderTimestamps?: Record<string, string | null>;
  selectedKeys: Set<string>;
  sortField: 'name' | 'size' | 'date' | 'class';
  sortDirection: 'asc' | 'desc';
  isLoading: boolean;
  onNavigate: (prefix: string) => void;
  onSelect: (key: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onMenuOpen: (event: React.MouseEvent<HTMLElement>, key: string, isFolder: boolean) => void;
  onSortChange: (field: 'name' | 'size' | 'date' | 'class') => void;
  onDownload?: (key: string) => void;
  onDelete?: (key: string) => void;
  onPreview?: (key: string, size: number) => void;
  onEdit?: (key: string) => void;
  onCopyPath?: (key: string) => void;
  onEndReached?: () => void;
  isLoadingMore?: boolean;
}

type ScrollerProps = HTMLAttributes<HTMLDivElement> & { style?: CSSProperties };
type TableElementProps = HTMLAttributes<HTMLTableElement>;
type TableSectionProps = HTMLAttributes<HTMLTableSectionElement>;
type TableRowElementProps = HTMLAttributes<HTMLTableRowElement> & { item?: RowData };

const VirtuosoScroller = memo(function VirtuosoScroller({ style, ...props }: ScrollerProps) {
  return (
    <Box
      {...props}
      style={style}
      sx={{
        bgcolor: 'background.paper',
        '&::-webkit-scrollbar': { width: 6, height: 6 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.600', borderRadius: 3 },
        willChange: 'transform',
      }}
    />
  );
});

const VirtuosoTable = memo(function VirtuosoTable(props: TableElementProps) {
  return <Table {...props} size="small" sx={{ tableLayout: 'fixed', minWidth: '100%', bgcolor: 'background.paper' }} />;
});

const VirtuosoTableHead = memo(function VirtuosoTableHead(props: TableSectionProps) {
  return <TableHead {...props} sx={{ bgcolor: 'background.default' }} />;
});

const VirtuosoTableRow = memo(function VirtuosoTableRow({ item, ...props }: TableRowElementProps) {
  void item;
  return <TableRow hover {...props} sx={{ bgcolor: 'background.paper' }} />;
});

const VirtuosoTableBody = memo(function VirtuosoTableBody(props: TableSectionProps) {
  return <TableBody {...props} sx={{ bgcolor: 'background.paper' }} />;
});

// Lightweight table components with explicit backgrounds for WebKit
const VirtuosoComponents: TableComponents<RowData, ContextType> = {
  Scroller: VirtuosoScroller,
  Table: VirtuosoTable,
  TableHead: VirtuosoTableHead,
  TableRow: VirtuosoTableRow,
  TableBody: VirtuosoTableBody,
};

// Memoized row component for performance - prevents flickering on Ubuntu/WebKitGTK
const RowContent = memo(function RowContent({
  row,
  rowIndex,
  isSelected,
  onSelect,
  onNavigate,
  onPreview,
  onEdit,
  onMenuOpen,
}: {
  row: RowData;
  rowIndex: number;
  isSelected: boolean;
  onSelect: (key: string, checked: boolean) => void;
  onNavigate: (prefix: string) => void;
  onPreview?: (key: string, size: number) => void;
  onEdit?: (key: string) => void;
  onMenuOpen: (event: React.MouseEvent<HTMLElement>, key: string, isFolder: boolean) => void;
}) {
  const { t } = useI18n();
  const ext = getExt(row.name);
  const canPreview = !row.isFolder && canObjectBePreviewed(row.name);
  const canEdit = !row.isFolder && canObjectBeEdited(row.name);

  // Debounce checkbox to prevent rapid clicking
  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelect(row.key, e.target.checked);
  }, [onSelect, row.key]);

  return (
    <>
      {/* Row number column */}
      <TableCell sx={{ width: 40, py: 0.5, textAlign: 'center', color: 'text.secondary', fontSize: '0.75rem', fontFamily: 'monospace', bgcolor: 'background.paper' }}>
        {rowIndex + 1}
      </TableCell>
      <TableCell sx={{ width: 40, minWidth: 40, maxWidth: 40, p: 0, bgcolor: 'background.paper', textAlign: 'center', verticalAlign: 'middle' }}>
        <StyledCheckbox
          aria-label={t('Select {key}', { key: row.key })}
          checked={isSelected}
          onChange={handleCheckboxChange}
        />
      </TableCell>
      <TableCell sx={{ width: 32, py: 0.5, bgcolor: 'background.paper' }}>
        {getIcon(row.name, row.isFolder)}
      </TableCell>
      <TableCell 
        sx={{ 
          py: 0.5,
          cursor: row.isFolder ? 'pointer' : 'default',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          bgcolor: 'background.paper',
        }}
        onClick={row.isFolder ? () => onNavigate(row.key) : undefined}
      >
        <Typography 
          variant="body2" 
          component="span"
          sx={{ fontWeight: row.isFolder ? 600 : 400 }}
        >
          {row.name}{row.isFolder ? '/' : ''}
        </Typography>
        {ext && !row.isFolder && (
          <Typography 
            component="span" 
            sx={{ 
              ml: 1, 
              px: 0.5, 
              py: 0.1,
              fontSize: '0.65rem', 
              bgcolor: 'action.hover', 
              borderRadius: 0.5,
              fontWeight: 600,
            }}
          >
            {ext.toUpperCase()}
          </Typography>
        )}
      </TableCell>
      <TableCell align="right" sx={{ width: 80, py: 0.5, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap', bgcolor: 'background.paper' }}>
        {row.isFolder ? '—' : formatSize(row.size)}
      </TableCell>
      <TableCell align="right" sx={{ width: 150, py: 0.5, fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'nowrap', color: row.modified ? 'text.secondary' : 'text.disabled', bgcolor: 'background.paper' }}
        title={!row.modified && row.isFolder ? t('S3 folders have no timestamp unless a child object or folder marker exists') : undefined}
      >
        {row.modified || '—'}
      </TableCell>
      <TableCell sx={{ width: 80, py: 0.25, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', opacity: 0.7, '&:hover': { opacity: 1 } }}>
          {row.isFolder ? (
            <IconButton size="small" onClick={() => onNavigate(row.key)} sx={{ p: 0.5 }}>
              <OpenIcon sx={{ fontSize: 16 }} />
            </IconButton>
          ) : (
            <>
              {canPreview && onPreview && (
                <IconButton size="small" onClick={() => onPreview(row.key, row.size)} sx={{ p: 0.5 }} title={t('Preview')}>
                  <PreviewIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
              {canEdit && onEdit && (
                <IconButton size="small" onClick={() => onEdit(row.key)} sx={{ p: 0.5 }} title={t('Edit')}>
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </>
          )}
          <IconButton size="small" onClick={(e) => onMenuOpen(e, row.key, row.isFolder)} sx={{ p: 0.5 }}>
            <MoreVertIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </TableCell>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props changed
  return prevProps.isSelected === nextProps.isSelected &&
         prevProps.row.key === nextProps.row.key &&
         prevProps.rowIndex === nextProps.rowIndex &&
         prevProps.row.size === nextProps.row.size &&
         prevProps.row.modifiedTimestamp === nextProps.row.modifiedTimestamp;
});

export const VirtualizedObjectTable = memo(function VirtualizedObjectTable({
  folders = [],
  objects = [],
  folderTimestamps,
  selectedKeys,
  sortField,
  sortDirection,
  isLoading,
  onNavigate,
  onSelect,
  onSelectAll,
  onMenuOpen,
  onSortChange,
  onPreview,
  onEdit,
  onEndReached,
  isLoadingMore = false,
}: Props) {
  const { t } = useI18n();
  // Build rows - highly optimized
  const rows = useMemo<RowData[]>(() => {
    const result: RowData[] = [];
    
    // Add folders
    for (const prefix of folders) {
      const parts = prefix.split('/').filter(Boolean);
      const modifiedAt = folderTimestamps?.[prefix] ?? null;
      const modifiedTime = modifiedAt ? new Date(modifiedAt).getTime() : 0;
      result.push({
        key: prefix,
        name: parts[parts.length - 1] || prefix,
        isFolder: true,
        size: 0,
        modified: formatDateTime(modifiedAt),
        modifiedTimestamp: Number.isFinite(modifiedTime) ? modifiedTime : 0,
        storageClass: '',
      });
    }

    // Add files
    for (const obj of objects) {
      const parts = obj.key.split('/');
      const modifiedTime = obj.last_modified ? new Date(obj.last_modified).getTime() : 0;
      result.push({
        key: obj.key,
        name: parts[parts.length - 1] || obj.key,
        isFolder: false,
        size: obj.size,
        modified: formatDateTime(obj.last_modified),
        modifiedTimestamp: Number.isFinite(modifiedTime) ? modifiedTime : 0,
        storageClass: obj.storage_class || 'STANDARD',
      });
    }
    
    // Sort - folders first, then by field
    result.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      
      return compareSortable(a, b, sortField, sortDirection);
    });
    
    return result;
  }, [folders, objects, folderTimestamps, sortField, sortDirection]);

  // Header selection state should reflect only the rows visible in the current table view.
  const visibleSelectedCount = useMemo(
    () => rows.reduce((count, row) => count + (selectedKeys.has(row.key) ? 1 : 0), 0),
    [rows, selectedKeys]
  );
  const allSelected = rows.length > 0 && visibleSelectedCount === rows.length;
  const someSelected = visibleSelectedCount > 0 && visibleSelectedCount < rows.length;



  // Fixed header - memoized
  const headerContent = useCallback(() => (
    <TableRow sx={{ bgcolor: 'background.default' }}>
      <TableCell sx={{ width: 40, bgcolor: 'background.default', textAlign: 'center', fontWeight: 600, fontSize: '0.75rem' }}>#</TableCell>
      <TableCell sx={{ width: 40, minWidth: 40, maxWidth: 40, p: 0, bgcolor: 'background.default', textAlign: 'center', verticalAlign: 'middle' }}>
        <StyledCheckbox
          aria-label={t('Select all objects')}
          indeterminate={someSelected}
          checked={allSelected}
          onChange={(e) => onSelectAll(e.target.checked)}
        />
      </TableCell>
      <TableCell sx={{ width: 32, bgcolor: 'background.default' }} />
      <TableCell 
        sx={{ bgcolor: 'background.default', cursor: 'pointer', fontWeight: 600 }}
        onClick={() => onSortChange('name')}
      >
        {t('Name')} {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
      </TableCell>
      <TableCell 
        align="right"
        sx={{ width: 80, bgcolor: 'background.default', cursor: 'pointer', fontWeight: 600 }}
        onClick={() => onSortChange('size')}
      >
        {t('Size')} {sortField === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
      </TableCell>
      <TableCell
        align="right"
        sx={{ width: 150, bgcolor: 'background.default', cursor: 'pointer', fontWeight: 600 }}
        onClick={() => onSortChange('date')}
      >
        {t('Updated')} {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
      </TableCell>
      <TableCell sx={{ width: 80, bgcolor: 'background.default', textAlign: 'right' }}>{t('Actions')}</TableCell>
    </TableRow>
  ), [allSelected, someSelected, sortField, sortDirection, onSelectAll, onSortChange, t]);

  const context = useMemo<ContextType>(() => ({
    selectedKeys,
    onSelect,
    onNavigate,
    onPreview,
    onEdit,
    onMenuOpen,
  }), [selectedKeys, onSelect, onNavigate, onPreview, onEdit, onMenuOpen]);

  const rowContent = useCallback((index: number, row: RowData, ctx: ContextType) => (
    <RowContent
      key={row.key}
      row={row}
      rowIndex={index}
      isSelected={ctx.selectedKeys.has(row.key)}
      onSelect={ctx.onSelect}
      onNavigate={ctx.onNavigate}
      onPreview={ctx.onPreview}
      onEdit={ctx.onEdit}
      onMenuOpen={ctx.onMenuOpen}
    />
  ), []);

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      {/* Table Body Area */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {isLoading ? (
          <Table size="small" sx={{ tableLayout: 'fixed', minWidth: '100%' }}>
            <TableHead>{headerContent()}</TableHead>
            <TableBody>
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <CircularProgress size={32} />
                    <Typography variant="caption" color="text.secondary">{t('Loading...')}</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : rows.length === 0 ? (
          <Table size="small">
            <TableHead>{headerContent()}</TableHead>
            <TableBody>
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">{onEndReached ? t('More results are available. Load the next page.') : t('Empty folder')}</Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <TableVirtuoso
            data={rows}
            context={context}
            components={VirtuosoComponents}
            fixedHeaderContent={headerContent}
            itemContent={rowContent}
            style={{ height: '100%' }}
            overscan={20}
            increaseViewportBy={{ top: 100, bottom: 100 }}
            endReached={onEndReached}
          />
        )}
      </Box>

      {/* Persistent Footer */}
      <Box sx={{ 
        px: 2, 
        py: 0.75, 
        borderTop: 1, 
        borderColor: 'divider', 
        bgcolor: 'background.paper',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 32
      }}>
        <Stack direction="row" spacing={3} alignItems="center">
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="span" fontWeight={600} color="text.primary">{rows.length.toLocaleString()}</Box>
            <Box component="span" color="text.secondary">{t('items visible')}</Box>
          </Typography>

          <Divider orientation="vertical" flexItem sx={{ height: 12, my: 'auto' }} />

          <Stack direction="row" spacing={1.5}>
            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box component="span" fontWeight={600} color="text.secondary">{folders.length.toLocaleString()}</Box>
              <Box component="span" color="text.secondary">{t('folders')}</Box>
            </Typography>
            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box component="span" fontWeight={600} color="text.secondary">{objects.length.toLocaleString()}</Box>
              <Box component="span" color="text.secondary">{t('files')}</Box>
            </Typography>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          {onEndReached && (
            <Button size="small" onClick={onEndReached} disabled={isLoadingMore || isLoading}>
              {isLoadingMore ? t('Loading more...') : t('Load more')}
            </Button>
          )}
        </Stack>
      </Box>
    </Box>
  );
});
