'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, Pagination, TextField, Typography } from '@mui/material';
import { Close, ExpandLess, ExpandMore } from '@mui/icons-material';
import { BaseDialog } from '@/components/common/BaseDialog';
import { urlActionStyles } from '@/components/common/urlActionStyles';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DEFAULT_URL_LIMIT, MAX_MANIFEST_BYTES, MAX_URL_IMPORTS, parseUrlImports, UrlImportEntry, validateImport } from '@/lib/urlImport';
import { urlApi } from '@/lib/tauri';
import { useTransferStore } from '@/store/transferStore';
import { useProfileStore } from '@/store/profileStore';
import { toast } from '@/store/toastStore';
import { useI18n } from '@/lib/i18n';

interface Props { bucket: string; region?: string; prefix: string; profileId: string; onClose: () => void; initialPath?: string; initialLimits?: { max_bytes: number; max_attempts?: number; sha256: string | null } }
interface Row { id: number; entry: UrlImportEntry; headerText: string; expanded: boolean }
const pill = urlActionStyles;
export default function UrlImportDialog({ bucket, region, prefix, profileId, onClose, initialPath, initialLimits }: Props) {
  const { t } = useI18n();
  const activeProfile = useProfileStore(s => s.activeProfileId);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [discard, setDiscard] = useState(false);
  const pending = useRef(false), alive = useRef(true), nextId = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const update = (id: number, patch: Partial<UrlImportEntry>) => setRows(current => current.map(r => r.id === id ? { ...r, entry: { ...r.entry, ...patch } } : r));
  const materialize = (row: Row): UrlImportEntry => ({ ...row.entry, headers: JSON.parse(row.headerText || '{}') });
  const errors = rows.map(row => {
    try { const entry = materialize(row); return validateImport(entry) || (new TextEncoder().encode(prefix + entry.path).length > 1024 ? t('Full destination key exceeds 1,024 bytes.') : rows.some(other => other.id !== row.id && other.entry.path === entry.path) ? t('Duplicate destination path. Rename or remove this entry.') : ''); }
    catch { return t('Headers must be a valid JSON object.'); }
  });
  const add = (source: string, format: 'text' | 'csv' | 'json') => {
    const parsed = parseUrlImports(source, format);
    if (rows.length + parsed.length > MAX_URL_IMPORTS) throw new Error(t('At most {count} files per batch.', { count: MAX_URL_IMPORTS }));
    if (initialPath && (parsed.length !== 1 || rows.length)) throw new Error(t('Add one replacement source URL for this file.'));
    setRows(current => [...current, ...parsed.map(entry => ({ id: nextId.current++, entry: { ...entry, ...(initialLimits ? { max_bytes: initialLimits.max_bytes, sha256: initialLimits.sha256, max_attempts: initialLimits.max_attempts || 3 } : {}), path: initialPath ?? entry.path }, headerText: JSON.stringify(entry.headers, null, 2), expanded: false }))]);
    setText(''); setError('');
  };
  const close = () => { if (pending.current || reading) return; if (rows.length || text.trim()) setDiscard(true); else onClose(); };
  async function submit() {
    if (pending.current || reading || !rows.length || errors.some(Boolean) || activeProfile !== profileId) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const count = await urlApi.importUrls(bucket, region, prefix, rows.map(materialize), profileId);
      void useTransferStore.getState().refreshJobs(); useTransferStore.getState().showPanel();
      toast.success(t('{count} URL imports queued', { count }), t('Follow progress in Uploads.'));
      if (alive.current) onClose();
    } catch (e) { if (alive.current) setError(String(e)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <><BaseDialog open title={initialPath ? t('Replace import source') : t('Import from URLs')} maxWidth="md" onClose={close} closeDisabled={busy || reading} actions={<>
    <Button size="small" sx={pill} disabled={busy || reading} onClick={close}>{t('Cancel')}</Button>
    <Button size="small" sx={pill} variant="contained" onClick={submit} disabled={busy || reading || !!text.trim() || !rows.length || errors.some(Boolean) || activeProfile !== profileId}>{busy ? t('Queueing...') : t('Import files')}</Button>
  </>}>
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{t('Destination: s3://{bucket}/{prefix}{path}', { bucket, prefix, path: initialPath || '' })}</Typography>
      <Typography variant="body2" color="text.secondary">{t('Files pass through this computer using temporary disk space. URLs and headers are kept only for this session. Public internet sources only.')}</Typography>
      <TextField label={t('Source URLs')} multiline minRows={3} maxRows={6} fullWidth value={text} onChange={e => setText(e.target.value)} disabled={busy || reading} helperText={t('One URL per line. Add links to review before importing. No S3 permissions are changed.')} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button size="small" sx={pill} variant="outlined" disabled={busy || reading || !text.trim()} onClick={() => { try { add(text, 'text'); } catch (e) { setError(String(e)); } }}>{t('Add links')}</Button>
        <Button size="small" sx={pill} disabled={busy || reading} onClick={() => input.current?.click()}>{t('Import CSV / JSON')}</Button>
        <input ref={input} type="file" accept=".csv,.json" aria-label={t('Import URL file')} style={{ display: 'none' }} onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
          setReading(true);
          try { if (file.size > MAX_MANIFEST_BYTES) throw new Error(t('Import file exceeds 2 MiB.')); if (!/\.(csv|json)$/i.test(file.name)) throw new Error(t('Choose a CSV or JSON file.')); const content = await file.text(); if (alive.current) add(content, file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'); }
          catch (e) { if (alive.current) setError(String(e)); }
          finally { if (alive.current) setReading(false); }
        }} />
        {reading && <CircularProgress size={16} />}
      </Box>
      <Typography variant="caption" color="text.secondary">{t('CSV requires a url column. JSON accepts an array of URLs or objects. Optional fields: path, replace, headers, sha256, max_bytes, max_attempts. Up to {count} files / 2 MiB.', { count: MAX_URL_IMPORTS })}</Typography>
      {rows.length > 0 && <>
        <Typography variant="body2" fontWeight={600}>{t('{count} files to review', { count: rows.length })}</Typography>
        {rows.slice((page - 1) * 10, page * 10).map(row => {
          const rowError = errors[rows.indexOf(row)];
          let host = t('Invalid URL'); try { host = new URL(row.entry.url).host; } catch { /* validated below */ }
          return <Box key={row.id} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1.5, minWidth: 0 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField fullWidth size="small" label={t('Destination filename / path')} value={row.entry.path} disabled={busy || !!initialPath} onChange={e => update(row.id, { path: e.target.value })} />
              <IconButton size="small" aria-label={t('Configure {name}', { name: row.entry.path || t('file') })} aria-expanded={row.expanded} disabled={busy} onClick={() => setRows(current => current.map(r => r.id === row.id ? { ...r, expanded: !r.expanded } : r))}>{row.expanded ? <ExpandLess /> : <ExpandMore />}</IconButton>
              <IconButton size="small" aria-label={t('Remove {name} from import', { name: row.entry.path || t('file') })} disabled={busy} onClick={() => { setRows(current => current.filter(r => r.id !== row.id)); setPage(1); }}><Close fontSize="small" /></IconButton>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .5, overflowWrap: 'anywhere' }}>{host} · {row.entry.replace ? t('Replace only if destination is unchanged') : t('Do not replace existing files')}</Typography>
            {row.expanded && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
              <TextField size="small" label={t('Source URL')} type="password" autoComplete="off" fullWidth value={row.entry.url} disabled={busy} onChange={e => update(row.id, { url: e.target.value })} helperText={t('Hidden to protect signed URL tokens. Paste a fresh URL here if it expires.')} />
              <FormControlLabel control={<Checkbox size="small" disabled={busy} checked={row.entry.replace} onChange={(_, checked) => update(row.id, { replace: checked })} />} label={t('Allow replacement of this destination file')} />
              <TextField size="small" label={t('Maximum download size (GiB)')} type="number" value={Number.isFinite(row.entry.max_bytes) ? row.entry.max_bytes / 1024 ** 3 : ''} disabled={busy} onChange={e => update(row.id, { max_bytes: Math.round(Number(e.target.value) * 1024 ** 3) })} helperText={t('Default {size} GiB. Adjust for large files. Requires available temporary disk space.', { size: DEFAULT_URL_LIMIT / 1024 ** 3 })} />
              <TextField size="small" label={t('Expected SHA-256 (optional)')} value={row.entry.sha256 || ''} disabled={busy} onChange={e => update(row.id, { sha256: e.target.value || null })} />
              <TextField size="small" label={t('Download attempts')} type="number" value={row.entry.max_attempts} disabled={busy} onChange={e => update(row.id, { max_attempts: Number(e.target.value) })} helperText={t('1 to 5 attempts, including the first. Only temporary download failures retry automatically.')} />
              <TextField size="small" label={t('Source headers (JSON, optional)')} multiline minRows={2} value={row.headerText} disabled={busy} autoComplete="off" onChange={e => setRows(current => current.map(r => r.id === row.id ? { ...r, headerText: e.target.value } : r))} helperText={t('Example: {"Authorization":"Bearer token"}. Headers are not forwarded to another origin on redirects.')} />
            </Box>}
            {rowError && <Alert severity="error" sx={{ mt: 1 }}>{rowError}</Alert>}
          </Box>;
        })}
        {rows.length > 10 && <Pagination size="small" count={Math.ceil(rows.length / 10)} page={page} onChange={(_, value) => setPage(value)} />}
      </>}
      {rows.some(r => r.entry.replace) && <Alert severity="warning">{t('You have allowed replacement for some files. Those files will be replaced only if their destination ETag still matches the queue-time check.')}</Alert>}
      {busy && <Typography role="status" variant="body2">{t('Checking replacement destinations and queueing imports...')}</Typography>}
      {activeProfile !== profileId && <Alert severity="warning">{t('Switch back to this transfer\'s connection before importing.')}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  </BaseDialog><ConfirmDialog open={discard} title={t('Discard import draft?')} message={t('These URLs have not been queued. Discard the draft or keep reviewing.')} confirmLabel={t('Discard draft')} cancelLabel={t('Keep reviewing')} onClose={() => setDiscard(false)} onConfirm={onClose} /></>;
}
