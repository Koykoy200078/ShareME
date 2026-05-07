"use client";

import type { ActiveUploader } from "../hooks/useWebSocket";
import type { WsStatus } from "../hooks/useWebSocket";

interface Props {
  uploaders: ActiveUploader[];
  wsStatus: WsStatus;
}

export default function ActivityBar({ uploaders, wsStatus }: Props) {
  return (
    <>
      {/* Connection status dot */}
      <div className={`connection-status ${wsStatus}`}>
        <span className="status-dot" />
        <span className="status-text">
          {wsStatus === "connected" ? "Live" : wsStatus === "reconnecting" ? "Reconnecting…" : "Offline"}
        </span>
      </div>

      {uploaders.length > 0 && (
        <div id="uploadActivity" className="upload-activity">
          <div className="activity-header">📡 Live Upload Activity</div>
          <div id="activityList" className="activity-list">
            {uploaders.map((u) => (
              <div key={u.clientId} className="activity-item">
                <div className="pulse" />
                <span className="filename">{u.filename || "Unknown file"}</span>
                <div className="progress-mini">
                  <div className="progress-mini-fill" style={{ width: `${u.progress ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
