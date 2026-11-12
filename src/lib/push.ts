import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** O que a pessoa acabou de fazer e que merece avisar alguém. */
export type PushEvent =
  | { kind: 'message'; id: string }
  | { kind: 'comment'; id: string }
  | { kind: 'like'; post_id: string };

const supported = Platform.OS !== 'web';

// Com o app aberto, a notificação aparece como faixa no topo, sem som.
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Token deste aparelho, guardado para remover ao sair da conta. */
let currentToken: string | null = null;

/**
 * Pede permissão (só na primeira vez) e registra o aparelho para receber notificações.
 * Falha em silêncio: sem permissão ou no simulador, o app segue igual, só sem push.
 */
export async function registerForPush() {
  if (!supported || !Device.isDevice) return;
  try {
    // Android: as notificações precisam de um canal, e sem ele o Android 13+ nem pergunta a permissão.
    // O servidor da Expo entrega no canal "default"; importância alta mostra a faixa no topo.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos',
        importance: AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status === 'undetermined') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { device_token: token, device_platform: Platform.OS });
    if (!error) currentToken = token;
  } catch {
    // Sem push desta vez; tenta de novo na próxima abertura.
  }
}

/** Ao sair da conta: este aparelho para de receber as notificações dela. */
export async function unregisterFromPush() {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  try {
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // Se falhar, o servidor remove o token quando a entrega for recusada.
  }
}

/** Avisa o servidor para notificar a outra pessoa. Não espera nem atrapalha a ação em si. */
export function notify(event: PushEvent) {
  supabase.functions.invoke('notify', { body: event }).catch(() => {});
}

function open(data: unknown) {
  const d = (data ?? {}) as { type?: string; c?: string };
  if (d.type === 'message' && typeof d.c === 'string') {
    router.navigate({ pathname: '/messages', params: { c: d.c } });
  } else if (d.type === 'comment' || d.type === 'like') {
    router.navigate('/profile');
  }
}

/** Tocar numa notificação abre o lugar certo: a conversa, ou o perfil com seus trabalhos. */
export function usePushNavigation() {
  useEffect(() => {
    if (!supported) return;
    let handled: string | null = null;
    const handle = (response: Notifications.NotificationResponse | null) => {
      const id = response?.notification.request.identifier;
      if (!response || !id || id === handled) return;
      handled = id;
      open(response.notification.request.content.data);
      // Já tratada: não reabre a mesma tela se a pessoa sair e entrar de novo.
      Notifications.clearLastNotificationResponse();
    };
    // O toque que abriu o app do zero, e os toques com o app já aberto.
    handle(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, []);
}
