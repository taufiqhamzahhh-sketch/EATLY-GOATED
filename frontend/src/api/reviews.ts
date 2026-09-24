import { apiFetch } from "@/src/api/client";
import { Review } from "@/src/types";

export function fetchReviews(restaurantId: string) {
  return apiFetch<Review[]>(`/restaurants/${restaurantId}/reviews`);
}

export function createReviewRequest(body: { order_id: string; rating: number; comment: string }) {
  return apiFetch<{ ok: boolean }>("/reviews", { method: "POST", body: JSON.stringify(body) }, true);
}
