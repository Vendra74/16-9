import { TabList, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExploreIcon, FeedIcon, ProfileIcon, PublishIcon } from '@/components/rail-icons';
import { Colors, RailWidth, Spacing } from '@/constants/theme';

type RailButtonProps = Omit<TabTriggerSlotProps, 'ref'> & {
  label: string;
  Icon: ComponentType<{ color: string }>;
};

function RailButton({ label, Icon, isFocused, ...props }: RailButtonProps) {
  const color = isFocused ? Colors.text : Colors.textMuted;
  return (
    <Pressable {...props} accessibilityLabel={label} style={styles.button}>
      <Icon color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Trilho vertical na lateral esquerda. Em paisagem, a tela do iPhone é mais
 * larga que 16:9: a faixa que sobra vira o menu e a imagem nunca é coberta.
 */
export function SideRail() {
  const insets = useSafeAreaInsets();
  return (
    <TabList
      style={[
        styles.rail,
        { width: RailWidth + insets.left, paddingLeft: insets.left, paddingVertical: Math.max(insets.top, Spacing.md) },
      ]}>
      <TabTrigger name="index" href="/" asChild>
        <RailButton label="Feed" Icon={FeedIcon} />
      </TabTrigger>
      <TabTrigger name="explore" href="/explore" asChild>
        <RailButton label="Explorar" Icon={ExploreIcon} />
      </TabTrigger>
      <TabTrigger name="publish" href="/publish" asChild>
        <RailButton label="Publicar" Icon={PublishIcon} />
      </TabTrigger>
      <View style={styles.spacer} />
      <TabTrigger name="profile" href="/profile" asChild>
        <RailButton label="Perfil" Icon={ProfileIcon} />
      </TabTrigger>
    </TabList>
  );
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
