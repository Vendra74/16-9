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
import { t } from '@/lib/i18n';

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
  // "1,2 mil" em português; cada idioma traz o seu formato e o separador decimal.
  if (n >= 1000) return t('{n} mil', { n: (n / 1000).toFixed(1).replace('.0', '').replace('.', t(',')) });
  return String(n);
}

type Props = {
  liked: boolean;
  count: number;
  onToggle: () => void;
  size?: number;
  /** Com isto, tocar no número abre a lista de quem curtiu. */
  onCountPress?: () => void;
  /** Versão de linha (nos comentários): número ao lado, e some quando é zero. */
  inline?: boolean;
};

/** Curtir com uma claquete: ela abre e bate quando a pessoa curte. */
export function ClapperButton({ liked, count, onToggle, size = 26, onCountPress, inline }: Props) {
  const number = <Text style={[styles.count, inline && styles.countInline]}>{formatCount(count)}</Text>;
  return (
    <View style={[styles.button, inline && styles.inline]}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        style={!inline && !onCountPress ? styles.button : undefined}
        accessibilityRole="button"
        accessibilityState={{ selected: liked }}
        accessibilityLabel={liked ? t('Curtido, {n} curtidas. Tocar para desfazer', { n: count }) : t('Curtir, {n} curtidas', { n: count })}>
        <View>
          <ClapperIcon liked={liked} size={size} />
        </View>
        {!inline && !onCountPress ? number : null}
      </Pressable>
      {inline ? (
        count > 0 ? number : null
      ) : onCountPress ? (
        <Pressable
          onPress={count > 0 ? onCountPress : onToggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? t('Ver quem curtiu') : t('Curtir')}>
          {number}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    gap: 2,
    minWidth: 40,
  },
  inline: {
    flexDirection: 'row',
    minWidth: 0,
    gap: 4,
  },
  countInline: {
    color: Colors.textSecondary,
    fontSize: 11,
    textShadowRadius: 0,
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
