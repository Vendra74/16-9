import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { t } from '@/lib/i18n';

export type SheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  title?: string;
  /** Uma fileira de emojis no topo (reações). `selected` é o que a pessoa já escolheu. */
  emojis?: string[];
  selected?: string | null;
  onEmoji?: (emoji: string) => void;
  actions: SheetAction[];
  onClose: () => void;
};

/**
 * Menu de ações no meio da tela. Existe porque o alerta do sistema só aceita
 * três botões no Android, e os menus das mensagens têm mais do que isso.
 */
export function ActionSheet({ visible, title, emojis, selected, onEmoji, actions, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape']}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Fechar')}>
        {/* O toque dentro do cartão não fecha o menu. */}
        <Pressable style={styles.card} onPress={() => {}}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {emojis && onEmoji ? (
            <View style={styles.emojis}>
              {emojis.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    onClose();
                    onEmoji(emoji);
                  }}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={t('Reagir com {emoji}', { emoji })}
                  style={[styles.emoji, selected === emoji && styles.emojiSelected]}>
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <ScrollView bounces={false}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <Text style={[styles.actionText, action.destructive && styles.destructive]}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text style={styles.cancel}>{t('Cancelar')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  card: {
    width: 300,
    maxHeight: '100%',
    borderRadius: 16,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  title: {
    color: Colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  emojis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  emoji: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiSelected: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  emojiText: {
    fontSize: 24,
  },
  action: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  pressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionText: {
    color: Colors.text,
    fontSize: 15,
  },
  destructive: {
    color: '#FF8A80',
  },
  cancel: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
});
