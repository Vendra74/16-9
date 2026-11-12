import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Colors, Spacing } from '@/constants/theme';
import type { MutualFollowers } from '@/lib/follows';
import { t } from '@/lib/i18n';

/** "Seguido por X e Y": quem você segue e também segue essa pessoa. */
export function MutualFollowersLine({ mutual, onPress }: { mutual: MutualFollowers; onPress: () => void }) {
  const { people, total } = mutual;
  if (!people.length) return null;
  const names = people.map((p) => p.display_name || p.username);
  let text: string;
  if (total === 1) text = t('Seguido por {a}', { a: names[0] });
  else if (total === 2) text = t('Seguido por {a} e {b}', { a: names[0], b: names[1] });
  else text = t('Seguido por {a}, {b} e mais {n}', { a: names[0], b: names[1], n: total - 2 });

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
      <View style={styles.avatars}>
        {people.slice(0, 2).map((p, i) => (
          <View key={p.id} style={[styles.avatar, i > 0 && styles.overlap]}>
            <Avatar name={p.display_name || p.username} url={p.avatar_url} size={20} />
          </View>
        ))}
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  avatars: {
    flexDirection: 'row',
  },
  avatar: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.background,
  },
  overlap: {
    marginLeft: -8,
  },
  text: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
  },
});
