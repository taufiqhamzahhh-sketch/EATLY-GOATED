import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useCallback, ReactNode } from "react";

import {
  CreateOrderBody,
  cancelOrderRequest,
  completeOrderRequest,
  createOrderRequest,
  fetchOrders,
} from "@/src/api/orders";
import { useAuth } from "@/src/context/auth-context";
import { Order } from "@/src/types";

type OrdersState = {
  orders: Order[];
  loading: boolean;
  createOrder: (body: CreateOrderBody) => Promise<Order>;
  cancelOrder: (id: string) => Promise<Order>;
  completeOrder: (id: string) => Promise<Order>;
  getOrder: (id: string) => Order | undefined;
  refetch: () => void;
};

const OrdersContext = createContext<OrdersState | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    enabled: !!user,
    // Poll so kitchen status + notifications stay fresh while an order is active.
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const orders = useMemo(() => data ?? [], [data]);

  const createOrder = useCallback(
    async (body: CreateOrderBody) => {
      const order = await createOrderRequest(body);
      // Make it immediately visible to the success/tracking screens.
      qc.setQueryData<Order[]>(["orders"], (old) => [order, ...(old ?? [])]);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      return order;
    },
    [qc],
  );

  const cancelOrder = useCallback(
    async (id: string) => {
      const order = await cancelOrderRequest(id);
      qc.setQueryData<Order[]>(["orders"], (old) => (old ?? []).map((o) => (o.id === id ? order : o)));
      qc.invalidateQueries({ queryKey: ["notifications"] });
      return order;
    },
    [qc],
  );

  const completeOrder = useCallback(
    async (id: string) => {
      const order = await completeOrderRequest(id);
      qc.setQueryData<Order[]>(["orders"], (old) => (old ?? []).map((o) => (o.id === id ? order : o)));
      qc.invalidateQueries({ queryKey: ["notifications"] });
      return order;
    },
    [qc],
  );

  const getOrder = useCallback((id: string) => orders.find((o) => o.id === id), [orders]);

  const value = useMemo<OrdersState>(
    () => ({ orders, loading: isLoading, createOrder, cancelOrder, completeOrder, getOrder, refetch }),
    [orders, isLoading, createOrder, cancelOrder, completeOrder, getOrder, refetch],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used within OrdersProvider");
  return ctx;
}
