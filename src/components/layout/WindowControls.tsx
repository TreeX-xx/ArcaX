'use client';

import { useEffect, useState } from 'react';
import { Box, IconButton } from '@mui/material';
import { Close, CropSquare, FilterNone, Remove } from '@mui/icons-material';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@/lib/tauri';
import { useI18n } from '@/lib/i18n';

const isWindows = () => typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

export default function WindowControls() {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);
  // Windows runs undecorated; macOS and Linux keep their native title bar.
  const available = isTauri() && isWindows();

  useEffect(() => {
    if (!available) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    const sync = () => {
      void appWindow.isMaximized().then(setMaximized).catch(error => console.error('Window state failed:', error));
    };
    sync();
    void appWindow.onResized(sync).then(stop => { unlisten = stop; }).catch(error => console.error('Window resize listener failed:', error));
    return () => { unlisten?.(); };
  }, [available]);

  if (!available) return null;

  const run = (action: 'minimize' | 'toggleMaximize' | 'close') => {
    void getCurrentWindow()[action]().catch(error => console.error('Window action failed:', error));
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', alignItems: 'stretch', '& .MuiIconButton-root': { width: 42, borderRadius: 0 } }}>
      <IconButton aria-label={t('Minimize window')} onClick={() => run('minimize')}><Remove sx={{ fontSize: 16 }} /></IconButton>
      <IconButton aria-label={t('Maximize or restore window')} onClick={() => run('toggleMaximize')}>
        {maximized ? <FilterNone sx={{ fontSize: 13 }} /> : <CropSquare sx={{ fontSize: 13 }} />}
      </IconButton>
      <IconButton aria-label={t('Close window')} onClick={() => run('close')} sx={{ '&:hover': { bgcolor: '#C42B1C', color: '#fff' } }}><Close sx={{ fontSize: 17 }} /></IconButton>
    </Box>
  );
}
