import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import QRCode from "react-native-qrcode-svg";

import { Button } from "@/src/components/ui/Button";
import { StateView } from "@/src/components/ui/StateView";
import { useOrders } from "@/src/context/orders-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { formatRupiah } from "@/src/utils/format";

export default function PaymentSuccessScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders } = useOrders();

  const order = orders.find((o) => o.id === id);

  if (!order) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <StateView
          testID="success-notfound"
          icon="alert-circle-outline"
          title="Pesanan tidak ditemukan"
          message="Kami tidak dapat menemukan detail pembayaran ini."
          actionLabel="Kembali ke Beranda"
          onAction={() => router.replace("/(tabs)")}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.body, { paddingTop: insets.top + spacing["2xl"] }]}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.checkCircle}>
          <Ionicons name="checkmark" size={54} color={colors.onBrandPrimary} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120)} style={styles.textBlock}>
          <Text style={styles.title}>Pembayaran Berhasil!</Text>
          <Text style={styles.subtitle}>
            Pesananmu di {order.restaurantName} sudah diterima. Tunjukkan QR di bawah ke staf saat tiba.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220)} style={styles.qrCard}>
          <View style={styles.qrWrap}>
            <QRCode value={order.qrToken} size={172} color="#1A1D26" backgroundColor="#FFFFFF" />
          </View>
          <Text style={styles.orderCodeLabel}>Kode Pesanan</Text>
          <Text style={styles.orderCode} testID="success-order-code">
            {order.code}
          </Text>
          <View style={styles.dineRow}>
            <View style={styles.dineItem}>
              <Ionicons name="grid-outline" size={15} color={colors.brandPrimary} />
              <Text style={styles.dineText}>Meja {order.dineIn.table}</Text>
            </View>
            <View style={styles.dineDivider} />
            <View style={styles.dineItem}>
              <Ionicons name="time-outline" size={15} color={colors.brandPrimary} />
              <Text style={styles.dineText}>{order.dineIn.time}</Text>
            </View>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Dibayar</Text>
            <Text style={styles.totalValue}>{formatRupiah(order.total)}</Text>
          </View>
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label="Lacak Pesanan"
          icon="navigate"
          testID="success-track"
          onPress={() => router.replace({ pathname: "/order/[id]", params: { id: order.id } })}
        />
        <Button
          label="Kembali ke Beranda"
          variant="ghost"
          testID="success-home"
          onPress={() => router.replace("/(tabs)")}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1, alignItems: "center", paddingHorizontal: spacing.xl },
  checkCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.successSolid,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.successSolid,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  textBlock: { alignItems: "center", marginTop: spacing.lg, gap: spacing.xs },
  title: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  qrCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginTop: spacing.xl,
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  qrWrap: { padding: spacing.md, backgroundColor: "#FFFFFF", borderRadius: radius.lg },
  orderCodeLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  orderCode: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.onSurface, letterSpacing: 2 },
  dineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dineItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dineText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.onBrandSecondary },
  dineDivider: { width: 1, height: 16, backgroundColor: colors.brandTertiary },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  totalLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.brandPrimary },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
}));
