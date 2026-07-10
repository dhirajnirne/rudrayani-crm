import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { WidgetLayoutEntry } from "../components/dashboard/widgetRegistry";

/**
 * Per-user dashboard layout, backed by GET/PUT/DELETE /dashboard-preferences
 * (backend/src/routes/dashboard-preferences.ts). `layout` is null until the
 * user saves one — DashboardPage.tsx falls back to a role-based default from
 * the widget registry in that case (see applyLayout/getRoleDefaultLayout).
 */
export function useDashboardPreferences() {
  const [layout, setLayout] = useState<WidgetLayoutEntry[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get("/dashboard-preferences").then((res) => {
      setLayout(res.data.layout);
      setLoaded(true);
    });
  }, []);

  const save = useCallback(async (widgets: WidgetLayoutEntry[]) => {
    const res = await api.put("/dashboard-preferences", { layout: { widgets } });
    setLayout(res.data.layout);
  }, []);

  const reset = useCallback(async () => {
    await api.delete("/dashboard-preferences");
    setLayout(null);
  }, []);

  return { layout, loaded, save, reset };
}
