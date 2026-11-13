import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApertureLoader } from '@/components/aperture';
import { PlayIcon, SendIcon } from '@/components/rail-icons';
import { Colors, Spacing } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { messageImageUrl } from '@/lib/images';
import { MAX_VOICE_SECONDS, type Message } from '@/lib/messages';

/** Voz não precisa de estéreo nem de taxa alta: arquivo pequeno, envio rápido. */
const RECORDING = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true };

/** Abaixo deste nível (dB) o microfone não captou nada: gravação muda não é enviada. */
const SILENCE_DB = -55;

/** Tocar: alto-falante, mesmo com a chave de silêncio ligada, sem dividir a saída com outro som. */
const PLAYBACK = { allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix' } as const;
const CAPTURE = { ...PLAYBACK, allowsRecording: true } as const;

/** Sem começar a tocar neste tempo, avisa em vez de deixar o balão mudo. */
const LOAD_TIMEOUT_MS = 15000;

/** Gravações mais curtas que isto são toque sem querer. */
const MIN_SECONDS = 1;

function clock(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * A barra que toma o lugar do campo de texto enquanto a pessoa grava.
 * Começa a gravar ao aparecer; "Enviar" entrega o arquivo e a duração, "Cancelar" descarta.
 */
export function VoiceRecorder({
  onSend,
  onCancel,
}: {
  onSend: (uri: string, seconds: number) => void;
  onCancel: () => void;
}) {
  const recorder = useAudioRecorder(RECORDING);
  const state = useAudioRecorderState(recorder, 200);
  const [failed, setFailed] = useState(false);
  const finishing = useRef(false);
  const seconds = state.durationMillis / 1000;
  // O som mais alto captado até agora; `null` onde o aparelho não mede (navegador).
  const loudest = useRef<number | null>(null);
  const level = state.metering;
  useEffect(() => {
    if (typeof level === 'number' && (loudest.current === null || level > loudest.current)) loudest.current = level;
  }, [level]);

  // Começa a gravar assim que a barra aparece.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!active) return;
        if (!permission.granted) {
          Alert.alert(
            t('Microfone bloqueado'),
            t('Para gravar mensagens de voz, libere o microfone nos Ajustes do aparelho.'),
            permission.canAskAgain
              ? undefined
              : [{ text: t('Agora não'), style: 'cancel' }, { text: t('Abrir Ajustes'), onPress: () => Linking.openSettings() }],
          );
          onCancel();
          return;
        }
        await setAudioModeAsync(CAPTURE);
        await recorder.prepareToRecordAsync();
        if (active) recorder.record();
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      // Saiu da barra por qualquer caminho (trocou de conversa, fechou a tela):
      // o aparelho não pode ficar em modo de gravação, que toca baixo, pelo fone do ouvido.
      setAudioModeAsync(PLAYBACK).catch(() => {});
    };
    // Só na montagem: a barra existe enquanto durar esta gravação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Para de gravar e devolve o áudio ao modo de tocar (alto-falante, não o do ouvido). */
  async function stop() {
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // Já parada.
    }
    await setAudioModeAsync(PLAYBACK).catch(() => {});
  }

  async function finish(send: boolean) {
    if (finishing.current) return;
    finishing.current = true;
    const length = recorder.currentTime || seconds;
    await stop();
    const uri = recorder.uri;
    const silent = loudest.current !== null && loudest.current < SILENCE_DB;
    if (send && silent) {
      Alert.alert(t('Não ouvimos nada'), t('A gravação ficou sem som e não foi enviada. Tente de novo.'));
      onCancel();
    } else if (send && uri && length >= MIN_SECONDS) onSend(uri, Math.min(length, MAX_VOICE_SECONDS));
    else onCancel();
  }

  // Saiu do app no meio da gravação (bloqueou a tela, trocou de app): descarta.
  // O sistema corta o microfone nessa hora, e o que sobraria é um áudio mudo.
  const cancel = useRef(() => {});
  useEffect(() => {
    cancel.current = () => finish(false);
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') cancel.current();
    });
    return () => subscription.remove();
  }, []);

  // No limite, a gravação para sozinha e fica esperando "Enviar" ou "Cancelar".
  const atLimit = seconds >= MAX_VOICE_SECONDS;
  useEffect(() => {
    if (atLimit && recorder.isRecording) recorder.stop().catch(() => {});
  }, [atLimit, recorder]);

  return (
    <View style={styles.recorder}>
      <Pressable onPress={() => finish(false)} hitSlop={8} accessibilityRole="button">
        <Text style={styles.cancel}>{t('Cancelar')}</Text>
      </Pressable>
      <View style={styles.recording}>
        {failed ? (
          <Text style={styles.error}>{t('Não foi possível gravar. Tente de novo.')}</Text>
        ) : (
          <>
            <View style={[styles.dot, !state.isRecording && styles.dotIdle]} />
            <Text style={styles.time}>{clock(seconds)}</Text>
            <Text style={styles.hint} numberOfLines={1}>
              {atLimit ? t('Limite de 2 minutos') : t('Gravando…')}
            </Text>
          </>
        )}
      </View>
      <Pressable
        onPress={() => finish(true)}
        disabled={failed || seconds < MIN_SECONDS}
        accessibilityRole="button"
        accessibilityLabel={t('Enviar mensagem de voz')}
        style={[styles.send, (failed || seconds < MIN_SECONDS) && styles.dimmed]}>
        <SendIcon color={Colors.background} size={20} />
      </Pressable>
    </View>
  );
}

