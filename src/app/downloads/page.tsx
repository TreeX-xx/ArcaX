'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Button,
} from '@mui/material';
import type { ChipProps, LinearProgressProps } from '@mui/material';
import {
  CloudDownload as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Delete as DeleteIcon,

  FolderOpen as FolderOpenIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  Cancel as CancelIcon,
  Replay as ReplayIcon,
} from '@mui/icons-material';

import { useTransferStore } from '@/store/transferStore';
import { TransferJob } from '@/lib/tauri';
import { transferColumnWidths, transferTableSx } from '@/components/transfer/tableLayout';
import { CancelTransferButton } from '@/components/transfer/CancelTransferButton';
import { TransferActivityIcon } from '@/components/transfer/TransferActivityIcon';
import { formatTransferSpeed, transferSpeed, totalTransferSpeed } from '@/lib/transferSpeed';
import { useI18n } from '@/lib/i18n';

type Translate = (message: string, vars?: Record<string, string | number>) => string;

type StatusColor = NonNullable<ChipProps['color']>;
type ProgressColor = NonNullable<LinearProgressProps['color']>;
type TransferTableRow =
  | { id: string; isGroup: true; items: TransferJob[]; latest: number; name: string }
  | { id: string; isGroup: false; item: TransferJob; latest: number };
type TransferGroupRow = Extract<TransferTableRow, { isGroup: true }>;

const toProgressColor = (color: StatusColor): ProgressColor => (
  color === 'default' ? 'primary' : color
);

// Format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

// Format duration
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
};

// Format time ago
const formatTimeAgo = (timestamp: number, t: Translate, locale: string): string => {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return t('Just now');
  if (diff < 3600000) return t('{count}m ago', { count: Math.floor(diff / 60000) });
  if (diff < 86400000) return t('{count}h ago', { count: Math.floor(diff / 3600000) });
  return new Date(timestamp).toLocaleDateString(locale);
};

// Get status info
const getStatusInfo = (status: TransferJob['status'], t: Translate): { label: string; color: StatusColor; icon?: React.ReactElement; detail?: string } => {
  if (status === 'Completed') {
    return { label: t('Completed'), color: 'success', icon: <CheckCircleIcon fontSize="small" /> };
  }
  if (status === 'InProgress') {
    return { label: t('Downloading'), color: 'info', icon: <TransferActivityIcon type="Download" active /> };
  }
  if (status === 'Pending') {
    return { label: t('Pending'), color: 'default', icon: <ScheduleIcon fontSize="small" /> };
  }
  if (typeof status === 'object' && 'Failed' in status) {
    return { label: t('Failed'), color: 'error', icon: <ErrorIcon fontSize="small" />, detail: status.Failed };
  }
  if (status === 'Cancelled') {
    return { label: t('Cancelled'), color: 'default', icon: <CancelIcon fontSize="small" /> };
  }
  return { label: String(status), color: 'default' };
};

