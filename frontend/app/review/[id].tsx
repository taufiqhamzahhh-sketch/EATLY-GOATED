import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { createReviewRequest } from "@/src/api/reviews";
import { Button } from "@/src/components/ui/Button";
import { StateView } from "@/src/components/ui/StateView";
import { useOrders } from "@/src/context/orders-context";
import { useToast } from "@/src/context/toast-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ReviewScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, refetch } = useOrders();

  const order = orders.find((o) => o.id === id);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/pesanan");
  };

  if (!order) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <StateView
          testID="review-notfound"
          icon="receipt-outline"
          title="Pesanan tidak ditemukan"
          message="Tidak dapat memuat pesanan untuk diulas."
          actionLabel="Kembali"
          onAction={goBack}
        />
      </View>
    );
  }

  const submit = async () => {
    setSaving(true);
    try {
      await createReviewRequest({ order_id: order.id, rating, comment: comment.trim() });
      qc.invalidateQueries({ queryKey: ["reviews", order.restaurantId] });
      qc.invalidateQueries({ queryKey: ["restaurant", order.restaurantId] });
      qc.invalidateQueries({ queryKey: ["restaurants"] });
      refetch();
      show("Terima kasih atas ulasanmu!", "success");
      goBack();
    } catch (e: any) {
      show(e?.message ?? "Gagal mengirim ulasan", "error");
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={goBack} style={styles.backBtn} hitSlop={8} testID="review-back">
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Beri Ulasan</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.restoCard}>
            <View style={styles.restoIcon}>
              <Ionicons name="storefront" size={18} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.restoName}>{order.restaurantName}</Text>
              <Text style={styles.restoMeta}>{order.code}</Text>
            </View>
          </View>

          <Text style={styles.label}>Seberapa puas kamu?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={6} testID={`review-star-${n}`}>
                <Ionicons
                  name={n <= rating ? "star" : "star-outline"}
                  size={40}
                  color={n <= rating ? colors.star : colors.borderStrong}
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Ceritakan pengalamanmu (opsional)</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Contoh: Rendangnya empuk, pelayanan ramah!"
            placeholderTextColor={colors.muted}
            multiline
            style={styles.input}
            testID="review-comment"
            maxLength={500}
          />

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label={saving ? "Mengirim..." : "Kirim Ulasan"}
              icon="send"
              loading={saving}
              testID="review-submit"
              onPress={submit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  content: { padding: spacing.lg },
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
  restoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  restoName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  restoMeta: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, marginTop: 1, letterSpacing: 1 },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.sm },
  stars: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 110,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.onSurface,
    textAlignVertical: "top",
  },
}));
