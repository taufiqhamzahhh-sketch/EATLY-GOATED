// Order status presentation + tracking metadata. Pure data so both the
// Pesanan list and the tracking screen render consistently.
import { OrderStatus } from "@/src/types";

export type StatusTone = "brand" | "warning" | "success" | "neutral" | "error";

// Kitchen progression path (cancelled is a terminal branch handled separately).
export const ORDER_FLOW: OrderStatus[] = ["paid", "preparing", "ready", "completed"];

export const STATUS_META: Record<
  OrderStatus,
  { label: string; tone: StatusTone; icon: string; hint: string }
> = {
  paid: {
    label: "Dibayar",
    tone: "brand",
    icon: "checkmark-circle",
    hint: "Pembayaran diterima, menunggu restoran.",
  },
  preparing: {
    label: "Disiapkan",
    tone: "warning",
    icon: "restaurant",
    hint: "Dapur sedang menyiapkan pesananmu.",
  },
  ready: {
    label: "Siap",
    tone: "success",
    icon: "fast-food",
    hint: "Pesanan siap! Tunjukkan QR ke staf.",
  },
  completed: {
    label: "Selesai",
    tone: "neutral",
    icon: "flag",
    hint: "Pesanan selesai. Selamat menikmati!",
  },
  cancelled: {
    label: "Dibatalkan",
    tone: "error",
    icon: "close-circle",
    hint: "Pesanan ini dibatalkan.",
  },
};

export const TIMELINE_STEPS: {
  status: OrderStatus;
  title: string;
  desc: string;
  icon: string;
}[] = [
  { status: "paid", title: "Pembayaran Diterima", desc: "Pesanan diteruskan ke restoran", icon: "card" },
  { status: "preparing", title: "Sedang Disiapkan", desc: "Dapur menyiapkan pesananmu", icon: "restaurant" },
  { status: "ready", title: "Siap Disajikan", desc: "Tunjukkan QR ke staf restoran", icon: "fast-food" },
  { status: "completed", title: "Selesai", desc: "Selamat menikmati!", icon: "checkmark-done" },
];

// Index within ORDER_FLOW; -1 for cancelled.
export function statusStepIndex(status: OrderStatus): number {
  return ORDER_FLOW.indexOf(status);
}

export function formatOrderTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `Hari ini, ${hh}:${mm}`;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("id-ID", { month: "short" });
  return `${day} ${month}, ${hh}:${mm}`;
}
