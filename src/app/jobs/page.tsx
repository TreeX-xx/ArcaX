'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Typography } from '@mui/material';
import { Schedule } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { jobsApi, SavedJob } from '@/lib/tauri';
import { useProfileStore } from '@/store/profileStore';
import { BaseDialog } from '@/components/common/BaseDialog';
import { useI18n } from '@/lib/i18n';

const buttonSx = { borderRadius: 1, color: 'text.primary' };
const date = (time: number, locale: string) => new Date(time * 1000).toLocaleString(locale);

export default function JobsPage() {
  const { t, locale } = useI18n();
  const [jobs, setJobs] = useState<SavedJob[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<SavedJob | null>(null);
  const [cancelling, setCancelling] = useState<SavedJob | null>(null);
  const profiles = useProfileStore(state => state.profiles);
  const router = useRouter();
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try { const result = await jobsApi.list(); if (alive.current) { setJobs(result); setError(''); } }
    catch (e) { if (alive.current) setError(String(e)); }
  }, []);
  useEffect(() => {
    alive.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() { await refresh(); if (!stopped) timer = setTimeout(poll, 2000); }
    void poll();
    return () => { alive.current = false; stopped = true; clearTimeout(timer); };
  }, [refresh]);
  const [actionError, setActionError] = useState('');
  const actionLock = useRef(false);
  async function act(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setActionError('');
    try { await action(); if (alive.current) { setDeleting(null); setCancelling(null); await refresh(); } }
    catch (e) { if (alive.current) setActionError(String(e)); }
    finally { actionLock.current = false; if (alive.current) setBusy(false); }
  }
  return <Box sx={{ minWidth: 0 }}>
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}><Schedule color="primary" /><Typography variant="h4" component="h1" fontWeight={600}>{t('Jobs')}</Typography></Box>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: '75ch' }}>{t('Saved folder-to-S3 syncs across your profiles. Runs only while ArcaX is open. Missed runs while closed, interrupted runs, and failures pause their schedules. Files and remote-only objects are never deleted.')}</Typography>
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      <Button size="small" sx={buttonSx} variant="outlined" onClick={() => router.push('/')}>{t('Browse buckets')}</Button>
      <Button size="small" sx={buttonSx} onClick={() => router.push('/uploads')}>{t('View uploads')}</Button>
      <Button size="small" sx={buttonSx} disabled={busy} onClick={() => void refresh()}>{t('Refresh jobs')}</Button>
    </Box>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('To add a job, open a bucket and choose Upload, Sync local folder, then Save as a job. To change a configuration, delete it and save a new one. Pause stops future runs; cancel queued or active transfers in Uploads.')}</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {actionError && !deleting && !cancelling && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
    {!jobs && !error && <Box role="status" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><CircularProgress size={18} />{t('Loading jobs...')}</Box>}
    {jobs?.length === 0 && <Typography sx={{ py: 3 }}>{t('No saved jobs yet. Save a folder sync to repeat it here.')}</Typography>}
    {jobs?.map(job => {
      const active = !!job.last_run && job.last_run.finished_at === null;
      const profile = profiles.find(p => p.id === job.config.profile_id);
      return <Box component="section" aria-label={job.config.name} key={job.id} sx={{ py: 2, borderTop: '1px solid', borderColor: 'divider', overflowWrap: 'anywhere' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1 }}>
          <Box sx={{ minWidth: 0 }}><Typography variant="h6" component="h2">{job.config.name}</Typography><Typography variant="body2" color="text.secondary">{profile?.name ?? t('Profile unavailable')} · {job.config.interval_minutes ? t('Every {count} minutes after completion', { count: job.config.interval_minutes }) : t('Manual only')}{job.config.interval_minutes && !job.enabled ? ` · ${t('Paused')}` : ''}</Typography></Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="small" sx={buttonSx} variant="outlined" disabled={busy || active || !profile} onClick={() => void act(() => jobsApi.run(job.id))}>{t('Run now')}</Button>
            {active && <Button size="small" sx={buttonSx} disabled={busy || job.last_run?.cancel_requested} onClick={() => { setActionError(''); setCancelling(job); }}>{job.last_run?.cancel_requested ? t('Cancelling...') : t('Cancel run')}</Button>}
            {job.config.interval_minutes && <Button size="small" sx={buttonSx} disabled={busy || (!job.enabled && !profile)} onClick={() => void act(() => jobsApi.setEnabled(job.id, !job.enabled))}>{job.enabled ? t('Pause') : t('Resume')}</Button>}
            <Button size="small" sx={buttonSx} disabled={busy || active} onClick={() => { setActionError(''); setDeleting(job); }}>{t('Delete')}</Button>
          </Box>
        </Box>
        <Typography variant="body2">{job.config.local_path}</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>{t('To s3://{bucket}/{prefix}', { bucket: job.config.bucket, prefix: job.config.prefix })}</Typography>
        <Typography variant="body2" color="text.secondary">{job.config.options.skip_existing ? t('Skip existing objects') : t('Replace changed or unverified objects')} · {job.config.bandwidth ? t('{value} KiB/s per transfer', { value: job.config.bandwidth / 1024 }) : t('Unlimited bandwidth')}</Typography>
        {(job.config.options.include.length > 0 || job.config.options.exclude.length > 0) && <Typography variant="body2" color="text.secondary">{t('Include: {include}. Exclude: {exclude}.', { include: job.config.options.include.join(', ') || t('All files'), exclude: job.config.options.exclude.join(', ') || t('None') })}</Typography>}
        <Typography variant="body2" sx={{ mt: 1 }}>{t('Next run: {value}', { value: active ? t('After this run completes, if enabled') : job.next_run ? date(job.next_run, locale) : t('Not scheduled') })}</Typography>
        {job.last_run ? <Typography variant="body2" role="status" color={['Failed', 'Interrupted', 'Cancelled', 'Missed'].includes(job.last_run.status) ? 'error.main' : 'text.primary'} sx={{ mt: 0.5 }}>{t(job.last_run.status)} · {date(job.last_run.finished_at ?? job.last_run.started_at, locale)}. {t(job.last_run.message)}</Typography> : <Typography variant="body2" color="text.secondary">{t('Not run yet.')}</Typography>}
      </Box>;
    })}
    <Divider />
    {cancelling && <BaseDialog open title={t('Cancel this job run?')} onClose={() => { if (!busy) setCancelling(null); }} actions={<><Button size="small" sx={buttonSx} disabled={busy} onClick={() => setCancelling(null)}>{t('Keep running')}</Button><Button size="small" color="error" sx={{ borderRadius: 1 }} disabled={busy} onClick={() => void act(() => jobsApi.cancel(cancelling.id))}>{t('Cancel run')}</Button></>}>
      <Typography>{t('Cancel pending and active transfers for this run and pause its schedule? Completed uploads will remain. A local scan already in progress may take a few minutes to stop.')}</Typography>
      {actionError && <Alert severity="error" sx={{ mt: 2 }}>{actionError}</Alert>}
    </BaseDialog>}
    {deleting && <BaseDialog open title={t('Delete saved job?')} onClose={() => { if (!busy) setDeleting(null); }} actions={<><Button size="small" sx={buttonSx} disabled={busy} onClick={() => setDeleting(null)}>{t('Keep job')}</Button><Button size="small" color="error" sx={{ borderRadius: 1 }} disabled={busy} onClick={() => void act(() => jobsApi.delete(deleting.id))}>{t('Delete job')}</Button></>}>
      <Typography sx={{ overflowWrap: 'anywhere' }}>{t('Delete {name} and its schedule? This will not delete local files, S3 objects, or transfer history.', { name: deleting.config.name })}</Typography>
      {actionError && <Alert severity="error" sx={{ mt: 2 }}>{actionError}</Alert>}
    </BaseDialog>}
  </Box>;
}