export default function DownloadsPage() {
  const { t } = useI18n();
  const { jobs, refreshJobs, clearCompleted: clearCompletedStore } = useTransferStore();
  
  // Refresh jobs on mount to sync with backend
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);
  
  // Filter only downloads
  const downloads = useMemo(() => 
    jobs.filter(j => j.transfer_type === 'Download')
      .sort((a, b) => b.created_at - a.created_at),
  [jobs]);
  
  // Stats
  const stats = useMemo(() => {
    const active = downloads.filter(d => d.status === 'InProgress' || d.status === 'Pending');
    const completed = downloads.filter(d => d.status === 'Completed');
    const failed = downloads.filter(d => typeof d.status === 'object' && 'Failed' in d.status);
    const cancelled = downloads.filter(d => d.status === 'Cancelled');
    
    const totalBytes = active.reduce((sum, d) => sum + d.total_bytes, 0);
    const processedBytes = active.reduce((sum, d) => sum + d.processed_bytes, 0);
    
    return {
      activeCount: active.length,
      completedCount: completed.length,
      failedCount: failed.length,
      cancelledCount: cancelled.length,
      totalBytes,
      processedBytes,
      progress: totalBytes > 0 ? (processedBytes / totalBytes) * 100 : 0,
    };
  }, [downloads]);

  // Grouping logic
  const groupedDownloads = useMemo<TransferTableRow[]>(() => {
    const groups: Record<string, TransferJob[]> = {};
    const standalone: TransferJob[] = [];
    
    downloads.forEach(job => {
      if (job.parent_group_id) {
        if (!groups[job.parent_group_id]) {
          groups[job.parent_group_id] = [];
        }
        groups[job.parent_group_id].push(job);
      } else {
        standalone.push(job);
      }
    });
    
    // Convert groups to array for sorting
    const groupList = Object.entries(groups).map(([groupId, items]) => {
      // Find latest date in group
      const latest = Math.max(...items.map(i => i.created_at));
      // Use group_name from first item
      const name = items[0].group_name || t('Unknown Group');
      
      return {
        id: groupId,
        isGroup: true as const,
        items,
        latest,
        name
      };
    });
    
    // Combine and sort
    return [
        ...standalone.map(j => ({ id: j.id, isGroup: false as const, item: j, latest: j.created_at })),
        ...groupList
    ].sort((a, b) => b.latest - a.latest);
  }, [downloads, t]);

  const clearCompleted = () => {
      clearCompletedStore();
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <DownloadIcon color="primary" sx={{ fontSize: 24 }} />
          <Box>
            <Typography variant="h4" fontWeight={600}>
              {t('Downloads')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {stats.activeCount > 0
                ? t('{count} active • {processed} / {total}', { count: stats.activeCount, processed: formatBytes(stats.processedBytes), total: formatBytes(stats.totalBytes) })
                : t('{count} total downloads', { count: downloads.length })}
            </Typography>
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          {(stats.completedCount > 0 || stats.failedCount > 0 || stats.cancelledCount > 0) && (
            <Button 
              variant="outlined" 
              size="small"
              startIcon={<DeleteIcon />}
              onClick={clearCompleted}
            >
              {t('Clear Finished')}
            </Button>
          )}
        </Box>
      </Box>



      {/* Downloads Table */}
      {downloads.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <DownloadIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {t('No downloads yet')}
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {t('Download files from your S3 buckets and they will appear here')}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, minWidth: 0, width: '100%', containerType: 'inline-size', overflowY: 'auto', overflowX: 'hidden' }}>
          <Table stickyHeader size="small" sx={transferTableSx}>
            <colgroup>{transferColumnWidths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{t('File')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('Status')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('Size')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('Progress')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('Speed')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('Started')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('Finished')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('Elapsed')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('Actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(() => {
                  const folders = groupedDownloads.filter((row): row is TransferGroupRow => row.isGroup);
                  const files = groupedDownloads.filter((row): row is Extract<TransferTableRow, { isGroup: false }> => !row.isGroup);

                  return (
                    <>
                      {folders.length > 0 && (
                        <>
                          <TableRow>
                            <TableCell colSpan={9} sx={{ bgcolor: 'action.hover', fontWeight: 600, py: 1 }}>
                              {t('Folders ({count})', { count: folders.length })}
                            </TableCell>
                          </TableRow>
                          {folders.map((row) => (
                             <GroupRow key={row.id} group={row} />
                          ))}
                        </>
                      )}

                      {files.length > 0 && (
                        <>
                           <TableRow>
                            <TableCell colSpan={9} sx={{ bgcolor: 'action.hover', fontWeight: 600, py: 1 }}>
                              {t('Files ({count})', { count: files.length })}
                            </TableCell>
                          </TableRow>
                          {files.map((row) => (
                             <SingleRow key={row.id} job={row.item} />
                          ))}
                        </>
                      )}
                    </>
                  );
              })()}
            </TableBody>
          </Table>
        </TableContainer>
      )}
          {(stats.failedCount > 0 || stats.cancelledCount > 0) && (
            <Typography variant="caption" color="error" sx={{ mt: 1 }}>
              <strong>{stats.failedCount}</strong> {t('failed')}
              {stats.cancelledCount > 0 ? ` • ${t('{count} cancelled', { count: stats.cancelledCount })}` : ''}
            </Typography>
          )}

    </Box>
  );
}

