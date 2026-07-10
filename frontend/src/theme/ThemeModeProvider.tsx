import { ConfigProvider } from "antd";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { lightTheme } from "./light";
import { darkTheme } from "./dark";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "rcrm_theme_mode";

interface ThemeModeContextValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used within ThemeModeProvider");
  return ctx;
}

/**
 * Office-only light/dark preference (web admin/ops/TL portal). This is a
 * device/lighting preference, not a per-user server-side setting — kept in
 * localStorage rather than the backend, deliberately separate from the
 * dashboard-layout preferences which DO need to follow the user cross-device.
 */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readInitialMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.setAttribute("data-theme", mode);
  }, [mode]);

  const value = useMemo<ThemeModeContextValue>(
    () => ({ mode, toggle: () => setMode((m) => (m === "light" ? "dark" : "light")) }),
    [mode],
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ConfigProvider theme={mode === "dark" ? darkTheme : lightTheme}>{children}</ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
