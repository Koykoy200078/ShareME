"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

// ─── Notification ────────────────────────────────────────────────────────────

export type NotifType = "success" | "error" | "info";

interface NotifState {
  message: string;
  type: NotifType;
  id: number;
}

// ─── Theme ────────────────────────────────────────────────────────────────────

type Theme = "light" | "dark";

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppCtx {
  notification: NotifState | null;
  showNotification: (message: string, type?: NotifType) => void;
  theme: Theme;
  toggleTheme: () => void;
}

const AppContext = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<NotifState | null>(null);
  const [theme, setTheme] = useState<Theme>("light");

  // Init theme from localStorage
  useEffect(() => {
    const saved = (localStorage.getItem("shareme-theme") as Theme) || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const showNotification = useCallback((message: string, type: NotifType = "success") => {
    const id = Date.now();
    setNotification({ message, type, id });
    setTimeout(() => setNotification((prev) => (prev?.id === id ? null : prev)), 3000);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      localStorage.setItem("shareme-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  return (
    <AppContext.Provider value={{ notification, showNotification, theme, toggleTheme }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
