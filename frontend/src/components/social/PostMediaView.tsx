import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useRef, useState } from "react";
import { Dimensions, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Ionicons from "@react-native-vector-icons/ionicons";

import { PostMedia } from "@/src/types";
import { fonts } from "@/src/fonts";
import { makeStyles, useTheme } from "@/src/theme";

const { width: SCREEN_W } = Dimensions.get("window");

function FeedVideo({ media, width }: { media: PostMedia; width: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const player = useVideoPlayer(media.url, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const [muted, setMuted] = useState(true);

  const toggle = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  const toggleMute = useCallback(() => {
    player.muted = !player.muted;
    setMuted(player.muted);
  }, [player]);

  return (
    <Pressable onPress={toggle} style={{ width, height: width }} testID="post-video">
      <VideoView
        player={player}
        style={{ width, height: width }}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      {!isPlaying ? (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={26} color="#FFFFFF" />
          </View>
        </View>
      ) : null}
      <Pressable onPress={toggleMute} style={styles.muteBtn} testID="post-video-mute" hitSlop={8}>
        <Ionicons name={muted ? "volume-mute" : "volume-high"} size={15} color="#FFFFFF" />
      </Pressable>
    </Pressable>
  );
}

export function PostMediaView({
  media,
  onDoubleTapLike,
  width = SCREEN_W,
}: {
  media: PostMedia[];
  onDoubleTapLike?: () => void;
  width?: number;
}) {
  const styles = useStyles();
  const [index, setIndex] = useState(0);
  const lastTap = useRef(0);
  const heartScale = useSharedValue(0);

  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartScale.value,
    transform: [{ scale: heartScale.value }],
  }));

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      heartScale.value = withSequence(withSpring(1, { damping: 8 }), withTiming(0, { duration: 420 }));
      onDoubleTapLike?.();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, [heartScale, onDoubleTapLike]);

  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== index) setIndex(i);
    },
    [index, width],
  );

  const single = media.length === 1;

  return (
    <View style={{ width, height: width }}>
      {single ? (
        media[0].type === "video" ? (
          <FeedVideo media={media[0]} width={width} />
        ) : (
          <Pressable onPress={handleTap} testID="post-image">
            <Image source={{ uri: media[0].url }} style={{ width, height: width }} contentFit="cover" transition={150} />
          </Pressable>
        )
      ) : (
        <>
          <Animated.ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {media.map((m, i) =>
              m.type === "video" ? (
                <FeedVideo key={i} media={m} width={width} />
              ) : (
                <Pressable key={i} onPress={handleTap} testID={`post-image-${i}`}>
                  <Image source={{ uri: m.url }} style={{ width, height: width }} contentFit="cover" transition={150} />
                </Pressable>
              ),
            )}
          </Animated.ScrollView>
          <View style={styles.counter} pointerEvents="none">
            <Ionicons name="copy-outline" size={12} color="#FFFFFF" />
          </View>
          <View style={styles.dots} pointerEvents="none">
            {media.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        </>
      )}
      <Animated.View style={[styles.heart, heartStyle]} pointerEvents="none">
        <Ionicons name="heart" size={96} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  playOverlay: { ...StyleSheetAbsolute(), alignItems: "center", justifyContent: "center" },
  playCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteBtn: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: "#FFFFFF", width: 7, height: 7, borderRadius: 3.5 },
  heart: { ...StyleSheetAbsolute(), alignItems: "center", justifyContent: "center" },
}));

function StyleSheetAbsolute() {
  return { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };
}
