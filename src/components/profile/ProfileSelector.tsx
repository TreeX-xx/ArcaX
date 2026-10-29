'use client';

import {
  Box,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Settings as SettingsIcon,
  CheckCircle as ConnectedIcon,
} from '@mui/icons-material';
import { useProfileStore } from '@/store/profileStore';
import { Profile, profileApi, bucketApi, invalidateCache } from '@/lib/tauri';
import { invalidateBucketCache } from '@/hooks/useBuckets';
import { useAppStore } from '@/store/appStore';
import { useRouter } from 'next/navigation';
import { useProfileDialogStore } from '@/store/profileDialogStore';
import { useI18n } from '@/lib/i18n';

export default function ProfileSelector() {
  const { t } = useI18n();
  const router = useRouter();
  const { 
    profiles, 
    activeProfileId, 
    setActiveProfileId,
    isLoading,
  } = useProfileStore();
  const { resetApp, clearDiscoveredRegions } = useAppStore();
  
  const openProfileDialog = useProfileDialogStore(state => state.openDialog);
  
  // Profiles are hydrated by AppShell on mount - no need to load here
  
  const handleProfileChange = async (event: SelectChangeEvent<string>) => {
    const newProfileId = event.target.value;
    if (newProfileId === 'manage') {
      openProfileDialog();
      return;
    }
    
    try {
      await profileApi.setActiveProfile(newProfileId);
      setActiveProfileId(newProfileId);
      invalidateBucketCache();
      clearDiscoveredRegions();
      invalidateCache();
      resetApp();
      router.push('/');
      // Also refresh buckets for the new profile
      bucketApi.refreshS3Client().then(() => {
           // The useBuckets hook will react to profile change if it's set up to do so
           // or we can trigger a global refresh via some event
      });
    } catch (error) {
      console.error('Failed to set active profile:', error);
      return;
    }
  };
  
  const handleEditProfile = (profile: Profile) => {
    openProfileDialog(profile);
  };
  
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
      <FormControl 
        variant="outlined" 
        size="small" 
        sx={{ 
            minWidth: 0, width: '100%',
        }}
      >
        <Select
          value={activeProfileId || ''}
          onChange={handleProfileChange}
          displayEmpty
          inputProps={{ 'aria-label': t('Active profile') }}
          renderValue={(selected) => {
            if (!selected) {
              return <Typography variant="body2" color="text.secondary">{t('Select Profile')}</Typography>;
            }
            const profile = profiles.find((p) => p.id === selected);
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ConnectedIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.name}</Typography>
              </Box>
            );
          }}
          sx={{
            minWidth: 0, width: '100%',
          }}
        >
          {profiles.map((profile) => (
            <MenuItem key={profile.id} value={profile.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">{profile.name}</Typography>
                  <Chip label={profile.region || 'us-east-1'} size="small" sx={{ height: 16, fontSize: '0.6rem' }} />
                </Box>
                <IconButton size="small" aria-label={t('Edit {name}', { name: profile.name })} onClick={(e) => { e.stopPropagation(); handleEditProfile(profile); }}>
                  <SettingsIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            </MenuItem>
          ))}
          
          <Divider />
          
          <MenuItem value="manage">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
              <AddIcon sx={{ fontSize: 18 }} />
              <Typography variant="body2">{t('Manage Profiles')}</Typography>
            </Box>
          </MenuItem>
        </Select>
      </FormControl>
      
      {isLoading && <CircularProgress size={16} sx={{ ml: 1 }} />}
    </Box>
  );
}
