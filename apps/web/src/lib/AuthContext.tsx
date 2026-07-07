"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type AuthState = {
  token: string | null;
  setToken: (token: string | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(window.localStorage.getItem("douyin-local-life-token"));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      setToken: (nextToken) => {
        setTokenState(nextToken);
        if (nextToken) window.localStorage.setItem("douyin-local-life-token", nextToken);
        else window.localStorage.removeItem("douyin-local-life-token");
      }
    }),
    [token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
