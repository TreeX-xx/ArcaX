import {
  Typography,
  Box,
  Link,
  Chip,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import { GitHub as GitHubIcon } from '@mui/icons-material';
import { getVersion } from '@tauri-apps/api/app';
import { useState, useEffect } from 'react';
import { BaseDialog } from '../common/BaseDialog';
import { BrandMark } from '../common/BrandMark';
import { isTauri } from '@/lib/tauri';
import { useI18n } from '@/lib/i18n';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  const { t } = useI18n();
  const [version, setVersion] = useState<string>(() => (isTauri() ? '...' : 'Web'));
  const theme = useTheme();

  useEffect(() => {
    if (!open || !isTauri()) {
      return;
    }

    getVersion().then(setVersion).catch(() => setVersion(t('Unknown')));
  }, [open, t]);

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={t('About ArcaX')}
      maxWidth="xs"
    >
      <Box sx={{ textAlign: 'center', pb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2.5 }}>
          <BrandMark size={72} />
        </Box>

        <Typography variant="h3" sx={{ fontSize: '1.35rem', mb: 1 }}>ArcaX</Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 3 }}>
          <Chip
            label={t('Version {version}', { version })}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
              border: 'none'
            }}
          />
          <Chip
            label={t('Desktop')}
            size="small"
            sx={{
              bgcolor: 'action.hover',
              color: theme.palette.text.secondary,
              border: 'none'
            }}
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, lineHeight: 1.7 }}>
          {t('A fast, focused desktop client for Amazon S3 and S3-compatible object storage. Built for large buckets, deep prefixes, and quick transfers.')}
        </Typography>

        <Divider sx={{ mb: 3 }} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {t('ArcaX is derived from an open-source S3 browser project and keeps its MIT license.')}
          </Typography>
          <Link
            href="https://github.com/TreeX-xx/ArcaX"
            target="_blank"
            rel="noopener"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              fontSize: '0.78rem',
              fontWeight: 600,
              color: theme.palette.text.secondary,
              textDecoration: 'none',
              '&:hover': { color: theme.palette.primary.main }
            }}
          >
            <GitHubIcon sx={{ fontSize: 15 }} />
            {t('ArcaX on GitHub')}
          </Link>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, letterSpacing: '0.08em' }}>
            TAURI · REACT · RUST · NEXT.JS
          </Typography>
          <Typography variant="caption" display="block" color="text.disabled" sx={{ mt: 0.75, opacity: 0.6 }}>
            MIT License · TreeX-xx and Claude
          </Typography>
        </Box>
      </Box>
    </BaseDialog>
  );
}
