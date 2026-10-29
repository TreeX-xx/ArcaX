'use client';

import { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemIcon,
  ListItemSecondaryAction, 
  Select, 
  MenuItem, 
  TextField, 
  Slider, 
  Switch,
  Container,
  Button,
  Chip,
  Divider,
  Alert,
} from '@mui/material';
import {
  Folder as FolderIcon,
  DeleteSweep as ClearIcon,
  MonitorHeart as MonitorIcon,
  CheckCircle as SuccessIcon,
  ErrorOutline as ErrorIcon,
  Info as InfoIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import {
  MAX_TEXT_PREVIEW_SIZE_MB,
  MIN_TEXT_PREVIEW_SIZE_MB,
  useSettingsStore,
  type Language,
} from '@/store/settingsStore';
import { useI18n } from '@/lib/i18n';
import { useAppStore } from '@/store/appStore';
import { useMonitorStore } from '@/store/monitorStore';
import { invalidateBucketCache } from '@/hooks/useBuckets';
import { toast } from '@/store/toastStore';
import { bucketApi, copyToClipboard, invalidateCache, isTauri, logApi, transferApi, type LogFileInfo } from '@/lib/tauri';

export default function SettingsPage() {
  const { t } = useI18n();
  // Theme is controlled by appStore (used by the actual app)
  const { themeMode, setThemeMode, clearDiscoveredRegions } = useAppStore();
  // Other settings from settingsStore
  const {
    language, setLanguage,
    defaultRegion, setDefaultRegion,
    maxConcurrentTransfers, setMaxConcurrentTransfers,
    transferBandwidthKiB, setTransferBandwidthKiB,
    maxTextPreviewSizeMb, setMaxTextPreviewSizeMb,
    autoRefreshOnFocus, setAutoRefreshOnFocus
  } = useSettingsStore();
  
  const [version, setVersion] = useState<string>('...');
  const [appDataDir, setAppDataDir] = useState<string>('Loading...');
  const [logFileInfo, setLogFileInfo] = useState<LogFileInfo | null>(null);
  const [pendingTransferConcurrency, setPendingTransferConcurrency] = useState(maxConcurrentTransfers);
  const [pendingPreviewLimit, setPendingPreviewLimit] = useState(maxTextPreviewSizeMb);
  const [bandwidth, setBandwidth] = useState(String(transferBandwidthKiB));
  const [savingBandwidth, setSavingBandwidth] = useState(false);
  const [bandwidthError, setBandwidthError] = useState('');
  const bandwidthValue = Number(bandwidth);
  const validBandwidth = /^\d+$/.test(bandwidth) && Number.isSafeInteger(bandwidthValue) && (bandwidthValue === 0 || (bandwidthValue >= 64 && bandwidthValue <= 1048576));
  useEffect(() => { setBandwidth(String(transferBandwidthKiB)); }, [transferBandwidthKiB]);
  async function applyBandwidth() {
    if (!validBandwidth || savingBandwidth) return;
    setSavingBandwidth(true); setBandwidthError('');
    try {
      if (isTauri()) await transferApi.setBandwidth(bandwidthValue * 1024);
      setTransferBandwidthKiB(bandwidthValue);
      toast.success(t('Bandwidth limit saved'), t('Applies to newly queued transfers. Existing jobs keep their limit.'));
    } catch (e) { setBandwidthError(String(e)); }
    finally { setSavingBandwidth(false); }
  }
  
  useEffect(() => {
    if (!isTauri()) {
      setVersion('Web');
      setAppDataDir(t('Desktop app only'));
      return;
    }

    // Get app version
    import('@tauri-apps/api/app').then(({ getVersion }) => {
      getVersion().then(setVersion).catch(() => setVersion(t('Unknown')));
    });
    
    // Get app data directory
    import('@tauri-apps/api/path').then(({ appDataDir: getAppDataDir }) => {
      getAppDataDir().then(setAppDataDir).catch(() => setAppDataDir(t('Unknown')));
    });

    logApi.getLogFileInfo()
      .then(setLogFileInfo)
      .catch(() => setLogFileInfo(null));
  }, [t]);

  useEffect(() => {
    setPendingTransferConcurrency(maxConcurrentTransfers);
  }, [maxConcurrentTransfers]);

  useEffect(() => {
    setPendingPreviewLimit(maxTextPreviewSizeMb);
  }, [maxTextPreviewSizeMb]);

  const handleClearCache = async () => {
    try {
      if (isTauri()) await bucketApi.refreshS3Client();
      invalidateBucketCache();
      clearDiscoveredRegions();
      invalidateCache();
      toast.success(t('Caches cleared'), t('Bucket lists, discovered regions, and object views were reset.'));
    } catch (error) {
      toast.error(t('Could not clear caches'), String(error));
    }
  };

  const handleCopyLogPath = async () => {
    if (!logFileInfo) return;

    try {
      await copyToClipboard(logFileInfo.log_file_path);
      toast.success(t('Log path copied'));
    } catch (err) {
      toast.error(t('Copy failed'), String(err));
    }
  };

  return (
    <Container
      maxWidth="md"
      sx={{
        py: { xs: 1.5, md: 2 },
        '& > .MuiPaper-root': {
          bgcolor: 'transparent',
          backgroundImage: 'none',
          border: 0,
          borderRadius: 0,
          mb: 4,
        },
        '& > .MuiPaper-root > .MuiBox-root:first-of-type': {
          bgcolor: 'transparent',
          px: 0,
          py: 0.75,
          borderBottom: '1px solid',
          borderColor: 'divider',
        },
        '& > .MuiPaper-root > .MuiBox-root:first-of-type .MuiTypography-root': {
          fontSize: 12,
          fontWeight: 600,
          color: 'text.secondary',
        },
        '& .MuiPaper-root .MuiListItem-root': { px: 0 },
        '& .MuiPaper-root .MuiListItemSecondaryAction-root': { right: 0 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 550, letterSpacing: '-0.03em' }}>{t('Settings')}</Typography>
        <Chip label={`v${version}`} size="small" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
      </Box>

      {/* Appearance Section */}
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>{t('Appearance')}</Typography>
        </Box>
        <List>
          <ListItem>
            <ListItemText
              primary={t('Language')}
              secondary={t('Choose the interface language')}
            />
            <ListItemSecondaryAction>
              <Select
                size="small"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="zh">简体中文</MenuItem>
              </Select>
            </ListItemSecondaryAction>
          </ListItem>
          <ListItem>
            <ListItemText
              primary={t('Theme')}
              secondary={t('Choose your preferred interface appearance')}
            />
            <ListItemSecondaryAction>
              <Select
                size="small"
                value={themeMode}
                onChange={(e) => {
                  setThemeMode(e.target.value as 'light' | 'dark' | 'system');
                  toast.success(t('Theme updated'), t('Changed to {mode} mode', { mode: t(e.target.value === 'light' ? 'Light' : e.target.value === 'dark' ? 'Dark' : 'System') }));
                }}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="light">{t('Light')}</MenuItem>
                <MenuItem value="dark">{t('Dark')}</MenuItem>
                <MenuItem value="system">{t('System')}</MenuItem>
              </Select>
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Paper>

      {/* Defaults Section */}
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>{t('Defaults')}</Typography>
        </Box>
        <List>
          <ListItem>
            <ListItemText
              primary={t('Default Region')}
              secondary={t('Used as fallback for new profiles if region cannot be auto-detected')}
            />
            <ListItemSecondaryAction>
              <TextField 
                size="small" 
                variant="outlined" 
                value={defaultRegion} 
                onChange={(e) => setDefaultRegion(e.target.value)}
                sx={{ width: 150 }}
              />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Paper>

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>{t('Performance & Behavior')}</Typography>
        </Box>
        <List>
          <ListItem divider>
            <ListItemText
              primary={t('Max Concurrent Transfers')}
              secondary={t('Allow up to {count} simultaneous uploads/downloads', { count: pendingTransferConcurrency })}
            />
            <Box sx={{ width: 200, mr: 2 }}>
               <Slider
                 value={pendingTransferConcurrency}
                 min={1}
                 max={20}
                 step={1}
                 valueLabelDisplay="auto"
                 onChange={(_, val) => setPendingTransferConcurrency(val as number)}
                 onChangeCommitted={(_, val) => {
                   const nextValue = val as number;
                   setPendingTransferConcurrency(nextValue);
                   if (nextValue !== maxConcurrentTransfers) {
                     setMaxConcurrentTransfers(nextValue);
                     toast.success(t('Transfer concurrency updated'), t('Set to {value}', { value: nextValue }));
                   }
                 }}
               />
            </Box>
          </ListItem>
          <ListItem divider sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
            <ListItemText primary={t('Bandwidth per transfer')} secondary={t('Limits each newly queued upload or download, including sync, cross-profile copy and restore. Existing jobs keep their limit. Concurrent jobs each get this allowance; this is not a total app limit.')} />
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <TextField label={t('Limit (KiB/s)')} size="small" value={bandwidth} disabled={savingBandwidth} onChange={e => { setBandwidth(e.target.value); setBandwidthError(''); }} inputProps={{ inputMode: 'numeric' }} error={!validBandwidth} helperText={t('0 is unlimited. Otherwise 64 to 1,048,576 KiB/s.')} sx={{ flex: 1 }} />
              <Button size="small" variant="outlined" sx={{ color: 'text.primary', mt: 0.5 }} disabled={!validBandwidth || savingBandwidth || bandwidthValue === transferBandwidthKiB} onClick={applyBandwidth}>{savingBandwidth ? t('Saving...') : t('Apply')}</Button>
            </Box>
            {bandwidthError && <Alert severity="error">{bandwidthError}</Alert>}
          </ListItem>
          <ListItem divider>
            <ListItemText
              primary={t('Text Preview Size Limit')}
              secondary={t('Load text, HTML, and code objects up to {size} MB. Images, audio, video, and PDFs are streamed and do not use this memory limit.', { size: pendingPreviewLimit })}
            />
            <Box sx={{ width: 200, mr: 2 }}>
              <Slider
                value={pendingPreviewLimit}
                min={MIN_TEXT_PREVIEW_SIZE_MB}
                max={MAX_TEXT_PREVIEW_SIZE_MB}
                step={1}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${value} MB`}
                onChange={(_, value) => setPendingPreviewLimit(value as number)}
                onChangeCommitted={(_, value) => {
                  const nextValue = value as number;
                  setPendingPreviewLimit(nextValue);
                  if (nextValue !== maxTextPreviewSizeMb) {
                    setMaxTextPreviewSizeMb(nextValue);
                    toast.success(t('Preview limit updated'), t('Text previews can use up to {size} MB', { size: nextValue }));
                  }
                }}
              />
            </Box>
          </ListItem>
          <ListItem>
            <ListItemText 
              primary={t('Auto-refresh on Focus')}
              secondary={t('Automatically refresh object list when returning to the app')}
            />
            <ListItemSecondaryAction>
              <Switch
                edge="end"
                checked={autoRefreshOnFocus}
                onChange={(e) => {
                  setAutoRefreshOnFocus(e.target.checked);
                  toast.success(t('Behavior updated'), t(e.target.checked ? 'Auto-refresh enabled' : 'Auto-refresh disabled'));
                }}
              />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Paper>

      {/* Data & Storage Section */}
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>{t('Data & Storage')}</Typography>
        </Box>
        <List>
          <ListItem>
            <ListItemIcon>
              <FolderIcon color="action" />
            </ListItemIcon>
            <ListItemText 
              primary={t('App Data Location')}
              secondary={appDataDir}
              secondaryTypographyProps={{ 
                component: 'code', 
                sx: { fontSize: '0.75rem', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block', mt: 0.5 } 
              }}
            />
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemIcon>
              <InfoIcon color="action" />
            </ListItemIcon>
            <ListItemText
              primary={t('Diagnostic Log File')}
              secondary={logFileInfo?.log_file_path || (isTauri() ? t('Unavailable') : t('Desktop app only'))}
              secondaryTypographyProps={{
                component: 'code',
                sx: { fontSize: '0.75rem', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block', mt: 0.5, maxWidth: '100%', overflowWrap: 'anywhere' }
              }}
            />
            <ListItemSecondaryAction sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CopyIcon />}
                disabled={!logFileInfo}
                onClick={handleCopyLogPath}
              >
                {t('Copy Path')}
              </Button>
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          {logFileInfo?.panic_log_exists && (
            <>
              <ListItem>
                <ListItemIcon>
                  <ErrorIcon color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={t('Last Panic Log')}
                  secondary={logFileInfo.panic_log_path}
                  secondaryTypographyProps={{
                    component: 'code',
                    sx: { fontSize: '0.75rem', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block', mt: 0.5, maxWidth: '100%', overflowWrap: 'anywhere' }
                  }}
                />
              </ListItem>
              <Divider />
            </>
          )}
          <ListItem>
            <ListItemText 
              primary={t('Cached Bucket and Object Data')}
              secondary={t('Clear cached bucket lists, discovered regions, and open object views to force fresh fetches from S3')}
            />
            <ListItemSecondaryAction>
              <Button 
                variant="outlined" 
                size="small" 
                startIcon={<ClearIcon />}
                onClick={handleClearCache}
              >
                {t('Clear Cache')}
              </Button>
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Paper>

      {/* Updates Section */}
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>{t('Updates')}</Typography>
        </Box>
        <List>
          <ListItem>
            <ListItemText
              primary={t('Automatic Updates')}
              secondary={t('Not configured in this build. Update manually from the ArcaX GitHub releases.')}
            />
          </ListItem>
        </List>
        <Alert severity="info" sx={{ m: 2, mt: 0 }}>
          {t('No update endpoint is configured yet. Automatic updates will be based on ArcaX GitHub releases in a future build.')}
        </Alert>
      </Paper>

      {/* System Monitor Section */}
      <SystemMonitor />
    </Container>
  );
}

function SystemMonitor() {
  const { t, locale } = useI18n();
  const { logs, metrics, clearLogs } = useMonitorStore();
  
  return (
    <Paper variant="outlined">
        <Box sx={{ p: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MonitorIcon color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>{t('System Monitor')}</Typography>
          </Box>
          <Button size="small" onClick={clearLogs} startIcon={<ClearIcon />}>{t('Clear Logs')}</Button>
        </Box>
        
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="primary">{metrics.totalRequests}</Typography>
                <Typography variant="caption" color="text.secondary">{t('Total Requests')}</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color={metrics.failedRequests > 0 ? "error" : "text.secondary"}>
                    {metrics.failedRequests}
                </Typography>
                <Typography variant="caption" color="text.secondary">{t('Failed Requests')}</Typography>
            </Paper>
        </Box>

        <Box sx={{ maxHeight: 300, overflow: 'auto', borderTop: 1, borderColor: 'divider' }}>
            {logs.length === 0 ? (
                <Typography sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>{t('No logs yet')}</Typography>
            ) : (
                <List dense>
                    {logs.map((log) => (
                        <ListItem key={log.id} divider>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                                {log.type === 'error' ? <ErrorIcon color="error" fontSize="small" /> : 
                                 log.type === 'success' ? <SuccessIcon color="success" fontSize="small" /> :
                                 <InfoIcon color="info" fontSize="small" />}
                            </ListItemIcon>
                            <ListItemText 
                                primary={
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace' }}>{log.message}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {new Date(log.timestamp).toLocaleTimeString(locale)}
                                        </Typography>
                                    </Box>
                                }
                                secondary={log.details}
                                secondaryTypographyProps={{ 
                                    sx: { 
                                        color: 'error.main', 
                                        fontFamily: 'monospace', 
                                        fontSize: '0.75rem',
                                        mt: 0.5 
                                    } 
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            )}
        </Box>
    </Paper>
  );
}
