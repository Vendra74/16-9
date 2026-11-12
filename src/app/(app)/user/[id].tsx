import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Button, FormMessage } from '@/components/form';
import { BackButton } from '@/components/side-rail';
import { WorkTile } from '@/components/work-tile';
import { Colors, Spacing } from '@/constants/theme';
import { isBlockedByMe, startConversation, unblockUser } from '@/lib/messages';
import { askModeration } from '@/lib/moderation';
import { fetchUserPosts, type FeedPost } from '@/lib/posts';
import { fetchProfile, type Profile } from '@/lib/profile';
import { useSession } from '@/lib/session';
import { openConversation, openViewer } from '@/lib/viewer';
import { plural, t } from '@/lib/i18n';

const GAP = Spacing.sm;
const MIN_TILE = 170;

type Loaded = { profile: Profile; posts: FeedPost[]; blocked: boolean };

/** Perfil de outra pessoa: quem é, o portfólio em 16:9 e o caminho para conversar. */
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(0);

  const load = useCallback(async () => {
    try {
      const [profile, posts, blocked] = await Promise.all([fetchProfile(id), fetchUserPosts(id), isBlockedByMe(id)]);
      setData({ profile, posts, blocked });
      setError(false);
    } catch {
      setError(true);
    }
  }, [id]);

  // Recarrega ao voltar para a tela (ex.: depois de curtir um trabalho aberto daqui).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (id === session?.user.id) return <Redirect href="/profile" />;

  if (!data) {
    return (
      <View style={[styles.center, { paddingLeft: insets.left }]}>
        <View style={[styles.back, { left: Math.max(insets.left, Spacing.sm) }]}>
          <BackButton />
        </View>
        {error ? (
          <>
            <FormMessage text={t('Não foi possível abrir este perfil.')} />
            <Button variant="ghost" title={t('Tentar de novo')} onPress={load} />
          </>
        ) : (
          <ApertureLoader />
        )}
      </View>
    );
  }

  const { profile, posts, blocked } = data;
  const name = profile.display_name || profile.username;
  const details = [profile.specialty, profile.city].filter(Boolean).join(' · ');
  const columns = Math.max(2, Math.floor((width + GAP) / (MIN_TILE + GAP)));
  const tile = Math.floor((width - GAP * (columns - 1)) / columns);

  async function message() {
    setBusy(true);
    try {
      const c = await startConversation(profile.id);
      openConversation(c);
    } catch (e) {
      Alert.alert(t('Não foi possível abrir a conversa'), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function unblock() {
    setBusy(true);
    try {
      await unblockUser(profile.id);
      await load();
    } catch {
      Alert.alert(t('Não foi possível desbloquear'), t('Confira a internet e tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <ScrollView style={styles.side} contentContainerStyle={[styles.sideContent, { paddingTop: Math.max(insets.top, Spacing.sm) }]}>
        <View style={styles.backRow}>
          <BackButton />
        </View>
        <Avatar name={name} url={profile.avatar_url} size={72} />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.handle}>@{profile.username}</Text>
        {details ? <Text style={styles.details}>{details}</Text> : null}
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        <View style={styles.actions}>
          {blocked ? (
            <>
              <Text style={styles.blocked}>{t('Você bloqueou esta pessoa.')}</Text>
              <Button title={t('Desbloquear')} onPress={unblock} loading={busy} />
            </>
          ) : (
            <>
              <Button title={t('Mensagem')} onPress={message} loading={busy} />
              <Button
                variant="ghost"
                title={t('Mais opções')}
                onPress={() => askModeration({ id: profile.id, name }, {}, load)}
              />
            </>
          )}
        </View>
      </ScrollView>

      <ScrollView
        style={styles.main}
        contentContainerStyle={[styles.mainContent, { paddingTop: Math.max(insets.top, Spacing.lg) }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width - Spacing.lg * 2)}>
        {posts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {blocked ? t('Os trabalhos de quem você bloqueou ficam escondidos.') : t('{name} ainda não publicou nenhum trabalho.', { name })}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.gridTitle}>
              {plural(posts.length, '{n} trabalho', '{n} trabalhos')}
            </Text>
            {width > 0 ? (
              <View style={styles.grid}>
                {posts.map((post) => (
                  <WorkTile key={post.id} post={post} width={tile} onPress={() => openViewer(posts, post.id)} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
  },
  back: {
    position: 'absolute',
    top: Spacing.sm + 2,
  },
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  side: {
    width: 260,
    flexGrow: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  sideContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  backRow: {
    alignSelf: 'flex-start',
    marginLeft: -Spacing.md,
    marginBottom: -Spacing.sm,
  },
  name: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  handle: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  details: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  bio: {
    color: Colors.text,
    fontSize: 13,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  blocked: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  main: {
    flex: 1,
  },
  mainContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  gridTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GAP,
    rowGap: Spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 420,
  },
});
