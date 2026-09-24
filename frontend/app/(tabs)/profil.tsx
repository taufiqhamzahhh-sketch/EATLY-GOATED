import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useAuth } from "@/src/context/auth-context";
import { useToast } from "@/src/context/toast-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ProfilScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { show } = useToast();

  const code = user?.referral_code ?? "EATLY2026";

  const copyCode = async () => {
    await Clipboard.setStringAsync(code);
    show("Kode referral disalin", "success");
  };

  const shareCode = async () => {
    try {
      await Share.share({
        message: `Yuk pesan makan di Eatly! Pakai kode ${code} buat dapat diskon Rp 25.000 di pesanan pertamamu. 🍽️`,
      });
    } catch {
      // dismissed
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/auth/login");
  };

  return (
    <View style={styles.container}>
      <ScrollWrap insetsBottom={insets.bottom}>
        {/* Orange header */}
        <LinearGradient colors={[colors.brandPrimary, "#FB8A3C"]} style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
          <Pressable onPress={shareCode} style={styles.headerIcon} testID="profil-share" hitSlop={6}>
            <Ionicons name="share-social" size={18} color={colors.onBrandPrimary} />
          </Pressable>
          <Image source={{ uri: user?.avatar_url }} style={styles.avatar} contentFit="cover" />
          <Text style={styles.name}>{user?.name ?? "Pengguna Eatly"}</Text>
          <Text style={styles.handle}>@{user?.username ?? "eatly"}</Text>
          <View style={styles.badge}>
            <Ionicons name="star" size={12} color={colors.star} />
            <Text style={styles.badgeText}>Sahabat Eatly</Text>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Stat value={user?.total_orders ?? 0} label="Total Pesanan" />
          <Stat value={user?.favorites_count ?? 0} label="Favorit" />
          <Stat value={user?.invited_friends ?? 0} label="Teman Diundang" />
        </View>

        {/* Referral dark card */}
        <View style={styles.referralCard}>
          <View style={styles.referralHeader}>
            <View style={styles.giftCircle}>
              <Ionicons name="gift" size={18} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.referralTitle}>Undang Teman, Dapat Rp 25.000</Text>
          </View>
          <Text style={styles.referralDesc}>
            Bagikan kode ini. Teman kamu dapat diskon Rp 25.000 untuk pesanan pertama, kamu dapat Rp 25.000 juga.
          </Text>
          <View style={styles.codeRow}>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Kode Kamu</Text>
              <Text style={styles.codeValue}>{code}</Text>
            </View>
            <Pressable onPress={copyCode} style={styles.copyBtn} testID="profil-copy">
              <Text style={styles.copyText}>Salin</Text>
            </Pressable>
          </View>
          <Pressable onPress={shareCode} style={styles.shareBtn} testID="profil-share-wa">
            <Ionicons name="share-social" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.shareText}>Bagikan ke WhatsApp</Text>
          </Pressable>
        </View>

        {/* Menu rows */}
        <View style={styles.menu}>
          <MenuRow icon="grid-outline" title="Profil & Kiriman Sosial" subtitle="Lihat postingan, reels, pengikut" onPress={() => router.push(`/user/${user?.id}`)} testID="profil-social" />
          <MenuRow icon="add-circle-outline" title="Buat Konten" subtitle="Bagikan foto, carousel, atau reel" onPress={() => router.push("/create")} testID="profil-create" />
          <MenuRow icon="bookmark-outline" title="Konten Tersimpan" onPress={() => router.push("/saved")} testID="profil-saved" />
          <MenuRow icon="receipt-outline" title="Riwayat Pesanan" subtitle={`${user?.total_orders ?? 0} pesanan · ${user?.favorites_count ?? 0} restoran favorit`} onPress={() => router.push("/(tabs)/pesanan")} testID="profil-history" />
          <MenuRow icon="heart-outline" title="Restoran Favorit" onPress={() => router.push("/(tabs)/favorit")} testID="profil-favorites" />
          <MenuRow icon="help-circle-outline" title="Bantuan & FAQ" onPress={() => show("Pusat bantuan segera hadir", "info")} testID="profil-help" />
        </View>

        <Pressable onPress={handleLogout} style={styles.logout} testID="profil-logout">
          <Ionicons name="log-out-outline" size={18} color={colors.errorSolid} />
          <Text style={styles.logoutText}>Keluar</Text>
        </Pressable>
      </ScrollWrap>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  testID,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.85 }]} testID={testID}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function ScrollWrap({ children, insetsBottom }: { children: React.ReactNode; insetsBottom: number }) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insetsBottom + spacing["2xl"] }} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    alignItems: "center",
    paddingBottom: spacing["2xl"],
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerIcon: {
    position: "absolute",
    right: spacing.lg,
    top: spacing.xl,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: { width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: "rgba(255,255,255,0.6)", backgroundColor: colors.surfaceTertiary },
  name: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.onBrandPrimary, marginTop: spacing.md },
  handle: { fontFamily: fonts.regular, fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    marginTop: spacing.md,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.onBrandPrimary },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: -spacing.xl },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statValue: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.brandPrimary },
  statLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 2, textAlign: "center" },
  referralCard: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  referralHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  giftCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  referralTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.onSurfaceInverse },
  referralDesc: { fontFamily: fonts.regular, fontSize: 12.5, color: "rgba(255,255,255,0.7)", lineHeight: 18 },
  codeRow: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  codeBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: "center" },
  codeLabel: { fontFamily: fonts.regular, fontSize: 10.5, color: "rgba(255,255,255,0.55)" },
  codeValue: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.onSurfaceInverse, letterSpacing: 2 },
  copyBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  copyText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onBrandPrimary },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onBrandPrimary },
  menu: { marginTop: spacing.lg, marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  menuTitle: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.onSurface },
  menuSubtitle: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  logoutText: { fontFamily: fonts.bold, fontSize: 14, color: colors.errorSolid },
}));
