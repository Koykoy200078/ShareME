"use client";

import type { FileItem } from "../hooks/useFiles";

const ICONS: Record<string, string> = {
  pdf:"📄", doc:"📝", docx:"📝", xls:"📊", xlsx:"📊", ppt:"📊", pptx:"📊",
  jpg:"🖼️", jpeg:"🖼️", png:"🖼️", gif:"🖼️", svg:"🖼️", webp:"🖼️", bmp:"🖼️",
  mp4:"🎬", avi:"🎬", mov:"🎬", webm:"🎬", ogg:"🎬",
  mp3:"🎵", wav:"🎵",
  zip:"📦", rar:"📦", "7z":"📦",
  txt:"📃", html:"🌐", css:"🎨", js:"⚙️", ts:"⚙️", exe:"⚙️",
};

function icon(name: string) { return ICONS[name.split(".").pop()?.toLowerCase() ?? ""] ?? "📄"; }
function fmtSize(b: number) {
  if (!b || !isFinite(b)) return "0 B";
  const k = 1024, s = ["B","KB","MB","GB","TB"];
  const i = Math.min(Math.floor(Math.log(b)/Math.log(k)), s.length-1);
  return (b/Math.pow(k,i)).toFixed(2)+" "+s[i];
}

const IS_IMAGE = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i;
const IS_VIDEO = /\.(mp4|webm|ogg|mov|avi)$/i;

interface Props {
  file: FileItem;
  selected: boolean;
  onToggleSelect: (path: string) => void;
  onDelete: (path: string, name: string) => void;
  onDownload: (path: string, name: string) => void;
  onPreview: (path: string, name: string) => void;
  onPrint: (path: string, name: string) => void;
}

export default function FileCard({ file, selected, onToggleSelect, onDelete, onDownload, onPreview, onPrint }: Props) {
  const isPDF = file.name.toLowerCase().endsWith(".pdf");
  const isImage = IS_IMAGE.test(file.name);
  const isVideo = IS_VIDEO.test(file.name);
  const isPreviewable = isPDF || isImage || isVideo;

  return (
    <div
      className={`file-card selectable${selected ? " selected" : ""}`}
      data-path={file.path}
      draggable
      onDragStart={e => e.dataTransfer.setData("text/uri-list", `${window.location.origin}/files${file.path}`)}
      onClick={() => onToggleSelect(file.path)}
    >
      {/* Checkbox */}
      <div
        className="file-card-checkbox"
        onClick={e => { e.stopPropagation(); onToggleSelect(file.path); }}
      >
        {selected ? "✓" : ""}
      </div>

      {/* Thumbnail for images */}
      {isImage && (
        <img
          src={`/files${file.path}`}
          className="file-thumbnail"
          alt={file.name}
          loading="lazy"
          onError={e => (e.currentTarget.style.display = "none")}
        />
      )}

      <div className="file-card-icon">{icon(file.name)}</div>
      <div className="file-card-name" title={file.name}>{file.name}</div>
      <div className="file-card-info">
        {fmtSize(file.size)} • {new Date(file.uploadedAt).toLocaleString()}
      </div>

      <div className="file-card-actions" onClick={e => e.stopPropagation()}>
        {isPreviewable && (
          <button className="btn btn-preview" type="button" onClick={() => onPreview(file.path, file.name)}>
            Preview
          </button>
        )}
        {isPDF && (
          <button className="btn btn-print" type="button" onClick={() => onPrint(file.path, file.name)}>
            Direct Print
          </button>
        )}
        <button className="btn btn-download" type="button" onClick={() => onDownload(file.path, file.name)}>
          Download
        </button>
        <button className="btn btn-delete" type="button" onClick={() => onDelete(file.path, file.name)}>
          Delete
        </button>
      </div>
    </div>
  );
}
