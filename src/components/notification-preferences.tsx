"use client";

import { useEffect, useState } from "react";

export function NotificationPreferences({
  labels,
}: {
  labels: { browser: string; sound: string; help: string };
}) {
  const [browser, setBrowser] = useState(false);
  const [sound, setSound] = useState(false);
  useEffect(() => {
    setBrowser(Boolean(localStorage.getItem("menuqr-browser-notifications")));
    setSound(Boolean(localStorage.getItem("menuqr-notification-sound")));
  }, []);
  async function toggleBrowser(enabled: boolean) {
    if (enabled && "Notification" in window) {
      const permission = await Notification.requestPermission();
      enabled = permission === "granted";
    }
    setBrowser(enabled);
    if (enabled) localStorage.setItem("menuqr-browser-notifications", "1");
    else localStorage.removeItem("menuqr-browser-notifications");
  }
  function toggleSound(enabled: boolean) {
    setSound(enabled);
    if (enabled) localStorage.setItem("menuqr-notification-sound", "1");
    else localStorage.removeItem("menuqr-notification-sound");
  }
  return (
    <div className="notification-preferences">
      <p>{labels.help}</p>
      <label><input type="checkbox" checked={browser} onChange={(event) => void toggleBrowser(event.target.checked)} />{labels.browser}</label>
      <label><input type="checkbox" checked={sound} onChange={(event) => toggleSound(event.target.checked)} />{labels.sound}</label>
    </div>
  );
}
