'use client';

import { useState, useMemo, useEffect, useRef, Suspense, useDeferredValue } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Skeleton,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  Tooltip,
  Button,
  Container,
  CircularProgress,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  Cloud as CloudIcon,
  Storage as StorageIcon,
  Refresh as RefreshIcon,
  FolderOpen as FolderOpenIcon,
  MoreVert as MoreVertIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useProfileStore } from '@/store/profileStore';
import { useBuckets } from '@/hooks/useBuckets';
import { useHistoryStore } from '@/store/historyStore';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toastStore';
import BucketManagementDialog, { type BucketAction } from '@/components/dialogs/BucketManagementDialog';
import { useI18n, tGlobal } from '@/lib/i18n';

function HomeContent() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { activeProfileId, profiles } = useProfileStore();
  const { recentPathEntries, addPath } = useHistoryStore();
  const { addTab, activeTabId, updateTab } = useAppStore();
  
  // Use query parameter to toggle view instead of local state
  const searchParams = useSearchParams();
  const showBuckets = searchParams.get('view') === 'discovery';
  const { buckets, isLoading, error, refresh } = useBuckets({ enabled: showBuckets });
  
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [s3UriInput, setS3UriInput] = useState('');
  
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const [bucketAction, setBucketAction] = useState<BucketAction | null>(null);
  const [bucketMenu, setBucketMenu] = useState<{ anchor: HTMLElement; name: string; region: string; profileId: string } | null>(null);

  useEffect(() => useProfileStore.subscribe((state, previous) => {
    if (state.activeProfileId !== previous.activeProfileId) {
      setBucketAction(null);
      setBucketMenu(null);
    }
  }), []);
  

  const filteredBuckets = useMemo(() => {
    if (!deferredSearchQuery.trim()) return buckets;
    const query = deferredSearchQuery.toLowerCase();
    return buckets.filter(bucket => 
      bucket.name.toLowerCase().includes(query) || 
      bucket.region.toLowerCase().includes(query)
    );
  }, [buckets, deferredSearchQuery]);

  const recentPaths = useMemo(
    () => recentPathEntries
      .filter((entry) => entry.profileId === activeProfileId)
      .map((entry) => entry.path),
    [activeProfileId, recentPathEntries]
  );

  const handleFetchBuckets = () => {
    const path = '/?view=discovery';
    if (activeTabId && activeTabId !== 'home') {
      updateTab(activeTabId, { title: 'Buckets', path, icon: 'cloud' });
    } else {
      addTab({ title: 'Buckets', path, icon: 'cloud' });
    }
    router.push(path);
  };

  const validateAndParsePath = (path: string): { bucket: string; region?: string; prefix: string; hasTrailingSlash: boolean } | null => {
    const trimmedPath = path.trim();
    if (!trimmedPath.startsWith('s3://')) return null;
    
    // Check if it's a valid S3 URI format: s3://bucket-name or s3://bucket-name/prefix/
    // Supports explicit region: s3://bucket-name@region/prefix/
    const s3UriMatch = trimmedPath.match(/^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:@([a-z0-9-]+))?(\/(.*))?$/i);
    
    if (s3UriMatch) {
      const bucket = s3UriMatch[1];
      const region = s3UriMatch[2];
      const rawPrefix = s3UriMatch[4] || '';
      const hasTrailingSlash = rawPrefix.endsWith('/');
      const prefix = rawPrefix.replace(/\/$/, '');
      return { bucket, region, prefix, hasTrailingSlash };
    }
    return null;
  };

  const isNavigating = useRef(false);

  const handleNavigate = (path: string) => {
    // 1. Prevent double navigation in the same frame
    if (isNavigating.current) return;

    const trimmedPath = path.trim();
    if (!trimmedPath) {
      toast.error(t('Enter S3 URI'), t('Please enter a valid S3 URI.'));
      return;
    }

    const parsed = validateAndParsePath(trimmedPath);
    if (!parsed) {
      toast.error(t('Invalid S3 URI'), t('Path must start with s3://bucket-name/'));
      return;
    }
    
    const { bucket, region: explicitRegion, prefix, hasTrailingSlash } = parsed;
    isNavigating.current = true;
    setTimeout(() => { isNavigating.current = false; }, 500);
    
    const activeProfile = profiles.find(p => p.id === activeProfileId);
    // Priority: 1. Explicit region, 2. Discovered region from store, 3. Profile default
    const { discoveredRegions } = useAppStore.getState();
    const region = explicitRegion || discoveredRegions[bucket] || activeProfile?.region || 'us-east-1';
    
    // Determine if we should append a slash
    let finalPrefix = prefix;
    if (prefix) {
        const hasExtension = /\.[a-zA-Z0-9]{2,10}$/.test(prefix);
        if (hasTrailingSlash || !hasExtension) {
            finalPrefix = prefix + '/';
        } else {
            finalPrefix = prefix;
        }
    }

    const urlPath = `/bucket?name=${bucket}&region=${region}${finalPrefix ? `&prefix=${encodeURIComponent(finalPrefix)}` : ''}`;
    addPath(`s3://${bucket}${explicitRegion ? '@' + explicitRegion : ''}/${finalPrefix}`, activeProfileId || undefined);
    addTab({ title: bucket, path: urlPath, icon: 'bucket' });
    router.push(urlPath);
  };

  // Show error as toast
  useEffect(() => {
    if (error && showBuckets) {
      toast.error(tGlobal('Failed to load buckets'), error);
    }
  }, [error, showBuckets]);
  
  if (!activeProfile) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '60vh', 
        textAlign: 'center', 
        p: 3 
      }}>
        <CloudIcon sx={{ fontSize: 100, color: 'text.secondary', mb: 3, opacity: 0.5 }} />
        <Typography variant="h5" color="text.primary" gutterBottom fontWeight={600}>
          {t('No Profile Selected')}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 400, mb: 4 }}>
          {t('Select an existing profile from the top bar or create a new one to start browsing your S3 buckets.')}
        </Typography>
      </Box>
    );
  }
  
  const renderBucketList = () => {
    if (isLoading) {
      return (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 600 }}>{t('Name')}</TableCell>
                <TableCell width={120} sx={{ fontWeight: 600 }}>{t('Region')}</TableCell>
                <TableCell width={150} sx={{ fontWeight: 600 }}>{t('Created')}</TableCell>
                <TableCell width={100} align="right" sx={{ fontWeight: 600 }}>{t('Size')}</TableCell>
                <TableCell width={50}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Skeleton variant="circular" width={32} height={32} />
                      <Skeleton variant="text" width={200} />
                    </Box>
                  </TableCell>
                  <TableCell><Skeleton variant="text" width={80} /></TableCell>
                  <TableCell><Skeleton variant="text" width={100} /></TableCell>
                  <TableCell align="right"><Skeleton variant="text" width={60} /></TableCell>
                  <TableCell><Skeleton variant="circular" width={24} height={24} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }
    
    if (filteredBuckets.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 8, bgcolor: 'action.hover', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
          <FolderOpenIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" color="text.secondary">
            {searchQuery ? t('No buckets match your search') : t('No Buckets Found')}
          </Typography>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => refresh()}
            sx={{ mt: 2 }}
          >
            {t('Refresh List')}
          </Button>
        </Box>
      );
    }
    
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mb: 4, borderRadius: 1, overflow: 'hidden' }}>
      <Table sx={{ minWidth: 650 }} aria-label={t('buckets table')}>
        <TableHead>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell sx={{ fontWeight: 600 }}>{t('Bucket Name')}</TableCell>
            <TableCell sx={{ fontWeight: 600 }} width={140}>{t('Region')}</TableCell>
            <TableCell sx={{ fontWeight: 600 }} width={180}>{t('Created')}</TableCell>
            <TableCell sx={{ fontWeight: 600 }} align="right" width={120}>{t('Total Size')}</TableCell>
            <TableCell width={60}>{t('Actions')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredBuckets.map((bucket) => (
            <TableRow
              key={bucket.name}
              hover
              onClick={() => {
                const path = `/bucket?name=${bucket.name}&region=${bucket.region}`;
                addTab({ title: bucket.name, path, icon: 'bucket' });
                router.push(path);
              }}
              sx={{ 
                cursor: 'pointer',
                '&:last-child td, &:last-child th': { border: 0 },
                transition: 'background-color 0s', // Theme standard speed
              }}
            >
              <TableCell component="th" scope="row">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <StorageIcon color="primary" sx={{ fontSize: 24, opacity: 0.8 }} />
                  <Typography variant="body1" fontWeight={500}>
                    {bucket.name}
                  </Typography>
                </Box>
              </TableCell>
              <TableCell>
                <Chip 
                  label={bucket.region} 
                  size="small" 
                  variant="outlined" 
                  sx={{ height: 24, fontSize: '0.75rem', borderColor: 'divider', borderRadius: 1 }}
                />
              </TableCell>
              <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                {bucket.creation_date ? new Date(bucket.creation_date).toLocaleDateString(locale) : '—'}
              </TableCell>
              <TableCell align="right" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {bucket.total_size_formatted || '—'}
              </TableCell>
              <TableCell align="right">
                  <IconButton size="small" aria-label={t('Manage {name}', { name: bucket.name })} onClick={event => {
                    event.stopPropagation();
                    if (activeProfileId) setBucketMenu({ anchor: event.currentTarget, name: bucket.name, region: bucket.region, profileId: activeProfileId });
                  }}><MoreVertIcon fontSize="small" /></IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};


  const renderLanding = () => (
    <Box sx={{ minHeight: 'calc(100dvh - 185px)', display: 'flex', alignItems: 'center', justifyContent: 'center', py: 5 }}>
      <Container maxWidth="sm" sx={{ pb: 5 }}>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1.5 }}>{activeProfile.name} / {t('Workspace')}</Typography>
        <Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 550, letterSpacing: '-0.045em', mb: 1 }}>{t('Where would you like to go?')}</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 14, mb: 4 }}>{t('Open a bucket or jump straight to a path.')}</Typography>
        <Paper variant="outlined" sx={{ p: 1, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.default' }}>
          <TextField fullWidth variant="outlined" size="small" placeholder="s3://bucket/prefix/" value={s3UriInput} onChange={e => setS3UriInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleNavigate(s3UriInput)}
            inputProps={{ 'aria-label': t('S3 path') }} sx={{ '& fieldset': { border: 'none' }, '& input': { fontSize: 14 } }} />
          <Button variant="contained" onClick={() => handleNavigate(s3UriInput)} sx={{ minWidth: 72, height: 36, px: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>{t('Go')}</Button>
        </Paper>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, gap: 2 }}>
          <Button variant="text" onClick={handleFetchBuckets} startIcon={<StorageIcon sx={{ fontSize: 17 }} />} sx={{ color: 'text.secondary', fontWeight: 400, px: 1 }}>{t('List All Buckets')}</Button>
          <Typography variant="caption" color="text.secondary">{t('S3-compatible storage')}</Typography>
        </Box>
        {recentPaths.length > 0 && <Box sx={{ mt: 5 }}>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1.5 }}>{t('RECENT PATHS')}</Typography>
          {recentPaths.slice(0, 3).map(path => <Button key={path} fullWidth onClick={() => handleNavigate(path)} sx={{ justifyContent: 'flex-start', px: 1, color: 'text.secondary', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</Button>)}
        </Box>}
      </Container>
    </Box>
  );

  return (
    <Box>
      {bucketAction && bucketAction.profileId === activeProfileId && <BucketManagementDialog key={`${bucketAction.mode}-${bucketAction.bucket || ''}-${bucketAction.profileId}`} action={bucketAction} onClose={() => setBucketAction(null)} />}
      <Menu anchorEl={bucketMenu?.anchor} open={!!bucketMenu && bucketMenu.profileId === activeProfileId} onClose={() => setBucketMenu(null)}>
        <MenuItem onClick={() => {
          if (bucketMenu) setBucketAction({ mode: 'policy', bucket: bucketMenu.name, region: bucketMenu.region, profileId: bucketMenu.profileId });
          setBucketMenu(null);
        }}>{t('Edit bucket policy')}</MenuItem>
        <MenuItem onClick={() => {
          if (bucketMenu) setBucketAction({ mode: 'delete', bucket: bucketMenu.name, region: bucketMenu.region, profileId: bucketMenu.profileId });
          setBucketMenu(null);
        }} sx={{ color: 'error.main' }}>{t('Delete bucket')}</MenuItem>
      </Menu>

      {showBuckets ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <IconButton onClick={() => router.push('/')} sx={{ bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                    <FolderOpenIcon />
                </IconButton>
              <Box>
                <Typography variant="h4" fontWeight={600}>
                  {t('All Buckets')}
                </Typography>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                  {activeProfile.name} • {t('{count} buckets', { count: filteredBuckets.length })}
                </Typography>
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button startIcon={<AddIcon />} variant="contained" onClick={() => activeProfileId && setBucketAction({ mode: 'create', profileId: activeProfileId, region: activeProfile.region || 'us-east-1' })}>{t('Create bucket')}</Button>
              <TextField
                placeholder={t('Search buckets...')}
                size="small"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: 250 }}
              />
              <Tooltip title={t('Refresh bucket list')}>
                <IconButton 
                  onClick={() => refresh()} 
                  disabled={isLoading} 
                  color="primary" 
                  sx={{
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <RefreshIcon className={isLoading ? 'spin-animation' : ''} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          {renderBucketList()}
        </>
      ) : renderLanding()}
      
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </Box>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}>
      <HomeContent />
    </Suspense>
  );
}
