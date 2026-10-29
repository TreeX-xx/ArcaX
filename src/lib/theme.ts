'use client';

import { alpha, createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';

const fontSans =
  '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "Inter", system-ui, sans-serif';
const fontMono =
  '"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace';

const sharedTypography: ThemeOptions['typography'] = {
  fontFamily: fontSans,
  h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em' },
  h2: { fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.025em' },
  h3: { fontSize: '1.35rem', fontWeight: 650, letterSpacing: '-0.02em' },
  h4: { fontSize: '1.15rem', fontWeight: 650, letterSpacing: '-0.015em' },
  h5: { fontSize: '0.95rem', fontWeight: 650, letterSpacing: '-0.01em' },
  h6: { fontSize: '0.875rem', fontWeight: 650, letterSpacing: '-0.005em' },
  subtitle1: { fontWeight: 600, letterSpacing: '-0.005em' },
  subtitle2: { fontWeight: 600, letterSpacing: '-0.005em' },
  body1: { fontSize: '0.875rem', lineHeight: 1.55 },
  body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
  button: { fontWeight: 600, fontSize: '0.8125rem', letterSpacing: 0 },
  caption: { fontSize: '0.72rem', letterSpacing: '0.01em' },
  overline: { fontSize: '0.65rem', letterSpacing: '0.08em' },
};

// Keep durations at zero: the WebView table avoids transition work while scrolling.
const noTransitions: ThemeOptions['transitions'] = {
  duration: {
    shortest: 0,
    shorter: 0,
    short: 0,
    standard: 0,
    complex: 0,
    enteringScreen: 0,
    leavingScreen: 0,
  },
};

function buildComponents(
  mode: 'light' | 'dark',
  divider: string,
  paper: string,
  background: string,
  accent: string
): ThemeOptions['components'] {
  const scrollThumb = mode === 'dark' ? '#3A3A40' : '#C7C7CD';
  const scrollTrack = 'transparent';

  return {
    MuiCssBaseline: {
      styleOverrides: {
        html: { colorScheme: mode },
        body: { scrollbarWidth: 'thin', scrollbarColor: `${scrollThumb} ${scrollTrack}` },
        '*': { scrollbarWidth: 'thin', scrollbarColor: `${scrollThumb} ${scrollTrack}` },
        '*::-webkit-scrollbar': { width: '7px', height: '7px' },
        '*::-webkit-scrollbar-track': { background: scrollTrack },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: scrollThumb,
          borderRadius: '999px',
          border: `2px solid ${scrollTrack}`,
        },
        '*::-webkit-scrollbar-thumb:hover': { backgroundColor: mode === 'dark' ? '#55555D' : '#A8A8B0' },
        'code, kbd, pre, samp': { fontFamily: fontMono, fontSize: '0.85em' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          transition: 'none',
          borderRadius: 8,
          paddingInline: 14,
          minHeight: 32,
          boxShadow: 'none',
        },
        contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        outlined: { borderColor: divider },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { transition: 'none', borderRadius: 8, color: mode === 'dark' ? '#A3A3A0' : '#70706B' },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          transition: 'none',
          borderRadius: 8,
          marginInline: 8,
          paddingInline: 10,
          minHeight: 34,
          '&:hover': {
            backgroundColor: alpha(accent, mode === 'dark' ? 0.06 : 0.04),
          },
          '&.Mui-selected': {
            backgroundColor: alpha(accent, mode === 'dark' ? 0.08 : 0.06),
            color: mode === 'dark' ? '#FFFFFF' : undefined,
            '&:hover': { backgroundColor: alpha(accent, mode === 'dark' ? 0.12 : 0.09) },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: { minWidth: 30, color: 'text.secondary' },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: '0.8125rem', fontWeight: 500 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: mode === 'dark' ? '#232327' : '#1B1B1F',
          color: '#F4F4F5',
          border: `1px solid ${mode === 'dark' ? '#34343A' : '#2C2C31'}`,
          fontSize: '0.72rem',
          borderRadius: 8,
          padding: '5px 8px',
        },
        arrow: { color: mode === 'dark' ? '#232327' : '#1B1B1F' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: divider,
          fontSize: '0.8125rem',
          padding: '6px 12px',
        },
        head: {
          fontSize: '0.7rem',
          fontWeight: 600,
          letterSpacing: 0,
          textTransform: 'none',
          color: mode === 'dark' ? '#8E8E98' : '#71717A',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: alpha(accent, mode === 'dark' ? 0.07 : 0.05),
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: paper,
          border: `1px solid ${divider}`,
          borderRadius: 10,
          boxShadow:
            mode === 'dark'
              ? '0 24px 64px rgba(0,0,0,0.55)'
              : '0 24px 64px rgba(15,15,20,0.14)',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          border: `1px solid ${divider}`,
          borderRadius: 8,
          boxShadow:
            mode === 'dark'
              ? '0 16px 40px rgba(0,0,0,0.5)'
              : '0 16px 40px rgba(15,15,20,0.12)',
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: { border: `1px solid ${divider}`, borderRadius: 8 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: 'transparent',
          fontSize: '0.8125rem',
        },
        notchedOutline: { borderColor: divider },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { fontSize: '0.8125rem' } },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 600, fontSize: '0.7rem' },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: divider } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          borderBottom: `1px solid ${divider}`,
          backgroundColor: paper,
          color: mode === 'dark' ? '#ECECEA' : '#242424',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: background, borderRight: `1px solid ${divider}` },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 8, fontSize: '0.8125rem' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500, minHeight: 36, minWidth: 0 },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 8, fontSize: '0.75rem' },
      },
    },
  };
}

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#242424', light: '#454545', dark: '#111111', contrastText: '#FFFFFF' },
    secondary: { main: '#5C5C66', light: '#7A7A85', dark: '#3F3F47', contrastText: '#FFFFFF' },
    success: { main: '#1A7F37', light: '#2DA44E', dark: '#0F5C26' },
    error: { main: '#CF222E', light: '#E5534B', dark: '#A40E26' },
    warning: { main: '#BF8700', light: '#D4A72C', dark: '#8A6200' },
    info: { main: '#0969DA', light: '#218BFF', dark: '#0550AE' },
    background: { default: '#F3F3F1', paper: '#FFFFFF' },
    text: { primary: '#242424', secondary: '#70706B', disabled: '#9A9AA2' },
    divider: '#E6E6E3',
    action: {
      hover: 'rgba(20,20,23,0.045)',
      selected: 'rgba(0,0,0,0.06)',
      selectedOpacity: 0.1,
      hoverOpacity: 0,
      focusOpacity: 0.12,
      disabledOpacity: 0.38,
    },
  },
  transitions: noTransitions,
  typography: sharedTypography,
  shape: { borderRadius: 8 },
  components: buildComponents('light', '#E6E6E3', '#FFFFFF', '#F3F3F1', '#242424'),
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#E8E8E6', light: '#FFFFFF', dark: '#CBCBC8', contrastText: '#202020' },
    secondary: { main: '#8B8B96', light: '#A8A8B2', dark: '#6A6A74', contrastText: '#191919' },
    success: { main: '#3FB950', light: '#56D364', dark: '#2EA043' },
    error: { main: '#F85149', light: '#FF7B72', dark: '#DA3633' },
    warning: { main: '#D29922', light: '#E3B341', dark: '#BB8009' },
    info: { main: '#58A6FF', light: '#79C0FF', dark: '#388BFD' },
    background: { default: '#191919', paper: '#212121' },
    text: { primary: '#ECECEA', secondary: '#A3A3A0', disabled: '#70706D' },
    divider: '#333333',
    action: {
      hover: 'rgba(255,255,255,0.05)',
      selected: 'rgba(255,255,255,0.08)',
      selectedOpacity: 0.16,
      hoverOpacity: 0,
      focusOpacity: 0.12,
      disabledOpacity: 0.38,
    },
  },
  transitions: noTransitions,
  typography: sharedTypography,
  shape: { borderRadius: 8 },
  components: buildComponents('dark', '#333333', '#212121', '#191919', '#E8E8E6'),
});
