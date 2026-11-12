import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import type { FollowKind, ProfileCounts } from '@/lib/follows';
import { dateLocale, t } from '@/lib/i18n';

/** Trabalhos, seguidores e seguindo. Tocar em seguidores ou seguindo abre a lista. */
export function ProfileCountsRow({ counts, onOpen }: { counts: ProfileCounts | null; onOpen: (kind: FollowKind) => void }) {
  const items: { value: number | undefined; label: string; kind?: FollowKind }[] = [
    { value: counts?.posts, label: counts?.posts === 1 ? t('trabalho') : t('trabalhos') },
    { value: counts?.followers, label: counts?.followers === 1 ? t('seguidor') : t('seguidores'), kind: 'followers' },
    { value: counts?.following, label: t('seguindo'), kind: 'following' },
  ];
  return (
    <View style={styles.row}>
      {items.map((item) => (
        <Pressable
          key={item.kind ?? 'posts'}
          style={({ pressed }) => [styles.item, pressed && item.kind && styles.pressed]}
          onPress={item.kind ? () => onOpen(item.kind!) : undefined}
          disabled={!item.kind || !counts}
          accessibilityRole={item.kind ? 'button' : 'text'}>
          <Text style={styles.value}>{item.value === undefined ? '–' : item.value.toLocaleString(dateLocale())}</Text>
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  pressed: {
    backgroundColor: Colors.surfaceRaised,
  },
  value: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
});