function SingleRow({ job, isNested = false }: { job: TransferJob; isNested?: boolean }) {
    const { t, locale } = useI18n();
    const status = getStatusInfo(job.status, t);
    const isCompleted = job.status === 'Completed';
    const progress = isCompleted ? 100 : (job.total_bytes > 0 ? (job.processed_bytes / job.total_bytes) * 100 : 0);
    const displayBytes = job.total_bytes > 0 ? job.total_bytes : (isCompleted ? job.processed_bytes : 0);
    const { retryJob } = useTransferStore();
    
    // Actions
    const handleRetry = () => retryJob(job.id);

    return (
        <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 }, bgcolor: isNested ? 'action.hover' : 'inherit' }}>
            <TableCell component="th" scope="row" sx={{ pl: isNested ? 1.5 : 0.5 }}>
                <Box sx={{ overflow: 'hidden' }}>
                    <Tooltip title={job.key.split('/').pop() || ''}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: isNested ? 400 : 500, fontFamily: isNested ? 'monospace' : 'inherit' }}>
                            {job.key.split('/').pop()}
                        </Typography>
                    </Tooltip>
                    {!isNested && <Typography variant="caption" color="text.secondary" noWrap display="block">{job.bucket}</Typography>}
                    {job.status === 'InProgress' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>{formatTransferSpeed(transferSpeed(job))}</Typography>}
                    {status.detail && <Typography variant="caption" color="error" display="block" sx={{ overflowWrap: 'anywhere', maxWidth: 360 }}>{status.detail}</Typography>}
                </Box>
            </TableCell>
            <TableCell>
                <Chip
                    icon={status.icon}
                    label={status.label}
                    size="small"
                    color={status.color}
                    variant="outlined"
                    sx={{ borderRadius: 1, height: 24 }}
                />
            </TableCell>

            {/* 3. Size */}
            <TableCell>{formatBytes(displayBytes)}</TableCell>

            {/* 4. Progress */}
            <TableCell>
                 <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <LinearProgress variant="determinate" value={progress} color={toProgressColor(status.color)} sx={{ height: 6, borderRadius: 1 }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{Math.round(progress)}%</Typography>
                </Box>
            </TableCell>

            {/* 5. Started */}
            <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{job.status === 'InProgress' ? formatTransferSpeed(transferSpeed(job)) : '-'}</TableCell>
            <TableCell>
                <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
                   {new Date(job.created_at).toLocaleDateString(locale)}
                   <br/>
                   <Box component="span" color="text.secondary">{new Date(job.created_at).toLocaleTimeString(locale)}</Box>
                </Typography>
            </TableCell>

            {/* 6. Finished */}
            <TableCell>
                <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
                   {job.finished_at ? (
                       <>
                           {new Date(job.finished_at).toLocaleDateString(locale)}
                           <br/>
                           <Box component="span" color="text.secondary">{new Date(job.finished_at).toLocaleTimeString(locale)}</Box>
                       </>
                   ) : '—'}
                </Typography>
            </TableCell>

            {/* 7. Elapsed */}
             <TableCell>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                   {job.finished_at ? formatDuration(job.finished_at - job.created_at) : (
                       job.status === 'InProgress' ? <span className="elapsed-timer">{formatTimeAgo(job.created_at, t, locale)}</span> : '—'
                   )}
                </Typography>
             </TableCell>
             
            {/* 8. Actions */}
            <TableCell align="right">
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0, flexWrap: 'wrap' }}>
                    {/* Retry Button */}
                    <Tooltip title={((typeof job.status === 'object' && 'Failed' in job.status) || job.status === 'Cancelled') ? t('Retry') : ""}>
                        <span>
                            <IconButton 
                                onClick={handleRetry} 
                                size="small" 
                                color="primary"
                                disabled={!((typeof job.status === 'object' && 'Failed' in job.status) || job.status === 'Cancelled')}
                            >
                                <ReplayIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>

                    {/* Cancel Button */}
                    <CancelTransferButton job={job} />
                </Box>
            </TableCell>
        </TableRow>
    );
}

