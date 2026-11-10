import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Button, Field, FormMessage } from '@/components/form';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { settingsLine } from '@/lib/exif';
import { cropAndResize, publicUrl, uploadJpeg } from '@/lib/images';
import { deletePost, fetchUserPosts, postImageUrl, type FeedPost } from '@/lib/posts';
import {
  fetchProfile,
  normalizeUsername,
  sendFeedback,
  updateProfile,
  USERNAME_PATTERN,
  type Profile,
} from '@/lib/profile';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Panel = 'works' | 'edit' | 'feedback';

export default function ProfileScreen() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('works');
  const [attempt, setAttempt] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchProfile(userId)
      .then((data) => active && setProfile(data))
      .catch(() => active && setLoadError('Não foi possível carregar seu perfil.'));
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  async function changeAvatar() {
    if (!profile) return;
    setAvatarError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAvatarBusy(true);
    try {
      // O editor do sistema já devolve quadrado; o recorte garante isso no web e no Android.
      const side = Math.min(asset.width, asset.height);
      const square = {
        originX: Math.floor((asset.width - side) / 2),
        originY: Math.floor((asset.height - side) / 2),
        width: side,
        height: side,
      };
      const image = await cropAndResize(asset.uri, square, 512);
      const path = await uploadJpeg('avatars', profile.id, image.uri);
      const avatar_url = publicUrl('avatars', path);
      await updateProfile(profile.id, { avatar_url });
      setProfile({ ...profile, avatar_url });
    } catch {
      setAvatarError('Não foi possível trocar a foto.');
    } finally {
      setAvatarBusy(false);
    }
  }

  function retry() {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        {loadError ? (
          <>
            <FormMessage text={loadError} />
            <Button variant="ghost" title="Tentar de novo" onPress={retry} />
          </>
        ) : (
          <ApertureLoader />
        )}
      </View>
    );
  }

  const details = [profile.specialty, profile.city].filter(Boolean).join(' · ');

  return (
    <View style={[styles.screen, { paddingRight: insets.right }]}>
      <ScrollView style={styles.side} contentContainerStyle={[styles.sideContent, { paddingTop: Math.max(insets.top, Spacing.lg) }]}>
        <Pressable onPress={changeAvatar} disabled={avatarBusy} accessibilityLabel="Trocar foto de perfil">
          <Avatar name={profile.display_name || profile.username} url={profile.avatar_url} size={72} />
          {avatarBusy ? (
            <View style={styles.avatarBusy}>
              <ApertureLoader size={28} background={Colors.surfaceRaised} />
            </View>
          ) : null}
        </Pressable>
        <Pressable onPress={changeAvatar} disabled={avatarBusy} hitSlop={6}>
          <Text style={styles.changePhoto}>{profile.avatar_url ? 'Trocar foto' : 'Adicionar foto'}</Text>
        </Pressable>
        <FormMessage text={avatarError} />
        <Text style={styles.name}>{profile.display_name || profile.username}</Text>
        <Text style={styles.handle}>@{profile.username}</Text>
        {details ? <Text style={styles.details}>{details}</Text> : null}
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        <View style={styles.actions}>
          <Button
            variant={panel === 'edit' ? 'primary' : 'ghost'}
            title="Editar perfil"
            onPress={() => setPanel(panel === 'edit' ? 'works' : 'edit')}
          />
          <Button
            variant={panel === 'feedback' ? 'primary' : 'ghost'}
            title="Enviar feedback"
            onPress={() => setPanel(panel === 'feedback' ? 'works' : 'feedback')}
          />
          <Button variant="ghost" title="Sair" onPress={() => supabase.auth.signOut()} />
        </View>
        <Text style={styles.account}>{session?.user.email}</Text>
      </ScrollView>

      <ScrollView
        style={styles.main}
        contentContainerStyle={[styles.mainContent, { paddingTop: Math.max(insets.top, Spacing.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets>
        {panel === 'edit' ? (
          <EditProfile
            profile={profile}
            onSaved={(saved) => {
              setProfile(saved);
              setPanel('works');
            }}
          />
        ) : panel === 'feedback' ? (
          <FeedbackForm onSent={() => setPanel('works')} />
        ) : (
          <MyWorks userId={profile.id} />
        )}
      </ScrollView>
    </View>
  );
}

/** Portfólio: os trabalhos da pessoa em 16:9. Segurar um trabalho oferece apagar. */
function MyWorks({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetchUserPosts(userId)
      .then((data) => {
        setPosts(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, [userId]);

  useFocusEffect(load);

  function confirmDelete(post: FeedPost) {
    Alert.alert('Apagar este trabalho?', 'Ele sai do feed e do seu perfil. Não dá para desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post);
            setPosts((list) => list?.filter((p) => p.id !== post.id) ?? null);
          } catch {
            Alert.alert('Não foi possível apagar', 'Confira a internet e tente de novo.');
          }
        },
      },
    ]);
  }

  if (posts === null) {
    return (
      <View style={styles.empty}>
        {error ? <FormMessage text="Não foi possível carregar seus trabalhos." /> : <ApertureLoader />}
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Seus trabalhos em 16:9</Text>
        <Text style={styles.emptyText}>O que você publicar aparece aqui, formando seu portfólio.</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      <Text style={styles.gridTitle}>
        {posts.length} {posts.length === 1 ? 'trabalho' : 'trabalhos'}
      </Text>
      <View style={styles.gridItems}>
        {posts.map((post) => (
          <Pressable key={post.id} style={styles.tile} onLongPress={() => confirmDelete(post)} delayLongPress={350}>
            <Image source={{ uri: postImageUrl(post) }} style={styles.tileImage} contentFit="cover" transition={200} />
            <Text style={styles.tileTitle} numberOfLines={1}>
              {post.title || post.location || settingsLine(post) || ' '}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Segure um trabalho para apagar.</Text>
    </View>
  );
}

function EditProfile({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Profile) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setError(null);
    const changes = {
      username: normalizeUsername(form.username),
      display_name: form.display_name.trim(),
      specialty: form.specialty.trim(),
      city: form.city.trim(),
      bio: form.bio.trim(),
    };
    if (!USERNAME_PATTERN.test(changes.username)) {
      return setError('O @ precisa ter de 3 a 24 letras, números, ponto ou _.');
    }
    setBusy(true);
    try {
      await updateProfile(profile.id, changes);
      onSaved({ ...profile, ...changes });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>Editar perfil</Text>
      <View style={styles.row}>
        <View style={styles.col}>
          <Field label="Nome" value={form.display_name} onChangeText={set('display_name')} maxLength={60} />
        </View>
        <View style={styles.col}>
          <Field
            label="Usuário"
            value={form.username}
            onChangeText={(t) => set('username')(normalizeUsername(t))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.col}>
          <Field
            label="Especialidade"
            placeholder="Fotógrafo, diretor, colorista…"
            value={form.specialty}
            onChangeText={set('specialty')}
            maxLength={60}
          />
        </View>
        <View style={styles.col}>
          <Field label="Cidade" placeholder="São Paulo, SP" value={form.city} onChangeText={set('city')} maxLength={60} />
        </View>
      </View>
      <Field
        label="Bio"
        placeholder="O que você filma, fotografa, edita…"
        value={form.bio}
        onChangeText={set('bio')}
        multiline
        maxLength={300}
      />
      <FormMessage text={error} />
      <Button title="Salvar" onPress={save} loading={busy} />
    </View>
  );
}

function FeedbackForm({ onSent }: { onSent: () => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!message.trim()) return setError('Escreva o que achou antes de enviar.');
    setError(null);
    setBusy(true);
    try {
      const version = Constants.expoConfig?.version ?? '?';
      await sendFeedback(message.trim(), version, `${Platform.OS} ${Platform.Version}`);
      setSent(true);
      setMessage('');
      setTimeout(onSent, 1500);
    } catch {
      setError('Não foi possível enviar. Confira a internet e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>Enviar feedback</Text>
      <Text style={styles.emptyText}>
        O que funcionou, o que travou, o que faltou. Vale tudo: a gente lê cada mensagem.
      </Text>
      <Field label="Mensagem" value={message} onChangeText={setMessage} multiline maxLength={4000} />
      <FormMessage text={error} />
      <FormMessage text={sent ? 'Recebido. Obrigado!' : null} tone="info" />
      <Button title="Enviar" onPress={send} loading={busy} />
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
  avatarBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  changePhoto: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  name: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
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
  },
  account: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: Spacing.sm,
  },
  main: {
    flex: 1,
  },
  mainContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    maxWidth: 420,
  },
  grid: {
    gap: Spacing.sm,
  },
  gridTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  gridItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    width: 176,
    gap: 4,
  },
  tileImage: {
    width: 176,
    aspectRatio: FrameRatio,
    backgroundColor: Colors.surface,
  },
  tileTitle: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: Spacing.xs,
  },
  form: {
    gap: Spacing.md,
    maxWidth: 560,
  },
  formTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  col: {
    flex: 1,
  },
});