/**
 * A mensagem de voz dentro do balão. Só a que está `active` carrega e toca o
 * arquivo; quem controla qual é a conversa, para tocar uma de cada vez.
 */
export function VoiceBubble({
  message,
  mine,
  active,
  onPlay,
}: {
  message: Message;
  mine: boolean;
  active: boolean;
  /** Recebe o id desta mensagem para tocar, ou `null` para parar. */
  onPlay: (id: string | null) => void;
}) {
  const color = mine ? Colors.background : Colors.text;
  const total = message.duration ?? 0;
  const stop = useCallback(() => onPlay(null), [onPlay]);
  return (
    <View style={styles.voice}>
      {active && message.audio_path ? (
        <Playing path={message.audio_path} total={total} color={color} mine={mine} onStop={stop} />
      ) : (
        <>
          <Pressable onPress={() => onPlay(message.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Tocar o áudio')}>
            <PlayIcon color={color} size={26} />
          </Pressable>
          <View style={[styles.track, mine && styles.trackMine]} />
          <Text style={[styles.length, { color }]}>{clock(total)}</Text>
        </>
      )}
    </View>
  );
}

/** Busca o endereço temporário do áudio e só então monta o tocador. */
function Playing(props: { path: string; total: number; color: string; mine: boolean; onStop: () => void }) {
  const { path, onStop } = props;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    messageImageUrl(path)
      .then((signed) => active && setUrl(signed))
      .catch(() => {
        if (!active) return;
        Alert.alert(t('Não foi possível tocar o áudio.'), t('Confira a internet e tente de novo.'));
        onStop();
      });
    return () => {
      active = false;
    };
  }, [path, onStop]);

  if (!url) {
    return (
      <>
        <ApertureLoader size={26} background={props.mine ? Colors.silver : Colors.surfaceRaised} />
        <View style={[styles.track, props.mine && styles.trackMine]} />
        <Text style={[styles.length, { color: props.color }]}>{clock(props.total)}</Text>
      </>
    );
  }
  return <Player {...props} url={url} />;
}

function Player({
  url,
  total,
  color,
  mine,
  onStop,
}: {
  url: string;
  total: number;
  color: string;
  mine: boolean;
  onStop: () => void;
}) {
  // Baixa o arquivo antes de tocar: mais confiável que tocar direto do endereço temporário.
  const player = useAudioPlayer(url, { updateInterval: 200, downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const loaded = status.isLoaded;
  const started = status.playing || status.currentTime > 0;

  // Só manda tocar com o arquivo carregado e o aparelho já em modo de tocar.
  useEffect(() => {
    if (!loaded) return;
    let active = true;
    setAudioModeAsync(PLAYBACK)
      .catch(() => {})
      .then(() => {
        if (active) player.play();
      });
    return () => {
      active = false;
    };
  }, [player, loaded]);

  // Não começou a tocar: avisa, em vez de ficar parado sem som.
  useEffect(() => {
    if (started) return;
    const timer = setTimeout(() => {
      Alert.alert(t('Não foi possível tocar o áudio.'), t('Confira a internet e tente de novo.'));
      onStop();
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [started, onStop]);

  // Terminou: o balão volta ao estado parado.
  useEffect(() => {
    if (status.didJustFinish) onStop();
  }, [status.didJustFinish, onStop]);

  const length = status.duration > 0 ? status.duration : total;
  const progress = length > 0 ? Math.min(1, status.currentTime / length) : 0;
  return (
    <>
      <Pressable onPress={onStop} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Parar o áudio')}>
        <PlayIcon color={color} size={26} playing />
      </Pressable>
      <View style={[styles.track, mine && styles.trackMine]}>
        <View style={[styles.progress, { width: `${progress * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.length, { color }]}>{clock(Math.max(0, length - status.currentTime))}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  recorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  cancel: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  recording: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 38,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF5A4F',
  },
  dotIdle: {
    backgroundColor: Colors.textMuted,
  },
  time: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 13,
  },
  error: {
    flex: 1,
    color: '#FF8A80',
    fontSize: 13,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.silver,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.4,
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    width: 200,
    minHeight: 30,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  trackMine: {
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  progress: {
    height: 3,
  },
  length: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    minWidth: 30,
    textAlign: 'right',
  },
});
