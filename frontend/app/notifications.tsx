import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { fetchNotifications, markAllNotificationsRead } from "@/src/api/notifications";
import { StateView } from "@/src/components/ui/StateView";
import { useAuth } from "@/src/context/auth-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { AppNotification } from "@/src/types";
import { formatOrderTime } from "@/src/utils/orders";

export default function NotificationsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    enabled: !!user,
    refetchInterval: 5000,
  });
  const notifications = data ?? [];

  // Mark all read when this screen is opened.
  useEffect(() => {
    (async () => {
      try {
        await markAllNotificationsRead();
        qc.invalidateQueries({ queryKey: ["notifications-unread"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={goBack} style={styles.backBtn} hitSlop={8} testID="notif-back">
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifikasi</Text>
        <View style={{ width: 40 }} />
      </View>

      {notifications.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StateView
            testID="notif-empty"
            icon="notifications-outline"
            title="Belum ada notifikasi"
            message="Update pesanan dan info penting akan muncul di sini."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {notifications.map((n: AppNotification) => (
            <Pressable
              key={n.id}
              style={[styles.card, !n.read && styles.cardUnread]}
              testID={`notif-${n.id}`}
              onPress={() => {
                if (n.orderId) router.push({ pathname: "/order/[id]", params: { id: n.orderId } });
              }}
            >
              <View style={styles.iconWrap}>
                <Ionicons name="receipt" size={18} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{n.title}</Text>
                <Text style={styles.body}>{n.body}</Text>
                <Text style={styles.time}>{formatOrderTime(n.createdAt)}</Text>
              </View>
              {!n.read ? <View style={styles.dot} /> : null}
            </Pressable>
          ))}
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
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: { backgroundColor: colors.brandSecondary, borderColor: colors.brandTertiary },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.onSurface },
  body: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, marginTop: 2, lineHeight: 17 },
  time: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
}));
