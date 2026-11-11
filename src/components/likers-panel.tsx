import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/form';
import { Colors, Spacing } from '@/constants/theme';
import { fetchLikers, type Liker } from '@/lib/likes';
import type { FeedPost } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { openMyProfile } from '@/lib/viewer';

type Props = {
  /** O post cujas curtidas aparecem; `null` fecha. */
  post: FeedPost | null;
  onClose: () => void;
};

/** Quem curtiu um post. Tocar numa pessoa abre o perfil dela. */
export function LikersPanel({ post, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={post !== null} animationType="fade" transparent supportedOrientations={['landscape']} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { marginTop: Math.max(insets.top, Spacing.md) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Curtidas</Text>
            <Button variant="ghost" title="Fechar" onPress={onClose} />
          </View>
          {post ? <List key={post.id} postId={post.id} onClose={onClose} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function List({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { session } = useSession();
  const me = session?.user.id;
  const [people, setPeople] = useState<Liker[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchLikers(postId)
      .then((list) => {
        if (!active) return;
        setPeople(list);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [postId, attempt]);

  function open(person: Liker) {
    onClose();
    if (person.id === me) openMyProfile();
    else router.push({ pathname: '/user/[id]', params: { id: person.id } });
  }

  if (people === null) {
    return (
      <View style={styles.center}>
        {failed ? (
          <>
            <Text style={styles.empty}>Não foi possível carregar as curtidas.</Text>
            <Button variant="ghost" title="Tentar de novo" onPress={() => setAttempt((n) => n + 1)} />
          </>
        ) : (
          <ApertureLoader size={32} background={Colors.surface} />
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={people}
      keyExtractor={(p) => p.id}
      ListEmptyComponent={<Text style={styles.empty}>Ninguém curtiu ainda.</Text>}
      renderItem={({ item }) => {
        const name = item.display_name || item.username;
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => open(item)}
            accessibilityRole="button"
            accessibilityLabel={`Ver o perfil de ${name}`}>
            <Avatar name={name} url={item.avatar_url} size={36} />
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                {[`@${item.username}`, item.specialty].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
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
  flex: {
    flex: 1,
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
