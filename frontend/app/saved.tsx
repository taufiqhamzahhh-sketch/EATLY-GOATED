import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ActivityIndicator, Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { StateView } from "@/src/components/ui/StateView";
import { fetchSavedPosts } from "@/src/api/social";
import { fonts } from "@/src/fonts";
import { makeStyles, spacing, useTheme } from "@/src/theme";

const GAP = 2;
const TILE = (Dimensions.get("window").width - GAP * 2) / 3;

export default function SavedScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const query = useQuery({ queryKey: ["saved-posts"], queryFn: fetchSavedPosts });
  const posts = query.data ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="saved-back">
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Konten Tersimpan</Text>
        <View style={{ width: 24 }} />
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : posts.length === 0 ? (
        <StateView
          testID="saved-empty"
          icon="bookmark-outline"
          title="Belum ada yang disimpan"
          message="Simpan penemuan makanan yang ingin kamu coba nanti."
          actionLabel="Jelajahi Feed"
          onAction={() => router.push("/(tabs)/feed")}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing["2xl"] }}>
          <View style={styles.grid}>
            {posts.map((p) => (
              <Pressable key={p.id} onPress={() => router.push(`/post/${p.id}`)} testID={`saved-post-${p.id}`}>
                <Image source={{ uri: p.media[0]?.poster || p.media[0]?.url }} style={styles.tile} contentFit="cover" />
                {p.isReel ? <Ionicons name="play" size={15} color="#FFFFFF" style={styles.tileIcon} /> : null}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginTop: GAP },
  tile: { width: TILE, height: TILE, backgroundColor: colors.surfaceTertiary },
  tileIcon: { position: "absolute", top: 6, right: 6 },
}));
