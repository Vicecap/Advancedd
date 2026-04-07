import { useState, useEffect, useCallback } from "react";

export interface UseNotificationsReturn {
  permission: NotificationPermission | "unsupported";
  requestPermission: () => Promise<void>;
  notify: (title: string, options?: NotificationOptions) => void;
}

export function useNotifications(): UseNotificationsReturn {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission);
  }, [supported]);

  const requestPermission = useCallback(async () => {
    if (!supported) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, [supported]);

  const notify = useCallback((title: string, options?: NotificationOptions) => {
    if (!supported || Notification.permission !== "granted") return;
    new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...options,
    });
  }, [supported]);

  return { permission, requestPermission, notify };
}
