'use client';

import { useMemo, useEffect, useSyncExternalStore, Suspense } from 'react';
import {
  Box,
  CssBaseline,
  Drawer,
  Typography,
  useMediaQuery,
  ThemeProvider,
  Button,
  CircularProgress,
} from '@mui/material';
import { BrandMark } from '@/components/common/BrandMark';
import { lightTheme, darkTheme } from '@/lib/theme';
import { useAppStore } from '@/store/appStore';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import Footer from './Footer';
import TabBar from './TabBar';
import { useTransferEvents } from '@/hooks/useTransferEvents';
import { TransferPanel } from '@/components/transfer/TransferPanel';
import { useProfileStore } from '@/store/profileStore';
import { useSettingsStore } from '@/store/settingsStore';
import ProfileDialog from '@/components/profile/ProfileDialog';
import { useProfileDialogStore } from '@/store/profileDialogStore';
import ToastContainer from '@/components/common/ToastContainer';
import { profileApi, transferApi } from '@/lib/tauri';
import { useClipboardShortcuts } from '@/hooks/useClipboardShortcuts';
import { preloadMonaco } from '@/lib/monaco-config';
import { useSavedJobEvents } from '@/hooks/useSavedJobEvents';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

const drawerWidth = 232;
const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { language, t } = useI18n();
  useSavedJobEvents();
  const { themeMode, sidebarOpen, setSidebarOpen } = useAppStore();
  const { profiles, setProfiles, setActiveProfileId } = useProfileStore();
  const maxConcurrentTransfers = useSettingsStore((state) => state.maxConcurrentTransfers);
  const transferBandwidthKiB = useSettingsStore((state) => state.transferBandwidthKiB);
  const mounted = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const { open: profileDialogOpen, profile: profileDialogProfile, openDialog: openProfileDialog, closeDialog: closeProfileDialog } = useProfileDialogStore();
  // Enable clipboard shortcuts globally
  useClipboardShortcuts();

  // Determine if we should use dark mode
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const isMobile = useMediaQuery('(max-width:900px)');

  const theme = useMemo(() => {
    if (themeMode === 'system') {
      return prefersDarkMode ? darkTheme : lightTheme;
    }
    return themeMode === 'dark' ? darkTheme : lightTheme;
  }, [themeMode, prefersDarkMode]);

  // Keep the document language in sync with the selected interface language.
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  // Handle hydration mismatch
  useEffect(() => {
    // Preload Monaco Editor in background for faster file editing
    preloadMonaco();
  }, []);

  // Close drawer on mobile when navigating
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile, setSidebarOpen]);

  // Listen for global transfer events
  useTransferEvents();

  useEffect(() => {
    const syncTransferConcurrency = async () => {
      if (typeof window === 'undefined' || !('__TAURI__' in window)) {
        return;
      }

      try {
        await transferApi.setConcurrency(maxConcurrentTransfers);
      } catch (err) {
        console.warn('Failed to sync transfer concurrency:', err);
      }
    };

    if (mounted) {
      syncTransferConcurrency();
    }
  }, [mounted, maxConcurrentTransfers]);

  // Load profiles on mount (Persistence Fix)
  useEffect(() => {
    if (mounted && typeof window !== 'undefined' && '__TAURI__' in window) {
      transferApi.setBandwidth(transferBandwidthKiB * 1024).catch(error => console.warn('Could not apply transfer bandwidth limit:', error));
    }
  }, [mounted, transferBandwidthKiB]);

  useEffect(() => {
    const initProfiles = async () => {
      // Only run in Tauri environment
      if (typeof window !== 'undefined' && !('__TAURI__' in window)) {
         return;
      }

      try {
        const [loadedProfiles, activeProfile] = await Promise.all([
          profileApi.listProfiles(),
          profileApi.getActiveProfile()
        ]);

        setProfiles(loadedProfiles);

        if (activeProfile) {
          setActiveProfileId(activeProfile.id);
        } else if (loadedProfiles.length > 0) {
          const fallbackProfile = loadedProfiles[0];
          setActiveProfileId(fallbackProfile.id);

          try {
            await profileApi.setActiveProfile(fallbackProfile.id);
          } catch (persistErr) {
            console.warn('Failed to persist fallback active profile:', persistErr);
          }
        } else {
          setActiveProfileId(null);
        }
      } catch (err) {
        console.error("Failed to hydrate profiles on init", err);
      }
    };

    if (mounted) {
      initProfiles();
    }
  }, [mounted, setProfiles, setActiveProfileId]);

  // Check for updates on load (with safety checks)
  // Upstream update checks are intentionally disabled in ArcaX; see Settings.

  if (!mounted) {
    return null;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
        <Suspense fallback={<Box sx={{ height: 56, flexShrink: 0 }} />}><TopBar /></Suspense>
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Drawer id="sidebar-navigation" variant={isMobile ? 'temporary' : 'persistent'} open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            sx={{ width: !isMobile && sidebarOpen ? drawerWidth : 0, flexShrink: 0,
              '& .MuiDrawer-paper': { width: drawerWidth, top: 56, height: 'calc(100dvh - 56px)', boxSizing: 'border-box', borderRight: 0, overflow: 'hidden' } }}>
            <Suspense fallback={<Box sx={{ p: 2 }}><CircularProgress size={20} /></Box>}><Sidebar /></Suspense>
          </Drawer>
          <Box component="main" sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper',
            border: '1px solid', borderColor: 'divider', borderRadius: '12px 0 0 0', overflow: 'hidden', mr: 0.75 }}>
            <Suspense fallback={null}><TabBar /></Suspense>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 1.5, md: 3 }, py: 2 }}>
              {profiles.length === 0 && pathname !== '/jobs' && pathname !== '/settings' ? (
                <Box sx={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2, md: 5 } }}>
                  <Box sx={{ width: '100%', maxWidth: 500, pb: 7 }}>
                    <Box sx={{ color: 'text.primary', mb: 3 }}><BrandMark size={48} /></Box>
                    <Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 550, letterSpacing: '-0.045em', mb: 1.5 }}>{t('A place for your objects.')}</Typography>
                    <Typography color="text.secondary" sx={{ fontSize: 14, lineHeight: 1.8, maxWidth: 410, mb: 4 }}>
                      {t('Connect your storage. Browse, move, and organize everything in one quiet workspace.')}
                    </Typography>
                    <Button variant="contained" onClick={() => openProfileDialog()} sx={{ px: 2.5, height: 38 }}>{t('Connect account')} <Box component="span" sx={{ ml: 3 }}>↗</Box></Button>
                    <Typography sx={{ mt: 2.5, fontSize: 11, color: 'text.secondary' }}>AWS S3 · Cloudflare R2 · MinIO · {t('Any S3-compatible endpoint')}</Typography>
                  </Box>
                </Box>
              ) : children}
            </Box>
            <Suspense fallback={<Box sx={{ height: 30 }} />}><Footer /></Suspense>
          </Box>
        </Box>
        <ProfileDialog open={profileDialogOpen} onClose={closeProfileDialog} editProfile={profileDialogProfile} />
        <ToastContainer />
        <TransferPanel />
      </Box>
    </ThemeProvider>
  );
}
