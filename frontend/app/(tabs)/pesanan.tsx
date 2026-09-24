import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Pill } from "@/src/components/ui/Pill";
import { StateView } from "@/src/components/ui/StateView";
import { useOrders } from "@/src/context/orders-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Order } from "@/src/types";
import { formatRupiah } from "@/src/utils/format";
import { STATUS_META, formatOrderTime } from "@/src/utils/orders";

const ACTIVE = new Set(["paid", "preparing", "ready"]);

export default function PesananScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders } = useOrders();

  const active = orders.filter((o) => ACTIVE.has(o.status));
  const past = orders.filter((o) => !ACTIVE.has(o.status));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Pesanan</Text>
      </View>

      {orders.length === 0 ? (
        <View style={styles.body}>
          <StateView
            testID="pesanan-empty"
            icon="receipt-outline"
            title="Belum ada pesanan"
            message="Riwayat pesanan dine-in kamu akan muncul di sini setelah kamu memesan."
            actionLabel="Cari Restoran"
            onAction={() => router.push("/(tabs)")}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing["2xl"] }]}
          showsVerticalScrollIndicator={false}
        >
          {active.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Sedang Berjalan</Text>
              <View style={styles.list}>
                {active.map((o) => (
                  <OrderCard key={o.id} order={o} onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })} />
                ))}
              </View>
            </>
          ) : null}

          {past.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, active.length > 0 && { marginTop: spacing.lg }]}>Riwayat</Text>
              <View style={styles.list}>
                {past.map((o) => (
                  <OrderCard key={o.id} order={o} onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })} />
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const meta = STATUS_META[order.status];
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      testID={`order-card-${order.id}`}
    >
      <View style={styles.cardTop}>
        <View style={styles.restoIcon}>
          <Ionicons name="storefront" size={18} color={colors.brandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.restoName} numberOfLines={1}>
            {order.restaurantName}
          </Text>
          <Text style={styles.codeText}>{order.code} · {formatOrderTime(order.createdAt)}</Text>
        </View>
        <Pill label={meta.label} tone={meta.tone} dot />
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.cardBottom}>
        <View style={styles.metaRow}>
          <Ionicons name="grid-outline" size={14} color={colors.muted} />
          <Text style={styles.metaText}>Meja {order.dineIn.table}</Text>
          <View style={styles.metaDot} />
          <Ionicons name="fast-food-outline" size={14} color={colors.muted} />
          <Text style={styles.metaText}>{itemCount} item</Text>
        </View>
        <Text style={styles.total}>{formatRupiah(order.total)}</Text>
      </View>
    </Pressable>
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
  },
  title: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.onSurface },
  body: { flex: 1, justifyContent: "center" },
  content: { padding: spacing.lg },
  sectionTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.onSurface, marginBottom: spacing.md },
  list: { gap: spacing.md },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  restoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  restoName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  codeText: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  cardDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.borderStrong, marginHorizontal: 3 },
  total: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.brandPrimary },
}));
