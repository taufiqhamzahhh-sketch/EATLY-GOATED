import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Button } from "@/src/components/ui/Button";
import { StateView } from "@/src/components/ui/StateView";
import { Stepper } from "@/src/components/ui/Stepper";
import { useCart } from "@/src/context/cart-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { formatRupiah } from "@/src/utils/format";

export default function CartScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, restaurantName, subtotal, count, incrementLine, decrementLine, removeLine } = useCart();

  const empty = items.length === 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} testID="cart-back">
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Keranjang</Text>
        <View style={{ width: 40 }} />
      </View>

      {empty ? (
        <View style={styles.emptyWrap}>
          <StateView
            testID="cart-empty"
            icon="cart-outline"
            title="Keranjang masih kosong"
            message="Tambahkan menu favoritmu untuk mulai memesan."
            actionLabel="Cari Restoran"
            onAction={() => router.replace("/(tabs)")}
          />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Restaurant + dine-in context */}
            <View style={styles.restoCard}>
              <View style={styles.restoIcon}>
                <Ionicons name="storefront" size={18} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.restoName}>{restaurantName}</Text>
                <Text style={styles.restoMeta}>Dine-in · Pilih meja saat checkout</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Pesananmu ({count} item)</Text>

            <View style={styles.list}>
              {items.map((line) => (
                <View key={line.lineId} style={styles.lineCard} testID={`cart-line-${line.lineId}`}>
                  <Image source={{ uri: line.image }} style={styles.lineImage} contentFit="cover" />
                  <View style={styles.lineInfo}>
                    <View style={styles.lineTopRow}>
                      <Text style={styles.lineName} numberOfLines={1}>
                        {line.name}
                      </Text>
                      <Pressable onPress={() => removeLine(line.lineId)} hitSlop={8} testID={`cart-remove-${line.lineId}`}>
                        <Ionicons name="trash-outline" size={17} color={colors.muted} />
                      </Pressable>
                    </View>
                    {line.options.length > 0 ? (
                      <Text style={styles.lineOptions} numberOfLines={2}>
                        {line.options.map((o) => o.choice).join(" · ")}
                      </Text>
                    ) : null}
                    {line.notes ? (
                      <View style={styles.notesRow}>
                        <Ionicons name="create-outline" size={13} color={colors.muted} />
                        <Text style={styles.notesText} numberOfLines={1}>
                          {line.notes}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.lineBottomRow}>
                      <Text style={styles.linePrice}>{formatRupiah(line.unitPrice * line.quantity)}</Text>
                      <Stepper
                        testID={`cart-stepper-${line.lineId}`}
                        value={line.quantity}
                        onIncrement={() => incrementLine(line.lineId)}
                        onDecrement={() => decrementLine(line.lineId)}
                        size="sm"
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <Pressable style={styles.addMore} onPress={() => router.back()} testID="cart-add-more">
              <Ionicons name="add" size={16} color={colors.brandPrimary} />
              <Text style={styles.addMoreText}>Tambah item lain</Text>
            </Pressable>
          </ScrollView>

          {/* Sticky checkout bar */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.footerLabel}>Subtotal</Text>
              <Text style={styles.footerTotal}>{formatRupiah(subtotal)}</Text>
            </View>
            <View style={styles.footerBtn}>
              <Button
                label="Lanjut ke Pembayaran"
                iconRight="arrow-forward"
                testID="cart-checkout"
                onPress={() => router.push("/checkout")}
                fullWidth={false}
              />
            </View>
          </View>
        </>
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
  content: { padding: spacing.lg, gap: spacing.md },
  restoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restoIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  restoName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  restoMeta: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, marginTop: 1 },
  sectionTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.onSurface, marginTop: spacing.sm },
  list: { gap: spacing.md },
  lineCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lineImage: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  lineInfo: { flex: 1, gap: 4 },
  lineTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  lineName: { flex: 1, fontFamily: fonts.bold, fontSize: 14.5, color: colors.onSurface },
  lineOptions: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, lineHeight: 17 },
  notesRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  notesText: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, flex: 1 },
  lineBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  linePrice: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.onSurface },
  addMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandSecondary,
  },
  addMoreText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onBrandSecondary },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLabel: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted },
  footerTotal: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.brandPrimary },
  footerBtn: { flexShrink: 0 },
}));
