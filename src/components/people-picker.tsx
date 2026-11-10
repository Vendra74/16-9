import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button, FormMessage } from '@/components/form';
import { Colors, Spacing } from '@/constants/theme';
import { searchPeople, type MiniProfile } from '@/lib/messages';
import { useSession } from '@/lib/session';

type Props = {
  visible: boolean;
  title: string;
  onPick: (person: MiniProfile) => void;
  onClose: () => void;
};

/** Escolher uma pessoa pelo nome ou @ (para conversar ou enviar um post). */
export function PeoplePicker({ visible, title, onPick, onClose }: Props) {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const me = session?.user.id ?? '';
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<MiniProfile[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible || !me) return;
    let active = true;
    const timer = setTimeout(() => {
      searchPeople(query, me)
        .then((list) => {
          if (!active) return;
          setPeople(list);
          setError(false);
        })
        .catch(() => active && setError(true));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, visible, me]);

  return (
    <Modal visible={visible} animationType="fade" transparent supportedOrientations={['landscape']} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { marginTop: Math.max(insets.top, Spacing.md) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Button variant="ghost" title="Fechar" onPress={onClose} />
          </View>
          <TextInput
            style={styles.search}
            placeholder="Buscar por nome ou @"
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance="dark"
            selectionColor={Colors.silver}
          />
          {error ? <FormMessage text="Não foi possível buscar. Confira a internet." /> : null}
          <FlatList
            data={people ?? []}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              people ? <Text style={styles.empty}>Ninguém encontrado.</Text> : undefined
            }
            renderItem={({ item }) => (
              <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => onPick(item)}>
                <Avatar name={item.display_name || item.username} url={item.avatar_url} size={36} />
                <View>
                  <Text style={styles.name}>{item.display_name || item.username}</Text>
                  <Text style={styles.handle}>@{item.username}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
  },
  sheet: {
    width: 420,
    maxWidth: '90%',
    flex: 1,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  search: {
    color: Colors.text,
    fontSize: 15,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  pressed: {
    backgroundColor: Colors.surfaceRaised,
  },
  name: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  handle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  empty: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
