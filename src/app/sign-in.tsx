import type { AuthError } from '@supabase/supabase-js';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aperture } from '@/components/aperture';
import { Button, Field, FormMessage } from '@/components/form';
import { Colors, Spacing } from '@/constants/theme';
import { openPrivacy, openTerms } from '@/lib/legal';
import { isUsernameAvailable, normalizeUsername, USERNAME_PATTERN } from '@/lib/profile';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { t } from '@/lib/i18n';

/** 'forgot' pede o e-mail; 'reset' recebe o código enviado e a senha nova. */
type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'reset';
type InputRef = ComponentRef<typeof TextInput>;

/** Mensagens do Supabase Auth traduzidas para quem está testando o app. */
function authMessage(error: AuthError) {
  switch (error.code) {
    case 'invalid_credentials':
      return t('E-mail ou senha incorretos.');
    case 'user_already_exists':
    case 'email_exists':
      return t('Já existe uma conta com esse e-mail. Toque em "Já tenho conta".');
    case 'weak_password':
      return t('Senha fraca. Use pelo menos 8 caracteres.');
    case 'email_not_confirmed':
      return t('Confirme seu e-mail pelo link que enviamos e tente de novo.');
    case 'email_address_invalid':
      return t('Esse e-mail não parece válido.');
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return t('Muitas tentativas seguidas. Espere alguns minutos.');
    case 'otp_expired':
      return t('Código incorreto ou vencido. Confira o e-mail ou peça um código novo.');
    case 'same_password':
      return t('A senha nova precisa ser diferente da anterior.');
    case 'signup_disabled':
      return t('Cadastros fechados no momento.');
    default:
      return error.message || t('Algo deu errado. Tente de novo.');
  }
}

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
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

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  function switchMode() {
    go(mode === 'sign-in' ? 'sign-up' : 'sign-in');
  }

  /** Esqueci a senha, passo 1: manda um código para o e-mail. */
  async function sendCode() {
    setError(null);
    setInfo(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setError(t('Digite o e-mail da sua conta.'));
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) return setError(authMessage(error));
      setCode('');
      setPassword('');
      setMode('reset');
      // Por segurança o servidor não diz se o e-mail existe; a mensagem é a mesma nos dois casos.
      setInfo(t('Se existe uma conta com {email}, o código chega em instantes. Olhe também o spam.', { email: cleanEmail }));
    } catch {
      setError(t('Sem conexão com o servidor. Confira a internet e tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  /** Esqueci a senha, passo 2: confere o código e grava a senha nova. */
  async function resetPassword() {
    setError(null);
    setInfo(null);
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return setError(t('Digite o código que chegou no seu e-mail.'));
    if (password.length < 8) return setError(t('Use pelo menos 8 caracteres na senha nova.'));
    setBusy(true);
    try {
      const verified = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'recovery' });
      if (verified.error) return setError(authMessage(verified.error));
      // O código já abre a sessão, e o app entra sozinho. A senha é gravada em seguida.
      const updated = await supabase.auth.updateUser({ password });
      if (updated.error) {
        Alert.alert(
          t('Você entrou, mas a senha não foi trocada'),
          `${authMessage(updated.error)} ${t('Saia pelo Perfil e use "Esqueci minha senha" de novo.')}`,
        );
      }
    } catch {
      setError(t('Sem conexão com o servidor. Confira a internet e tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    setInfo(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError(t('Preencha e-mail e senha.'));
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
      if (!name.trim()) return setError(t('Diga como quer aparecer no 16:9.'));
      if (!USERNAME_PATTERN.test(handle)) {
        return setError(t('O @ precisa ter de 3 a 24 letras, números, ponto ou _.'));
      }
      if (password.length < 8) return setError(t('Use pelo menos 8 caracteres na senha.'));
      if (!(await isUsernameAvailable(handle))) return setError(t('@{handle} já está em uso.', { handle }));

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { username: handle, display_name: name.trim() } },
      });
      if (error) return setError(authMessage(error));
      // Com confirmação de e-mail ligada no Supabase, a sessão só vem depois do link.
      if (!data.session) {
        setMode('sign-in');
        setInfo(t('Conta criada. Abra o link que enviamos para o seu e-mail e depois entre aqui.'));
      }
    } catch {
      setError(t('Sem conexão com o servidor. Confira a internet e tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  const signingUp = mode === 'sign-up';
  const recovering = mode === 'forgot' || mode === 'reset';
  const title = { 'sign-in': t('Entrar'), 'sign-up': t('Criar conta'), forgot: t('Esqueci minha senha'), reset: t('Nova senha') }[mode];

  return (
    <View style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.brand}>
        <View style={styles.logoRow}>
          <Aperture size={64} opening={opening} rotation={rotation} />
          <Text style={styles.logo}>16:9</Text>
        </View>
        <Text style={styles.slogan}>A FRAME FOR EVERYONE</Text>
        <Text style={styles.beta}>{t('Versão de teste. Seu feedback molda o app.')}</Text>
      </View>

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={[styles.form, { paddingTop: Math.max(insets.top, Spacing.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets>
        <Text style={styles.title}>{title}</Text>
        {mode === 'forgot' ? (
          <Text style={styles.help}>{t('Digite o e-mail da sua conta. Enviamos um código para você criar uma senha nova.')}</Text>
        ) : null}

        {!supabaseConfigured ? (
          <FormMessage text={t('Servidor não configurado: falta EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY (veja o README).')} />
        ) : null}

        {signingUp ? (
          <>
            <Field
              label={t('Nome')}
              placeholder={t('Como você assina seus trabalhos')}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => usernameRef.current?.focus()}
            />
            <Field
              ref={usernameRef}
              label={t('Usuário')}
              placeholder={t('@seunome')}
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

        {mode === 'reset' ? (
          <Field
            label={t('Código')}
            placeholder={t('Código que chegou no e-mail')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={10}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        ) : (
        <Field
          ref={emailRef}
          label={t('E-mail')}
          placeholder={t('voce@email.com')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType={mode === 'forgot' ? 'send' : 'next'}
          onSubmitEditing={mode === 'forgot' ? sendCode : () => passwordRef.current?.focus()}
        />
        )}
        {mode === 'forgot' ? null : (
        <Field
          ref={passwordRef}
          label={mode === 'reset' ? t('Senha nova') : t('Senha')}
          placeholder={signingUp || mode === 'reset' ? t('Mínimo de 8 caracteres') : t('Sua senha')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={signingUp || mode === 'reset' ? 'new-password' : 'current-password'}
          textContentType={signingUp || mode === 'reset' ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={mode === 'reset' ? resetPassword : submit}
        />
        )}

        <FormMessage text={error} />
        <FormMessage text={info} tone="info" />

{recovering ? (
          <>
            <Button
              title={mode === 'forgot' ? t('Enviar código') : t('Trocar senha e entrar')}
              onPress={mode === 'forgot' ? sendCode : resetPassword}
              loading={busy}
              disabled={!supabaseConfigured}
            />
            {mode === 'reset' ? <Button variant="ghost" title={t('Enviar outro código')} onPress={sendCode} disabled={busy} /> : null}
            <Button variant="ghost" title={t('Voltar para entrar')} onPress={() => go('sign-in')} />
          </>
        ) : (
          <>
            {signingUp ? (
              <View style={styles.consent}>
                <Text style={styles.consentText}>
                  {t('Ao criar a conta, você concorda com os Termos de uso e a Política de privacidade. Nudez, violência, assédio e conteúdo ilegal não são permitidos.')}
                </Text>
                <View style={styles.consentLinks}>
                  <Pressable onPress={openTerms} hitSlop={6} accessibilityRole="link">
                    <Text style={styles.consentLink}>{t('Termos de uso')}</Text>
                  </Pressable>
                  <Pressable onPress={openPrivacy} hitSlop={6} accessibilityRole="link">
                    <Text style={styles.consentLink}>{t('Política de privacidade')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <Button
              title={signingUp ? t('Criar conta') : t('Entrar')}
              onPress={submit}
              loading={busy}
              disabled={!supabaseConfigured}
            />
            <Button
              variant="ghost"
              title={signingUp ? t('Já tenho conta') : t('Ainda não tenho conta')}
              onPress={switchMode}
            />
            {!signingUp ? <Button variant="ghost" title={t('Esqueci minha senha')} onPress={() => go('forgot')} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  consent: {
    gap: Spacing.xs,
  },
  consentText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  consentLinks: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  consentLink: {
    color: Colors.text,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
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