function GroupRow({ group }: { group: TransferGroupRow }) {
    const { t, locale } = useI18n();
    const [open, setOpen] = useState(false);
    const items = group.items as TransferJob[];
    
    // Aggregated stats
    const totalBytes = items.reduce((sum, j) => {
        const bytes = j.total_bytes > 0 ? j.total_bytes : (j.status === 'Completed' ? j.processed_bytes : 0);
        return sum + bytes;
    }, 0);
    const processedBytes = items.reduce((sum, j) => sum + j.processed_bytes, 0);
    const isAllCompleted = items.every(j => j.status === 'Completed');
    const progress = isAllCompleted ? 100 : (totalBytes > 0 ? (processedBytes / totalBytes) * 100 : 0);
    
    const activeCount = items.filter(j => j.status === 'InProgress' || j.status === 'Pending').length;
    const failedCount = items.filter(j => typeof j.status === 'object' && 'Failed' in j.status).length;
    const cancelledCount = items.filter(j => j.status === 'Cancelled').length;
    const isAllTerminal = items.every((j) =>
        j.status === 'Completed' ||
        j.status === 'Cancelled' ||
        (typeof j.status === 'object' && 'Failed' in j.status)
    );
    
    // Date calculations
    const startTimes = items.map(j => j.created_at).filter(t => t > 0);
    const startTime = startTimes.length > 0 ? Math.min(...startTimes) : 0;
    
    const endTimes = items.map(j => j.finished_at || 0).filter((t) => t > 0);
    const endTime = isAllTerminal && endTimes.length > 0 ? Math.max(...endTimes) : 0;
    
    const startDateStr = startTime > 0 ? new Date(startTime).toLocaleString(locale) : '—';
    const finishedDateStr = endTime > 0 ? new Date(endTime).toLocaleString(locale) : '—';
    const elapsedStr = endTime > 0 ? formatDuration(endTime - startTime) : (activeCount > 0 ? t('In Progress') : '—');

    let statusLabel = t('Completed');
    let statusColor: StatusColor = 'success';

    if (activeCount > 0) {
        statusLabel = t('Downloading ({count})', { count: activeCount });
        statusColor = 'info';
    } else if (failedCount > 0) {
        statusLabel = t('Failed ({count})', { count: failedCount });
        statusColor = 'error';
    } else if (cancelledCount === items.length) {
        statusLabel = t('Cancelled ({count})', { count: cancelledCount });
        statusColor = 'default';
    } else if (cancelledCount > 0) {
        statusLabel = t('Partial ({count} cancelled)', { count: cancelledCount });
        statusColor = 'warning';
    }
    
    return (
        <>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' } }} hover onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
                <TableCell component="th" scope="row">
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                         <IconButton
                            aria-label={t('expand row')}
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen(!open);
                            }}
                            sx={{ mr: 0.5, p: 0.5, flexShrink: 0 }}
                        >
                            {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                        <FolderOpenIcon color="action" sx={{ mr: 0.5, fontSize: 20, flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                             <Typography variant="body2" title={group.name} noWrap sx={{ fontWeight: 600 }}>
                                {group.name ? group.name.replace('s3://', '') : t('Group')}
                             </Typography>
                             <Typography variant="caption" color="text.secondary">
                                {t('{count} files', { count: items.length })}
                             </Typography>
                        </Box>
                    </Box>
                </TableCell>
                <TableCell>
                    <Chip
                        label={statusLabel}
                        size="small"
                        color={statusColor}
                        variant="outlined"
                        sx={{ borderRadius: 1, height: 24 }}
                    />
                </TableCell>

                {/* 3. Size */}
                <TableCell>{formatBytes(totalBytes)}</TableCell>

                {/* 4. Progress */}
                <TableCell>
                     <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <LinearProgress variant="determinate" value={progress} color={toProgressColor(statusColor)} sx={{ height: 6, borderRadius: 1 }} />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{Math.round(progress)}%</Typography>
                    </Box>
                </TableCell>
                
                
                <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{items.some(job => job.status === 'InProgress') ? formatTransferSpeed(totalTransferSpeed(items)) : '-'}</TableCell>
                {/* 5. Started */}
                <TableCell>{startDateStr}</TableCell>
                {/* 6. Finished */}
                <TableCell>{finishedDateStr}</TableCell>
                {/* 7. Elapsed */}
                <TableCell>{elapsedStr}</TableCell>
                {/* 8. Actions (Empty) */}
                <TableCell></TableCell>
            </TableRow>
            
            {/* Flattened Children - No nested table! */}
            {open && items.map((job) => (
                <SingleRow key={job.id} job={job} isNested />
            ))}
        </>
    );  
}
