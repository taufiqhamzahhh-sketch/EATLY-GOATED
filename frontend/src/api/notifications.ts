import { apiFetch } from "@/src/api/client";
import { AppNotification } from "@/src/types";

export function fetchNotifications() {
  return apiFetch<AppNotification[]>("/notifications", {}, true);
}

export function fetchUnreadCount() {
  return apiFetch<{ count: number }>("/notifications/unread-count", {}, true);
}

export function markAllNotificationsRead() {
  return apiFetch<{ ok: boolean }>("/notifications/read-all", { method: "POST" }, true);
}
