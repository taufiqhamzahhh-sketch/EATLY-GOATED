import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { TextField } from "@/src/components/ui/TextField";
import { createPost } from "@/src/api/social";
import { fetchMenu, fetchRestaurants } from "@/src/api/restaurants";
import { useToast } from "@/src/context/toast-context";
import { GALLERY_IMAGES, GALLERY_REELS } from "@/src/utils/socialMedia";
import { MenuItem, Restaurant } from "@/src/types";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Kind = "photo" | "reel";

export default function CreatePostScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show } = useToast();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<Kind>("photo");
  const [images, setImages] = useState<string[]>([]);
  const [reelIdx, setReelIdx] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dish, setDish] = useState<MenuItem | null>(null);
  const [pickerMode, setPickerMode] = useState<"none" | "resto" | "dish">("none");

  const restaurantsQuery = useQuery({ queryKey: ["restaurants"], queryFn: () => fetchRestaurants() });
  const menuQuery = useQuery({
    queryKey: ["menu", restaurant?.id],
    queryFn: () => fetchMenu(restaurant!.id),
    enabled: !!restaurant && pickerMode === "dish",
  });

  const toggleImage = (uri: string) => {
    setImages((prev) => (prev.includes(uri) ? prev.filter((x) => x !== uri) : prev.length >= 10 ? prev : [...prev, uri]));
  };

  const pickFromDevice = async () => {
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      let status = perm.status;
      if (status !== "granted") {
        if (!perm.canAskAgain) {
          show("Izin galeri diblokir. Buka Pengaturan untuk mengaktifkan.", "error");
          Linking.openSettings();
          return;
        }
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        status = req.status;
        if (status !== "granted") {
          show("Butuh izin galeri untuk memilih foto", "error");
          return;
        }
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setImages((prev) => (prev.length >= 10 ? prev : [...prev, res.assets[0].uri]));
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const media =
        kind === "reel"
          ? [{ type: "video" as const, url: GALLERY_REELS[reelIdx!].url, poster: GALLERY_REELS[reelIdx!].poster }]
          : images.map((url) => ({ type: "image" as const, url }));
      const type = kind === "reel" ? "reel" : images.length > 1 ? "carousel" : "photo";
      return createPost({
        type,
        media,
        caption,
        restaurant_id: restaurant?.id ?? null,
        dish_id: dish?.id ?? null,
        location,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["reels-feed"] });
      show("Konten berhasil dibagikan!", "success");
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/feed");
    },
    onError: () => show("Gagal membagikan konten. Coba lagi.", "error"),
  });

  const canPublish = kind === "reel" ? reelIdx !== null : images.length > 0;

  const publish = () => {
    if (!canPublish) {
      show(kind === "reel" ? "Pilih satu video Reel" : "Pilih minimal satu foto", "error");
      return;
    }
    mutation.mutate();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/feed"))} hitSlop={8} testID="create-cancel">
          <Text style={styles.cancel}>Batal</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Konten Baru</Text>
        <Pressable onPress={publish} hitSlop={8} disabled={mutation.isPending} testID="create-publish">
          <Text style={[styles.publish, (!canPublish || mutation.isPending) && { opacity: 0.4 }]}>
            {mutation.isPending ? "..." : "Bagikan"}
          </Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing["3xl"] }}
        bottomOffset={20}
      >
        {/* Type toggle */}
        <View style={styles.toggle}>
          {(["photo", "reel"] as Kind[]).map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[styles.toggleBtn, kind === k && styles.toggleActive]}
              testID={`create-kind-${k}`}
            >
              <Ionicons name={k === "photo" ? "images" : "play-circle"} size={17} color={kind === k ? colors.onBrandPrimary : colors.muted} />
              <Text style={[styles.toggleText, kind === k && styles.toggleTextActive]}>{k === "photo" ? "Foto" : "Reel"}</Text>
            </Pressable>
          ))}
        </View>

        {/* Media selection */}
        {kind === "photo" ? (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Pilih foto {images.length > 0 ? `(${images.length})` : ""}</Text>
              <Pressable onPress={pickFromDevice} style={styles.deviceBtn} testID="create-device-pick">
                <Ionicons name="phone-portrait-outline" size={15} color={colors.brandPrimary} />
                <Text style={styles.deviceText}>Dari perangkat</Text>
              </Pressable>
            </View>
            <View style={styles.gallery}>
              {[...images.filter((u) => !GALLERY_IMAGES.includes(u)), ...GALLERY_IMAGES].map((uri) => {
                const order = images.indexOf(uri);
                const selected = order >= 0;
                return (
                  <Pressable key={uri} onPress={() => toggleImage(uri)} testID={`create-img-${uri.slice(-12)}`}>
                    <Image source={{ uri }} style={[styles.thumb, selected && styles.thumbSelected]} contentFit="cover" />
                    {selected ? (
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderText}>{order + 1}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { paddingHorizontal: spacing.lg, marginTop: spacing.md }]}>Pilih video Reel</Text>
            <View style={styles.gallery}>
              {GALLERY_REELS.map((r, i) => (
                <Pressable key={i} onPress={() => setReelIdx(i)} testID={`create-reel-${i}`}>
                  <Image source={{ uri: r.poster }} style={[styles.reelThumb, reelIdx === i && styles.thumbSelected]} contentFit="cover" />
                  <View style={styles.reelPlay}>
                    <Ionicons name={reelIdx === i ? "checkmark-circle" : "play-circle"} size={26} color="#FFFFFF" />
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Caption */}
        <View style={styles.form}>
          <View style={styles.captionWrap}>
            <Text style={styles.captionLabel}>Caption</Text>
            <TextInput
              style={styles.captionInput}
              placeholder="Ceritakan pengalaman makanmu... gunakan #tagar & @mention"
              placeholderTextColor={colors.muted}
              value={caption}
              onChangeText={setCaption}
              multiline
              testID="create-caption"
            />
          </View>

          {/* Tag restaurant */}
          <Pressable style={styles.tagRow} onPress={() => setPickerMode("resto")} testID="create-tag-resto">
            <Ionicons name="restaurant-outline" size={20} color={colors.brandPrimary} />
            <Text style={[styles.tagLabel, restaurant && styles.tagLabelActive]}>
              {restaurant ? restaurant.name : "Tag restoran"}
            </Text>
            {restaurant ? (
              <Ionicons name="close-circle" size={18} color={colors.muted} onPress={() => { setRestaurant(null); setDish(null); }} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            )}
          </Pressable>

          {/* Tag dish */}
          <Pressable
            style={[styles.tagRow, !restaurant && { opacity: 0.5 }]}
            onPress={() => restaurant && setPickerMode("dish")}
            testID="create-tag-dish"
          >
            <Ionicons name="fast-food-outline" size={20} color={colors.brandPrimary} />
            <Text style={[styles.tagLabel, dish && styles.tagLabelActive]}>
              {dish ? dish.name : restaurant ? "Tag menu" : "Tag menu (pilih restoran dulu)"}
            </Text>
            {dish ? (
              <Ionicons name="close-circle" size={18} color={colors.muted} onPress={() => setDish(null)} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            )}
          </Pressable>

          <TextField
            label="Lokasi"
            placeholder="Contoh: Kemang, Jakarta Selatan"
            value={location}
            onChangeText={setLocation}
            testID="create-location"
          />
        </View>
      </KeyboardAwareScrollView>

      {/* Restaurant / Dish picker modal */}
      <Modal visible={pickerMode !== "none"} transparent animationType="slide" onRequestClose={() => setPickerMode("none")}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setPickerMode("none")} />
          <View style={[styles.picker, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.handle} />
            <Text style={styles.pickerTitle}>{pickerMode === "resto" ? "Pilih restoran" : "Pilih menu"}</Text>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {(pickerMode === "resto" ? restaurantsQuery.data ?? [] : menuQuery.data ?? []).map((item: Restaurant | MenuItem) => (
                <Pressable
                  key={item.id}
                  style={styles.pickerRow}
                  testID={`picker-${item.id}`}
                  onPress={() => {
                    if (pickerMode === "resto") {
                      setRestaurant(item as Restaurant);
                      setDish(null);
                    } else {
                      setDish(item as MenuItem);
                    }
                    setPickerMode("none");
                  }}
                >
                  <Image
                    source={{ uri: (item as Restaurant).avatar_image || (item as MenuItem).image }}
                    style={styles.pickerImg}
                    contentFit="cover"
                  />
                  <Text style={styles.pickerName}>{item.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  cancel: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted },
  headerTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface },
  publish: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.brandPrimary },
  toggle: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  toggleActive: { backgroundColor: colors.brandPrimary },
  toggleText: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
  toggleTextActive: { color: colors.onBrandPrimary },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface },
  deviceBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  deviceText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.brandPrimary },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.lg },
  thumb: { width: 78, height: 78, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 2, borderColor: "transparent" },
  thumbSelected: { borderColor: colors.brandPrimary },
  orderBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  orderText: { fontFamily: fonts.bold, fontSize: 11, color: colors.onBrandPrimary },
  reelThumb: { width: 100, height: 140, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 2, borderColor: "transparent" },
  reelPlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md },
  captionWrap: { gap: spacing.sm },
  captionLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onSurface },
  captionInput: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 96,
    textAlignVertical: "top",
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  tagLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  tagLabelActive: { color: colors.onSurface, fontFamily: fonts.semibold },
  pickerBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  picker: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxHeight: "70%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.sm },
  pickerTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface, textAlign: "center", marginBottom: spacing.md },
  pickerList: { gap: 2 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  pickerImg: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  pickerName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onSurface, flex: 1 },
}));
