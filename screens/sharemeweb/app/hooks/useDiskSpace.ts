import { useState, useEffect, useCallback } from "react";

const API = "/api";

export interface DiskSpace { free: number | null; total: number | null; }

export function formatBytes(b: number | null): string {
  if (b === null || !isFinite(b) || b === 0) return "0 B";
  const k = 1024, sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
  return (b / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

export function useDiskSpace() {
  const [space, setSpace] = useState<DiskSpace>({ free: null, total: null });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/disk-space`);
      if (res.ok) setSpace(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const pct = space.free !== null && space.total && space.total > 0
    ? Math.round(((space.total - space.free) / space.total) * 100) : 0;

  return { space, pct, reload: load };
}
