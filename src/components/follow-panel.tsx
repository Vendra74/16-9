import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/form';
import { Colors, Spacing } from '@/constants/theme';
import { fetchFollowList, follow, unfollow, type FollowKind, type FollowPerson } from '@/lib/follows';
import { useSession } from '@/lib/session';
import { openMyProfile } from '@/lib/viewer';
import { t } from '@/lib/i18n';

type Props = {
  /** De quem são as listas; `null` fecha. */
  userId: string | null;
  kind: FollowKind;
  onKindChange: (kind: FollowKind) => void;
  onClose: () => void;
  /** Avisa quando você segue ou deixa de seguir alguém na lista. */
  onChanged?: () => void;
};

/** Seguidores e seguindo de alguém, em duas abas. Tocar numa pessoa abre o perfil. */
export function FollowPanel({ userId, kind, onKindChange, onClose, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={userId !== null} animationType="fade" transparent supportedOrientations={['landscape']} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { marginTop: Math.max(insets.top, Spacing.md) }]}>
          <View style={styles.header}>
            <View style={styles.tabs}>
              {(['followers', 'following'] as const).map((tab) => (
                <Pressable key={tab} onPress={() => onKindChange(tab)} hitSlop={6} accessibilityRole="tab" accessibilityState={{ selected: kind === tab }}>
                  <Text style={[styles.tab, kind === tab && styles.tabSelected]}>
                    {tab === 'followers' ? t('Seguidores') : t('Seguindo')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Button variant="ghost" title={t('Fechar')} onPress={onClose} />
          </View>
          {userId ? <List key={`${userId}-${kind}`} userId={userId} kind={kind} onClose={onClose} onChanged={onChanged} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function List({ userId, kind, onClose, onChanged }: { userId: string; kind: FollowKind; onClose: () => void; onChanged?: () => void }) {
  const { session } = useSession();
  const me = session?.user.id;
  const [people, setPeople] = useState<FollowPerson[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchFollowList(userId, kind)
      .then((list) => {
        if (!active) return;
        setPeople(list);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [userId, kind, attempt]);

  function open(person: FollowPerson) {
    onClose();
    if (person.id === me) openMyProfile();
    else router.push({ pathname: '/user/[id]', params: { id: person.id } });
  }

  async function toggle(person: FollowPerson) {
    if (!me) return;
    const next = !person.i_follow;
    const flip = (value: boolean) =>
      setPeople((list) => list?.map((p) => (p.id === person.id ? { ...p, i_follow: value } : p)) ?? null);
    flip(next);
    try {
      if (next) await follow(person.id);
      else await unfollow(me, person.id);
      onChanged?.();
    } catch {
      flip(!next);
    }
  }

  if (people === null) {
    return (
      <View style={styles.center}>
        {failed ? (
          <>
            <Text style={styles.empty}>{t('Não foi possível carregar a lista.')}</Text>
            <Button variant="ghost" title={t('Tentar de novo')} onPress={() => setAttempt((n) => n + 1)} />
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
      ListEmptyComponent={
        <Text style={styles.empty}>{kind === 'followers' ? t('Nenhum seguidor ainda.') : t('Ainda não segue ninguém.')}</Text>
      }
      renderItem={({ item }) => {
        const name = item.display_name || item.username;
        return (
          <View style={styles.row}>
            <Pressable
              style={({ pressed }) => [styles.person, pressed && styles.pressed]}
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={t('Ver o perfil de {name}', { name })}>
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
            {item.id === me ? null : <FollowChip following={item.i_follow} onPress={() => toggle(item)} />}
          </View>
        );
      }}
    />
  );
}

/** Botão pequeno de seguir/seguindo, usado nas listas. */
export function FollowChip({ following, onPress }: { following: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.chip, following ? styles.chipFollowing : styles.chipFollow, pressed && styles.chipPressed]}>
      <Text style={[styles.chipText, following ? styles.chipTextFollowing : styles.chipTextFollow]}>
        {following ? t('Seguindo') : t('Seguir')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
  },
  sheet: {
    width: 440,
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
  tabs: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  tab: {
    color: Colors.textMuted,
    fontSize: 17,
    fontWeight: '700',
  },
  tabSelected: {
    color: Colors.text,
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
  },
  person: {
    flex: 1,
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
  chip: {
    minWidth: 92,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipFollow: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  chipFollowing: {
    borderColor: Colors.textMuted,
  },
  chipPressed: {
    opacity: 0.6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextFollow: {
    color: Colors.background,
  },
  chipTextFollowing: {
    color: Colors.text,
  },
});
