import { useEvent } from "expo";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { CaptionText } from "@/src/components/social/CaptionText";
import { CommentsSheet } from "@/src/components/social/CommentsSheet";
import { PostOptionsSheet } from "@/src/components/social/PostOptionsSheet";
import { fetchFeed, togglePostLike, togglePostSave, toggleFollow } from "@/src/api/social";
import { StateView } from "@/src/components/ui/StateView";
import { Post } from "@/src/types";
import { formatCount } from "@/src/utils/format";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const { height: SCREEN_H } = Dimensions.get("window");

function ReelItem({
  post,
  height,
  active,
  onOpenComments,
  onOpenOptions,
}: {
  post: Post;
  height: number;
  active: boolean;
  onOpenComments: (id: string) => void;
  onOpenOptions: (p: Post) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const media = post.media[0];

  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.saved);
  const [following, setFollowing] = useState(post.author.following);
  const [muted, setMuted] = useState(false);

  const pausedManually = useRef(false);
  const player = useVideoPlayer(media?.url ?? "", (p) => {
    p.loop = true;
    p.muted = false;
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  // sync playback with active state (effect, never during render)
  useEffect(() => {
    if (active && !pausedManually.current) {
      player.play();
    } else if (!active) {
      pausedManually.current = false;
      player.pause();
    }
  }, [active, player]);

  const togglePlay = () => {
    if (player.playing) {
      player.pause();
      pausedManually.current = true;
    } else {
      player.play();
      pausedManually.current = false;
    }
  };

  const doLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const res = await togglePostLike(post.id);
      setLiked(res.liked);
      setLikeCount(res.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  };
  const doSave = async () => {
    setSaved((s) => !s);
    try {
      const res = await togglePostSave(post.id);
      setSaved(res.saved);
    } catch {
      setSaved((s) => !s);
    }
  };
  const doFollow = async () => {
    setFollowing((f) => !f);
    try {
      await toggleFollow(post.author.id);
    } catch {
      setFollowing((f) => !f);
    }
  };

  return (
    <View style={{ height, backgroundColor: "#000000" }} testID={`reel-${post.id}`}>
      <Pressable style={{ flex: 1 }} onPress={togglePlay}>
        {media?.poster ? (
          <Image source={{ uri: media.poster }} style={styles.fill} contentFit="cover" />
        ) : null}
        {media?.type === "video" ? (
          <VideoView player={player} style={styles.fill} contentFit="cover" nativeControls={false} pointerEvents="none" />
        ) : null}
        {!isPlaying ? (
          <View style={styles.playOverlay} pointerEvents="none">
            <Ionicons name="play" size={64} color="rgba(255,255,255,0.85)" />
          </View>
        ) : null}
        <View style={styles.scrim} pointerEvents="none" />
      </Pressable>

      {/* Top bar */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <Text style={styles.topTitle}>Reels</Text>
        <View style={{ flexDirection: "row", gap: spacing.lg }}>
          <Pressable onPress={() => setMuted((m) => { const nm = !m; player.muted = nm; return nm; })} hitSlop={8} testID={`reel-mute-${post.id}`}>
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={() => onOpenOptions(post)} hitSlop={8} testID={`reel-options-${post.id}`}>
            <Ionicons name="ellipsis-vertical" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Right action rail */}
      <View style={[styles.rail, { bottom: insets.bottom + 90 }]}>
        <Rail icon={liked ? "heart" : "heart-outline"} color={liked ? colors.errorSolid : "#FFFFFF"} label={formatCount(likeCount)} onPress={doLike} testID={`reel-like-${post.id}`} />
        <Rail icon="chatbubble-outline" label={formatCount(post.commentCount)} onPress={() => onOpenComments(post.id)} testID={`reel-comment-${post.id}`} />
        <Rail icon={saved ? "bookmark" : "bookmark-outline"} label="Simpan" onPress={doSave} testID={`reel-save-${post.id}`} />
        {post.restaurantId ? (
          <Rail icon="restaurant" label="Resto" onPress={() => router.push(`/restaurant/${post.restaurantId}`)} testID={`reel-resto-${post.id}`} />
        ) : null}
      </View>

      {/* Bottom info */}
      <View style={[styles.bottom, { bottom: insets.bottom + 24 }]}>
        <View style={styles.authorRow}>
          <Pressable style={styles.authorLeft} onPress={() => router.push(`/user/${post.author.id}`)}>
            <Image source={{ uri: post.author.avatar }} style={styles.reelAvatar} contentFit="cover" />
            <Text style={styles.reelUser}>{post.author.username}</Text>
            {post.author.verified ? <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" /> : null}
          </Pressable>
          {!following ? (
            <Pressable onPress={doFollow} style={styles.followBtn} testID={`reel-follow-${post.id}`}>
              <Text style={styles.followText}>Ikuti</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <CaptionText text={post.caption} numberOfLines={2} light />
        </View>
        {post.restaurantName ? (
          <Pressable style={styles.restoChip} onPress={() => router.push(`/restaurant/${post.restaurantId}`)} testID={`reel-resto-chip-${post.id}`}>
            <Ionicons name="location" size={13} color="#FFFFFF" />
            <Text style={styles.restoChipText} numberOfLines={1}>
              {post.restaurantName}
              {post.dishName ? ` · ${post.dishName}` : ""}
            </Text>
            <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Rail({ icon, label, onPress, testID, color = "#FFFFFF" }: { icon: string; label: string; onPress: () => void; testID?: string; color?: string }) {
  const styles = useStyles();
  return (
    <Pressable style={styles.railBtn} onPress={onPress} testID={testID} hitSlop={6}>
      <Ionicons name={icon} size={30} color={color} />
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );
}

export default function ReelsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [containerH, setContainerH] = useState(SCREEN_H);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [optionsFor, setOptionsFor] = useState<Post | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["reels-feed"],
    queryFn: ({ pageParam }) => fetchFeed({ scope: "foryou", reelsOnly: true, cursor: pageParam, limit: 5 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
  });

  const reels = query.data?.pages.flatMap((p) => p.items) ?? [];

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) setActiveIndex(viewableItems[0].index);
  }).current;

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: containerH, offset: containerH * index, index }),
    [containerH],
  );

  return (
    <View style={styles.reelsContainer} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
      {query.isLoading ? (
        <View style={styles.centerDark}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : query.isError ? (
        <View style={styles.centerDark}>
          <StateView testID="reels-error" icon="cloud-offline-outline" title="Gagal memuat Reels" actionLabel="Coba Lagi" onAction={() => query.refetch()} />
        </View>
      ) : reels.length === 0 ? (
        <View style={styles.centerDark}>
          <Ionicons name="videocam-outline" size={48} color="#FFFFFF" />
          <Text style={styles.emptyText}>Belum ada Reels</Text>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          getItemLayout={getItemLayout}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onEndReachedThreshold={1}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          renderItem={({ item, index }) => (
            <ReelItem
              post={item}
              height={containerH}
              active={index === activeIndex}
              onOpenComments={setCommentsFor}
              onOpenOptions={setOptionsFor}
            />
          )}
        />
      )}

      <CommentsSheet postId={commentsFor} visible={!!commentsFor} onClose={() => setCommentsFor(null)} onAdded={() => query.refetch()} />
      <PostOptionsSheet post={optionsFor} visible={!!optionsFor} onClose={() => setOptionsFor(null)} onDeleted={() => query.refetch()} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  reelsContainer: { flex: 1, backgroundColor: "#000000" },
  centerDark: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  emptyText: { fontFamily: fonts.bold, fontSize: 15, color: "#FFFFFF" },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  playOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 260, backgroundColor: "rgba(0,0,0,0.35)" },
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: "#FFFFFF" },
  rail: { position: "absolute", right: spacing.md, alignItems: "center", gap: spacing.lg },
  railBtn: { alignItems: "center", gap: 3 },
  railLabel: { fontFamily: fonts.semibold, fontSize: 11.5, color: "#FFFFFF" },
  bottom: { position: "absolute", left: spacing.lg, right: 72 },
  authorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  authorLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  reelAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: "#FFFFFF" },
  reelUser: { fontFamily: fonts.bold, fontSize: 14, color: "#FFFFFF" },
  followBtn: { borderWidth: 1.2, borderColor: "#FFFFFF", borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 5 },
  followText: { fontFamily: fonts.bold, fontSize: 12.5, color: "#FFFFFF" },
  restoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    marginTop: spacing.md,
  },
  restoChipText: { fontFamily: fonts.semibold, fontSize: 12.5, color: "#FFFFFF", flexShrink: 1 },
}));
