'use client';
import { Accordion, AccordionSummary, AccordionDetails, Box, Button, Checkbox, FormControlLabel, IconButton, TextField, Typography } from '@mui/material';
import { ExpandMore, Close } from '@mui/icons-material';
import { PublicUrlSettings } from '@/lib/tauri';
import { validateHttpUrl } from '@/lib/urlImport';
import { urlActionStyles } from '@/components/common/urlActionStyles';
import { tGlobal, useI18n } from '@/lib/i18n';

export interface PublicUrlForm { base: string; includeBucket: boolean; overrides: { bucket: string; url: string }[] }
export const emptyPublicUrlForm = (): PublicUrlForm => ({ base: '', includeBucket: false, overrides: [] });
export function publicUrlSettings(form: PublicUrlForm): PublicUrlSettings {
  const validate = (value: string) => {
    const error = validateHttpUrl(value); if (error) throw new Error(error);
    if (new URL(value).search) throw new Error(tGlobal('Public base URLs cannot contain query parameters. Keep signed links separate.'));
  };
  const base = form.base.trim(); if (base) validate(base);
  const overrides: Record<string, string> = Object.create(null);
  for (const row of form.overrides) {
    const bucket = row.bucket.trim(), url = row.url.trim();
    if (!bucket || bucket.includes('/') || Object.hasOwn(overrides, bucket)) throw new Error(tGlobal('Each public URL override needs a unique bucket name.'));
    validate(url); overrides[bucket] = url;
  }
  return { base_url: base, include_bucket: form.includeBucket, bucket_overrides: overrides };
}
export default function PublicUrlFields({ value, onChange }: { value: PublicUrlForm; onChange: (value: PublicUrlForm) => void }) {
  const { t } = useI18n();
  return <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMore />}><Typography variant="body2" fontWeight={600}>{t('Public URLs and CDN (optional)')}</Typography></AccordionSummary>
    <AccordionDetails sx={{ px: 0 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">{t('Used only when copying public links. This does not make files public or change S3 permissions. Leave blank to use the S3 endpoint.')}</Typography>
        <TextField size="small" fullWidth label={t('Public / CDN base URL')} placeholder="https://cdn.example.com/assets" value={value.base} onChange={e => onChange({ ...value, base: e.target.value })} />
        <FormControlLabel control={<Checkbox size="small" checked={value.includeBucket} onChange={(_, checked) => onChange({ ...value, includeBucket: checked })} />} label={t('Append the bucket name before the file path')} />
        <Typography variant="body2">{t('Bucket overrides point directly to that bucket\'s public root.')}</Typography>
        {value.overrides.map((row, index) => <Box key={index} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <TextField size="small" label={t('Bucket {index}', { index: index + 1 })} value={row.bucket} sx={{ flex: '1 1 140px' }} onChange={e => onChange({ ...value, overrides: value.overrides.map((v, i) => i === index ? { ...v, bucket: e.target.value } : v) })} />
          <TextField size="small" label={t('Public root {index}', { index: index + 1 })} value={row.url} sx={{ flex: '2 1 230px' }} onChange={e => onChange({ ...value, overrides: value.overrides.map((v, i) => i === index ? { ...v, url: e.target.value } : v) })} />
          <IconButton size="small" aria-label={t('Remove bucket override {index}', { index: index + 1 })} onClick={() => onChange({ ...value, overrides: value.overrides.filter((_, i) => i !== index) })}><Close fontSize="small" /></IconButton>
        </Box>)}
        <Button size="small" sx={[urlActionStyles, { alignSelf: 'flex-start' }]} disabled={value.overrides.length >= 100} onClick={() => onChange({ ...value, overrides: [...value.overrides, { bucket: '', url: '' }] })}>{t('Add bucket override')}</Button>
      </Box>
    </AccordionDetails>
  </Accordion>;
}
