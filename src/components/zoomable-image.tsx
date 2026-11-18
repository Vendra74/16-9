import { Image, type ImageContentFit, type ImageLoadEventData } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** Até quanto a foto amplia. */
const MAX_SCALE = 5;
/** Quanto o toque duplo amplia. */
const DOUBLE_TAP_SCALE = 2.5;
/** Abaixo disto a foto conta como "sem zoom". */
const ZOOM_EPSILON = 1.01;
const SNAP = { duration: 220 };

type Props = {
  uri: string;
  width: number;
  height: number;
  /** "cover" no feed (a foto preenche a moldura) e "contain" em tela cheia. */
  contentFit?: ImageContentFit;
  /** Toque simples (ex.: mostrar ou esconder as informações). Espera o toque duplo falhar. */
  onTap?: () => void;
  /** Avisa quando a foto entra ou sai do zoom, para travar a rolagem de quem está em volta. */
  onZoomChange?: (zoomed: boolean) => void;
  /** Quando este valor muda, a foto volta ao tamanho normal (ex.: saiu da tela ou trocou de página). */
  resetKey?: unknown;
  transition?: number;
  recyclingKey?: string;
  onLoad?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** O quanto a foto pode andar para cada lado sem mostrar borda vazia. */
function bound(content: number, frame: number, scale: number) {
  'worklet';
  return Math.max(0, (content * scale - frame) / 2);
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * Foto com zoom como em qualquer galeria: pinça para ampliar, arrastar com um dedo
 * quando ampliada e toque duplo para ampliar ou voltar. Sem zoom, um dedo não faz nada aqui,
 * então a rolagem do feed e o deslizar do carrossel continuam funcionando.
 */
export function ZoomableImage({
  uri,
  width,
  height,
  contentFit = 'cover',
  onTap,
  onZoomChange,
  resetKey,
  transition,
  recyclingKey,
  onLoad,
  accessibilityLabel,
  style,
}: Props) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const zoomed = useSharedValue(false);
  const pinching = useSharedValue(false);

  // Ponto de partida de cada gesto.
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  // Tamanho em que a foto aparece de fato: no "cover" é a moldura; no "contain" depende da proporção da foto.
  const [ratio, setRatio] = useState<number | null>(null);
  const frameRatio = width / Math.max(1, height);
  const fit = contentFit === 'contain' && ratio;
  const contentW = useSharedValue(width);
  const contentH = useSharedValue(height);
  useEffect(() => {
    contentW.set(fit ? (ratio > frameRatio ? width : height * ratio) : width);
    contentH.set(fit ? (ratio > frameRatio ? width / ratio : height) : height);
  }, [contentW, contentH, fit, ratio, frameRatio, width, height]);

  // Saiu da tela ou trocou de foto: volta ao normal.
  useEffect(() => {
    scale.set(withTiming(1, SNAP));
    tx.set(withTiming(0, SNAP));
    ty.set(withTiming(0, SNAP));
  }, [resetKey, scale, tx, ty]);

  useAnimatedReaction(
    () => pinching.value || scale.value > ZOOM_EPSILON,
    (now, before) => {
      zoomed.set(now);
      if (before !== null && now !== before && onZoomChange) scheduleOnRN(onZoomChange, now);
    },
    [onZoomChange],
  );

  /** Leva a foto para dentro dos limites, com animação. */
  function settle(targetScale: number) {
    'worklet';
    const s = clamp(targetScale, 1, MAX_SCALE);
    const bx = bound(contentW.value, width, s);
    const by = bound(contentH.value, height, s);
    scale.set(withTiming(s, SNAP));
    tx.set(withTiming(clamp(tx.value, -bx, bx), SNAP));
    ty.set(withTiming(clamp(ty.value, -by, by), SNAP));
  }

  const pinch = usePinchGesture({
    onActivate: (e) => {
      'worklet';
      pinching.set(true);
      startScale.set(scale.value);
      startX.set(tx.value);
      startY.set(ty.value);
      originX.set(e.focalX - width / 2);
      originY.set(e.focalY - height / 2);
    },
    onUpdate: (e) => {
      'worklet';
      // Um pouco de folga além dos limites durante o gesto; ao soltar, volta para dentro.
      const s = clamp(startScale.value * e.scale, 0.85, MAX_SCALE * 1.3);
      // O ponto da foto que estava entre os dedos continua entre os dedos (e acompanha se eles andarem).
      const px = (originX.value - startX.value) / startScale.value;
      const py = (originY.value - startY.value) / startScale.value;
      scale.set(s);
      tx.set(e.focalX - width / 2 - px * s);
      ty.set(e.focalY - height / 2 - py * s);
    },
    onDeactivate: () => {
      'worklet';
      settle(scale.value < ZOOM_EPSILON ? 1 : scale.value);
    },
    onFinalize: () => {
      'worklet';
      pinching.set(false);
    },
  });

  // Arrastar com um dedo só vale com zoom; sem zoom o toque segue para o feed e o carrossel.
  const pan = usePanGesture({
    enabled: zoomed,
    maxPointers: 1,
    onActivate: () => {
      'worklet';
      startX.set(tx.value);
      startY.set(ty.value);
    },
    onUpdate: (e) => {
      'worklet';
      const bx = bound(contentW.value, width, scale.value);
      const by = bound(contentH.value, height, scale.value);
      tx.set(rubber(startX.value + e.translationX, bx));
      ty.set(rubber(startY.value + e.translationY, by));
    },
    onDeactivate: (e) => {
      'worklet';
      const bx = bound(contentW.value, width, scale.value);
      const by = bound(contentH.value, height, scale.value);
      // Dentro dos limites, a foto segue o embalo do dedo; fora, volta para a borda.
      tx.set(Math.abs(tx.value) > bx ? withTiming(clamp(tx.value, -bx, bx), SNAP) : withDecay({ velocity: e.velocityX, clamp: [-bx, bx] }));
      ty.set(Math.abs(ty.value) > by ? withTiming(clamp(ty.value, -by, by), SNAP) : withDecay({ velocity: e.velocityY, clamp: [-by, by] }));
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (e) => {
      'worklet';
      if (scale.value > ZOOM_EPSILON) {
        scale.set(withTiming(1, SNAP));
        tx.set(withTiming(0, SNAP));
        ty.set(withTiming(0, SNAP));
        return;
      }
      // Amplia no ponto tocado.
      const s = DOUBLE_TAP_SCALE;
      const bx = bound(contentW.value, width, s);
      const by = bound(contentH.value, height, s);
      scale.set(withTiming(s, SNAP));
      tx.set(withTiming(clamp(-(e.x - width / 2) * (s - 1), -bx, bx), SNAP));
      ty.set(withTiming(clamp(-(e.y - height / 2) * (s - 1), -by, by), SNAP));
    },
  });

  const singleTap = useTapGesture({
    onActivate: () => {
      'worklet';
      if (onTap) scheduleOnRN(onTap);
    },
  });

  const taps = useExclusiveGestures(doubleTap, singleTap);
  const gesture = useSimultaneousGestures(pinch, pan, taps);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  function handleLoad(e: ImageLoadEventData) {
    const { width: w, height: h } = e.source;
    if (w && h) setRatio(w / h);
    onLoad?.();
  }

  return (
    <GestureDetector gesture={gesture}>
      {/* A área do gesto não se mexe; só a foto dentro dela. Assim os pontos dos dedos ficam estáveis. */}
      <View style={[{ width, height }, styles.frame, style]} collapsable={false}>
        <Animated.View style={[StyleSheet.absoluteFill, animated]}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            transition={transition}
            recyclingKey={recyclingKey}
            onLoad={handleLoad}
            accessibilityLabel={accessibilityLabel}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Além do limite, a foto anda bem menos que o dedo (efeito elástico). */
function rubber(value: number, limit: number) {
  'worklet';
  if (value > limit) return limit + (value - limit) * 0.3;
  if (value < -limit) return -limit + (value + limit) * 0.3;
  return value;
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
});
