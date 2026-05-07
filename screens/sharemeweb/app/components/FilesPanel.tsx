"use client";

import { useEffect, useCallback, useState } from "react";
import type { SortOption } from "../hooks/useFiles";
import { buildFolderTree } from "../hooks/useFiles";
import type { UseFilesReturn } from "./FilesPanel.types";
import FolderTree from "./FolderTree";
import { useApp } from "../context/AppContext";

interface Props {
  files: UseFilesReturn;
  onPreview: (path: string, name: string) => void;
  onPrint: (path: string, name: string) => void;
}

function download(filePath: string, fileName: string) {
  const a = document.createElement("a");
  a.href = "/files" + filePath;
  a.download = fileName;
  a.click();
}

export default function FilesPanel({ files, onPreview, onPrint }: Props) {
  const { showNotification } = useApp();
  const { paginated, extensions, sort, setSort, search, setSearch, extension, setExtension,
          page, setPage, selected, toggleSelect, selectAll, clearSelection, deleteFile,
          bulkDelete, loadFiles, loading } = files;
  const { files: pageFiles, totalPages, total, safePage } = paginated();

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleDelete = useCallback((p: string, n: string) => deleteFile(p, n), [deleteFile]);
  const handleDownload = useCallback((p: string, n: string) => { download(p, n); showNotification(`Downloading ${n}`, "success"); }, [showNotification]);

  const tree = buildFolderTree(pageFiles);

  return (
    <div className="files-section">
      {/* Header */}
      <div className="section-header">
        <h2>📂 Shared Files</h2>
        <div className="files-controls">
          <select className="sort-option" value={sort}
            onChange={e => { setSort(e.target.value as SortOption); setPage(1); }}>
            <option value="name-asc">Name (A→Z)</option>
            <option value="name-desc">Name (Z→A)</option>
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="size-desc">Largest First</option>
            <option value="size-asc">Smallest First</option>
          </select>

          <select className="extension-filter" value={extension} onChange={e => { setExtension(e.target.value); setPage(1); }}>
            <option value="">All Types</option>
            {extensions().map(e => <option key={e} value={e}>.{e.toUpperCase()}</option>)}
          </select>

          <input
            className="search-input"
            type="text"
            placeholder="🔍 Search files…"
            style={{ flex: '1 1 140px', minWidth: '120px' }}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />

          <span className="file-count">{total} file{total !== 1 ? "s" : ""}</span>

          <button className="btn btn-refresh" type="button" onClick={loadFiles} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div id="bulkActions" className="bulk-actions">
          <span id="selectedCount">{selected.size} selected</span>
          <button className="btn btn-select-all" type="button" onClick={selectAll}>Select All</button>
          <button className="btn btn-delete" type="button" onClick={() => bulkDelete()}>🗑️ Delete Selected</button>
          <button className="btn btn-secondary" type="button" onClick={clearSelection}>Clear Selection</button>
        </div>
      )}

      {/* File Grid */}
      <div id="filesList-shared" className="files-grid">
        {loading ? (
          <p className="no-files">Loading…</p>
        ) : pageFiles.length === 0 ? (
          <p className="no-files">No files found</p>
        ) : (
          <FolderTree node={tree} selected={selected} onToggleSelect={toggleSelect}
            onDelete={handleDelete} onDownload={handleDownload}
            onPreview={onPreview} onPrint={onPrint} />
        )}
      </div>

      {/* Pagination */}
      <div className="pagination-controls">
        <button className="btn btn-pagination" type="button" disabled={safePage <= 1}
          onClick={() => setPage(p => Math.max(1, p - 1))}>← Previous</button>
        <span className="pagination-info">
          Page <span id="currentPage">{safePage}</span> of <span id="totalPages">{totalPages}</span>
        </span>
        <button className="btn btn-pagination" type="button" disabled={safePage >= totalPages}
          onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    </div>
  );
}
