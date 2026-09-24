import { useRouter } from "expo-router";
import { View } from "react-native";

import { StateView } from "@/src/components/ui/StateView";
import { makeStyles } from "@/src/theme";

export default function NotFoundScreen() {
  const styles = useStyles();
  const router = useRouter();
  return (
    <View style={styles.container}>
      <StateView
        testID="not-found"
        icon="compass-outline"
        title="Halaman tidak ditemukan"
        message="Sepertinya kamu tersesat. Yuk kembali menjelajah restoran."
        actionLabel="Kembali ke Beranda"
        onAction={() => router.replace("/(tabs)")}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface, justifyContent: "center" },
}));
