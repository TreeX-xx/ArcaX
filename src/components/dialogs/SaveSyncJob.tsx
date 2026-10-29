'use client';

import { useRef, useState, useEffect } from 'react';
import { Alert, Box, Button, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import { StyledCheckbox } from '@/components/common/StyledCheckbox';
import { jobsApi, SavedJobConfig } from '@/lib/tauri';
import { toast } from '@/store/toastStore';
import { useI18n } from '@/lib/i18n';

export default function SaveSyncJob({ config, onBusy, blocked }: {
  config: Omit<SavedJobConfig, 'name' | 'interval_minutes' | 'allow_replacement'>;
  onBusy: (busy: boolean) => void;
  blocked: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [interval, setInterval] = useState(0);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function save() {
    if (busy || blocked || !approved) return;
    setBusy(true); onBusy(true); setError('');
    try {
      await jobsApi.save({ ...config, name: name.trim(), interval_minutes: interval || null, allow_replacement: !config.options.skip_existing }, approved);
      toast.success(t('Job saved. Manage it in Jobs.'));
      if (alive.current) setSaved(true);
    } catch (e) { if (alive.current) setError(String(e)); }
    finally { if (alive.current) { setBusy(false); onBusy(false); } }
  }
  if (saved) return <Alert severity="success" sx={{ mb: 2 }}>{t('Job saved. Open Jobs to run it, pause its schedule, or view its result.')}</Alert>;
  return <Box component="fieldset" disabled={busy || blocked} sx={{ border: 0, borderTop: '1px solid', borderColor: 'divider', pt: 2, px: 0, mx: 0, mb: 2, minWidth: 0 }}>
    <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>{t('Save this sync as a job')}</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 2, mb: 1 }}>
      <TextField size="small" label={t('Job name')} value={name} disabled={busy} inputProps={{ maxLength: 120 }} onChange={e => { setName(e.target.value); setApproved(false); }} />
      <TextField select size="small" label={t('Schedule')} value={interval} disabled={busy} onChange={e => { setInterval(Number(e.target.value)); setApproved(false); }}>
        <MenuItem value={0}>{t('Manual only')}</MenuItem><MenuItem value={15}>{t('Every 15 minutes')}</MenuItem><MenuItem value={60}>{t('Every hour')}</MenuItem><MenuItem value={1440}>{t('Every day')}</MenuItem><MenuItem value={10080}>{t('Every week')}</MenuItem>
      </TextField>
    </Box>
    <Typography variant="body2" color="text.secondary">{t('Runs only while ArcaX is open. The first scheduled run starts after the selected interval; later intervals start when a run finishes. Missed runs while closed are paused, not replayed. Failures pause the schedule.')}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{t('Each run compares fresh content with these filters. Bandwidth per transfer: {value}. To change a saved configuration, delete it and save a new job.', { value: config.bandwidth ? t('{value} KiB/s', { value: config.bandwidth / 1024 }) : t('Unlimited') })}</Typography>
    <FormControlLabel disabled={busy} sx={{ ml: 0, gap: 1, my: 1, alignItems: 'flex-start' }} control={<StyledCheckbox aria-label={t('Approve saved job')} checked={approved} onChange={e => { if (!busy) setApproved(e.target.checked); }} />} label={config.options.skip_existing
      ? t('I approve future uploads from this folder to this destination. Existing objects will be skipped. S3 charges may apply.')
      : t('I approve future uploads and replacement of changed or unverified objects, without another prompt. Previous contents may be unrecoverable without bucket versioning. S3 charges may apply.')} />
    {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
    <Button size="small" variant="outlined" sx={{ borderRadius: 1, color: 'text.primary' }} disabled={!name.trim() || !approved || busy || blocked} onClick={save}>{busy ? t('Saving job...') : t('Save job')}</Button>
  </Box>;
}
