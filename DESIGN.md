---
name: ArcaX
description: Dark-first, neutral desktop tool interface with neutral controls and compact data views.
colors:
  accent-dark: "#E8E8E6"
  accent-hover-dark: "#FFFFFF"
  accent-pressed-dark: "#CBCBC8"
  accent-light: "#242424"
  accent-contrast: "#202020"
  accent-contrast-light: "#FFFFFF"
  background-dark: "#191919"
  paper-dark: "#212121"
  raised-dark: "#292929"
  text-dark: "#ECECEA"
  text-secondary-dark: "#A3A3A0"
  text-disabled-dark: "#70706D"
  divider-dark: "#333333"
  background-light: "#F3F3F1"
  paper-light: "#FFFFFF"
  text-light: "#242424"
  text-secondary-light: "#70706B"
  divider-light: "#E6E6E3"
  success: "#3FB950"
  error: "#F85149"
  warning: "#D29922"
  info: "#58A6FF"
typography:
  font-sans: '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "Inter", system-ui, sans-serif'
  font-mono: '"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace'
  display:
    fontSize: "2rem"
    fontWeight: 700
    letterSpacing: "-0.03em"
  headline:
    fontSize: "1.35rem"
    fontWeight: 650
    letterSpacing: "-0.02em"
  body:
    fontSize: "0.875rem"
    lineHeight: 1.55
  compact-body:
    fontSize: "0.8125rem"
    lineHeight: 1.5
  label:
    fontSize: "0.7rem"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  control: "8px"
  surface: "10px"
  pill: "999px"
spacing:
  half: "4px"
  one: "8px"
  one-and-half: "12px"
  two: "16px"
  three: "24px"
  four: "32px"
components:
  button-primary-dark:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.accent-contrast}"
    rounded: "{rounded.control}"
  button-primary-light:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.accent-contrast-light}"
    rounded: "{rounded.control}"
  table-header:
    textColor: "{colors.text-secondary-dark}"
    fontSize: "0.7rem"
    transform: none
  dialog:
    backgroundColor: "{colors.paper-dark}"
    border: "{colors.divider-dark}"
    rounded: "{rounded.surface}"
---

# Design System: ArcaX

## Overview

ArcaX uses a dark-first, near-monochrome developer-tool interface. Surfaces separate through one-pixel borders and small background shifts rather than shadows or gradients. Neutral contrast marks selection, focus, and primary actions; semantic colors appear only for status.

Key characteristics:

- Near-black background (`#191919`) with slightly raised paper (`#212121`).
- Compact 0.875rem body text and a system UI stack; monospace for sizes, dates, and keys.
- Eight-pixel controls and ten-pixel dialogs with hairline dividers.
- No decorative shadows on buttons, cards, or the app bar.

Sources: `src/lib/theme.ts`, `src/components/common/BaseDialog.tsx`, `src/components/common/BrandMark.tsx`, `src/components/common/VirtualizedObjectTable.tsx`, and `src/app/globals.css`.

## Colors

The accent is `#E8E8E6` in dark mode and `#242424` in light mode. Selection uses a translucent accent fill; hover uses a translucent white (dark) or black (light) wash. Text hierarchy is primary, secondary, and disabled; dividers are `#333333` in dark and `#E6E6E3` in light. Success, error, warning, and info stay semantic and are never used for decoration.

The mark is a monochrome cut X: one continuous diagonal and two counter-strokes separated by a narrow seam. The inline mark inherits text color; the application icon places the same geometry on a graphite tile. No center dot, accent color, glow, or outline. The path geometry lives in `src/brand/mark.json`; `pnpm brand` derives `public/brand-mark.svg`, `public/app-icon.svg`, `public/logo.png`, `src-tauri/app-icon.png`, and the installer mark; `pnpm installer-art` renders the NSIS header/sidebar and WiX banner/dialog bitmaps. Regenerate platform icons with `pnpm tauri icon src-tauri/app-icon.png`.

## Typography

The sans stack starts with the platform UI font, then Inter, then generic sans-serif. Data columns (sizes, timestamps, row numbers, keys in dialogs) use the monospace stack. Headings use 650–700 weight with negative tracking; labels use 0.7rem text with restrained tracking. Buttons use sentence case at 0.8125rem/600.

## Layout

The shell uses a 56px draggable header, a collapsible 232px sidebar, and a flex-sized content pane. Tabs occupy 40px only when connected. The 30px footer stays within the content pane, without overlaying scrolling content. Desktop content padding is 24px, mobile padding is 12px. At 900px and below navigation becomes a dismissible drawer. Windows uses integrated minimize/maximize/close controls and a hidden native menu; macOS and Linux keep their native title bar, so the custom controls stay hidden there. The path field appears only in Workspace and Explorer. The object table is fixed-layout and virtualized; row actions remain visible at 0.7 opacity and reach full opacity on hover.

## Elevation & Depth

Depth is expressed with borders, not shadows. Dialogs and menus are the only elevated elements: a one-pixel divider border and a large soft shadow, with an opaque paper background. Backdrops use black at 70% (dark) or 40% (light). Theme transitions are zero to keep large virtualized tables stable in WebKit.

## Shapes

Controls use an 8px radius, dialogs and menus 8–10px, and pills are reserved for status chips only. Text fields remain outlined. Tables use bottom dividers only; the table container has an 8px radius and a one-pixel border.

## Components

- **Buttons**: contained primary uses the accent; outlined buttons use the divider color; text buttons are neutral. No elevation, no uppercase.
- **Dialogs**: `BaseDialog` supplies the frame, border, and close control. Avoid blur and translucent paper.
- **Settings and content pages**: prefer plain sections with divider headings over nested cards. Page headers use a 24px icon at most and sentence-case titles.
- **Tables**: sentence-case 0.7rem headers on `background.default`, 6px vertical padding, monospace size and timestamp columns, and an accent hover wash.
- **Timestamps**: files show local `YYYY-MM-DD HH:mm`. Folders show the newest direct-child timestamp or a folder-marker timestamp; unavailable values render `—` with an explanatory tooltip.
- **Sidebar**: selected items use the accent selection wash and a neutral icon; buckets use the storage icon at reduced opacity.
- **Status**: semantic colors are limited to transfer state, alerts, and errors.

## Do's and Don'ts

- Do keep the interface near-monochrome and let the accent mark only action and selection.
- Do use borders and spacing for hierarchy before reaching for shadows.
- Do keep data columns monospace and numeric columns tabular.
- Do preserve both themes, focus visibility, and disabled/error/busy states.
- Don't reintroduce orange AWS branding, gradients, pill action buttons, or decorative shadows.
- Don't use full-opacity accent fills on large surfaces.

## Reference and intent

The [Codex app](https://openai.com/index/introducing-the-codex-app/) is the visual direction: quiet navigation, a continuous workspace and restrained controls. ArcaX keeps its own identity and S3 workflows. Entry screens use open space and a direct action rather than nested cards. Both light and dark palettes are maintained.
