import { useState, useCallback, useRef } from "react";
import type { NotifType } from "../context/AppContext";

// Regular API calls go through the Next.js proxy (rewrites in next.config.ts)
const API = "/api";

// Multipart uploads MUST bypass the Next.js proxy — Next.js buffers the
// request body before forwarding, which corrupts the multipart boundary
// that multer uses on the backend. We target the Express server directly.
// NEXT_PUBLIC_BACKEND_UPLOAD_URL is set in next.config.ts env block,
// NEXT_PUBLIC_BACKEND_PORT is exposed by Next.js from the root .env
function getUploadBase(): string {
  const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "3007";
  if (typeof window === "undefined") return `http://localhost:${backendPort}`;
  
  // Use the same protocol (http: or https:) as the frontend to prevent mixed-content errors
  const protocol = window.location.protocol;
  const host = window.location.hostname;
  return `${protocol}//${host}:${backendPort}`;
}

const UPLOAD_BASE = getUploadBase();
const CONCURRENT = 5;
const MAX_RETRIES = 3;
export const CLIENT_ID = "client_" + Math.random().toString(36).substring(2, 11);

export type UploadState = "idle" | "uploading" | "cancelling";

export interface UploadProgress {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
  fileDone: number;
  fileTotal: number;
  speed: number;
  eta: number;
  active: number;
  retry: string;
}

type TaggedFile = File & { isFromFolder?: boolean; relativePath?: string };

async function sha256(file: File): Promise<{ hash: string; ok: boolean }> {
  try {
    if (window.crypto?.subtle) {
      const buf = await file.arrayBuffer();
      const h = await crypto.subtle.digest("SHA-256", buf);
      const hash = Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
      return { hash, ok: true };
    }
  } catch { /* fall through */ }
  return { hash: "", ok: false };
}

export function useUpload(
  onDone: () => void,
  notify: (m: string, t: NotifType) => void
) {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [pendingFiles, setPendingFiles] = useState<TaggedFile[]>([]);
  const cancelRef = useRef(false);
  const xhrs = useRef<XMLHttpRequest[]>([]);

  const setPending = useCallback((files: TaggedFile[]) => setPendingFiles(files), []);
  const clearPending = useCallback(() => setPendingFiles([]), []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setState("cancelling");
    xhrs.current.forEach(x => { try { x.abort(); } catch { /* ignore */ } });
    xhrs.current = [];
    setTimeout(() => { setState("idle"); setProgress(null); cancelRef.current = false; }, 600);
  }, []);

  const startUpload = useCallback(async (files: TaggedFile[]) => {
    if (!files.length) { notify("Select files first", "error"); return; }
    cancelRef.current = false;
    setState("uploading");

    let uploaded = 0, failed = 0, corrupted = 0;
    const total = files.length;
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    let uploadedBytes = 0;
    const t0 = Date.now();
    let idx = 0, active = 0, done = false;

    async function uploadOne(file: TaggedFile, retry = 0): Promise<void> {
      if (cancelRef.current) return;

      const isFolder = !!file.isFromFolder;
      const rawName = isFolder
        ? (file.webkitRelativePath || file.relativePath || file.name)
        : file.name;
      const fwd = rawName.replace(/\\/g, "/");
      const slash = fwd.lastIndexOf("/");
      const folder = slash >= 0 ? fwd.substring(0, slash) : "";
      const base = slash >= 0 ? fwd.substring(slash + 1) : fwd;
      const fileIdx = idx;
      const retryLabel = retry > 0 ? ` (retry ${retry}/${MAX_RETRIES})` : "";

      const { hash, ok } = await sha256(file);
      if (cancelRef.current) return;

      const fd = new FormData();
      fd.append("folderPath", folder);
      fd.append("files", file, base);
      fd.append("hashes", JSON.stringify(ok ? [hash] : []));

      const xhr = new XMLHttpRequest();
      xhrs.current.push(xhr);

      await new Promise<void>(resolve => {
        xhr.upload.onprogress = e => {
          if (!e.lengthComputable) return;
          const elapsed = (Date.now() - t0) / 1000;
          const sofar = uploadedBytes + e.loaded;
          const speed = elapsed > 0 ? sofar / elapsed : 0;
          const eta = speed > 0 ? (totalSize - sofar) / speed : 0;
          setProgress({ fileIndex: fileIdx + 1, totalFiles: total, fileName: base + retryLabel, fileDone: e.loaded, fileTotal: e.total, speed, eta, active, retry: retryLabel });
        };

        xhr.onload = () => {
          xhrs.current = xhrs.current.filter(x => x !== xhr);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const r = JSON.parse(xhr.responseText);
              const fr = r.results?.[0];
              if (fr?.success) { uploaded++; uploadedBytes += file.size; }
              else if (fr?.corrupted) { corrupted++; uploadedBytes += file.size; }
              else { failed++; uploadedBytes += file.size; }
            } catch { failed++; uploadedBytes += file.size; }
            resolve();
          } else if (xhr.status >= 500 && retry < MAX_RETRIES && !cancelRef.current) {
            setTimeout(() => uploadOne(file, retry + 1).then(resolve), 3000 * (retry + 1));
          } else { failed++; uploadedBytes += file.size; resolve(); }
        };

        xhr.onerror = () => {
          xhrs.current = xhrs.current.filter(x => x !== xhr);
          if (retry < MAX_RETRIES && !cancelRef.current)
            setTimeout(() => uploadOne(file, retry + 1).then(resolve), 2000 * (retry + 1));
          else { failed++; uploadedBytes += file.size; resolve(); }
        };

        xhr.onabort = () => { xhrs.current = xhrs.current.filter(x => x !== xhr); resolve(); };
        xhr.open("POST", `${UPLOAD_BASE}/upload-chunk`);
        xhr.timeout = 0;
        xhr.send(fd);
      });
    }

    async function processNext(): Promise<void> {
      if (cancelRef.current || idx >= total) return;
      const file = files[idx++];
      active++;
      await uploadOne(file);
      active--;
      if (idx < total && !cancelRef.current) await processNext();
      if (active === 0 && idx >= total && !done) {
        done = true;
        setProgress(null);
        setState("idle");
        const msg = `${uploaded} uploaded${failed ? `, ${failed} failed` : ""}${corrupted ? `, ${corrupted} corrupted` : ""}`;
        notify(msg, failed || corrupted ? "error" : "success");
        onDone();
      }
    }

    const workers = Math.min(CONCURRENT, total);
    await Promise.all(Array.from({ length: workers }, processNext));
  }, [notify, onDone]);

  return { state, progress, pendingFiles, setPending, clearPending, startUpload, cancel };
}
