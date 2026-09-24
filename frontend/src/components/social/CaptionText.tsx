import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { fonts } from "@/src/fonts";
import { makeStyles } from "@/src/theme";

const TOKEN_RE = /(#[\wぁ-んァ-ヶ一-龠]+|@[\w.]+)/g;

export function CaptionText({
  text,
  numberOfLines,
  showMore = true,
  light = false,
}: {
  text: string;
  numberOfLines?: number;
  showMore?: boolean;
  light?: boolean;
}) {
  const styles = useStyles();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;
  const parts = text.split(TOKEN_RE);
  const collapsed = showMore && !expanded ? numberOfLines : undefined;

  return (
    <Text style={[styles.caption, light && styles.captionLight]} numberOfLines={collapsed} testID="post-caption">
      {parts.map((part, i) => {
        if (part.startsWith("#") || part.startsWith("@")) {
          return (
            <Text
              key={i}
              style={[styles.tag, light && styles.tagLight]}
              onPress={() => router.push({ pathname: "/search", params: { q: part } })}
            >
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
      {showMore && !expanded && text.length > 90 && numberOfLines ? (
        <Text style={styles.more} onPress={() => setExpanded(true)}>
          {"  selengkapnya"}
        </Text>
      ) : null}
    </Text>
  );
}

const useStyles = makeStyles((colors) => ({
  caption: { fontFamily: fonts.regular, fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  captionLight: { color: "#FFFFFF" },
  tag: { fontFamily: fonts.semibold, color: colors.brandPrimary },
  tagLight: { color: "#FFD9B8" },
  more: { fontFamily: fonts.medium, color: colors.muted },
}));
