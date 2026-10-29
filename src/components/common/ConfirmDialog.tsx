'use client';

import React from 'react';
import { Button, Typography, Box, CircularProgress } from '@mui/material';
import { BaseDialog } from './BaseDialog';
import { useI18n } from '@/lib/i18n';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isDestructive = false,
  isLoading = false,
}) => {
  const { t } = useI18n();
  const resolvedConfirmLabel = confirmLabel ?? t('Confirm');
  const resolvedCancelLabel = cancelLabel ?? t('Cancel');
  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="xs"
      actions={
        <>
          <Button 
            onClick={onClose} 
            disabled={isLoading}
          >
            {resolvedCancelLabel}
          </Button>
          <Button
            variant="contained"
            color={isDestructive ? 'error' : 'primary'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={20} color="inherit" /> : resolvedConfirmLabel}
          </Button>
        </>
      }
    >
      <Box sx={{ py: 1 }}>
        <Typography variant="body1" sx={{ fontWeight: 500, lineHeight: 1.6 }}>
          {message}
        </Typography>
      </Box>
    </BaseDialog>
  );
};
