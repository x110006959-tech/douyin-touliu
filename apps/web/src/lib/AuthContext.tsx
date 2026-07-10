"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, cookieSessionMarker } from "./api";

type AuthState = {
  token: string | null;
  hydrated: boolean;
  setToken: (token: string | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    window.localStorage.removeItem("douyin-local-life-token");
    window.sessionStorage.removeItem("douyin-local-life-token");
    void apiFetch("/auth/me", null)
      .then(() => setTokenState(cookieSessionMarker))
      .catch(() => setTokenState(null))
      .finally(() => setHydrated(true));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      hydrated,
      setToken: (nextToken) => {
        setTokenState(nextToken ? cookieSessionMarker : null);
        if (!nextToken) void apiFetch("/auth/logout", cookieSessionMarker, { method: "POST" }).catch(() => undefined);
      }
    }),
    [hydrated, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
