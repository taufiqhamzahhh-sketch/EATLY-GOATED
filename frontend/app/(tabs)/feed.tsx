import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { CommentsSheet } from "@/src/components/social/CommentsSheet";
import { FeaturedCreators } from "@/src/components/social/FeaturedCreators";
import { PostCard } from "@/src/components/social/PostCard";
import { PostOptionsSheet } from "@/src/components/social/PostOptionsSheet";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { StateView } from "@/src/components/ui/StateView";
import { fetchFeed, FeedScope } from "@/src/api/social";
import { fetchUnreadCount } from "@/src/api/notifications";
import { useAuth } from "@/src/context/auth-context";
import { usesNativeTabs } from "@/src/navigation";
import { Post } from "@/src/types";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function FeedScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [scope, setScope] = useState<FeedScope>("foryou");
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [optionsFor, setOptionsFor] = useState<Post | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  const query = useInfiniteQuery({
    queryKey: ["feed", scope],
    queryFn: ({ pageParam }) => fetchFeed({ scope, cursor: pageParam, limit: 6 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
  });

  const unreadQuery = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: fetchUnreadCount,
    enabled: !!user,
    refetchInterval: 8000,
  });
  const unread = unreadQuery.data?.count ?? 0;

  const posts = (query.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => !hidden.includes(p.id));

  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCard post={item} onOpenComments={(p) => setCommentsFor(p.id)} onOpenOptions={(p) => setOptionsFor(p)} />
    ),
    [],
  );

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTop}>
          <Text style={styles.logo}>Eatly</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push("/create")} hitSlop={6} testID="feed-create">
              <Ionicons name="add-circle-outline" size={26} color={colors.onSurface} />
            </Pressable>
            <Pressable onPress={() => router.push("/search")} hitSlop={6} testID="feed-search">
              <Ionicons name="search" size={24} color={colors.onSurface} />
            </Pressable>
            <Pressable onPress={() => router.push("/notifications")} hitSlop={6} testID="feed-notifications">
              <Ionicons name="notifications-outline" size={24} color={colors.onSurface} />
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
        <View style={styles.scopeRow}>
          {(["foryou", "following"] as FeedScope[]).map((s) => (
            <Pressable key={s} onPress={() => setScope(s)} style={styles.scopeBtn} testID={`feed-scope-${s}`}>
              <Text style={[styles.scopeText, scope === s && styles.scopeTextActive]}>
                {s === "foryou" ? "Untuk Kamu" : "Mengikuti"}
              </Text>
              {scope === s ? <View style={styles.scopeUnderline} /> : null}
            </Pressable>
          ))}
        </View>
      </View>

      {query.isLoading ? (
        <View style={{ padding: spacing.md, gap: spacing.lg }}>
          {[1, 2].map((i) => (
            <View key={i} style={{ gap: spacing.sm }}>
              <Skeleton style={{ height: 40, borderRadius: radius.md, width: "60%" }} />
              <Skeleton style={{ height: 320, borderRadius: radius.md }} />
            </View>
          ))}
        </View>
      ) : query.isError ? (
        <StateView
          testID="feed-error"
          icon="cloud-offline-outline"
          title="Gagal memuat feed"
          message="Periksa koneksimu lalu coba lagi."
          actionLabel="Coba Lagi"
          onAction={() => query.refetch()}
        />
      ) : posts.length === 0 ? (
        <StateView
          testID="feed-empty"
          icon={scope === "following" ? "people-outline" : "fast-food-outline"}
          title={scope === "following" ? "Feed masih kosong" : "Perjalanan kulinermu dimulai di sini"}
          message={
            scope === "following"
              ? "Ikuti food lovers & restoran untuk mempersonalisasi feedmu."
              : "Temukan sesuatu yang lezat atau bagikan pengalaman makan pertamamu."
          }
          actionLabel={scope === "following" ? "Jelajahi Untuk Kamu" : "Buat Postingan"}
          onAction={() => (scope === "following" ? setScope("foryou") : router.push("/create"))}
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={scope === "foryou" ? <FeaturedCreators /> : null}
          contentContainerStyle={{ paddingBottom: bottomChrome + spacing["2xl"] }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.brandPrimary} />
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <View style={{ paddingVertical: spacing.xl }}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            ) : null
          }
        />
      )}

      <CommentsSheet
        postId={commentsFor}
        visible={!!commentsFor}
        onClose={() => setCommentsFor(null)}
        onAdded={() => query.refetch()}
      />
      <PostOptionsSheet
        post={optionsFor}
        visible={!!optionsFor}
        onClose={() => setOptionsFor(null)}
        onDeleted={(id) => {
          setHidden((h) => [...h, id]);
          query.refetch();
        }}
        onHidden={(id) => setHidden((h) => [...h, id])}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.brandPrimary },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  badge: {
    position: "absolute",
    top: -5,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.errorSolid,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, color: "#FFFFFF" },
  scopeRow: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.md },
  scopeBtn: { paddingBottom: spacing.sm, alignItems: "center" },
  scopeText: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.muted },
  scopeTextActive: { color: colors.onSurface, fontFamily: fonts.extrabold },
  scopeUnderline: { height: 2.5, backgroundColor: colors.brandPrimary, alignSelf: "stretch", borderRadius: 2, marginTop: 5 },
}));
