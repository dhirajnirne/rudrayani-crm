import { theme as antdTheme, type ThemeConfig } from "antd";
import { palette } from "./tokens";

export const lightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: palette.navy,
    colorSuccess: palette.emerald,
    colorWarning: palette.warning,
    colorError: palette.destructive,
    colorText: palette.textPrimary,
    colorBgLayout: palette.background,
    fontFamily: "Inter, sans-serif",
    borderRadius: 4,
    borderRadiusLG: 8,
    controlHeight: 40,
    controlHeightLG: 48,
  },
  components: {
    Layout: {
      siderBg: palette.sidebarDark,
      headerBg: palette.surface,
    },
    Menu: {
      darkItemBg: palette.sidebarDark,
    },
    Card: {
      borderRadiusLG: 8,
    },
    Tag: {
      borderRadiusSM: 12,
    },
  },
};
