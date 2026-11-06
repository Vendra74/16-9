import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Aperture } from '@/components/aperture';
import { Colors, Spacing } from '@/constants/theme';

/**
 * Abertura do app: o diafragma abre girando, o nome e o slogan aparecem,
 * e a tela some revelando o feed.
 */
export function SplashOverlay() {
  const [visible, setVisible] = useState(true);
  const opening = useSharedValue(0.02);
  const rotation = useSharedValue(-Math.PI / 2);
  const textOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    SplashScreen.hideAsync();
    const ease = Easing.out(Easing.cubic);
    opening.value = withTiming(0.42, { duration: 1100, easing: ease });
    rotation.value = withTiming(Math.PI / 10, { duration: 1100, easing: ease });
    textOpacity.value = withDelay(500, withTiming(1, { duration: 700 }));
    overlayOpacity.value = withDelay(
      2200,
      withTiming(0, { duration: 500 }, (finished) => {
        if (finished) scheduleOnRN(setVisible, false);
      }),
    );
  }, [opening, rotation, textOpacity, overlayOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} pointerEvents="none">
      <View style={styles.row}>
        <Aperture size={84} opening={opening} rotation={rotation} />
        <Animated.Text style={[styles.title, textStyle]}>16:9</Animated.Text>
      </View>
      <Animated.View style={textStyle}>
        <Text style={styles.slogan}>A FRAME FOR EVERYONE</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
    color: Colors.silver,
    fontSize: 84,
    fontWeight: '800',
    letterSpacing: -2,
  },
  slogan: {
    color: Colors.textSecondary,
    fontSize: 14,
    letterSpacing: 6,
    fontWeight: '500',
  },
});
