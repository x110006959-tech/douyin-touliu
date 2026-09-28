"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, cookieSessionMarker, setCsrfToken } from "./api";
import { createLatestRequestGuard, type LatestRequestGuard } from "./latest-request";
import { fetchLatestCreditBalance } from "./credits";

type AuthState = {
  token: string | null;
  hydrated: boolean;
  user: AuthUser | null;
  setToken: (token: string | null, user?: AuthUser | null) => void | Promise<void>;
  refreshCredits: () => Promise<number | null>;
};

export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  creditBalance: number;
  workspaceId?: string;
};

const AuthContext = createContext<AuthState | null>(null);
const SESSION_CHECK_TIMEOUT_MS = 3_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const creditsRefreshGuard = useRef<LatestRequestGuard | null>(null);
  // Stale logout/auth/me responses must not clear a session established later.
  const authTransitionRef = useRef(0);
  if (!creditsRefreshGuard.current) creditsRefreshGuard.current = createLatestRequestGuard();

  useEffect(() => {
    let active = true;
    const authTransition = ++authTransitionRef.current;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);

    window.localStorage.removeItem("douyin-local-life-token");
    window.sessionStorage.removeItem("douyin-local-life-token");
    void apiFetch<AuthUser & { csrfToken: string }>("/auth/me", null, { signal: controller.signal })
      .then((session) => {
        if (!active || authTransition !== authTransitionRef.current) return;
        creditsRefreshGuard.current?.invalidate();
        setCsrfToken(session.csrfToken);
        setTokenState(cookieSessionMarker);
        setUser(session);
      })
      .catch(() => {
        if (!active || authTransition !== authTransitionRef.current) return;
        creditsRefreshGuard.current?.invalidate();
        setCsrfToken(null);
        setTokenState(null);
        setUser(null);
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

  const setToken = useCallback((nextCsrfToken: string | null, nextUser?: AuthUser | null) => {
    const authTransition = ++authTransitionRef.current;
    creditsRefreshGuard.current?.invalidate();

    if (nextCsrfToken) {
      setCsrfToken(nextCsrfToken);
      setTokenState(cookieSessionMarker);
      if (nextUser !== undefined) {
        setUser(nextUser);
      } else {
        void apiFetch<AuthUser & { csrfToken: string }>("/auth/me", null).then((session) => {
          if (authTransition !== authTransitionRef.current) return;
          creditsRefreshGuard.current?.invalidate();
          setCsrfToken(session.csrfToken);
          setUser(session);
        }).catch(() => {
          if (authTransition !== authTransitionRef.current) return;
          creditsRefreshGuard.current?.invalidate();
          setCsrfToken(null);
          setTokenState(null);
          setUser(null);
        });
      }
      return;
    }

    // Send the CSRF-protected revocation request before clearing its in-memory token.
    return apiFetch<void>("/auth/logout", cookieSessionMarker, { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        if (authTransition !== authTransitionRef.current) return;
        setCsrfToken(null);
        setTokenState(null);
        setUser(null);
      })
      .then(() => undefined);
  }, []);

  const refreshCredits = useCallback(async () => {
    if (!token || !creditsRefreshGuard.current) return null;
    const creditBalance = await fetchLatestCreditBalance(token, creditsRefreshGuard.current);
    if (creditBalance === null) return null;
    setUser((current) => current ? { ...current, creditBalance } : current);
    return creditBalance;
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({ token, hydrated, user, setToken, refreshCredits }),
    [hydrated, token, user, setToken, refreshCredits]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
