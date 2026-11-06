import { usePathname } from 'expo-router';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, RailWidth, Spacing } from '@/constants/theme';

type RailButtonProps = Omit<TabTriggerSlotProps, 'ref'> & {
  label: string;
  /** Rota da aba, para destacar a aba atual. */
  route: string;
  Icon: ComponentType<{ color: string }>;
};

/** Botão do trilho lateral. Usar dentro de `<TabTrigger asChild>`. */
export function RailButton({ label, route, Icon, isFocused: _isFocused, ...props }: RailButtonProps) {
  const pathname = usePathname();
  const color = pathname === route ? Colors.text : Colors.textMuted;
  return (
    <Pressable {...props} accessibilityLabel={label} style={styles.button}>
      <Icon color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Empurra os botões seguintes para o fim do trilho. */
export function RailSpacer() {
  return <View style={styles.spacer} />;
}

/**
 * Estilo do trilho vertical na lateral esquerda. Em paisagem, a tela do
 * iPhone é mais larga que 16:9: a faixa que sobra vira o menu e a imagem
 * nunca é coberta.
 */
export function useRailStyle() {
  const insets = useSafeAreaInsets();
  return [
    styles.rail,
    {
      width: RailWidth + insets.left,
      paddingLeft: insets.left,
      paddingVertical: Math.max(insets.top, Spacing.md),
    },
  ];
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.lg,
    backgroundColor: Colors.background,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  button: {
    alignItems: 'center',
    gap: Spacing.xs,
    width: RailWidth,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  spacer: {
    flex: 1,
  },
});
