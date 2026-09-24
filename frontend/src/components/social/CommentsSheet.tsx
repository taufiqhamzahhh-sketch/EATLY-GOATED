import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Avatar } from "@/src/components/social/Avatar";
import { addComment, deleteComment, fetchComments, toggleCommentLike } from "@/src/api/social";
import { useAuth } from "@/src/context/auth-context";
import { useToast } from "@/src/context/toast-context";
import { PostComment } from "@/src/types";
import { formatCount } from "@/src/utils/format";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type ReplyTarget = { id: string; username: string } | null;

export function CommentsSheet({
  postId,
  visible,
  onClose,
  onAdded,
}: {
  postId: string | null;
  visible: boolean;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { show } = useToast();

  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<ReplyTarget>(null);
  const [repliesFor, setRepliesFor] = useState<Record<string, PostComment[]>>({});

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const page = await fetchComments(postId);
      setComments(page.items);
    } catch {
      show("Gagal memuat komentar", "error");
    } finally {
      setLoading(false);
    }
  }, [postId, show]);

  useEffect(() => {
    if (visible && postId) {
      setComments([]);
      setRepliesFor({});
      setReply(null);
      setText("");
      load();
    }
  }, [visible, postId, load]);

  const send = async () => {
    if (!postId || !text.trim() || sending) return;
    setSending(true);
    const body = text.trim();
    setText("");
    try {
      const created = await addComment(postId, body, reply?.id ?? null);
      if (reply) {
        setRepliesFor((prev) => ({ ...prev, [reply.id]: [...(prev[reply.id] ?? []), created] }));
        setComments((prev) => prev.map((c) => (c.id === reply.id ? { ...c, replyCount: c.replyCount + 1 } : c)));
      } else {
        setComments((prev) => [created, ...prev]);
      }
      setReply(null);
      onAdded?.();
    } catch {
      show("Gagal mengirim komentar", "error");
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const likeComment = async (c: PostComment) => {
    const upd = (list: PostComment[]) =>
      list.map((x) => (x.id === c.id ? { ...x, liked: !x.liked, likeCount: x.likeCount + (x.liked ? -1 : 1) } : x));
    setComments((prev) => upd(prev));
    setRepliesFor((prev) => {
      const copy = { ...prev };
      for (const k of Object.keys(copy)) copy[k] = upd(copy[k]);
      return copy;
    });
    try {
      await toggleCommentLike(c.id);
    } catch {
      /* revert on error by reloading */
      load();
    }
  };

  const removeComment = async (c: PostComment) => {
    try {
      await deleteComment(c.id);
      if (c.parentId) {
        setRepliesFor((prev) => ({ ...prev, [c.parentId!]: (prev[c.parentId!] ?? []).filter((x) => x.id !== c.id) }));
        setComments((prev) => prev.map((x) => (x.id === c.parentId ? { ...x, replyCount: Math.max(0, x.replyCount - 1) } : x)));
      } else {
        setComments((prev) => prev.filter((x) => x.id !== c.id));
      }
      show("Komentar dihapus", "success");
    } catch {
      show("Gagal menghapus komentar", "error");
    }
  };

  const loadReplies = async (c: PostComment) => {
    if (!postId) return;
    if (repliesFor[c.id]) {
      setRepliesFor((prev) => {
        const copy = { ...prev };
        delete copy[c.id];
        return copy;
      });
      return;
    }
    try {
      const page = await fetchComments(postId, { parentId: c.id });
      setRepliesFor((prev) => ({ ...prev, [c.id]: page.items }));
    } catch {
      show("Gagal memuat balasan", "error");
    }
  };

  const renderComment = (c: PostComment, isReply = false) => (
    <View style={[styles.commentRow, isReply && styles.replyRow]} key={c.id}>
      <Avatar uri={c.userAvatar} size={isReply ? 28 : 34} />
      <View style={{ flex: 1 }}>
        <Text style={styles.commentText}>
          <Text style={styles.commentUser}>{c.userName} </Text>
          {c.text}
        </Text>
        <View style={styles.commentMeta}>
          <Text style={styles.metaText}>{c.timeAgo}</Text>
          {c.likeCount > 0 ? <Text style={styles.metaText}>{formatCount(c.likeCount)} suka</Text> : null}
          <Pressable onPress={() => setReply({ id: c.parentId ?? c.id, username: c.userName })} testID={`reply-${c.id}`}>
            <Text style={styles.metaAction}>Balas</Text>
          </Pressable>
          {c.isOwner ? (
            <Pressable onPress={() => removeComment(c)} testID={`delete-comment-${c.id}`}>
              <Text style={[styles.metaAction, { color: colors.errorSolid }]}>Hapus</Text>
            </Pressable>
          ) : null}
        </View>
        {!isReply && c.replyCount > 0 ? (
          <Pressable onPress={() => loadReplies(c)} style={styles.repliesToggle} testID={`replies-${c.id}`}>
            <View style={styles.replyLine} />
            <Text style={styles.repliesText}>
              {repliesFor[c.id] ? "Sembunyikan balasan" : `Lihat ${c.replyCount} balasan`}
            </Text>
          </Pressable>
        ) : null}
        {repliesFor[c.id]?.map((r) => renderComment(r, true))}
      </View>
      <Pressable onPress={() => likeComment(c)} hitSlop={6} testID={`like-comment-${c.id}`} style={styles.commentLike}>
        <Ionicons name={c.liked ? "heart" : "heart-outline"} size={15} color={c.liked ? colors.errorSolid : colors.muted} />
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} testID="comments-backdrop" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.sheet, { paddingBottom: insets.bottom }]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>Komentar</Text>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>Belum ada komentar</Text>
              <Text style={styles.emptyMsg}>Jadilah yang pertama berbagi pendapat.</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => renderComment(item)}
              contentContainerStyle={{ paddingBottom: spacing.md }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {reply ? (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText}>Membalas {reply.username}</Text>
              <Pressable onPress={() => setReply(null)} testID="cancel-reply">
                <Ionicons name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.inputBar}>
            <Avatar uri={user?.avatar_url} size={32} />
            <TextInput
              style={styles.input}
              placeholder={reply ? `Balas ${reply.username}...` : "Tambahkan komentar..."}
              placeholderTextColor={colors.muted}
              value={text}
              onChangeText={setText}
              multiline
              testID="comment-input"
            />
            <Pressable onPress={send} disabled={!text.trim() || sending} testID="comment-send" hitSlop={6}>
              {sending ? (
                <ActivityIndicator color={colors.brandPrimary} size="small" />
              ) : (
                <Ionicons name="arrow-up-circle" size={30} color={text.trim() ? colors.brandPrimary : colors.borderStrong} />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "85%",
    minHeight: "55%",
    paddingHorizontal: spacing.lg,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: spacing.sm },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface, textAlign: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing["3xl"], gap: spacing.xs },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface, marginTop: spacing.sm },
  emptyMsg: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  commentRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm },
  replyRow: { paddingLeft: spacing.md, paddingVertical: spacing.xs },
  commentText: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurface, lineHeight: 19 },
  commentUser: { fontFamily: fonts.bold },
  commentMeta: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 4 },
  metaText: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted },
  metaAction: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.muted },
  repliesToggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  replyLine: { width: 24, height: 1, backgroundColor: colors.borderStrong },
  repliesText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  commentLike: { paddingTop: 4 },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  replyBannerText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.onSurface,
    maxHeight: 90,
    paddingVertical: spacing.sm,
  },
}));
