import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ScrollView, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import QRCode from "react-native-qrcode-svg";

import { Button } from "@/src/components/ui/Button";
import { Pill } from "@/src/components/ui/Pill";
import { StateView } from "@/src/components/ui/StateView";
import { useOrders } from "@/src/context/orders-context";
import { useToast } from "@/src/context/toast-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { formatRupiah } from "@/src/utils/format";
import {
  STATUS_META,
  TIMELINE_STEPS,
  formatOrderTime,
  statusStepIndex,
} from "@/src/utils/orders";

export default function OrderDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, cancelOrder, completeOrder } = useOrders();

  const order = orders.find((o) => o.id === id);

  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Tick every second so the 5-second cancel window closes on its own.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const canCancel =
    !!order &&
    order.status === "paid" &&
    typeof order.cancellableUntil === "number" &&
    now < order.cancellableUntil;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/pesanan");
  };

  if (!order) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={goBack} style={styles.backBtn} hitSlop={8} testID="order-back">
            <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Pesanan</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StateView
            testID="order-notfound"
            icon="receipt-outline"
            title="Pesanan tidak ditemukan"
            message="Pesanan ini mungkin sudah dihapus atau tidak tersedia."
            actionLabel="Lihat Semua Pesanan"
            onAction={() => router.replace("/(tabs)/pesanan")}
          />
        </View>
      </View>
    );
  }

  const meta = STATUS_META[order.status];
  const currentIdx = statusStepIndex(order.status);
  const cancelled = order.status === "cancelled";
  const showQr = order.status === "ready" || order.status === "paid" || order.status === "preparing";

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={goBack} style={styles.backBtn} hitSlop={8} testID="order-back">
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{order.code}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing["2xl"] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={styles.statusIcon}>
              <Ionicons name={meta.icon} size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Pill label={meta.label} tone={meta.tone} dot testID="order-status-pill" />
              <Text style={styles.statusHint}>{meta.hint}</Text>
            </View>
          </View>
        </View>

        {/* Timeline */}
        {!cancelled ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Status Pesanan</Text>
            <View style={styles.timeline}>
              {TIMELINE_STEPS.map((step, idx) => {
                const done = idx <= currentIdx;
                const isLast = idx === TIMELINE_STEPS.length - 1;
                return (
                  <View key={step.status} style={styles.stepRow}>
                    <View style={styles.stepIndicator}>
                      <View style={[styles.stepDot, done && styles.stepDotDone]}>
                        <Ionicons
                          name={done ? "checkmark" : step.icon}
                          size={14}
                          color={done ? colors.onBrandPrimary : colors.muted}
                        />
                      </View>
                      {!isLast ? <View style={[styles.stepLine, idx < currentIdx && styles.stepLineDone]} /> : null}
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>{step.title}</Text>
                      <Text style={styles.stepDesc}>{step.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* QR */}
        {showQr && !cancelled ? (
          <View style={[styles.card, { alignItems: "center" }]}>
            <Text style={styles.cardTitle}>QR Verifikasi Dine-in</Text>
            <View style={styles.qrWrap}>
              <QRCode value={order.qrToken} size={150} color="#1A1D26" backgroundColor="#FFFFFF" />
            </View>
            <Text style={styles.qrHint}>Tunjukkan kode ini ke staf restoran</Text>
          </View>
        ) : null}

        {/* Dine-in info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Info Dine-in</Text>
          <InfoRow icon="storefront-outline" label="Restoran" value={order.restaurantName} />
          <InfoRow icon="grid-outline" label="Meja" value={order.dineIn.table} />
          <InfoRow icon="time-outline" label="Waktu" value={order.dineIn.time} />
          <InfoRow icon="calendar-outline" label="Dipesan" value={formatOrderTime(order.createdAt)} />
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pesananmu ({order.items.length} item)</Text>
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            {order.items.map((line) => (
              <View key={line.lineId} style={styles.itemRow}>
                {line.image ? (
                  <Image source={{ uri: line.image }} style={styles.itemImage} contentFit="cover" />
                ) : (
                  <View style={[styles.itemImage, styles.itemImageFallback]}>
                    <Ionicons name="fast-food-outline" size={20} color={colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {line.quantity}x {line.name}
                  </Text>
                  {line.options.length > 0 ? (
                    <Text style={styles.itemOptions} numberOfLines={2}>
                      {line.options.map((o) => o.choice).join(" · ")}
                    </Text>
                  ) : null}
                  {line.notes ? <Text style={styles.itemNotes} numberOfLines={1}>Catatan: {line.notes}</Text> : null}
                </View>
                <Text style={styles.itemPrice}>{formatRupiah(line.unitPrice * line.quantity)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Payment summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rincian Pembayaran</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <SummaryRow label="Subtotal" value={formatRupiah(order.subtotal)} />
            {order.discount > 0 ? (
              <SummaryRow label={`Diskon${order.promoCode ? ` (${order.promoCode})` : ""}`} value={`- ${formatRupiah(order.discount)}`} positive />
            ) : null}
            <View style={styles.summaryDivider} />
            <SummaryRow label="Total" value={formatRupiah(order.total)} strong />
            <View style={styles.methodChip}>
              <Ionicons name="wallet-outline" size={14} color={colors.muted} />
              <Text style={styles.methodChipText}>Dibayar via {order.paymentMethod.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        {order.status === "ready" ? (
          <View style={{ marginTop: spacing.sm }}>
            <Button
              label="Tandai Selesai"
              icon="checkmark-done"
              testID="order-complete"
              onPress={async () => {
                try {
                  await completeOrder(order.id);
                  show("Pesanan selesai. Selamat menikmati!", "success");
                } catch (e: any) {
                  show(e?.message ?? "Gagal menyelesaikan pesanan", "error");
                }
              }}
            />
          </View>
        ) : null}

        {order.status === "completed" && !order.reviewed ? (
          <View style={{ marginTop: spacing.sm }}>
            <Button
              label="Beri Ulasan"
              icon="star"
              testID="order-review"
              onPress={() => router.push({ pathname: "/review/[id]", params: { id: order.id } })}
            />
          </View>
        ) : null}

        {order.status === "completed" && order.reviewed ? (
          <View style={styles.reviewedTag}>
            <Ionicons name="checkmark-circle" size={16} color={colors.successSolid} />
            <Text style={styles.reviewedText}>Kamu sudah memberi ulasan untuk pesanan ini</Text>
          </View>
        ) : null}

        {canCancel ? (
          <View style={{ marginTop: spacing.sm }}>
            <Button
              label={cancelling ? "Membatalkan..." : "Batalkan Pesanan"}
              variant="secondary"
              icon="close-circle-outline"
              testID="order-cancel"
              loading={cancelling}
              onPress={async () => {
                setCancelling(true);
                try {
                  await cancelOrder(order.id);
                  show("Pesanan dibatalkan", "success");
                } catch (e: any) {
                  show(e?.message ?? "Batas waktu pembatalan sudah lewat", "error");
                } finally {
                  setCancelling(false);
                }
              }}
            />
            <Text style={styles.cancelHint}>Pembatalan hanya bisa dalam 5 detik setelah pesanan dibuat</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  positive,
}: {
  label: string;
  value: string;
  strong?: boolean;
  positive?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong && styles.summaryLabelStrong]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          strong && styles.summaryValueStrong,
          positive && { color: colors.successSolid },
        ]}
      >
        {value}
      </Text>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.onSurface, letterSpacing: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  statusCard: {
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.brandTertiary,
  },
  statusTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  statusHint: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.onBrandSecondary, marginTop: 5 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15.5, color: colors.onSurface },
  timeline: { marginTop: spacing.md },
  stepRow: { flexDirection: "row", gap: spacing.md },
  stepIndicator: { alignItems: "center", width: 30 },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: { backgroundColor: colors.brandPrimary },
  stepLine: { width: 2, flex: 1, minHeight: 22, backgroundColor: colors.border, marginVertical: 2 },
  stepLineDone: { backgroundColor: colors.brandPrimary },
  stepBody: { flex: 1, paddingBottom: spacing.lg },
  stepTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
  stepTitleDone: { color: colors.onSurface },
  stepDesc: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  qrWrap: { padding: spacing.md, backgroundColor: "#FFFFFF", borderRadius: radius.lg, marginTop: spacing.md },
  qrHint: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted, marginTop: spacing.sm },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  infoLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, width: 72 },
  infoValue: { flex: 1, fontFamily: fonts.semibold, fontSize: 13.5, color: colors.onSurface, textAlign: "right" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  itemImage: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  itemImageFallback: { alignItems: "center", justifyContent: "center" },
  itemName: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.onSurface },
  itemOptions: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted, marginTop: 1 },
  itemNotes: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted, marginTop: 1, fontStyle: "italic" },
  itemPrice: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.onSurface },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.muted },
  summaryLabelStrong: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.onSurface },
  summaryValue: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.onSurface },
  summaryValueStrong: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.brandPrimary },
  summaryDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },
  methodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    marginTop: spacing.xs,
  },
  methodChipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.onSurfaceTertiary },
  reviewedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.success,
  },
  reviewedText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.onSuccess, flex: 1 },
  cancelHint: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
}));
