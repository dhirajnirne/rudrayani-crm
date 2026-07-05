import type { ThemeConfig } from "antd";

/**
 * Design tokens from docs/design-brief.md — single source for the AntD theme.
 */
export const colors = {
  primary: "#00535b", // Deep Trust Teal
  secondary: "#2c694e", // Field Recovery Green
  warning: "#d77a00", // Warning Amber
  error: "#ba1a1a", // Crimson Red
  surfaceMain: "#ffffff",
  surfaceDim: "#f7f9ff",
  textPrimary: "#181c20",
  sidebar: "#1A2332",
} as const;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorSuccess: colors.secondary,
    colorWarning: colors.warning,
    colorError: colors.error,
    colorText: colors.textPrimary,
    colorBgLayout: colors.surfaceDim,
    fontFamily: "Inter, sans-serif",
    borderRadius: 4, // standard elements
    borderRadiusLG: 8, // cards & modals
    controlHeight: 40,
    controlHeightLG: 48, // 48px tap target for primary actions/forms
  },
  components: {
    Layout: {
      siderBg: colors.sidebar,
      headerBg: colors.surfaceMain,
    },
    Menu: {
      darkItemBg: colors.sidebar,
    },
    Card: {
      borderRadiusLG: 8,
    },
    Tag: {
      borderRadiusSM: 12, // badges & statuses
    },
  },
};
