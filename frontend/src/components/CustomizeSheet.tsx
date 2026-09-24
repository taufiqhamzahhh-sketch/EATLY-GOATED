import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Stepper } from "@/src/components/ui/Stepper";
import { useCart } from "@/src/context/cart-context";
import { useToast } from "@/src/context/toast-context";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { MenuItem, SelectedOption } from "@/src/types";
import { formatRupiah, priceDeltaLabel } from "@/src/utils/format";

type Props = {
  item: MenuItem | null;
  restaurantId: string;
  restaurantName: string;
  onClose: () => void;
};

export function CustomizeSheet(props: Props) {
  // Only mount the sheet while an item is selected. Keeping @gorhom/bottom-sheet
  // permanently mounted leaves a full-screen container overlaying (and blanking)
  // the screen on web when closed.
  if (!props.item) return null;
  return <CustomizeSheetInner {...props} item={props.item} />;
}

function CustomizeSheetInner({
  item,
  restaurantId,
  restaurantName,
  onClose,
}: Props & { item: MenuItem }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { addItem } = useCart();
  const { show } = useToast();

  const [singles, setSingles] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    item.options.forEach((g) => {
      if (g.type === "single") s[g.name] = g.choices[0]?.name ?? "";
    });
    return s;
  });
  const [multis, setMultis] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    item.options.forEach((g) => {
      if (g.type === "multi") m[g.name] = [];
    });
    return m;
  });
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);

  const unitPrice = useMemo(() => {
    let price = item.price;
    item.options.forEach((g) => {
      if (g.type === "single") {
        const chosen = g.choices.find((c) => c.name === singles[g.name]);
        if (chosen) price += chosen.price_delta;
      } else {
        (multis[g.name] ?? []).forEach((name) => {
          const chosen = g.choices.find((c) => c.name === name);
          if (chosen) price += chosen.price_delta;
        });
      }
    });
    return price;
  }, [item, singles, multis]);

  const toggleMulti = (group: string, choice: string) => {
    setMultis((prev) => {
      const current = prev[group] ?? [];
      return {
        ...prev,
        [group]: current.includes(choice) ? current.filter((c) => c !== choice) : [...current, choice],
      };
    });
  };

  const handleAdd = useCallback(() => {
    const selected: SelectedOption[] = [];
    item.options.forEach((g) => {
      if (g.type === "single") {
        const chosen = g.choices.find((c) => c.name === singles[g.name]);
        if (chosen) selected.push({ group: g.name, choice: chosen.name, price_delta: chosen.price_delta });
      } else {
        (multis[g.name] ?? []).forEach((name) => {
          const chosen = g.choices.find((c) => c.name === name);
          if (chosen) selected.push({ group: g.name, choice: chosen.name, price_delta: chosen.price_delta });
        });
      }
    });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addItem({
      lineId: "",
      restaurantId,
      restaurantName,
      menuItemId: item.id,
      name: item.name,
      image: item.image,
      basePrice: item.price,
      unitPrice,
      quantity: qty,
      options: selected,
      notes: notes.trim(),
    });
    show(`${qty}× ${item.name} ditambahkan`, "success");
    onClose();
  }, [item, restaurantId, restaurantName, unitPrice, qty, notes, singles, multis, addItem, show, onClose]);

  const backdrop = useCallback(
    (bprops: any) => (
      <BottomSheetBackdrop {...bprops} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  const renderFooter = useCallback(
    (fprops: any) => (
      <BottomSheetFooter {...fprops} bottomInset={0}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Stepper
            value={qty}
            onIncrement={() => setQty((q) => q + 1)}
            onDecrement={() => setQty((q) => Math.max(1, q - 1))}
          />
          <Pressable
            testID="customize-add-to-cart"
            onPress={handleAdd}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          >
            <Text style={styles.addBtnText}>Tambah ke Keranjang</Text>
            <Text style={styles.addBtnPrice}>{formatRupiah(unitPrice * qty)}</Text>
          </Pressable>
        </View>
      </BottomSheetFooter>
    ),
    [qty, unitPrice, handleAdd, insets.bottom, styles],
  );

  return (
    <BottomSheet
      index={0}
      snapPoints={["88%"]}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={backdrop}
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
      footerComponent={renderFooter}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: item.image }} style={styles.image} contentFit="cover" />
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.desc}>{item.description}</Text>
        <Text style={styles.price}>{formatRupiah(item.price)}</Text>

        {item.options.map((g) => (
          <View key={g.name} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{g.name}</Text>
              {g.required ? (
                <View style={styles.reqBadge}>
                  <Text style={styles.reqText}>Wajib</Text>
                </View>
              ) : (
                <Text style={styles.optionalText}>Opsional</Text>
              )}
            </View>
            {g.choices.map((c) => {
              const selected =
                g.type === "single" ? singles[g.name] === c.name : (multis[g.name] ?? []).includes(c.name);
              return (
                <Pressable
                  key={c.name}
                  testID={`option-${g.name}-${c.name}`}
                  onPress={() =>
                    g.type === "single"
                      ? setSingles((p) => ({ ...p, [g.name]: c.name }))
                      : toggleMulti(g.name, c.name)
                  }
                  style={styles.choiceRow}
                >
                  <View style={styles.choiceLeft}>
                    <View style={[g.type === "single" ? styles.radio : styles.checkbox, selected && styles.selectedMark]}>
                      {selected ? (
                        <Ionicons
                          name={g.type === "single" ? "ellipse" : "checkmark"}
                          size={g.type === "single" ? 12 : 14}
                          color={colors.onBrandPrimary}
                        />
                      ) : null}
                    </View>
                    <Text style={styles.choiceName}>{c.name}</Text>
                  </View>
                  {c.price_delta !== 0 ? <Text style={styles.delta}>{priceDeltaLabel(c.price_delta)}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={styles.group}>
          <Text style={styles.groupName}>Catatan untuk dapur</Text>
          <NotesInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Contoh: nasi terpisah, tidak pakai bawang"
            placeholderTextColor={colors.muted}
            style={styles.notesInput}
          />
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

// react-native-web's TextInput lacks the focus-state API @gorhom's BottomSheetTextInput
// calls, so use the plain input on web and the sheet-aware one on native.
function NotesInput(props: React.ComponentProps<typeof TextInput>) {
  if (Platform.OS === "web") {
    return <TextInput testID="customize-notes" multiline {...props} />;
  }
  return <BottomSheetTextInput testID="customize-notes" multiline {...(props as any)} />;
}

const useStyles = makeStyles((colors) => ({
  sheetBg: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  handle: { backgroundColor: colors.borderStrong, width: 44 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 120, gap: spacing.xs },
  image: { width: "100%", height: 190, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, marginBottom: spacing.md },
  name: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.onSurface },
  desc: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.muted, lineHeight: 19, marginTop: 4 },
  price: { fontFamily: fonts.bold, fontSize: 17, color: colors.brandPrimary, marginTop: spacing.sm },
  group: { marginTop: spacing.lg, gap: spacing.sm },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  reqBadge: { backgroundColor: colors.brandTertiary, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  reqText: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.onBrandTertiary },
  optionalText: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.muted },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md - 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  choiceLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  selectedMark: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  choiceName: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurface, flex: 1 },
  delta: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  notesInput: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 72,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.onSurface,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: 0.9 },
  addBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onBrandPrimary },
  addBtnPrice: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.onBrandPrimary },
}));
