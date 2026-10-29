'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { BaseDialog } from '@/components/common/BaseDialog';
import { StyledCheckbox } from '@/components/common/StyledCheckbox';
import { versionsApi, type ObjectVersion, type VersionHistory } from '@/lib/tauri';
import { formatSize } from '@/lib/utils';
import { useTransferStore } from '@/store/transferStore';
import { toast } from '@/store/toastStore';
import { useI18n } from '@/lib/i18n';

interface Props { bucket: string; region: string; profileId: string; initialKey: string; onClose: () => void }
const buttonSx = { borderRadius: 1 };
const secondarySx = { ...buttonSx, color: 'text.primary' };
type Translate = (message: string, vars?: Record<string, string | number>) => string;
const dateLabel = (value: string | null, t: Translate, locale: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString(locale) : t('Not provided');

export default function VersionHistoryDialog({ bucket, region, profileId, initialKey, onClose }: Props) {
  const { t, locale, language } = useI18n();
  const [key, setKey] = useState(initialKey);
  const [pages, setPages] = useState<VersionHistory[]>([]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ObjectVersion | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'load' | 'restore' | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const pending = useRef(false);
  const initialized = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = pages[0]?.versions.find(v => v.is_latest);
  const versioning = pages[0]?.versioning;
  const visible = pages[page];

  const load = useCallback(async (previous: VersionHistory[] = []) => {
    if (!key || pending.current) return;
    pending.current = true; setBusy('load'); setError(''); setSelected(null); setConfirmed(false);
    if (!previous.length) { setPages([]); setPage(0); }
    try {
      const result = await versionsApi.list(bucket, region, key, previous.at(-1)?.next ?? null, profileId);
      if (result.next && previous.some(p => p.next?.key_marker === result.next?.key_marker && p.next?.version_id_marker === result.next?.version_id_marker)) throw new Error(t('History cursor repeated. Refresh history.'));
      if (alive.current) { setPages([...previous, result]); setPage(previous.length); }
    } catch (e) { if (alive.current) setError(String(e)); }
    finally { pending.current = false; if (alive.current) setBusy(null); }
  }, [bucket, region, key, profileId, t]);
  useEffect(() => {
    if (!initialized.current) { initialized.current = true; if (initialKey && !initialKey.endsWith('/')) void load(); }
  }, [initialKey, load]);

  async function restore() {
    if (!selected || !current || !confirmed || pending.current || versioning !== 'Enabled') return;
    pending.current = true; setBusy('restore'); setError('');
    try {
      await versionsApi.restore(bucket, region, key, selected.version_id, current.version_id, confirmed, profileId);
      void useTransferStore.getState().refreshJobs();
      toast.success(t('Version restore queued. View progress in Uploads.'));
      if (alive.current) onClose();
    } catch (e) {
      if (alive.current) { setError(String(e)); setPages([]); setSelected(null); setConfirmed(false); setPage(0); }
    } finally { pending.current = false; if (alive.current) setBusy(null); }
  }
  const confirmation = t('Create a new current version from the selected contents. Existing versions and delete markers will not be deleted.');
  return <BaseDialog open title={t('Version history')} maxWidth="md" onClose={onClose} closeDisabled={busy === 'restore'} actions={<>
    <Button size="small" sx={secondarySx} disabled={busy === 'restore'} onClick={onClose}>{t('Close')}</Button>
    <Button size="small" sx={buttonSx} variant="contained" disabled={!selected || !current || !confirmed || !!busy || versioning !== 'Enabled'} onClick={restore}>{t('Restore selected version')}</Button>
  </>}>
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
      <TextField label={t('Exact object key')} value={key} size="small" fullWidth disabled={!!busy} helperText={t('Enter the full key, including folders, to find existing or deleted objects.')} onChange={e => { setKey(e.target.value); setPages([]); setPage(0); setSelected(null); setConfirmed(false); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void load(); } }} inputProps={{ autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }} />
      <Button size="small" sx={{ ...secondarySx, flexShrink: 0, mt: 0.5 }} disabled={!key || !!busy} variant="outlined" onClick={() => void load()}>{pages.length ? t('Refresh') : t('Load history')}</Button>
    </Box>
    <Typography variant="body2" sx={{ overflowWrap: 'anywhere', mb: 2 }}>{t('Object: s3://{bucket}/{key}', { bucket, key })}</Typography>
    {busy && <Box role="status" sx={{ mb: 2 }}><LinearProgress /><Typography variant="body2" sx={{ mt: 1 }}>{busy === 'load' ? t('Reading version history...') : t('Checking the selected version and queueing restore...')}</Typography></Box>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {versioning && versioning !== 'Enabled' && <Alert severity="warning" sx={{ mb: 2 }}>{t('Bucket versioning is {state}. History is read-only. Restore requires versioning to be enabled through your storage provider.', { state: language === 'zh' ? t(versioning) : versioning.toLowerCase() })}</Alert>}
    {current?.is_delete_marker && <Alert severity="info" sx={{ mb: 2 }}>{t('This object is currently deleted. Select an older data version to recover its contents without removing the delete marker.')}</Alert>}
    {visible && !visible.versions.length && <Alert severity="info">{t('No versions found for this exact key on this page.')}</Alert>}
    {!!visible?.versions.length && <Table size="small" aria-label={t('Object versions')} sx={{ tableLayout: 'fixed', width: '100%', '& .MuiTableCell-root': { overflowWrap: 'anywhere' } }}>
      <TableHead><TableRow><TableCell>{t('Version ID')}</TableCell><TableCell sx={{ width: 100 }}>{t('State')}</TableCell><TableCell sx={{ width: 125 }}>{t('Modified')}</TableCell><TableCell sx={{ width: 80 }} align="right">{t('Size')}</TableCell><TableCell sx={{ width: 108 }}>{t('Restore')}</TableCell></TableRow></TableHead>
      <TableBody>{visible.versions.map(v => <TableRow key={`${v.version_id}:${v.is_delete_marker}`} selected={selected?.version_id === v.version_id}>
        <TableCell sx={{ overflowWrap: 'anywhere' }}>{v.version_id}</TableCell>
        <TableCell>{v.is_delete_marker ? (v.is_latest ? t('Current deletion') : t('Delete marker')) : (v.is_latest ? t('Current') : t('Older version'))}</TableCell>
        <TableCell sx={{ overflowWrap: 'anywhere' }}>{dateLabel(v.modified, t, locale)}</TableCell>
        <TableCell align="right">{v.size === null ? <span aria-label={t('Not applicable')}>{t('N/A')}</span> : formatSize(v.size)}</TableCell>
        <TableCell><Button size="small" sx={secondarySx} aria-label={t('Select version {id}', { id: v.version_id })} aria-pressed={selected?.version_id === v.version_id} disabled={!!busy || v.is_latest || v.is_delete_marker || !current || versioning !== 'Enabled'} onClick={() => { setSelected(v); setConfirmed(false); }}>{selected?.version_id === v.version_id ? t('Selected') : t('Select')}</Button></TableCell>
      </TableRow>)}</TableBody>
    </Table>}
    {visible && <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, mt: 1 }}>
      <Button size="small" sx={secondarySx} disabled={page === 0 || !!busy} onClick={() => { setPage(p => p - 1); setSelected(null); setConfirmed(false); }}>{t('Previous')}</Button>
      <Typography variant="body2">{t('Page {page}', { page: page + 1 })}</Typography>
      <Button size="small" sx={secondarySx} disabled={!!busy || (page === pages.length - 1 && (!visible.next || pages.length >= 100))} onClick={() => { if (page < pages.length - 1) { setPage(p => p + 1); setSelected(null); setConfirmed(false); } else void load(pages); }}>{t('Next')}</Button>
    </Box>}
    {pages.length >= 100 && visible?.next && <Alert severity="info" sx={{ mt: 1 }}>{t('Loaded the 10,000-entry history limit. Use your provider\'s tools to inspect older versions.')}</Alert>}
    {selected && <Box sx={{ mt: 2 }}>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere', mb: 1 }}>{t('Restore version: {id}', { id: selected.version_id })}</Typography>
      <FormControlLabel sx={{ ml: 0, gap: 1, alignItems: 'flex-start' }} control={<StyledCheckbox aria-label={confirmation} checked={confirmed} onChange={e => { if (!busy) setConfirmed(e.target.checked); }} />} label={confirmation} />
    </Box>}
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>{t('Restores contents and content metadata. For an existing object, current permissions, tags, encryption and retention are kept; for a deleted object, bucket defaults apply. Uses temporary disk space and this computer\'s connection. Request and transfer charges may apply.')}</Typography>
  </BaseDialog>;
}
