import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Avatar } from "@/src/components/social/Avatar";
import { StateView } from "@/src/components/ui/StateView";
import { fetchSocialProfile, fetchUserPosts, toggleFollow } from "@/src/api/social";
import { useToast } from "@/src/context/toast-context";
import { formatCount } from "@/src/utils/format";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const GAP = 2;
const COLS = 3;
const TILE = (Dimensions.get("window").width - GAP * (COLS - 1)) / COLS;

export default function UserProfileScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [tab, setTab] = useState<"posts" | "reels">("posts");
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followerCount, setFollowerCount] = useState<number | null>(null);

  const profileQuery = useQuery({ queryKey: ["profile", id], queryFn: () => fetchSocialProfile(id!), enabled: !!id });
  const postsQuery = useQuery({
    queryKey: ["user-posts", id, tab],
    queryFn: () => fetchUserPosts(id!, tab === "reels"),
    enabled: !!id,
  });

  const profile = profileQuery.data;
  const isFollowing = following ?? profile?.isFollowing ?? false;
  const followers = followerCount ?? profile?.followerCount ?? 0;

  const doFollow = async () => {
    if (!profile) return;
    const next = !isFollowing;
    setFollowing(next);
    setFollowerCount(followers + (next ? 1 : -1));
    try {
      const res = await toggleFollow(profile.id);
      setFollowing(res.following);
      setFollowerCount(res.followerCount);
    } catch {
      setFollowing(!next);
      setFollowerCount(followers);
      show("Gagal mengikuti", "error");
    }
  };

  const posts = postsQuery.data ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="profile-back">
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{profile?.username ?? "Profil"}</Text>
        <View style={{ width: 24 }} />
      </View>

      {profileQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : profileQuery.isError || !profile ? (
        <StateView testID="profile-error" icon="person-outline" title="Pengguna tidak ditemukan" actionLabel="Kembali" onAction={() => router.back()} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing["2xl"] }}>
          <View style={styles.top}>
            <Avatar uri={profile.avatar} size={84} verified={profile.verified} ring />
            <View style={styles.statsRow}>
              <Stat value={profile.postCount} label="Kiriman" />
              <Stat value={followers} label="Pengikut" />
              <Stat value={profile.followingCount} label="Mengikuti" />
            </View>
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{profile.name}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          </View>

          {!profile.isSelf ? (
            <Pressable
              onPress={doFollow}
              style={[styles.followBtn, isFollowing && styles.followingBtn]}
              testID="profile-follow"
            >
              <Text style={[styles.followText, isFollowing && styles.followingText]}>
                {isFollowing ? "Mengikuti" : "Ikuti"}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.tabs}>
            <Pressable style={styles.tabBtn} onPress={() => setTab("posts")} testID="profile-tab-posts">
              <Ionicons name={tab === "posts" ? "grid" : "grid-outline"} size={20} color={tab === "posts" ? colors.onSurface : colors.muted} />
            </Pressable>
            <Pressable style={styles.tabBtn} onPress={() => setTab("reels")} testID="profile-tab-reels">
              <Ionicons name={tab === "reels" ? "play-circle" : "play-circle-outline"} size={22} color={tab === "reels" ? colors.onSurface : colors.muted} />
            </Pressable>
          </View>

          {postsQuery.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : posts.length === 0 ? (
            <StateView
              testID="profile-empty"
              icon={tab === "reels" ? "videocam-outline" : "camera-outline"}
              title={tab === "reels" ? "Belum ada Reels" : "Belum ada kiriman"}
            />
          ) : (
            <View style={styles.grid}>
              {posts.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/post/${p.id}`)} testID={`grid-post-${p.id}`}>
                  <Image source={{ uri: p.media[0]?.poster || p.media[0]?.url }} style={styles.tile} contentFit="cover" />
                  {p.isReel ? <Ionicons name="play" size={16} color="#FFFFFF" style={styles.tileIcon} /> : null}
                  {p.type === "carousel" ? <Ionicons name="copy" size={14} color="#FFFFFF" style={styles.tileIcon} /> : null}
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{formatCount(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface },
  center: { paddingVertical: spacing["3xl"], alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg },
  statsRow: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center" },
  statValue: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.onSurface },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  info: { paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: 3 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  bio: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.onSurfaceTertiary, lineHeight: 19 },
  followBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  followingBtn: { backgroundColor: colors.surfaceTertiary },
  followText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onBrandPrimary },
  followingText: { color: colors.onSurface },
  tabs: {
    flexDirection: "row",
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginTop: GAP },
  tile: { width: TILE, height: TILE, backgroundColor: colors.surfaceTertiary },
  tileIcon: { position: "absolute", top: 6, right: 6, textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 3 },
}));
