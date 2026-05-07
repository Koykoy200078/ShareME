"use client";

import { usePrint, PAPER_SIZES } from "../hooks/usePrint";
import { useApp } from "../context/AppContext";

interface Props {
  printHook: ReturnType<typeof usePrint>;
  // called from FileCard "Direct Print" button
  pendingPrint?: { path: string; name: string } | null;
}

export default function PrintPanel({ printHook, pendingPrint }: Props) {
  const { showNotification } = useApp();
  const { printers, selectedPrinter, savePrinter, paperSize, setPaperSize,
          colorMode, setColorMode, scale, setScale, copies, setCopies,
          history, historyOpen, toggleHistory, printing, printFile } = printHook;

  // Trigger print when pendingPrint arrives from parent
  if (pendingPrint) {
    printFile(pendingPrint.path, pendingPrint.name);
  }

  return (
    <div className="autoprint-panel">
      {/* Printer select */}
      <div className="autoprint-row"><span className="autoprint-label">🖨️ Printer</span></div>
      <div className="autoprint-printer">
        <select className="printer-select" value={selectedPrinter}
          onChange={e => savePrinter(e.target.value)}>
          <option value="">🖨️ Default Printer</option>
          {printers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Paper size */}
      <div className="autoprint-row">
        <span className="autoprint-label">📌 Paper Size</span>
        <select className="paper-size-select" value={paperSize} onChange={e => setPaperSize(e.target.value)}>
          <option value="" disabled>— Select Paper Size —</option>
          <optgroup label="― ISO A Series">
            {["A1","A2","A3","A4","A5","A6"].map(s => <option key={s} value={s}>{s}</option>)}
          </optgroup>
          <optgroup label="― ISO B Series">
            {["B4","B5","B6"].map(s => <option key={s} value={s}>{s}</option>)}
          </optgroup>
          <optgroup label="― US Sizes">
            {["Letter","Legal","Tabloid","Executive","Statement","Folio"].map(s => <option key={s} value={s}>{s}</option>)}
          </optgroup>
        </select>
      </div>

      {/* Color mode */}
      <div className="autoprint-row">
        <span className="autoprint-label">🎨 Color Mode</span>
        <select className="color-mode-select" value={colorMode}
          onChange={e => setColorMode(e.target.value as "color" | "bw")}>
          <option value="color">Color</option>
          <option value="bw">Black &amp; White</option>
        </select>
      </div>

      {/* Scale */}
      <div className="autoprint-row">
        <span className="autoprint-label">⚖️ Scale</span>
        <select className="scale-select" value={scale}
          onChange={e => setScale(e.target.value as "fit" | "noscale" | "shrink")}>
          <option value="fit">Fit to printable area</option>
          <option value="noscale">Actual size</option>
          <option value="shrink">Shrink (if larger)</option>
        </select>
      </div>

      {/* Copies */}
      <div className="autoprint-row">
        <span className="autoprint-label">📄 Copies</span>
        <input className="print-copies-input" type="number" min={1} max={99} value={copies}
          onChange={e => setCopies(Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))} />
      </div>

      {/* Print history toggle */}
      <div className="print-history-header" onClick={toggleHistory} style={{ cursor: "pointer" }}>
        🕐 Print History <span id="printHistoryToggle">{historyOpen ? "▼" : "▶"}</span>
      </div>

      {historyOpen && (
        <div id="printHistoryList" className="print-history-list">
          {history.length === 0 ? (
            <div className="print-history-empty">No print jobs yet</div>
          ) : history.map((item, i) => (
            <div key={i} className={`print-history-item ${item.success ? "success" : "failed"}`}>
              <span className="ph-icon">{item.success ? "✅" : "❌"}</span>
              <span className="ph-name" title={item.file}>{item.file}</span>
              <span className="ph-meta">
                {item.printer} ×{item.copies}
                {item.paperSize && item.paperSize !== "default" ? ` · ${item.paperSize}` : ""}
                {item.colorMode && item.colorMode !== "color" ? " · B&W" : ""}
                {item.scale && item.scale !== "fit" ? ` · ${item.scale === "noscale" ? "Actual size" : "Shrink"}` : ""}
              </span>
              <span className="ph-time">{new Date(item.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
