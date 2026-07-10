import { theme as antdTheme, type ThemeConfig } from "antd";
import { darkPalette } from "./tokens";

export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: darkPalette.navy,
    colorSuccess: darkPalette.emerald,
    colorWarning: darkPalette.warning,
    colorError: darkPalette.destructive,
    colorBgLayout: darkPalette.background,
    colorBgContainer: darkPalette.surface,
    colorBorder: darkPalette.border,
    colorTextSecondary: darkPalette.textMuted,
    fontFamily: "Inter, sans-serif",
    borderRadius: 4,
    borderRadiusLG: 8,
    controlHeight: 40,
    controlHeightLG: 48,
  },
  components: {
    // The dark algorithm alone does not know about our explicit brand
    // sidebar/menu overrides from light.ts — restate them here, or the
    // sidebar renders with whatever grey the algorithm derives instead of
    // staying on-brand navy.
    Layout: {
      siderBg: darkPalette.sidebarDark,
      headerBg: darkPalette.surface,
    },
    Menu: {
      darkItemBg: darkPalette.sidebarDark,
    },
    Card: {
      borderRadiusLG: 8,
    },
    Tag: {
      borderRadiusSM: 12,
    },
  },
};
