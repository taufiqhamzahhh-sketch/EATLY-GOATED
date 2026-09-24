import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { CommentsSheet } from "@/src/components/social/CommentsSheet";
import { PostCard } from "@/src/components/social/PostCard";
import { PostOptionsSheet } from "@/src/components/social/PostOptionsSheet";
import { StateView } from "@/src/components/ui/StateView";
import { fetchPost } from "@/src/api/social";
import { useState } from "react";
import { Post } from "@/src/types";
import { fonts } from "@/src/fonts";
import { makeStyles, spacing, useTheme } from "@/src/theme";

export default function PostDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [optionsFor, setOptionsFor] = useState<Post | null>(null);

  const query = useQuery({ queryKey: ["post", id], queryFn: () => fetchPost(id!), enabled: !!id });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} testID="post-back">
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Postingan</Text>
        <View style={{ width: 24 }} />
      </View>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : query.isError || !query.data ? (
        <StateView
          testID="post-error"
          icon="alert-circle-outline"
          title="Konten tidak ditemukan"
          message="Konten mungkin sudah dihapus."
          actionLabel="Kembali"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing["2xl"] }}
        >
          <PostCard
            post={query.data}
            onOpenComments={() => setCommentsOpen(true)}
            onOpenOptions={(p) => setOptionsFor(p)}
          />
        </ScrollView>
      )}

      <CommentsSheet postId={commentsOpen ? id! : null} visible={commentsOpen} onClose={() => setCommentsOpen(false)} onAdded={() => query.refetch()} />
      <PostOptionsSheet post={optionsFor} visible={!!optionsFor} onClose={() => setOptionsFor(null)} onDeleted={() => router.back()} />
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
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
}));
