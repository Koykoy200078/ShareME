import { useState, useCallback, useRef } from "react";
import type { NotifType } from "../context/AppContext";

export interface FileItem {
  name: string;
  path: string;
  size: number;
  uploadedAt: string;
}

export type SortOption =
  | "name-asc" | "name-desc"
  | "date-desc" | "date-asc"
  | "size-desc" | "size-asc";

const API = "/api";
const PER_PAGE = 6;
const DEBOUNCE_MS = 500;

function applySort(files: FileItem[], sort: SortOption): FileItem[] {
  return [...files].sort((a, b) => {
    switch (sort) {
      case "name-asc":  return a.name.localeCompare(b.name);
      case "name-desc": return b.name.localeCompare(a.name);
      case "date-desc": return +new Date(b.uploadedAt) - +new Date(a.uploadedAt);
      case "date-asc":  return +new Date(a.uploadedAt) - +new Date(b.uploadedAt);
      case "size-desc": return b.size - a.size;
      case "size-asc":  return a.size - b.size;
      default:          return 0;
    }
  });
}

export interface FolderNode {
  folders: Record<string, FolderNode>;
  files: FileItem[];
}

export function buildFolderTree(files: FileItem[]): FolderNode {
  const root: FolderNode = { folders: {}, files: [] };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.folders[seg]) node.folders[seg] = { folders: {}, files: [] };
      node = node.folders[seg];
    }
    node.files.push(file);
  }
  return root;
}

export function useFiles(notify: (m: string, t: NotifType) => void) {
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortOption>("date-desc");
  const [search, setSearch] = useState("");
  const [extension, setExtension] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/files-list`);
      const data = await res.json();
      setAllFiles(data.files ?? []);
      setPage(1);
      setSelected(new Set());
    } catch { notify("Failed to load files", "error"); }
    finally { setLoading(false); }
  }, [notify]);

  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadFiles, DEBOUNCE_MS);
  }, [loadFiles]);

  // Derived: filtered + sorted
  const derived = useCallback(() => {
    let files = applySort(allFiles, sort);
    if (extension) files = files.filter(f => f.name.split(".").pop()?.toLowerCase() === extension);
    if (search.trim()) {
      const q = search.toLowerCase();
      files = files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    }
    return files;
  }, [allFiles, sort, search, extension]);

  const paginated = useCallback(() => {
    const files = derived();
    const totalPages = Math.max(1, Math.ceil(files.length / PER_PAGE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PER_PAGE;
    return { files: files.slice(start, start + PER_PAGE), totalPages, total: files.length, safePage };
  }, [derived, page]);

  const extensions = useCallback(() => {
    const s = new Set<string>();
    allFiles.forEach(f => { const e = f.name.split(".").pop()?.toLowerCase(); if (e) s.add(e); });
    return [...s].sort();
  }, [allFiles]);

  // Selection
  const toggleSelect = useCallback((path: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n; }), []);
  const selectAll = useCallback(() => setSelected(new Set(derived().map(f => f.path))), [derived]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Delete single
  const deleteFile = useCallback(async (filePath: string, fileName: string) => {
    if (!confirm(`Delete ${fileName}?`)) return;
    try {
      const res = await fetch(`${API}/delete${filePath}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) { notify("File deleted", "success"); await loadFiles(); }
      else throw new Error(data.error);
    } catch (e) { notify(`Delete failed: ${e instanceof Error ? e.message : ""}`, "error"); }
  }, [loadFiles, notify]);

  // Bulk delete
  const bulkDelete = useCallback(async () => {
    if (!selected.size || !confirm(`Delete ${selected.size} file(s)?`)) return;
    try {
      const files = [...selected].map(p => (p.startsWith("/") ? p.slice(1) : p));
      const res = await fetch(`${API}/delete-bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      const data = await res.json();
      if (data.success) { notify(data.message, "success"); clearSelection(); await loadFiles(); }
      else throw new Error(data.error);
    } catch (e) { notify(`Bulk delete failed: ${e instanceof Error ? e.message : ""}`, "error"); }
  }, [selected, loadFiles, clearSelection, notify]);

  return {
    allFiles, loading, sort, setSort,
    search, setSearch, extension, setExtension,
    page, setPage, selected,
    loadFiles, debouncedLoad, derived, paginated, extensions,
    toggleSelect, selectAll, clearSelection, deleteFile, bulkDelete,
  };
}
