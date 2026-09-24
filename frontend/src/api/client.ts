import { Platform } from "react-native";

import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "eatly_token";

// Resolve the API base URL at request time:
// - Web served from a real domain (preview/production): call the SAME origin.
//   The ingress routes "/api/*" to the backend, so requests are same-origin —
//   no CORS preflight, and immune to a stale EXPO_PUBLIC_BACKEND_URL pointing
//   at an old preview domain (the classic cause of "failed to fetch").
// - Web on localhost (dev) and native (Expo Go): use EXPO_PUBLIC_BACKEND_URL.
function apiBase(): string {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (!isLocal) return window.location.origin;
  }
  return process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  auth = false,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (auth) {
    const token = await storage.secureGet(TOKEN_KEY, "");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api${path}`, { ...options, headers });
  } catch {
    // Network/CORS failure (fetch throws TypeError("Failed to fetch")).
    throw new ApiError(
      "Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.",
      0,
    );
  }

  if (!res.ok) {
    let detail = `Terjadi kesalahan (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === "string" ? data.detail : detail;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
