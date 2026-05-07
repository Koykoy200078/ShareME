"use client";

import { useState } from "react";
import type { FolderNode, FileItem } from "../hooks/useFiles";
import FileCard from "./FileCard";

interface FolderNodeProps {
  name: string;
  node: FolderNode;
  onDelete: (p: string, n: string) => void;
  onDownload: (p: string, n: string) => void;
  onPreview: (p: string, n: string) => void;
  onPrint: (p: string, n: string) => void;
  onToggleSelect: (p: string) => void;
  selected: Set<string>;
}

function FolderItem({ name, node, ...handlers }: FolderNodeProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="folder-container">
      <div className="folder-header" onClick={() => setOpen(v => !v)}>
        <div className="folder-icon">📁</div>
        <div className="folder-name">{name}</div>
        <button className="folder-toggle" type="button">{open ? "▼" : "▶"}</button>
      </div>
      {open && (
        <div className="folder-content">
          <FolderTree node={node} {...handlers} />
        </div>
      )}
    </div>
  );
}

interface TreeProps {
  node: FolderNode;
  onDelete: (p: string, n: string) => void;
  onDownload: (p: string, n: string) => void;
  onPreview: (p: string, n: string) => void;
  onPrint: (p: string, n: string) => void;
  onToggleSelect: (p: string) => void;
  selected: Set<string>;
}

export default function FolderTree({ node, selected, ...handlers }: TreeProps) {
  const folderNames = Object.keys(node.folders).sort();
  return (
    <>
      {folderNames.map(name => (
        <FolderItem key={name} name={name} node={node.folders[name]} selected={selected} {...handlers} />
      ))}
      {node.files.map((file: FileItem) => (
        <FileCard
          key={file.path}
          file={file}
          selected={selected.has(file.path)}
          onToggleSelect={handlers.onToggleSelect}
          onDelete={handlers.onDelete}
          onDownload={handlers.onDownload}
          onPreview={handlers.onPreview}
          onPrint={handlers.onPrint}
        />
      ))}
    </>
  );
}
