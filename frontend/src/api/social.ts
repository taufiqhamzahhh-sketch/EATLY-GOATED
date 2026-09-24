import { apiFetch } from "@/src/api/client";
import {
  CommentPage,
  FeaturedCreator,
  FeedPage,
  Post,
  PostComment,
  PostType,
  ReportReason,
  ReportTarget,
  SearchResults,
  SocialProfile,
} from "@/src/types";

export type FeedScope = "foryou" | "following";

export function fetchFeed(params: {
  scope?: FeedScope;
  reelsOnly?: boolean;
  cursor?: string | null;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  qs.set("scope", params.scope ?? "foryou");
  if (params.reelsOnly) qs.set("reels_only", "true");
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch<FeedPage>(`/feed?${qs.toString()}`, {}, true);
}

export function fetchPost(id: string) {
  return apiFetch<Post>(`/posts/${id}`, {}, true);
}

export function createPost(body: {
  type: PostType;
  media: { type: "image" | "video"; url: string; poster?: string }[];
  caption: string;
  restaurant_id?: string | null;
  dish_id?: string | null;
  location?: string;
}) {
  return apiFetch<Post>("/posts", { method: "POST", body: JSON.stringify(body) }, true);
}

export function deletePost(id: string) {
  return apiFetch<{ ok: boolean }>(`/posts/${id}`, { method: "DELETE" }, true);
}

export function togglePostLike(id: string) {
  return apiFetch<{ liked: boolean; likeCount: number }>(`/posts/${id}/like`, { method: "POST" }, true);
}

export function togglePostSave(id: string) {
  return apiFetch<{ saved: boolean; saveCount: number }>(`/posts/${id}/save`, { method: "POST" }, true);
}

export function fetchComments(postId: string, params?: { parentId?: string; cursor?: string | null }) {
  const qs = new URLSearchParams();
  if (params?.parentId) qs.set("parent_id", params.parentId);
  if (params?.cursor) qs.set("cursor", params.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<CommentPage>(`/posts/${postId}/comments${suffix}`, {}, true);
}

export function addComment(postId: string, text: string, parentId?: string | null) {
  return apiFetch<PostComment>(
    `/posts/${postId}/comments`,
    { method: "POST", body: JSON.stringify({ text, parent_id: parentId ?? null }) },
    true,
  );
}

export function toggleCommentLike(commentId: string) {
  return apiFetch<{ liked: boolean; likeCount: number }>(`/comments/${commentId}/like`, { method: "POST" }, true);
}

export function deleteComment(commentId: string) {
  return apiFetch<{ ok: boolean }>(`/comments/${commentId}`, { method: "DELETE" }, true);
}

export function toggleFollow(userId: string) {
  return apiFetch<{ following: boolean; followerCount: number }>(`/users/${userId}/follow`, { method: "POST" }, true);
}

export function fetchSocialProfile(userId: string) {
  return apiFetch<SocialProfile>(`/users/${userId}`, {}, true);
}

export function fetchUserPosts(userId: string, reelsOnly = false) {
  const suffix = reelsOnly ? "?reels_only=true" : "";
  return apiFetch<Post[]>(`/users/${userId}/posts${suffix}`, {}, true);
}

export function fetchSavedPosts() {
  return apiFetch<Post[]>("/me/saved", {}, true);
}

export function fetchFeaturedCreators() {
  return apiFetch<FeaturedCreator[]>("/creators/featured", {}, true);
}

export function searchSocial(q: string) {
  return apiFetch<SearchResults>(`/social/search?q=${encodeURIComponent(q)}`, {}, true);
}

export function reportContent(target_type: ReportTarget, target_id: string, reason: ReportReason, note = "") {
  return apiFetch<{ ok: boolean }>(
    "/reports",
    { method: "POST", body: JSON.stringify({ target_type, target_id, reason, note }) },
    true,
  );
}
