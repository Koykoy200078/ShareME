"use client";

import { useEffect } from "react";

interface Props {
  file: { path: string; name: string } | null;
  onClose: () => void;
}

const IS_IMAGE = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
const IS_VIDEO = /\.(mp4|webm|ogg|mov|avi)$/i;

export default function PreviewModal({ file, onClose }: Props) {
  // ESC to close
  useEffect(() => {
    if (!file) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [file, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!file) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [file]);

  if (!file) return null;

  // Same-origin URL through the Next.js proxy rewrite (/files/:path* → :3007/files/:path*)
  // Must stay same-origin — cross-origin embeds for PDF are blocked by Chrome's PDF plugin.
  const fileUrl = `/files${file.path}`;

  const isImage = IS_IMAGE.test(file.name);
  const isVideo = IS_VIDEO.test(file.name);
  const isPDF   = file.name.toLowerCase().endsWith(".pdf");

  return (
    <div id="previewModal" className="preview-modal" onClick={onClose}>
      <div className="preview-content" onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="preview-header">
          <span className="preview-filename" title={file.name}>{file.name}</span>
          <div className="preview-header-actions">
            <a
              href={fileUrl}
              download={file.name}
              className="btn-open-tab"
              title="Download file"
              onClick={e => e.stopPropagation()}
            >
              ⬇ Download
            </a>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-open-tab"
              title="Open in new tab"
              onClick={e => e.stopPropagation()}
            >
              ↗ New Tab
            </a>
            <button className="btn-close" type="button" onClick={onClose} title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────── */}
        <div id="previewContainer" className="preview-container">

          {isImage && (
            <img src={fileUrl} alt={file.name} className="preview-image" />
          )}

          {isVideo && (
            <video src={fileUrl} controls autoPlay className="preview-video" />
          )}

          {isPDF && (
            <iframe
              src={`${fileUrl}#toolbar=1&view=FitH`}
              className="pdf-preview"
              title={file.name}
              // no sandbox — PDF plugin needs full access to render
            />
          )}

        </div>
      </div>
    </div>
  );
}
