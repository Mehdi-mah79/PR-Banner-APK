import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface RouterState {
  pathname: string;
  navigate: (to: string) => void;
}

const RouterCtx = createContext<RouterState>({
  pathname: "/",
  navigate: () => {},
});

function readHashPath(): string {
  if (typeof window === "undefined") return "/";
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return "/";
  return h.startsWith("/") ? h.split("?")[0] : "/" + h.split("?")[0];
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [pathname, setPathname] = useState<string>(readHashPath);

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = "#/";
    }
    const onHash = () => {
      setPathname(readHashPath());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((to: string) => {
    const clean = to.startsWith("/") ? to : "/" + to;
    window.location.hash = "#" + clean;
    setPathname(clean.split("?")[0]);
  }, []);

  const value = useMemo(() => ({ pathname, navigate }), [pathname, navigate]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export function useRouterState() {
  return useContext(RouterCtx);
}
