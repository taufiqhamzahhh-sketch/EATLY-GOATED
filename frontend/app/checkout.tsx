import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Button } from "@/src/components/ui/Button";
import { StateView } from "@/src/components/ui/StateView";
import { useCart } from "@/src/context/cart-context";
import { useOrders } from "@/src/context/orders-context";
import { useToast } from "@/src/context/toast-context";
import { fonts } from "@/src/fonts";
import {
  PAYMENT_METHODS,
  TABLE_OPTIONS,
  buildTimeSlots,
  computeTotals,
  simulatePayment,
} from "@/src/services/checkout";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { PaymentMethodId } from "@/src/types";
import { formatRupiah } from "@/src/utils/format";
import { applyPromo, Promo } from "@/src/utils/promos";

export default function CheckoutScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const { items, restaurantId, restaurantName, subtotal, count, clear } = useCart();
  const { createOrder } = useOrders();

  const timeSlots = useMemo(() => buildTimeSlots(), []);
  const [table, setTable] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethodId | null>("qris");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<Promo | null>(null);
  const [paying, setPaying] = useState(false);

  const discount = promo?.discount ?? 0;
  const totals = useMemo(() => computeTotals(subtotal, discount), [subtotal, discount]);
  const canPay = !!table && !!time && !!method && items.length > 0;

  const empty = items.length === 0;

  const handleApplyPromo = () => {
    const res = applyPromo(promoInput, subtotal);
    if (!res.ok) {
      setPromo(null);
      show(res.error ?? "Kode promo tidak valid", "error");
      return;
    }
    setPromo(res.promo ?? null);
    show(`Promo ${res.promo?.code} diterapkan`, "success");
  };

  const removePromo = () => {
    setPromo(null);
    setPromoInput("");
  };

  const handlePay = async () => {
    if (!canPay || paying || !method) {
      if (!table) show("Pilih meja terlebih dahulu", "info");
      else if (!time) show("Pilih waktu kedatangan", "info");
      else if (!method) show("Pilih metode pembayaran", "info");
      return;
    }
    setPaying(true);
    try {
      await simulatePayment(method);
      const order = await createOrder({
        restaurant_id: restaurantId ?? "",
        items: items.map((i) => ({
          menu_item_id: i.menuItemId,
          quantity: i.quantity,
          options: i.options.map((o) => ({ group: o.group, choice: o.choice })),
          notes: i.notes,
        })),
        dine_in: { table, time },
        payment_method: method,
        promo_code: promo?.code ?? null,
      });
      clear();
      router.replace({ pathname: "/payment-success", params: { id: order.id } });
    } catch (e: any) {
      show(e?.message ?? "Pembayaran gagal, coba lagi", "error");
      setPaying(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="checkout-back">
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Ringkasan & Bayar</Text>
        <View style={{ width: 40 }} />
      </View>

      {empty ? (
        <View style={styles.emptyWrap}>
          <StateView
            testID="checkout-empty"
            icon="cart-outline"
            title="Keranjang kosong"
            message="Tambahkan menu dulu sebelum checkout."
            actionLabel="Cari Restoran"
            onAction={() => router.replace("/(tabs)")}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={insets.top + 60}
        >
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 160 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Restaurant context */}
            <View style={styles.restoCard}>
              <View style={styles.restoIcon}>
                <Ionicons name="storefront" size={18} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.restoName}>{restaurantName}</Text>
                <Text style={styles.restoMeta}>Dine-in · {count} item</Text>
              </View>
            </View>

            {/* Dine-in: table */}
            <Text style={styles.sectionTitle}>Pilih Meja</Text>
            <View style={styles.chipWrap}>
              {TABLE_OPTIONS.map((t) => {
                const active = table === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTable(t)}
                    style={[styles.selectChip, active && styles.selectChipActive]}
                    testID={`checkout-table-${t}`}
                  >
                    <Ionicons
                      name="grid-outline"
                      size={14}
                      color={active ? colors.onBrandPrimary : colors.muted}
                    />
                    <Text style={[styles.selectChipText, active && styles.selectChipTextActive]}>Meja {t}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Dine-in: time */}
            <Text style={styles.sectionTitle}>Waktu Kedatangan</Text>
            <View style={styles.chipWrap}>
              {timeSlots.map((t) => {
                const active = time === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTime(t)}
                    style={[styles.selectChip, active && styles.selectChipActive]}
                    testID={`checkout-time-${t}`}
                  >
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={active ? colors.onBrandPrimary : colors.muted}
                    />
                    <Text style={[styles.selectChipText, active && styles.selectChipTextActive]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Promo */}
            <Text style={styles.sectionTitle}>Kode Promo</Text>
            {promo ? (
              <View style={styles.promoApplied} testID="checkout-promo-applied">
                <View style={styles.promoIcon}>
                  <Ionicons name="pricetag" size={16} color={colors.successSolid} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.promoCode}>{promo.code}</Text>
                  <Text style={styles.promoNote}>{promo.label}</Text>
                </View>
                <Pressable onPress={removePromo} hitSlop={8} testID="checkout-promo-remove">
                  <Ionicons name="close-circle" size={20} color={colors.muted} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.promoRow}>
                <View style={styles.promoInputWrap}>
                  <TextInput
                    value={promoInput}
                    onChangeText={setPromoInput}
                    placeholder="Masukkan kode promo"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={styles.promoInput}
                    testID="checkout-promo-input"
                    returnKeyType="done"
                    onSubmitEditing={handleApplyPromo}
                  />
                </View>
                <Pressable onPress={handleApplyPromo} style={styles.promoApply} testID="checkout-promo-apply">
                  <Text style={styles.promoApplyText}>Terapkan</Text>
                </Pressable>
              </View>
            )}

            {/* Payment method */}
            <Text style={styles.sectionTitle}>Metode Pembayaran</Text>
            <View style={styles.methodList}>
              {PAYMENT_METHODS.map((m) => {
                const active = method === m.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setMethod(m.id)}
                    style={[styles.methodRow, active && styles.methodRowActive]}
                    testID={`checkout-method-${m.id}`}
                  >
                    <View style={[styles.methodIcon, active && styles.methodIconActive]}>
                      <Ionicons name={m.icon} size={18} color={active ? colors.onBrandPrimary : colors.brandPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.methodLabel}>{m.label}</Text>
                      <Text style={styles.methodDesc}>{m.description}</Text>
                    </View>
                    <Ionicons
                      name={active ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={active ? colors.brandPrimary : colors.borderStrong}
                    />
                  </Pressable>
                );
              })}
            </View>

            {/* Summary */}
            <Text style={styles.sectionTitle}>Rincian Pembayaran</Text>
            <View style={styles.summaryCard}>
              <SummaryRow label={`Subtotal (${count} item)`} value={formatRupiah(totals.subtotal)} />
              {totals.discount > 0 ? (
                <SummaryRow label="Diskon promo" value={`- ${formatRupiah(totals.discount)}`} positive />
              ) : null}
              <View style={styles.summaryDivider} />
              <SummaryRow label="Total" value={formatRupiah(totals.total)} strong />
            </View>
          </ScrollView>

          {/* Sticky pay bar */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.footerSummary}>
              <Text style={styles.footerLabel}>Total Bayar</Text>
              <Text style={styles.footerTotal}>{formatRupiah(totals.total)}</Text>
            </View>
            <Button
              label={paying ? "Memproses..." : "Bayar Sekarang"}
              iconRight={paying ? undefined : "lock-closed"}
              testID="checkout-pay"
              onPress={handlePay}
              loading={paying}
              disabled={!canPay}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      )}
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
  headerTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.onSurface },
  emptyWrap: { flex: 1, justifyContent: "center" },
  content: { padding: spacing.lg, gap: spacing.sm },
  restoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  restoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  restoName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  restoMeta: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  sectionTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 15.5,
    color: colors.onSurface,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  selectChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
  },
  selectChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  selectChipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onSurfaceTertiary },
  selectChipTextActive: { color: colors.onBrandPrimary },
  promoRow: { flexDirection: "row", gap: spacing.sm },
  promoInputWrap: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    minHeight: 50,
  },
  promoInput: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onSurface, letterSpacing: 1 },
  promoApply: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  promoApplyText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onBrandSecondary },
  promoApplied: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.success,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  promoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  promoCode: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.onSuccess, letterSpacing: 1 },
  promoNote: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSuccess, marginTop: 1 },
  methodList: { gap: spacing.sm },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodRowActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  methodIconActive: { backgroundColor: colors.brandPrimary },
  methodLabel: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.onSurface },
  methodDesc: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  summaryCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.muted },
  summaryLabelStrong: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.onSurface },
  summaryValue: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.onSurface },
  summaryValueStrong: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.brandPrimary },
  summaryDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerSummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footerLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  footerTotal: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.brandPrimary },
}));
