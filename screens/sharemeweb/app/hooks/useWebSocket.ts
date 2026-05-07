import { useState, useEffect, useRef, useCallback } from "react";

const WS_PATH = "/ws";
const MAX_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

export type WsStatus = "connected" | "disconnected" | "reconnecting";

export interface ActiveUploader {
  clientId: string;
  filename: string;
  progress: number;
  duration?: number;
}

interface Options {
  onFileUpdate?: (action: string, files: unknown[]) => void;
  onUploadActivity?: (uploaders: ActiveUploader[]) => void;
}

export function useWebSocket({ onFileUpdate, onUploadActivity }: Options = {}) {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callbacks in refs so connect() closure stays stable
  const onFileUpdateRef = useRef(onFileUpdate);
  const onUploadRef = useRef(onUploadActivity);
  useEffect(() => { onFileUpdateRef.current = onFileUpdate; }, [onFileUpdate]);
  useEffect(() => { onUploadRef.current = onUploadActivity; }, [onUploadActivity]);

  const scheduleReconnect = useCallback(() => {
    const delay = attemptsRef.current < MAX_ATTEMPTS ? RECONNECT_DELAY : 30000;
    attemptsRef.current = attemptsRef.current < MAX_ATTEMPTS ? attemptsRef.current + 1 : 0;
    timerRef.current = setTimeout(() => connect(), delay); // eslint-disable-line
  }, []); // eslint-disable-line

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "3007";
    // Connect directly to the backend to bypass the Next.js proxy, which drops WS connections
    const url = `${protocol}//${window.location.hostname}:${backendPort}${WS_PATH}`;
    setStatus("reconnecting");
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setStatus("connected");
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data.type === "fileUpdate") onFileUpdateRef.current?.(data.action, data.files);
          else if (data.type === "uploadActivity") onUploadRef.current?.(data.uploaders);
          else if (data.type === "connected" && data.activeUploaders?.length > 0)
            onUploadRef.current?.(data.activeUploaders);
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setStatus("disconnected");
        scheduleReconnect();
      };

      ws.onerror = () => setStatus("disconnected");
    } catch {
      setStatus("disconnected");
      scheduleReconnect();
    }
  }, [scheduleReconnect]);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status };
}
