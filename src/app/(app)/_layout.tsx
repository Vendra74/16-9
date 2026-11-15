import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/form';
import { Colors, Spacing } from '@/constants/theme';
import { amIBanned } from '@/lib/admin';
import { t } from '@/lib/i18n';
import { InboxProvider } from '@/lib/inbox';
import { CONTACT_EMAIL } from '@/lib/legal';
import { registerForPush, unregisterFromPush, usePushNavigation } from '@/lib/push';
import { supabase } from '@/lib/supabase';

/**
 * Área logada: as abas (com o trilho lateral) e as telas que abrem por cima
 * delas, como o perfil de outra pessoa e a sequência de trabalhos.
 */
export default function AppLayout() {
  const [banned, setBanned] = useState(false);

  // Conta suspensa pela equipe: em vez do app, um aviso com a saída.
  useEffect(() => {
    amIBanned().then(setBanned);
  }, []);

  // Ao entrar na área logada: registra o aparelho para notificações e trata o toque nelas.
  useEffect(() => {
    registerForPush();
  }, []);
  usePushNavigation();

  if (banned) return <Suspended />;

  return (
    <InboxProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="viewer" />
        <Stack.Screen name="record" options={{ animation: 'fade' }} />
        <Stack.Screen name="admin" />
      </Stack>
    </InboxProvider>
  );
}

function Suspended() {
  return (
    <View style={styles.suspended}>
      <Text style={styles.title}>{t('Conta suspensa')}</Text>
      <Text style={styles.text}>
        {t('A equipe do 16:9 suspendeu esta conta por desrespeitar as regras da comunidade. Se achar que foi um engano, escreva para {email}.', {
          email: CONTACT_EMAIL,
        })}
      </Text>
      <Button
        variant="ghost"
        title={t('Sair')}
        onPress={async () => {
          await unregisterFromPush();
          await supabase.auth.signOut();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  suspended: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  text: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 480,
  },
});
