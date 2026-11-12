import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { linkLabel } from '@/lib/links';

/** Os links do perfil como etiquetas; tocar abre o endereço dentro do app. */
export function ProfileLinks({ links }: { links?: string[] }) {
  if (!links?.length) return null;
  return (
    <View style={styles.links}>
      {links.map((link) => (
        <Pressable
          key={link}
          onPress={() => WebBrowser.openBrowserAsync(link).catch(() => {})}
          accessibilityRole="link"
          accessibilityLabel={t('Abrir {link}', { link })}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Text style={styles.text} numberOfLines={1}>
            ↗ {linkLabel(link)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  link: {
    maxWidth: 200,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.textMuted,
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
