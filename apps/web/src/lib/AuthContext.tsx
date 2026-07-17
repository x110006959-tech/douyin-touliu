"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, cookieSessionMarker, setCsrfToken } from "./api";

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
    void apiFetch<{ csrfToken: string }>("/auth/me", null)
      .then((session) => {
        setCsrfToken(session.csrfToken);
        setTokenState(cookieSessionMarker);
      })
      .catch(() => {
        setCsrfToken(null);
        setTokenState(null);
      })
      .finally(() => setHydrated(true));
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
