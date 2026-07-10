/**
 * Re-exports for callers that only need the light theme's raw palette
 * (e.g. one-off components reading `colors.*` directly). Full theme
 * infrastructure — light/dark ThemeConfig, mode toggle — lives in
 * ./theme/*.
 */
export { palette as colors } from "./theme/tokens";
export { lightTheme as theme } from "./theme/light";
