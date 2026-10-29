import type { Theme } from '@mui/material/styles';

/** Shared treatment for URL workflow actions, aligned with the ArcaX system. */
export const urlActionStyles = (theme: Theme) => ({
  borderRadius: 8,
  '&.MuiButton-text:not(.Mui-disabled), &.MuiButton-outlined:not(.Mui-disabled)': {
    color: theme.palette.mode === 'light' ? theme.palette.text.primary : theme.palette.primary.light,
  },
});
