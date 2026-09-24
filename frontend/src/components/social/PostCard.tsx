import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Share, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Avatar } from "@/src/components/social/Avatar";
import { CaptionText } from "@/src/components/social/CaptionText";
import { PostMediaView } from "@/src/components/social/PostMediaView";
import { togglePostLike, togglePostSave, toggleFollow } from "@/src/api/social";
import { useToast } from "@/src/context/toast-context";
import { Post } from "@/src/types";
import { formatCount } from "@/src/utils/format";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export function PostCard({
  post,
  onOpenComments,
  onOpenOptions,
}: {
  post: Post;
  onOpenComments: (post: Post) => void;
  onOpenOptions: (post: Post) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { show } = useToast();

  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.saved);
  const [following, setFollowing] = useState(post.author.following);

  const doLike = async (fromDouble = false) => {
    if (fromDouble && liked) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const res = await togglePostLike(post.id);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      show("Gagal menyukai. Coba lagi.", "error");
    }
  };

  const doSave = async () => {
    const next = !saved;
    setSaved(next);
    try {
      const res = await togglePostSave(post.id);
      setSaved(res.saved);
      show(res.saved ? "Disimpan ke koleksi" : "Dihapus dari simpanan", "success");
    } catch {
      setSaved(!next);
      show("Gagal menyimpan. Coba lagi.", "error");
    }
  };

  const doFollow = async () => {
    const next = !following;
    setFollowing(next);
    try {
      await toggleFollow(post.author.id);
    } catch {
      setFollowing(!next);
      show("Gagal mengikuti. Coba lagi.", "error");
    }
  };

  const doShare = async () => {
    try {
      await Share.share({
        message: `Lihat konten makanan ini di Eatly: ${post.caption.slice(0, 80)}${
          post.restaurantName ? ` — ${post.restaurantName}` : ""
        }\neatly://post/${post.id}`,
      });
    } catch {
      /* dismissed */
    }
  };

  return (
    <View style={styles.card} testID={`post-card-${post.id}`}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          onPress={() => router.push(`/user/${post.author.id}`)}
          testID={`post-author-${post.id}`}
        >
          <Avatar uri={post.author.avatar} size={38} verified={post.author.verified} ring />
          <View style={{ marginLeft: spacing.sm }}>
            <Text style={styles.username}>{post.author.username}</Text>
            {post.location ? <Text style={styles.subLine}>{post.location}</Text> : null}
          </View>
        </Pressable>
        {!following ? (
          <Pressable onPress={doFollow} style={styles.followBtn} testID={`post-follow-${post.id}`}>
            <Text style={styles.followText}>Ikuti</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => onOpenOptions(post)} hitSlop={8} testID={`post-options-${post.id}`} style={styles.optionsBtn}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {/* Media */}
      <PostMediaView media={post.media} onDoubleTapLike={() => doLike(true)} />

      {/* Action bar */}
      <View style={styles.actions}>
        <View style={styles.actionsLeft}>
          <Pressable onPress={() => doLike()} hitSlop={6} testID={`post-like-${post.id}`}>
            <Ionicons name={liked ? "heart" : "heart-outline"} size={27} color={liked ? colors.errorSolid : colors.onSurface} />
          </Pressable>
          <Pressable onPress={() => onOpenComments(post)} hitSlop={6} testID={`post-comment-${post.id}`}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.onSurface} />
          </Pressable>
          <Pressable onPress={doShare} hitSlop={6} testID={`post-share-${post.id}`}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.onSurface} />
          </Pressable>
        </View>
        <Pressable onPress={doSave} hitSlop={6} testID={`post-save-${post.id}`}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      {/* Counts + caption */}
      <View style={styles.body}>
        {likeCount > 0 ? (
          <Text style={styles.likes} testID={`post-likes-${post.id}`}>
            {formatCount(likeCount)} suka
          </Text>
        ) : null}

        <View style={styles.captionRow}>
          <Text style={styles.captionUser}>{post.author.username} </Text>
          <View style={{ flex: 1 }}>
            <CaptionText text={post.caption} numberOfLines={2} />
          </View>
        </View>

        {/* Eatly discovery chips */}
        {post.restaurantId || post.dishId ? (
          <View style={styles.tagRow}>
            {post.restaurantName ? (
              <Pressable
                style={styles.tagChip}
                onPress={() => router.push(`/restaurant/${post.restaurantId}`)}
                testID={`post-resto-tag-${post.id}`}
              >
                <Ionicons name="restaurant" size={13} color={colors.brandPrimary} />
                <Text style={styles.tagText} numberOfLines={1}>{post.restaurantName}</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.muted} />
              </Pressable>
            ) : null}
            {post.dishName ? (
              <Pressable
                style={styles.tagChip}
                onPress={() => router.push(`/restaurant/${post.restaurantId}`)}
                testID={`post-dish-tag-${post.id}`}
              >
                <Ionicons name="fast-food" size={13} color={colors.brandPrimary} />
                <Text style={styles.tagText} numberOfLines={1}>{post.dishName}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {post.commentCount > 0 ? (
          <Pressable onPress={() => onOpenComments(post)} testID={`post-view-comments-${post.id}`}>
            <Text style={styles.viewComments}>Lihat semua {formatCount(post.commentCount)} komentar</Text>
          </Pressable>
        ) : null}
        <Text style={styles.time}>{post.timeAgo} lalu</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { backgroundColor: colors.surfaceSecondary, marginBottom: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  username: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.onSurface },
  subLine: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted, marginTop: 1 },
  followBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSecondary,
    marginRight: spacing.sm,
  },
  followText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.onBrandSecondary },
  optionsBtn: { padding: 2 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  actionsLeft: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 5 },
  likes: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.onSurface },
  captionRow: { flexDirection: "row", flexWrap: "wrap" },
  captionUser: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 220,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.onSurface, flexShrink: 1 },
  viewComments: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  time: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 1 },
}));
