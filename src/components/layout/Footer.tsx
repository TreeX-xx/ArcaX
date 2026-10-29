'use client';

import { formatTransferSpeed, totalTransferSpeed } from '@/lib/transferSpeed';

import { Box, Typography, Divider, Tooltip } from '@mui/material';
import { 
    CloudDone as CloudDoneIcon, 
    SwapVert as TransferIcon,
    Dns as ProfileIcon,
    Public as RegionIcon,
    Cached as CachedIcon,
    Info as InfoIcon,
} from '@mui/icons-material';
import { useProfileStore } from '@/store/profileStore';
import { useTransferStore } from '@/store/transferStore';
import { useAppStore } from '@/store/appStore';
import { useBuckets } from '@/hooks/useBuckets';
import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@/lib/tauri';
import { useI18n } from '@/lib/i18n';

function formatCacheAge(ms: number | null, t: (message: string, vars?: Record<string, string | number>) => string): string {
  if (ms === null) return '';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return t('just now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('{count}m ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  return t('{count}h ago', { count: hours });
}

export default function Footer() {
  const { t } = useI18n();
  const { profiles, activeProfileId } = useProfileStore();
  const { jobs } = useTransferStore();
  const { discoveredRegions } = useAppStore();
  const { buckets, isCached, cacheAge, isLoading } = useBuckets({ enabled: !!activeProfileId });
  const searchParams = useSearchParams();
  const [appVersion, setAppVersion] = useState(() => (isTauri() ? '' : 'web'));
  
  // Fetch app version from Tauri
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion('dev'));
  }, []);
  
  const bucketName = searchParams.get('name');
  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const activeTransfers = jobs.filter(j => j.status === 'Pending' || j.status === 'InProgress');

  // Priority: 1. Discovered region (specific to this bucket), 2. Profile default region
  const displayRegion = useMemo(() => {
    if (bucketName && discoveredRegions[bucketName]) {
      return discoveredRegions[bucketName];
    }
    return activeProfile?.region || 'N/A';
  }, [bucketName, discoveredRegions, activeProfile]);

  const isDiscovered = bucketName && discoveredRegions[bucketName] && discoveredRegions[bucketName] !== activeProfile?.region;
  
  const cacheStatus = useMemo(() => {
    if (isLoading) return { label: t('Loading...'), color: 'default' as const };
    if (isCached) return { label: t('Cached {age}', { age: formatCacheAge(cacheAge, t) }), color: 'success' as const };
    return { label: t('● Live'), color: 'primary' as const };
  }, [isCached, cacheAge, isLoading, t]);
  
  return (
    <Box
      component="footer"
      sx={{
        height: 30,
        flexShrink: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        '& > *': { flexShrink: 0 },
        bgcolor: 'transparent',
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        px: 2,
        position: 'relative',
        bottom: 0,
        left: 0,
        right: 0,
        fontSize: 11,
        gap: 1.5,
      }}
    >
      {/* Profile & Region Info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        <ProfileIcon sx={{ fontSize: 14 }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {activeProfile?.name || t('No Profile')}
        </Typography>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 12, my: 'auto' }} />
        <Tooltip title={isDiscovered ? t('Auto-discovered for {bucket}', { bucket: bucketName ?? '' }) : t('Region')}>
           <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
             <RegionIcon sx={{ fontSize: 14, color: isDiscovered ? 'primary.main' : 'inherit' }} />
             <Typography variant="caption" sx={{ fontWeight: isDiscovered ? 700 : 400 }}>
               {displayRegion}
             </Typography>
           </Box>
        </Tooltip>
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      {/* Cost Awareness Notice */}
      {activeProfile && (
        <>
          <Tooltip title={t('S3 API calls incur charges. Cache auto-refreshes after uploads/deletes within the app.')}>
            <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.5, color: 'text.secondary', cursor: 'help' }}>
              <InfoIcon sx={{ fontSize: 12 }} />
              <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
                {t('API costs apply')}
              </Typography>
            </Box>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', lg: 'block' }, mx: 0.5, height: 12, my: 'auto' }} />

          {/* Cache Status */}
          <Tooltip title={t('Bucket list is cached to reduce API calls. Click refresh to update.')}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
              <CachedIcon sx={{ fontSize: 12 }} />
              <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                {cacheStatus.label}
              </Typography>
            </Box>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 12, my: 'auto' }} />
        </>
      )}

      {/* Stats Summary */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: 'text.secondary' }}>
        <Tooltip title={t('{count} Buckets Found', { count: buckets.length })}>
           <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
             <CloudDoneIcon sx={{ fontSize: 14, color: activeProfile ? 'success.main' : 'inherit' }} />
             <Typography variant="caption">{buckets.length}</Typography>
           </Box>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 12, my: 'auto' }} />

        <Tooltip title={t('{count} Active Transfers', { count: activeTransfers.length })}>
           <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
             <TransferIcon sx={{ fontSize: 13, color: activeTransfers.length > 0 ? 'primary.main' : 'inherit' }} />
             <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{activeTransfers.length}</Typography>
             {activeTransfers.length > 0 && <Typography variant="caption" sx={{ fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', display: { xs: 'none', lg: 'block' } }}>{(['Upload', 'Download'] as const).filter(type => activeTransfers.some(job => job.transfer_type === type)).map(type => `${t(type)}: ${formatTransferSpeed(totalTransferSpeed(activeTransfers, type))}`).join(' · ')}</Typography>}
           </Box>
        </Tooltip>
      </Box>

      {/* Production Version */}
      <Typography variant="caption" sx={{ color: 'text.disabled', ml: 1, fontSize: '0.65rem' }}>
        ArcaX v{appVersion || '...'}
      </Typography>
    </Box>
  );
}
