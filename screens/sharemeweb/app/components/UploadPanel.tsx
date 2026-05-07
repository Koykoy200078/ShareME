"use client";

import { useEffect, useRef, useCallback } from "react";
import type { useUpload } from "../hooks/useUpload";
import { useDiskSpace, formatBytes } from "../hooks/useDiskSpace";
import PrintPanel from "./PrintPanel";
import type { usePrint } from "../hooks/usePrint";

type TaggedFile = File & { isFromFolder?: boolean; relativePath?: string };

interface Props {
  uploadHook: ReturnType<typeof useUpload>;
  printHook: ReturnType<typeof usePrint>;
  pendingPrint: { path: string; name: string } | null;
}

// Recursively read all entries from a directory reader (API requires looping)
async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];
  do {
    batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    all.push(...batch);
  } while (batch.length > 0);
  return all;
}

async function traverseEntry(entry: FileSystemEntry, prefix = ""): Promise<TaggedFile[]> {
  if (entry.isFile) {
    return new Promise(resolve => {
      (entry as FileSystemFileEntry).file(f => {
        const tf = f as TaggedFile;
        Object.defineProperty(tf, "isFromFolder", { value: !!prefix, writable: false });
        Object.defineProperty(tf, "relativePath", { value: prefix + f.name, writable: false });
        resolve([tf]);
      });
    });
  } else {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await readAllEntries(reader);
    const results = await Promise.all(entries.map(e => traverseEntry(e, prefix + entry.name + "/")));
    return results.flat();
  }
}

export default function UploadPanel({ uploadHook, printHook, pendingPrint }: Props) {
  const { state, progress, pendingFiles, setPending, clearPending, startUpload, cancel } = uploadHook;
  const { pct, space } = useDiskSpace();
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
    }
  }, []);

  // Drag & drop
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
    const items = e.dataTransfer.items;
    const all: TaggedFile[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) all.push(...await traverseEntry(entry));
    }
    setPending(all);
  }, [setPending]);

  const pctLabel = space.free !== null && space.total
    ? `${formatBytes(space.free)} free of ${formatBytes(space.total)}`
    : "Checking…";

  return (
    <div className="upload-section">
      {/* Drop zone */}
      <div
        className="upload-area"
        id="uploadArea"
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
        onDragLeave={e => e.currentTarget.classList.remove("dragover")}
        onDrop={onDrop}
      >
        <div className="upload-icon">📤</div>
        <h2>Upload Files or Folders</h2>
        <p>Drag and drop files/folders here or click to browse</p>
        <input ref={folderRef} type="file" id="fileInput" multiple hidden
          onChange={e => {
            const files = Array.from(e.target.files ?? []) as TaggedFile[];
            files.forEach(f => Object.defineProperty(f, "isFromFolder", { value: true, writable: false }));
            setPending(files);
          }} />
        <input ref={filesRef} type="file" id="filesInput" multiple hidden
          onChange={e => {
            const files = Array.from(e.target.files ?? []) as TaggedFile[];
            files.forEach(f => Object.defineProperty(f, "isFromFolder", { value: false, writable: false }));
            setPending(files);
          }} />
        <div className="button-group">
          <button className="btn btn-primary" type="button" onClick={() => filesRef.current?.click()}>Select Files</button>
          <button className="btn btn-secondary" type="button" onClick={() => folderRef.current?.click()}>Select Folder</button>
        </div>
      </div>

      {/* Selected files preview */}
      {pendingFiles.length > 0 && state === "idle" && (
        <div id="selectedFiles" className="selected-files">
          <h3>Selected Files ({pendingFiles.length}):</h3>
          <div id="filesList">
            {pendingFiles.slice(0, 10).map((f, i) => (
              <div key={i} className="file-item">
                <span>{(f as TaggedFile).relativePath || f.name}</span>
                <span className="file-size">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            ))}
            {pendingFiles.length > 10 && <div className="file-item">…and {pendingFiles.length - 10} more</div>}
          </div>
          <button className="btn btn-success" id="uploadBtn" type="button"
            onClick={() => startUpload(pendingFiles)}>
            Upload All Files
          </button>
        </div>
      )}

      {/* Upload progress */}
      {(state === "uploading" || state === "cancelling") && progress && (
        <div id="uploadProgress" className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" id="progressFill"
              style={{ width: `${Math.round((progress.fileIndex / progress.totalFiles) * 100)}%` }} />
          </div>
          <p id="progressText">
            Uploading {progress.fileIndex}/{progress.totalFiles}: {progress.fileName}{progress.retry}
          </p>
          <p id="progressStats" className="progress-stats">
            {progress.speed > 0
              ? `Speed: ${formatBytes(progress.speed)}/s | Active: ${progress.active}/5`
              : `Active: ${progress.active}/5`}
          </p>
          <button className="btn btn-delete" id="cancelBtn" type="button"
            onClick={cancel} disabled={state === "cancelling"}>
            {state === "cancelling" ? "Cancelling…" : "Cancel Upload"}
          </button>
        </div>
      )}

      {/* Print panel */}
      <PrintPanel printHook={printHook} pendingPrint={pendingPrint} />

      {/* Disk space gauge */}
      <div className="disk-space-panel" id="diskSpacePanel">
        <div className="disk-space-label">💾 Server Storage</div>
        <div className="disk-space-bar">
          <div id="diskSpaceFill" className={`disk-space-fill${pct > 95 ? " disk-space-fill-critical" : pct > 80 ? " disk-space-fill-warn" : ""}`}
            style={{ width: `${pct}%` }} />
        </div>
        <div id="diskSpaceText" className="disk-space-text">{pctLabel}</div>
      </div>
    </div>
  );
}
