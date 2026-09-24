import { apiFetch } from "@/src/api/client";
import { Order, PaymentMethodId } from "@/src/types";

export type CreateOrderItem = {
  menu_item_id: string;
  quantity: number;
  options: { group: string; choice: string }[];
  notes: string;
};

export type CreateOrderBody = {
  restaurant_id: string;
  items: CreateOrderItem[];
  dine_in: { table: string; time: string };
  payment_method: PaymentMethodId;
  promo_code: string | null;
};

export function fetchOrders() {
  return apiFetch<Order[]>("/orders", {}, true);
}

export function fetchOrder(id: string) {
  return apiFetch<Order>(`/orders/${id}`, {}, true);
}

export function createOrderRequest(body: CreateOrderBody) {
  return apiFetch<Order>("/orders", { method: "POST", body: JSON.stringify(body) }, true);
}

export function cancelOrderRequest(id: string) {
  return apiFetch<Order>(`/orders/${id}/cancel`, { method: "POST" }, true);
}

export function completeOrderRequest(id: string) {
  return apiFetch<Order>(`/orders/${id}/complete`, { method: "POST" }, true);
}
