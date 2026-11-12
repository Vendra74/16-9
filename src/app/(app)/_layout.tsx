import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { InboxProvider } from '@/lib/inbox';
import { registerForPush, usePushNavigation } from '@/lib/push';

/**
 * Área logada: as abas (com o trilho lateral) e as telas que abrem por cima
 * delas, como o perfil de outra pessoa e a sequência de trabalhos.
 */
export default function AppLayout() {
  // Ao entrar na área logada: registra o aparelho para notificações e trata o toque nelas.
  useEffect(() => {
    registerForPush();
  }, []);
  usePushNavigation();

  return (
    <InboxProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="viewer" />
        <Stack.Screen name="record" options={{ animation: 'fade' }} />
      </Stack>
    </InboxProvider>
  );
}
