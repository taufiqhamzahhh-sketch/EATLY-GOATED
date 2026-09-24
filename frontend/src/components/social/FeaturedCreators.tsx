import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Avatar } from "@/src/components/social/Avatar";
import { fetchFeaturedCreators, toggleFollow } from "@/src/api/social";
import { FeaturedCreator } from "@/src/types";
import { formatCount } from "@/src/utils/format";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

function CreatorCard({ creator }: { creator: FeaturedCreator }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [following, setFollowing] = useState(creator.following);
  const [busy, setBusy] = useState(false);

  const doFollow = async () => {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      await toggleFollow(creator.id);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  };

  const thumbs = creator.thumbs.slice(0, 3);
  while (thumbs.length < 3) thumbs.push("");

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/user/${creator.id}`)} testID={`creator-${creator.id}`}>
      <View style={styles.thumbRow}>
        {thumbs.map((t, i) =>
          t ? (
            <Image key={i} source={{ uri: t }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View key={i} style={[styles.thumb, styles.thumbEmpty]} />
          ),
        )}
      </View>
      <View style={styles.avatarWrap}>
        <Avatar uri={creator.avatar} size={54} verified={creator.verified} ring />
      </View>
      <View style={styles.badge}>
        <Ionicons name="ribbon" size={11} color={colors.onBrandTertiary} />
        <Text style={styles.badgeText}>{creator.badge}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>{creator.username}</Text>
      <Text style={styles.followers}>{formatCount(creator.followerCount)} pengikut</Text>
      <Pressable
        onPress={doFollow}
        style={[styles.followBtn, following && styles.followingBtn]}
        testID={`creator-follow-${creator.id}`}
      >
        <Text style={[styles.followText, following && styles.followingText]}>
          {following ? "Mengikuti" : "Ikuti"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

export function FeaturedCreators() {
  const styles = useStyles();
  const query = useQuery({ queryKey: ["featured-creators"], queryFn: fetchFeaturedCreators });
  const creators = query.data ?? [];
  if (query.isLoading || creators.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={15} color={styles._accent.color} />
        <Text style={styles.title}>Kreator Makanan Pilihan</Text>
      </View>
      <Text style={styles.sub}>Temukan pembuat konten makanan favorit baru</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {creators.map((c) => (
          <CreatorCard key={c.id} creator={c} />
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  _accent: { color: colors.brandPrimary },
  wrap: {
    backgroundColor: colors.surfaceSecondary,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, paddingHorizontal: spacing.lg, marginTop: 2 },
  row: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  card: {
    width: 156,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: spacing.md,
    alignItems: "center",
    overflow: "hidden",
  },
  thumbRow: { flexDirection: "row", gap: 1, alignSelf: "stretch", height: 56 },
  thumb: { flex: 1, height: 56, backgroundColor: colors.surfaceTertiary },
  thumbEmpty: { backgroundColor: colors.surfaceTertiary },
  avatarWrap: {
    marginTop: -27,
    borderWidth: 3,
    borderColor: colors.surface,
    borderRadius: 30,
    backgroundColor: colors.surface,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.sm,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.onBrandTertiary },
  name: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.onSurface, marginTop: 5, maxWidth: 130 },
  followers: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted, marginTop: 1 },
  followBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: spacing.xl,
    alignSelf: "stretch",
    marginHorizontal: spacing.md,
    alignItems: "center",
  },
  followingBtn: { backgroundColor: colors.surfaceTertiary },
  followText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onBrandPrimary },
  followingText: { color: colors.onSurface },
}));
