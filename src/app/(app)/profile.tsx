import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Button, Field, FormMessage } from '@/components/form';
import { Colors, Spacing } from '@/constants/theme';
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
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile.display_name || profile.username).charAt(0).toUpperCase()}</Text>
        </View>
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
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Seus trabalhos em 16:9</Text>
            <Text style={styles.emptyText}>Quando a publicação estiver pronta, seu portfólio aparece aqui.</Text>
          </View>
        )}
      </ScrollView>
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
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  avatarText: {
    color: Colors.silver,
    fontSize: 30,
    fontWeight: '700',
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
