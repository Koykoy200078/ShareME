import { useState, useCallback, useEffect } from "react";
import type { NotifType } from "../context/AppContext";

const API = "/api";

export interface PrintSettings { printer: string; }
export interface PrintHistoryItem {
  file: string; printer: string; copies: number;
  paperSize: string; colorMode: string; scale: string;
  timestamp: number; success: boolean; error?: string;
}

const PAPER_SIZES = ["A1","A2","A3","A4","A5","A6","B4","B5","B6","Letter","Legal","Tabloid","Executive","Statement","Folio"];
export { PAPER_SIZES };

export function usePrint(notify: (m: string, t: NotifType) => void) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [paperSize, setPaperSize] = useState("A4");
  const [colorMode, setColorMode] = useState<"color" | "bw">("color");
  const [scale, setScale] = useState<"fit" | "noscale" | "shrink">("fit");
  const [copies, setCopies] = useState(1);
  const [history, setHistory] = useState<PrintHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const [settRes, printRes] = await Promise.all([
        fetch(`${API}/print-settings`),
        fetch(`${API}/printers`),
      ]);
      if (settRes.ok && printRes.ok) {
        const sett: PrintSettings = await settRes.json();
        const { printers: list }: { printers: string[] } = await printRes.json();
        setPrinters(list);
        setSelectedPrinter(sett.printer || "");
      }
    } catch { /* silently ignore — printers optional */ }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const savePrinter = useCallback(async (p: string) => {
    setSelectedPrinter(p);
    try {
      await fetch(`${API}/print-settings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printer: p }),
      });
    } catch { /* silent */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/print-history`);
      if (res.ok) { const d = await res.json(); setHistory(d.history ?? []); }
    } catch { /* silent */ }
  }, []);

  const toggleHistory = useCallback(() => {
    setHistoryOpen(prev => { if (!prev) loadHistory(); return !prev; });
  }, [loadHistory]);

  const printFile = useCallback(async (filePath: string, fileName: string) => {
    if (!paperSize) { notify("Select a paper size before printing", "error"); return; }
    setPrinting(true);
    try {
      const res = await fetch(`${API}/print-file`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, printer: selectedPrinter, copies, paperSize, colorMode, scale }),
      });
      const data = await res.json();
      if (data.success) { notify(`Print job sent: ${fileName}`, "success"); await loadHistory(); }
      else throw new Error(data.error);
    } catch (e) { notify(`Print failed: ${e instanceof Error ? e.message : ""}`, "error"); }
    finally { setPrinting(false); }
  }, [selectedPrinter, copies, paperSize, colorMode, scale, notify, loadHistory]);

  return {
    printers, selectedPrinter, savePrinter,
    paperSize, setPaperSize,
    colorMode, setColorMode,
    scale, setScale,
    copies, setCopies,
    history, historyOpen, toggleHistory,
    printing, printFile,
  };
}
