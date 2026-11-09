import type { AuthError } from '@supabase/supabase-js';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aperture } from '@/components/aperture';
import { Button, Field, FormMessage } from '@/components/form';
import { Colors, Spacing } from '@/constants/theme';
import { isUsernameAvailable, normalizeUsername, USERNAME_PATTERN } from '@/lib/profile';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up';
type InputRef = ComponentRef<typeof TextInput>;

/** Mensagens do Supabase Auth traduzidas para quem está testando o app. */
function authMessage(error: AuthError) {
  switch (error.code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Já existe uma conta com esse e-mail. Toque em "Já tenho conta".';
    case 'weak_password':
      return 'Senha fraca. Use pelo menos 8 caracteres.';
    case 'email_not_confirmed':
      return 'Confirme seu e-mail pelo link que enviamos e tente de novo.';
    case 'email_address_invalid':
      return 'Esse e-mail não parece válido.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Muitas tentativas seguidas. Espere alguns minutos.';
    case 'signup_disabled':
      return 'Cadastros fechados no momento.';
    default:
      return error.message || 'Algo deu errado. Tente de novo.';
  }
}

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const usernameRef = useRef<InputRef>(null);
  const emailRef = useRef<InputRef>(null);
  const passwordRef = useRef<InputRef>(null);

  // O diafragma abre um pouco mais quando a pessoa vai criar a conta.
  const opening = useSharedValue(0.3);
  const rotation = useSharedValue(Math.PI / 10);
  useEffect(() => {
    const ease = Easing.inOut(Easing.cubic);
    opening.value = withTiming(mode === 'sign-up' ? 0.55 : 0.3, { duration: 600, easing: ease });
    rotation.value = withTiming(mode === 'sign-up' ? Math.PI / 3 : Math.PI / 10, { duration: 600, easing: ease });
  }, [mode, opening, rotation]);

  function switchMode() {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
    setError(null);
    setInfo(null);
  }

  async function submit() {
    setError(null);
    setInfo(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) setError(authMessage(error));
        return;
      }

      const handle = normalizeUsername(username);
      if (!name.trim()) return setError('Diga como quer aparecer no 16:9.');
      if (!USERNAME_PATTERN.test(handle)) {
        return setError('O @ precisa ter de 3 a 24 letras, números, ponto ou _.');
      }
      if (password.length < 8) return setError('Use pelo menos 8 caracteres na senha.');
      if (!(await isUsernameAvailable(handle))) return setError(`@${handle} já está em uso.`);

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { username: handle, display_name: name.trim() } },
      });
      if (error) return setError(authMessage(error));
      // Com confirmação de e-mail ligada no Supabase, a sessão só vem depois do link.
      if (!data.session) {
        setMode('sign-in');
        setInfo('Conta criada. Abra o link que enviamos para o seu e-mail e depois entre aqui.');
      }
    } catch {
      setError('Sem conexão com o servidor. Confira a internet e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const signingUp = mode === 'sign-up';

  return (
    <View style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.brand}>
        <View style={styles.logoRow}>
          <Aperture size={64} opening={opening} rotation={rotation} />
          <Text style={styles.logo}>16:9</Text>
        </View>
        <Text style={styles.slogan}>A FRAME FOR EVERYONE</Text>
        <Text style={styles.beta}>Versão de teste. Seu feedback molda o app.</Text>
      </View>

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={[styles.form, { paddingTop: Math.max(insets.top, Spacing.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets>
        <Text style={styles.title}>{signingUp ? 'Criar conta' : 'Entrar'}</Text>

        {!supabaseConfigured ? (
          <FormMessage text="Servidor não configurado: falta EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY (veja o README)." />
        ) : null}

        {signingUp ? (
          <>
            <Field
              label="Nome"
              placeholder="Como você assina seus trabalhos"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => usernameRef.current?.focus()}
            />
            <Field
              ref={usernameRef}
              label="Usuário"
              placeholder="@seunome"
              value={username}
              onChangeText={(text) => setUsername(normalizeUsername(text))}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          </>
        ) : null}

        <Field
          ref={emailRef}
          label="E-mail"
          placeholder="voce@email.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Field
          ref={passwordRef}
          label="Senha"
          placeholder={signingUp ? 'Mínimo de 8 caracteres' : 'Sua senha'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          textContentType={signingUp ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <FormMessage text={error} />
        <FormMessage text={info} tone="info" />

        <Button
          title={signingUp ? 'Criar conta' : 'Entrar'}
          onPress={submit}
          loading={busy}
          disabled={!supabaseConfigured}
        />
        <Button
          variant="ghost"
          title={signingUp ? 'Já tenho conta' : 'Ainda não tenho conta'}
          onPress={switchMode}
        />
        {!signingUp ? (
          <Text style={styles.help}>Esqueceu a senha? Fale com a equipe do 16:9 que a gente libera uma nova.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  logo: {
    color: Colors.silver,
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  slogan: {
    color: Colors.textSecondary,
    fontSize: 12,
    letterSpacing: 5,
    fontWeight: '500',
  },
  beta: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: Spacing.lg,
  },
  formScroll: {
    flex: 1,
  },
  form: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  help: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
