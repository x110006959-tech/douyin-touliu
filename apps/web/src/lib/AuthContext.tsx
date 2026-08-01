"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, cookieSessionMarker, setCsrfToken } from "./api";

type AuthState = {
  token: string | null;
  hydrated: boolean;
  setToken: (token: string | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);
const SESSION_CHECK_TIMEOUT_MS = 3_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);

    window.localStorage.removeItem("douyin-local-life-token");
    window.sessionStorage.removeItem("douyin-local-life-token");
    void apiFetch<{ csrfToken: string }>("/auth/me", null, { signal: controller.signal })
      .then((session) => {
        if (!active) return;
        setCsrfToken(session.csrfToken);
        setTokenState(cookieSessionMarker);
      })
      .catch(() => {
        if (!active) return;
        setCsrfToken(null);
        setTokenState(null);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      hydrated,
      setToken: (nextCsrfToken) => {
        if (nextCsrfToken) {
          setCsrfToken(nextCsrfToken);
          setTokenState(cookieSessionMarker);
          return;
        }

        // Send the CSRF-protected revocation request before clearing its in-memory token.
        void apiFetch("/auth/logout", cookieSessionMarker, { method: "POST" })
          .catch(() => undefined)
          .finally(() => {
            setCsrfToken(null);
            setTokenState(null);
          });
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
