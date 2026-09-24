import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ReelCard } from "@/src/components/ReelCard";
import { RestaurantCard } from "@/src/components/RestaurantCard";
import { Skeleton } from "@/src/components/ui/Skeleton";
import { StateView } from "@/src/components/ui/StateView";
import { fetchReels, fetchRestaurants } from "@/src/api/restaurants";
import { fetchUnreadCount } from "@/src/api/notifications";
import { useAuth } from "@/src/context/auth-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function BerandaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const reelsQuery = useQuery({ queryKey: ["reels"], queryFn: fetchReels });
  const restaurantsQuery = useQuery({ queryKey: ["restaurants"], queryFn: () => fetchRestaurants() });
  const unreadQuery = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: fetchUnreadCount,
    enabled: !!user,
    refetchInterval: 5000,
  });
  const unread = unreadQuery.data?.count ?? 0;

  const restaurants = restaurantsQuery.data ?? [];
  const community = restaurants.filter((r) => r.community_pick);
  const others = restaurants.filter((r) => !r.community_pick);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return restaurants.filter(
      (r) => r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q),
    );
  }, [search, restaurants]);

  const loading = restaurantsQuery.isLoading;
  const error = restaurantsQuery.isError;
  const searching = search.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Halo, {user?.name?.split(" ")[0] ?? "Sahabat"} 👋</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={colors.brandPrimary} />
              <Text style={styles.location}>Kemang, Jakarta Selatan</Text>
              <Ionicons name="chevron-down" size={14} color={colors.muted} />
            </View>
          </View>
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="beranda-search"
            style={styles.searchInput}
            placeholder="Cari restoran atau masakan..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {searching ? (
            <Ionicons name="close-circle" size={18} color={colors.muted} onPress={() => setSearch("")} />
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing["2xl"] }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={restaurantsQuery.isRefetching || reelsQuery.isRefetching}
            onRefresh={() => {
              restaurantsQuery.refetch();
              reelsQuery.refetch();
            }}
            tintColor={colors.brandPrimary}
          />
        }
      >
        {loading ? (
          <View style={styles.section}>
            <Skeleton style={{ height: 250, borderRadius: radius.lg, marginBottom: spacing.lg }} />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} style={{ height: 88, borderRadius: radius.lg, marginBottom: spacing.md }} />
            ))}
          </View>
        ) : error ? (
          <StateView
            testID="beranda-error"
            icon="cloud-offline-outline"
            title="Gagal memuat restoran"
            message="Periksa koneksimu lalu coba lagi."
            actionLabel="Coba Lagi"
            onAction={() => restaurantsQuery.refetch()}
          />
        ) : searching ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hasil pencarian</Text>
            {filtered.length === 0 ? (
              <StateView testID="beranda-empty-search" icon="search-outline" title="Tidak ada hasil" message={`Tidak ditemukan "${search}"`} />
            ) : (
              <View style={styles.list}>
                {filtered.map((r) => (
                  <RestaurantCard key={r.id} restaurant={r} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Reels */}
            <View style={styles.reelsHeader}>
              <Text style={styles.sectionTitle}>Lagi Viral</Text>
              <Text style={styles.sectionSub}>Cerita makan dari komunitas Eatly</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.reelsRow}
            >
              {(reelsQuery.data ?? []).map((reel) => (
                <ReelCard key={reel.id} reel={reel} />
              ))}
            </ScrollView>

            {/* Community picks */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Pilihan Komunitas</Text>
                  <Text style={styles.sectionSub}>Restoran dengan rating komunitas tertinggi</Text>
                </View>
              </View>
              <View style={styles.list}>
                {community.map((r) => (
                  <RestaurantCard key={r.id} restaurant={r} />
                ))}
              </View>
            </View>

            {/* All restaurants */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Jelajahi Semua</Text>
              <View style={styles.list}>
                {others.map((r) => (
                  <RestaurantCard key={r.id} restaurant={r} />
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headerTop: { flexDirection: "row", alignItems: "center" },
  greeting: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.onSurface },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  location: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.onSurface, height: "100%" },
  reelsHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: 2 },
  reelsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.onSurface },
  sectionSub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, marginTop: 2 },
  list: { gap: spacing.md },
}));
