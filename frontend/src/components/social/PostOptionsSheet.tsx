import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { deletePost, reportContent } from "@/src/api/social";
import { useAuth } from "@/src/context/auth-context";
import { useToast } from "@/src/context/toast-context";
import { Post, ReportReason } from "@/src/types";
import { fonts } from "@/src/fonts";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const REASONS: { key: ReportReason; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "inappropriate", label: "Konten tidak pantas" },
  { key: "harassment", label: "Pelecehan atau perundungan" },
  { key: "misleading", label: "Palsu atau menyesatkan" },
  { key: "copyright", label: "Masalah hak cipta" },
  { key: "other", label: "Lainnya" },
];

export function PostOptionsSheet({
  post,
  visible,
  onClose,
  onDeleted,
  onHidden,
}: {
  post: Post | null;
  visible: boolean;
  onClose: () => void;
  onDeleted?: (id: string) => void;
  onHidden?: (id: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { show } = useToast();
  const [mode, setMode] = useState<"menu" | "report">("menu");

  useEffect(() => {
    if (visible) setMode("menu");
  }, [visible]);

  if (!post) return null;
  const isOwner = user?.id === post.author.id;

  const submitReport = async (reason: ReportReason) => {
    try {
      await reportContent("post", post.id, reason);
      show("Laporan terkirim. Terima kasih.", "success");
    } catch {
      show("Gagal mengirim laporan", "error");
    }
    onClose();
  };

  const doDelete = async () => {
    try {
      await deletePost(post.id);
      onDeleted?.(post.id);
      show("Konten dihapus", "success");
    } catch {
      show("Gagal menghapus konten", "error");
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} testID="options-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />
          {mode === "menu" ? (
            <>
              {!isOwner ? (
                <Row icon="flag-outline" label="Laporkan" onPress={() => setMode("report")} testID="option-report" danger />
              ) : null}
              {!isOwner ? (
                <Row
                  icon="eye-off-outline"
                  label="Sembunyikan konten ini"
                  onPress={() => {
                    onHidden?.(post.id);
                    show("Konten disembunyikan", "info");
                    onClose();
                  }}
                  testID="option-hide"
                />
              ) : null}
              {isOwner ? (
                <Row icon="trash-outline" label="Hapus konten" onPress={doDelete} testID="option-delete" danger />
              ) : null}
              <Row icon="close" label="Batal" onPress={onClose} testID="option-cancel" />
            </>
          ) : (
            <>
              <Text style={styles.reportTitle}>Alasan melaporkan</Text>
              {REASONS.map((r) => (
                <Row key={r.key} label={r.label} onPress={() => submitReport(r.key)} testID={`report-${r.key}`} chevron />
              ))}
              <Row icon="arrow-back" label="Kembali" onPress={() => setMode("menu")} testID="report-back" />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
  testID,
  danger,
  chevron,
}: {
  icon?: string;
  label: string;
  onPress: () => void;
  testID?: string;
  danger?: boolean;
  chevron?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      {icon ? <Ionicons name={icon} size={20} color={danger ? colors.errorSolid : colors.onSurface} /> : <View style={{ width: 20 }} />}
      <Text style={[styles.rowLabel, danger && { color: colors.errorSolid }]}>{label}</Text>
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.sm },
  reportTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface, paddingVertical: spacing.md, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.onSurface },
}));
