import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export const TOKEN_KEYS = { access: "rcrm_access_token", refresh: "rcrm_refresh_token" } as const;

export function getTokens() {
  return {
    access: localStorage.getItem(TOKEN_KEYS.access),
    refresh: localStorage.getItem(TOKEN_KEYS.refresh),
  };
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEYS.access, access);
  localStorage.setItem(TOKEN_KEYS.refresh, refresh);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEYS.access);
  localStorage.removeItem(TOKEN_KEYS.refresh);
}

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const { access } = getTokens();
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refresh } = getTokens();
  if (!refresh) return null;
  try {
    // Raw axios: must not go through the interceptors.
    const res = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refresh });
    setTokens(res.data.access_token, res.data.refresh_token);
    return res.data.access_token as string;
  } catch {
    clearTokens();
    return null;
  }
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  const isAuthCall = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");

  if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
    refreshing = refreshing ?? refreshAccessToken();
    const newAccess = await refreshing;
    refreshing = null;
    if (newAccess) {
      original._retried = true;
      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    }
    // Session is gone for good: land back on the login screen.
    if (window.location.pathname !== "/login") window.location.assign("/login");
  }
  return Promise.reject(error);
});

/** Extracts the server's error message for display. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  return "Something went wrong. Please try again.";
}
