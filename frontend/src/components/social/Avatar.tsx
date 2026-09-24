import { Image } from "expo-image";
import { View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { makeStyles, useTheme } from "@/src/theme";

export function Avatar({
  uri,
  size = 40,
  verified = false,
  ring = false,
}: {
  uri?: string;
  size?: number;
  verified?: boolean;
  ring?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      <Image
        source={{ uri }}
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceTertiary },
          ring && { borderWidth: 2, borderColor: colors.brandPrimary },
        ]}
        contentFit="cover"
      />
      {verified ? (
        <View style={[styles.badge, { right: -1, bottom: -1 }]}>
          <Ionicons name="checkmark-circle" size={size * 0.4} color={colors.brandPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  badge: {
    position: "absolute",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 999,
  },
}));
