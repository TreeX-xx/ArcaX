'use client';
import { Suspense } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { ViewSidebarOutlined, DarkModeOutlined, LightModeOutlined, SettingsBrightnessOutlined, TranslateOutlined } from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { useProfileStore } from '@/store/profileStore';
import { useI18n } from '@/lib/i18n';
import PathBar from '../navigation/PathBar';
import { BrandWordmark } from '../common/BrandMark';
import WindowControls from './WindowControls';
const titles: Record<string, string> = { '/': 'Workspace', '/bucket': 'Explorer', '/favorites': 'Favorites', '/recent': 'Recent', '/downloads': 'Downloads', '/uploads': 'Uploads', '/jobs': 'Jobs', '/settings': 'Settings' };
export default function TopBar() {
  const { themeMode, setThemeMode, sidebarOpen, toggleSidebar } = useAppStore();
  const activeProfileId = useProfileStore(state => state.activeProfileId);
  const pathname = usePathname();
  const { language, setLanguage, t } = useI18n();
  const toggleTheme = () => { const modes = ['light', 'dark', 'system'] as const; setThemeMode(modes[(modes.indexOf(themeMode) + 1) % modes.length]); };
  const themeLabel = t(themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'System');
  const showPathBar = !!activeProfileId && (pathname === '/' || pathname === '/bucket');
  return <Box component="header" data-tauri-drag-region sx={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1, userSelect: 'none' }}>
    <Box data-tauri-drag-region sx={{ width: { xs: 'auto', md: sidebarOpen ? 232 : 154 }, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 2.5, pr: 1.5, gap: 2 }}>
      <BrandWordmark size={24} />
      <Tooltip title={sidebarOpen ? t('Hide sidebar') : t('Show sidebar')}><IconButton size="small" aria-label={t('Toggle navigation')} aria-controls="sidebar-navigation" aria-expanded={sidebarOpen} onClick={toggleSidebar}><ViewSidebarOutlined sx={{ fontSize: 18 }} /></IconButton></Tooltip>
    </Box>
    <Typography data-tauri-drag-region sx={{ fontSize: 12, color: 'text.secondary', pl: 1, display: { xs: 'none', sm: 'block' } }}>{t(titles[pathname] || 'Workspace')}</Typography>
    <Box data-tauri-drag-region sx={{ flex: 1, minWidth: 8 }} />
    {showPathBar && <Box sx={{ width: { xs: 'auto', sm: '40%' }, flex: { xs: 1, sm: 'none' }, maxWidth: 440, minWidth: 0 }}><Suspense fallback={null}><PathBar /></Suspense></Box>}
    <Tooltip title={t('Theme: {mode}', { mode: themeLabel })}><IconButton size="small" aria-label={t('Theme: {mode}', { mode: themeLabel })} onClick={toggleTheme} sx={{ mx: 0.5 }}>{themeMode === 'dark' ? <DarkModeOutlined sx={{ fontSize: 17 }} /> : themeMode === 'light' ? <LightModeOutlined sx={{ fontSize: 17 }} /> : <SettingsBrightnessOutlined sx={{ fontSize: 17 }} />}</IconButton></Tooltip>
    <Tooltip title={t(language === 'zh' ? 'Switch to English' : 'Switch to Chinese')}><IconButton size="small" aria-label={t('Switch language')} onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')} sx={{ mx: 0.5 }}><TranslateOutlined sx={{ fontSize: 17 }} /></IconButton></Tooltip>
    <WindowControls />
  </Box>;
}
