import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearTokens, getTokens, setTokens } from "../api/client";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  permissions: string[];
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const res = await api.get("/auth/me");
    setUser(res.data.user);
    setPermissions(res.data.permissions ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      if (getTokens().access) {
        try {
          await loadMe();
        } catch {
          // interceptor already cleared tokens / redirected if needed
        }
      }
      setLoading(false);
    })();
  }, [loadMe]);

  const login = useCallback(
    async (phone: string, password: string) => {
      const res = await api.post("/auth/login", { phone, password });
      setTokens(res.data.access_token, res.data.refresh_token);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    const { refresh } = getTokens();
    if (refresh) {
      try {
        await api.post("/auth/logout", { refresh_token: refresh });
      } catch {
        // best effort — clear locally regardless
      }
    }
    clearTokens();
    setUser(null);
    setPermissions([]);
  }, []);

  const value = useMemo(
    () => ({
      user,
      permissions,
      loading,
      login,
      logout,
      hasPermission: (key: string) => permissions.includes(key),
    }),
    [user, permissions, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
