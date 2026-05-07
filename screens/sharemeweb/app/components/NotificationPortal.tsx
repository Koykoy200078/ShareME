"use client";

import { useApp } from "../context/AppContext";

export default function NotificationPortal() {
  const { notification } = useApp();
  if (!notification) return null;
  return (
    <div id="notification" className={`notification ${notification.type}`}>
      {notification.message}
    </div>
  );
}
