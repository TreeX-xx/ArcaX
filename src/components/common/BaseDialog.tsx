'use client';

import React from 'react';
import {
  Dialog,
  DialogProps,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box,
  SxProps,
  Theme,
  alpha,
  useTheme,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useI18n } from '@/lib/i18n';

export interface BaseDialogProps {
  open: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
  PaperProps?: DialogProps['PaperProps'];
}

export const BaseDialog: React.FC<BaseDialogProps> = ({
  open,
  onClose,
  closeDisabled = false,
  title,
  children,
  actions,
  maxWidth = 'sm',
  fullWidth = true,
  sx,
  PaperProps,
}) => {
  const { t } = useI18n();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Dialog
      open={open}
      onClose={closeDisabled ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      TransitionProps={{ unmountOnExit: true }}
      PaperProps={{
        ...PaperProps,
        sx: {
          borderRadius: 2.5,
          backgroundImage: 'none',
          bgcolor: theme.palette.background.paper,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: isDark
            ? '0 20px 48px rgba(0, 0, 0, 0.45)'
            : '0 20px 48px rgba(15, 15, 20, 0.12)',
          overflow: 'hidden',
          ...PaperProps?.sx,
        },
      }}
      sx={{
        '& .MuiBackdrop-root': {
          bgcolor: isDark ? alpha('#000', 0.7) : alpha('#000', 0.4),
        },
        ...sx,
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <DialogTitle component="div" sx={{ 
          m: 0, 
          p: 2.5, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.05),
        }}>
          <Typography variant="h6" sx={{
            fontSize: '1.1rem',
            fontWeight: 650,
            letterSpacing: '-0.02em',
            color: 'text.primary',
          }}>
            {title}
          </Typography>
          <IconButton
            aria-label={t('close')}
            disabled={closeDisabled}
            onClick={onClose}
            sx={{
              color: (theme) => theme.palette.grey[500],
              '&:hover': {
                bgcolor: alpha(theme.palette.grey[500], 0.1),
              },
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
      </Box>

      <DialogContent sx={{ p: 3, pt: 4 }}>
        {children}
      </DialogContent>

      {actions && (
        <DialogActions sx={{ 
          p: 3, 
          pt: 1, 
          gap: 1.5,
          borderTop: '1px solid',
          borderColor: isDark ? alpha('#fff', 0.05) : alpha('#000', 0.05),
          bgcolor: isDark ? alpha('#000', 0.2) : alpha('#000', 0.02),
        }}>
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
};
