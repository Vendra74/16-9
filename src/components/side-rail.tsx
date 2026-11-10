import { usePathname } from 'expo-router';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Colors, FrameRatio, RailWidth, Spacing } from '@/constants/theme';

type RailButtonProps = Omit<TabTriggerSlotProps, 'ref'> & {
  label: string;
  /** Rota da aba, para destacar a aba atual. */
  route: string;
  Icon: ComponentType<{ color: string }>;
  /** Mostra um ponto de aviso (ex.: mensagem nova). */
  badge?: boolean;
};

/** Botão do trilho lateral. Usar dentro de `<TabTrigger asChild>`. */
export function RailButton({ label, route, Icon, badge, isFocused: _isFocused, ...props }: RailButtonProps) {
  const pathname = usePathname();
  const color = pathname === route ? Colors.text : Colors.textMuted;
  return (
    <Pressable {...props} accessibilityLabel={badge ? `${label}, há novidades` : label} style={styles.button}>
      <View>
        <Icon color={color} />
        {badge ? <View style={styles.badge} /> : null}
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Empurra os botões seguintes para o fim do trilho. */
export function RailSpacer() {
  return <View style={styles.spacer} />;
}

/**
 * Largura do trilho. Em paisagem a tela do iPhone é mais larga que 16:9:
 * a moldura ocupa a altura toda e a sobra é dividida igualmente entre os
 * dois lados. O trilho mora na sobra da esquerda, por cima da área da
 * câmera; a da direita fica livre (o iPhone pode estar virado para o outro lado).
 */
export function useRailWidth() {
  const { width, height } = useWindowDimensions();
  const frame = Math.min(width - RailWidth, height * FrameRatio);
  return Math.max(RailWidth, Math.floor((width - frame) / 2));
}

/**
 * Estilo do trilho vertical na lateral esquerda. Os botões ficam em dois
 * grupos (topo e base) para não passarem por trás da Dynamic Island, que
 * fica no meio da borda quando o iPhone está deitado.
 */
export function useRailStyle() {
  return [styles.rail, { width: useRailWidth() }];
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.background,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  button: {
    alignItems: 'center',
    gap: 3,
    width: RailWidth,
    paddingVertical: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  badge: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FF5A4F',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  spacer: {
    flex: 1,
  },
});
