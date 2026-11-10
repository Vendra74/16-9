import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';

/** Ângulo da haste de cima: entreaberta quando não curtido, fechada quando curtido. */
const OPEN = -14;
const WIDE = -34;

function clap() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** As listras diagonais de uma haste, entre y e y + 3. */
function stripes(y: number) {
  return [4, 9, 14]
    .map((x) => `M${x + 1.6} ${y}h2.6l-1.8 3h-2.6Z`)
    .join(' ');
}

function ClapperIcon({ liked, size }: { liked: boolean; size: number }) {
  const rotation = useSharedValue(liked ? 0 : OPEN);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (liked) {
      // Abre bem e bate: "Ação!"
      rotation.value = withSequence(
        withTiming(WIDE, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 70, easing: Easing.in(Easing.quad) }, (finished) => {
          if (finished) scheduleOnRN(clap);
        }),
      );
      scale.value = withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(1.28, { duration: 70 }),
        withSpring(1, { damping: 7, stiffness: 260 }),
      );
    } else {
      rotation.value = withTiming(OPEN, { duration: 200 });
      scale.value = withSequence(withTiming(0.88, { duration: 90 }), withSpring(1, { damping: 10 }));
    }
    // Só reage à troca de estado; o valor inicial já vem certo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liked]);

  const k = size / 24;
  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const stroke = Colors.text;
  const fill = liked ? Colors.silver : 'none';
  const stripeColor = liked ? Colors.background : Colors.text;

  return (
    <Animated.View style={[{ width: size, height: size }, boxStyle]}>
      {/* Corpo da claquete e a haste de baixo, fixa. */}
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Rect x={3} y={11} width={18} height={10} rx={1.4} fill={fill} stroke={stroke} strokeWidth={1.6} />
        <Rect x={3} y={8} width={18} height={3} fill={fill} stroke={stroke} strokeWidth={1.6} />
        <Path d={stripes(8)} fill={stripeColor} />
      </Svg>
      {/* Haste de cima, presa na dobradiça da esquerda. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transformOrigin: [3.2 * k, 8 * k, 0] }, armStyle]}
        pointerEvents="none">
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={3} y={4.6} width={18} height={3} rx={0.6} fill={fill} stroke={stroke} strokeWidth={1.6} />
          <Path d={stripes(4.6)} fill={stripeColor} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '').replace('.', ',')} mil`;
  return String(n);
}

type Props = {
  liked: boolean;
  count: number;
  onToggle: () => void;
  size?: number;
};

/** Curtir com uma claquete: ela abre e bate quando a pessoa curte. */
export function ClapperButton({ liked, count, onToggle, size = 26 }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      style={styles.button}
      accessibilityRole="button"
      accessibilityState={{ selected: liked }}
      accessibilityLabel={liked ? `Curtido, ${count} curtidas. Tocar para desfazer` : `Curtir, ${count} curtidas`}>
      <View>
        <ClapperIcon liked={liked} size={size} />
      </View>
      <Text style={styles.count}>{formatCount(count)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    gap: 2,
    minWidth: 40,
  },
  count: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
