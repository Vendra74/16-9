import { useEffect } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const VIEWBOX = 100;
const C = VIEWBOX / 2;
const R = 48;

/**
 * Geometria do diafragma: um hexágono central (a abertura) cujos lados,
 * prolongados até a borda, formam as divisões entre as seis lâminas.
 * `opening` vai de 0 (fechado) a 1 (aberto); `rotation` em radianos.
 */
function aperturePaths(opening: number, rotation: number) {
  'worklet';
  const r = Math.max(0.02, opening) * R;
  const vx: number[] = [];
  const vy: number[] = [];
  for (let k = 0; k < 6; k++) {
    const a = rotation + (k * Math.PI) / 3;
    vx.push(r * Math.cos(a));
    vy.push(r * Math.sin(a));
  }
  let hole = '';
  let lines = '';
  for (let k = 0; k < 6; k++) {
    const x = vx[k];
    const y = vy[k];
    hole += `${k === 0 ? 'M' : 'L'}${C + x} ${C + y} `;
    let dx = vx[(k + 1) % 6] - x;
    let dy = vy[(k + 1) % 6] - y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const b = x * dx + y * dy;
    const s = -b + Math.sqrt(Math.max(0, b * b - (x * x + y * y) + R * R));
    lines += `M${C + x} ${C + y} L${C + x + dx * s * 1.05} ${C + y + dy * s * 1.05} `;
  }
  return { hole: hole + 'Z', lines };
}

type ApertureProps = {
  size?: number;
  color?: string;
  /** Cor do fundo atrás do ícone (a abertura e as divisões usam essa cor). */
  background?: string;
  opening: SharedValue<number>;
  rotation: SharedValue<number>;
};

export function Aperture({
  size = 48,
  color = Colors.silver,
  background = Colors.background,
  opening,
  rotation,
}: ApertureProps) {
  const holeProps = useAnimatedProps(() => ({
    d: aperturePaths(opening.value, rotation.value).hole,
  }));
  const lineProps = useAnimatedProps(() => ({
    d: aperturePaths(opening.value, rotation.value).lines,
  }));

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
      <Circle cx={C} cy={C} r={R} fill={color} />
      <AnimatedPath animatedProps={holeProps} fill={background} />
      <AnimatedPath animatedProps={lineProps} stroke={background} strokeWidth={3.4} />
      <Circle cx={C} cy={C} r={R + 1.5} fill="none" stroke={background} strokeWidth={3} />
    </Svg>
  );
}

/** Indicador de carregamento: as lâminas abrem e fecham enquanto giram. */
export function ApertureLoader({ size = 40, color, background }: Omit<ApertureProps, 'opening' | 'rotation'>) {
  const opening = useSharedValue(0.25);
  const rotation = useSharedValue(0);

  useEffect(() => {
    opening.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
    );
    rotation.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 2800, easing: Easing.linear }),
      -1,
    );
  }, [opening, rotation]);

  return (
    <Aperture size={size} color={color} background={background} opening={opening} rotation={rotation} />
  );
}
