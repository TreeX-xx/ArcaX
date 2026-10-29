'use client';

import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Skeleton,
  Tooltip,
  Button,
  IconButton,
} from '@mui/material';
import {
  StarOutline as StarIcon,
  StarBorder as StarBorderIcon,
  NorthEast as UploadIcon,
  SouthWest as DownloadIcon,
  SettingsOutlined as SettingsIcon,
  History as HistoryIcon,
  GridViewOutlined as HomeIcon,
  InfoOutlined as InfoIcon,
  FolderOutlined as StorageIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import AboutDialog from '@/components/dialogs/AboutDialog';
import { useState } from 'react';
import ProfileSelector from '../profile/ProfileSelector';
import { useProfileStore } from '@/store/profileStore';
import { useBuckets } from '@/hooks/useBuckets';
import { useAppStore } from '@/store/appStore';
import { useHistoryStore } from '@/store/historyStore';
import { useI18n } from '@/lib/i18n';

const navItems = [
  { label: 'Home', icon: <HomeIcon />, path: '/' },
  { label: 'Favorites', icon: <StarIcon />, path: '/favorites' },
  { label: 'Recent', icon: <HistoryIcon />, path: '/recent' },
  { label: 'Downloads', icon: <DownloadIcon />, path: '/downloads' },
  { label: 'Uploads', icon: <UploadIcon />, path: '/uploads' },
  { label: 'Jobs', icon: <ScheduleIcon />, path: '/jobs' },
];

export default function Sidebar() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeBucketName = searchParams.get('name');

  const [aboutOpen, setAboutOpen] = useState(false);

  const { activeProfileId, profiles } = useProfileStore();
  const { buckets, isLoading, fetchBuckets } = useBuckets({ enabled: !!activeProfileId });
  const { addTab } = useAppStore();
  const { addFavorite, removeFavorite, isFavorite } = useHistoryStore();

  // Check if any profiles exist - this gates most UI
  const hasProfiles = profiles.length > 0;
  const hasActiveProfile = !!activeProfileId;


  const handleBucketClick = (bucketName: string, region: string) => {
    if (!hasActiveProfile) return;
    const path = `/bucket?name=${bucketName}&region=${region}`;
    addTab({ title: bucketName, path, icon: 'bucket' });
    router.push(path);
  };

  const handleBucketFavorite = (bucketName: string, region: string) => {
    if (!activeProfileId) return;
    if (isFavorite('', bucketName, activeProfileId)) {
      removeFavorite('', bucketName, activeProfileId);
      return;
    }
    addFavorite({
      key: '',
      name: bucketName,
      bucket: bucketName,
      region,
      profileId: activeProfileId,
      isFolder: true,
    });
  };

  const handleNavClick = (item: typeof navItems[0]) => {
    if (!hasProfiles && item.path !== '/jobs') return;
    addTab({ title: item.label, path: item.path, icon: item.label.toLowerCase() });
    router.push(item.path);
  };

  const handleSettingsClick = () => {
    addTab({ title: 'Settings', path: '/settings', icon: 'settings' });
    router.push('/settings');
  };

  // Disabled item styles
  const disabledStyles = {
    opacity: 0.65,
    pointerEvents: 'none' as const,
    cursor: 'not-allowed',
  };

  return (
    <Box component="nav" aria-label={t('Main navigation')} sx={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', '& .MuiListItemIcon-root .MuiSvgIcon-root': { fontSize: 18 } }}>

      <Box sx={{ px: 1.5, pt: 1, pb: 2 }}><Typography sx={{ fontSize: 11, color: 'text.secondary', px: 1, mb: 1 }}>{t('Connection')}</Typography><ProfileSelector /></Box>
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {/* Main Navigation - disabled without profile */}
        <List dense>
          {navItems.map((item) => (
            <Tooltip
              key={item.label}
              title={!hasProfiles && item.path !== '/jobs' ? t('Create a profile first') : ""}
              placement="right"
            >
              <ListItem disablePadding sx={!hasProfiles && item.path !== '/jobs' ? disabledStyles : {}}>
                <ListItemButton
                  onClick={() => handleNavClick(item)}
                  selected={
                    item.path === '/'
                      ? (pathname === '/' && !searchParams.get('view'))
                      : (pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '') === item.path || pathname === item.path)
                  }
                  disabled={!hasProfiles && item.path !== '/jobs'}
                  sx={{ mx: 1.5, my: 0.25, py: 0.5, minHeight: 36 }}
                >
                  <ListItemIcon sx={{
                    minWidth: 32,
                    color: (item.path === '/'
                      ? (pathname === '/' && !searchParams.get('view'))
                      : (pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '') === item.path || pathname === item.path))
                      ? 'text.primary' : 'text.secondary'
                  }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                      primary={t(item.label)}
                      primaryTypographyProps={{
                        variant: 'body2',
                        fontWeight: (item.path === '/'
                          ? (pathname === '/' && !searchParams.get('view'))
                          : (pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '') === item.path || pathname === item.path))
                          ? 600 : 400
                      }}
                  />
                </ListItemButton>
              </ListItem>
            </Tooltip>
          ))}
        </List>

        <Box sx={{ height: 22 }} />

        {/* Dynamic Buckets Section - disabled without active profile */}
        <Box sx={!hasActiveProfile ? disabledStyles : {}}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1 }}>
            <Typography
              variant="caption"
              sx={{ display: 'block', color: 'text.secondary', fontWeight: 500, letterSpacing: '0.05em' }}
            >
              {t('Buckets ({count})', { count: hasActiveProfile ? buckets.length : 0 })}
            </Typography>
            {hasActiveProfile && buckets.length === 0 && !isLoading && (
              <Button
                size="small"
                onClick={() => fetchBuckets()}
                sx={{ fontSize: '0.65rem', py: 0, textTransform: 'none', minWidth: 0, fontWeight: 600 }}
              >
                {t('Explore')}
              </Button>
            )}
          </Box>

          <List dense>
            {!hasActiveProfile ? (
              <Typography variant="caption" sx={{ px: 2, color: 'text.disabled', fontWeight: 500 }}>
                {t('Select a profile to view buckets')}
              </Typography>
            ) : isLoading ? (
               [1,2,3].map(i => (
                  <ListItem key={i} sx={{ px: 2, py: 0.5 }}>
                      <Skeleton variant="text" width="100%" />
                  </ListItem>
               ))
            ) : buckets.length > 0 ? (
              buckets.map((bucket) => (
                <ListItem key={bucket.name} disablePadding>
                  <ListItemButton
                      onClick={() => handleBucketClick(bucket.name, bucket.region || 'us-east-1')}
                      selected={pathname === '/bucket' && activeBucketName === bucket.name}
                      sx={{ mx: 1, my: 0.2, minWidth: 0, flex: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <StorageIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={bucket.name}
                      primaryTypographyProps={{
                          variant: 'body2',
                          noWrap: true,
                          title: bucket.name,
                          fontWeight: (pathname === '/bucket' && activeBucketName === bucket.name) ? 600 : 400
                      }}
                    />
                  </ListItemButton>
                  <Tooltip title={isFavorite('', bucket.name, activeProfileId) ? t('Remove from Favorites') : t('Add bucket root to Favorites')}>
                    <IconButton
                      edge="end"
                      size="small"
                      aria-pressed={isFavorite('', bucket.name, activeProfileId)}
                      aria-label={isFavorite('', bucket.name, activeProfileId) ? t('Remove {name} from Favorites', { name: bucket.name }) : t('Add {name} to Favorites', { name: bucket.name })}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleBucketFavorite(bucket.name, bucket.region || 'us-east-1');
                      }}
                      sx={{ mr: 0.5 }}
                    >
                      {isFavorite('', bucket.name, activeProfileId)
                        ? <StarIcon fontSize="small" color="warning" />
                        : <StarBorderIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </ListItem>
              ))
            ) : (
              <Typography variant="caption" sx={{ px: 2, color: 'text.disabled' }}>
                {t('No buckets found')}
              </Typography>
            )}
          </List>
        </Box>
      </Box>

      {/* Settings & About at bottom (always enabled) */}
      <Box sx={{ flexShrink: 0, pb: 2 }}>
        <Divider sx={{ mx: 2, mb: 1, opacity: 0.5 }} />
        <List dense>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleSettingsClick}
              selected={pathname === '/settings'}
              sx={{ mx: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t('Settings')} primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }} />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
              <ListItemButton onClick={() => setAboutOpen(true)} sx={{ mx: 1 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <InfoIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t('About')} primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }} />
            </ListItemButton>
          </ListItem>
        </List>
      </Box>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Box>
  );
}
