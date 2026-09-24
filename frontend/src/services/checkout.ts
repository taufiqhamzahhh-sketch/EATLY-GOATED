// Checkout domain/service layer.
// Keeps checkout + payment business logic out of the UI so screens stay
// declarative. Mock payment today; swap simulatePayment() for a real gateway
// call later without touching any screen.
import { PaymentMethodId } from "@/src/types";

export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  description: string;
  icon: string; // Ionicons name
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "qris", label: "QRIS", description: "Scan & bayar instan", icon: "qr-code-outline" },
  { id: "gopay", label: "E-Wallet", description: "GoPay, OVO, Dana", icon: "wallet-outline" },
  { id: "card", label: "Kartu Debit / Kredit", description: "Visa, Mastercard", icon: "card-outline" },
  { id: "cash", label: "Bayar di Kasir", description: "Tunai saat tiba", icon: "cash-outline" },
];

// Available dine-in tables (mock). Later: fetch per-restaurant availability.
export const TABLE_OPTIONS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2"];

// Next reservation slots: "Sekarang" plus 15-min increments for ~2 hours.
export function buildTimeSlots(now: Date = new Date()): string[] {
  const slots: string[] = ["Sekarang"];
  const start = new Date(now);
  const remainder = 15 - (start.getMinutes() % 15 || 15);
  start.setMinutes(start.getMinutes() + remainder, 0, 0);
  for (let i = 0; i < 8; i += 1) {
    const t = new Date(start.getTime() + i * 15 * 60 * 1000);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

export type Totals = { subtotal: number; discount: number; total: number };

export function computeTotals(subtotal: number, discount: number): Totals {
  const safeDiscount = Math.min(Math.max(0, discount), subtotal);
  return { subtotal, discount: safeDiscount, total: Math.max(0, subtotal - safeDiscount) };
}

// Simulated payment. Resolves after a short delay to mimic a gateway.
export function simulatePayment(method: PaymentMethodId): Promise<{ ok: true }> {
  const delay = method === "cash" ? 500 : 1300;
  return new Promise((resolve) => setTimeout(() => resolve({ ok: true }), delay));
}
