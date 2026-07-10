/**
 * Design tokens — single source of truth for both light and dark AntD themes.
 * Palette: "Navy & Emerald" (approved 2026-07-10, replaces the earlier Deep
 * Trust Teal brand). See ../theme.ts for the ConfigProvider-consumable
 * ThemeConfig objects built from this palette.
 */
export const palette = {
  navy: "#1E3A5F",
  sidebarDark: "#0F172A",
  emerald: "#059669",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#E4E7EB",
  textMuted: "#64748B",
  textPrimary: "#0F172A",
  destructive: "#DC2626",
  warning: "#D97706",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 4, md: 8, lg: 12 } as const;

/**
 * Dark-mode surface/text overrides. Brand colors (navy/emerald/destructive/
 * warning) stay identical across modes — only the neutral scale flips.
 */
export const darkPalette = {
  ...palette,
  background: "#0B1120",
  surface: "#131B2C",
  border: "#293548",
  textMuted: "#94A3B8",
  textPrimary: "#F1F5F9",
} as const;
