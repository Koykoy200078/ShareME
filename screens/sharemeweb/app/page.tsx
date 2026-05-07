"use client";

import { useState, useCallback } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { useWebSocket, type ActiveUploader } from "./hooks/useWebSocket";
import { useFiles } from "./hooks/useFiles";
import { useUpload } from "./hooks/useUpload";
import { usePrint } from "./hooks/usePrint";

import ActivityBar from "./components/ActivityBar";
import FilesPanel from "./components/FilesPanel";
import HeaderBar from "./components/HeaderBar";
import NotificationPortal from "./components/NotificationPortal";
import PreviewModal from "./components/PreviewModal";
import UploadPanel from "./components/UploadPanel";

function ShareMEApp() {
  const { showNotification } = useApp();

  // Hooks
  const files = useFiles(showNotification);
  const upload = useUpload(files.loadFiles, showNotification);
  const print = usePrint(showNotification);

  // WebSocket
  const [uploaders, setUploaders] = useState<ActiveUploader[]>([]);
  const { status } = useWebSocket({
    onFileUpdate: useCallback((_action: string) => files.debouncedLoad(), [files.debouncedLoad]),
    onUploadActivity: useCallback((u: ActiveUploader[]) => setUploaders(u), []),
  });

  // Preview state
  const [preview, setPreview] = useState<{ path: string; name: string } | null>(null);

  // Print request from file card
  const [pendingPrint, setPendingPrint] = useState<{ path: string; name: string } | null>(null);
  const handlePrint = useCallback((path: string, name: string) => {
    setPendingPrint({ path, name });
    setTimeout(() => setPendingPrint(null), 100);
  }, []);

  return (
    <>
      <NotificationPortal />

      <div className="container">
        <HeaderBar />
        <ActivityBar uploaders={uploaders} wsStatus={status} />

        <div className="main-layout">
          <UploadPanel uploadHook={upload} printHook={print} pendingPrint={pendingPrint} />
          <FilesPanel
            files={files}
            onPreview={(path, name) => setPreview({ path, name })}
            onPrint={handlePrint}
          />
        </div>
      </div>

      <PreviewModal file={preview} onClose={() => setPreview(null)} />
    </>
  );
}

export default function Page() {
  return (
    <AppProvider>
      <ShareMEApp />
    </AppProvider>
  );
}
