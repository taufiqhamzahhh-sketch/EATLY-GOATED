import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Avatar } from "@/src/components/social/Avatar";
import { StateView } from "@/src/components/ui/StateView";
import { searchSocial } from "@/src/api/social";
import { formatCount } from "@/src/utils/format";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const GAP = 2;
const TILE = (Dimensions.get("window").width - GAP * 2) / 3;

export default function SearchScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { q: initialQ } = useLocalSearchParams<{ q?: string }>();

  const [term, setTerm] = useState(initialQ ?? "");
  const [debounced, setDebounced] = useState(initialQ ?? "");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  const query = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchSocial(debounced),
    enabled: debounced.length > 0,
  });

  const data = query.data;
  const hasResults = useMemo(
    () => data && (data.users.length || data.hashtags.length || data.restaurants.length || data.posts.length),
    [data],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="search-back">
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.input}
            placeholder="Cari makanan, orang, #tagar, restoran"
            placeholderTextColor={colors.muted}
            value={term}
            onChangeText={setTerm}
            autoFocus
            autoCapitalize="none"
            testID="search-input"
            returnKeyType="search"
          />
          {term ? (
            <Ionicons name="close-circle" size={18} color={colors.muted} onPress={() => setTerm("")} />
          ) : null}
        </View>
      </View>

      {debounced.length === 0 ? (
        <StateView testID="search-idle" icon="search-outline" title="Cari di Eatly" message="Temukan food lovers, tagar, restoran, dan konten makanan." />
      ) : query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : !hasResults ? (
        <StateView testID="search-empty" icon="sad-outline" title="Tidak ada hasil" message={`Tidak ditemukan "${debounced}"`} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing["2xl"] }} keyboardShouldPersistTaps="handled">
          {data!.users.length ? (
            <Section title="Akun">
              {data!.users.map((u) => (
                <Pressable key={u.id} style={styles.row} onPress={() => router.push(`/user/${u.id}`)} testID={`search-user-${u.id}`}>
                  <Avatar uri={u.avatar} size={44} verified={u.verified} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{u.username}</Text>
                    <Text style={styles.rowSub}>{u.name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </Section>
          ) : null}

          {data!.hashtags.length ? (
            <Section title="Tagar">
              {data!.hashtags.map((h) => (
                <Pressable key={h.tag} style={styles.row} onPress={() => setTerm(`#${h.tag}`)} testID={`search-tag-${h.tag}`}>
                  <View style={styles.tagCircle}>
                    <Ionicons name="pricetag" size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>#{h.tag}</Text>
                    <Text style={styles.rowSub}>{formatCount(h.count)} kiriman</Text>
                  </View>
                </Pressable>
              ))}
            </Section>
          ) : null}

          {data!.restaurants.length ? (
            <Section title="Restoran">
              {data!.restaurants.map((r) => (
                <Pressable key={r.id} style={styles.row} onPress={() => router.push(`/restaurant/${r.id}`)} testID={`search-resto-${r.id}`}>
                  <Image source={{ uri: r.image }} style={styles.restoImg} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{r.name}</Text>
                    <Text style={styles.rowSub}>{r.cuisine}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </Section>
          ) : null}

          {data!.posts.length ? (
            <Section title="Konten">
              <View style={styles.grid}>
                {data!.posts.map((p) => (
                  <Pressable key={p.id} onPress={() => router.push(`/post/${p.id}`)} testID={`search-post-${p.id}`}>
                    <Image source={{ uri: p.media[0]?.poster || p.media[0]?.url }} style={styles.tile} contentFit="cover" />
                    {p.isReel ? <Ionicons name="play" size={15} color="#FFFFFF" style={styles.tileIcon} /> : null}
                  </Pressable>
                ))}
              </View>
            </Section>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.onSurface, height: "100%" },
  center: { paddingVertical: spacing["3xl"], alignItems: "center", justifyContent: "center" },
  section: { paddingTop: spacing.lg },
  sectionTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.onSurface, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rowTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface },
  rowSub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  tagCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  restoImg: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, paddingHorizontal: 0 },
  tile: { width: TILE, height: TILE, backgroundColor: colors.surfaceTertiary },
  tileIcon: { position: "absolute", top: 6, right: 6 },
}));
