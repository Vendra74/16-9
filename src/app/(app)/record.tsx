import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Button } from '@/components/form';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { MAX_VIDEO_SECONDS, setRecordedVideo } from '@/lib/video';

function clock(seconds: number) {
  const s = Math.min(seconds, MAX_VIDEO_SECONDS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Gravar um vídeo sem sair do app: câmera em tela cheia, na horizontal, com
 * o limite de 1 minuto. Ao terminar, volta para o Publicar com o vídeo.
 */
export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const [camera, askCamera] = useCameraPermissions();
  const [mic, askMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [failed, setFailed] = useState(false);
  const view = useRef<CameraView>(null);
  // Fechar a tela no meio da gravação descarta o vídeo em vez de levá-lo ao Publicar.
  const discard = useRef(false);

  // Pede as permissões ao abrir, uma de cada vez (o iOS mostra um aviso por permissão).
  useEffect(() => {
    if (camera && !camera.granted && camera.canAskAgain) askCamera();
    else if (camera?.granted && mic && !mic.granted && mic.canAskAgain) askMic();
  }, [camera, mic, askCamera, askMic]);

  // Relógio da gravação.
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(timer);
  }, [recording]);

  function close() {
    discard.current = true;
    if (recording) view.current?.stopRecording();
    router.back();
  }

  async function start() {
    if (!view.current || recording) return;
    setFailed(false);
    setSeconds(0);
    setRecording(true);
    try {
      // A promessa só termina quando a gravação para (no botão ou no limite de 1 minuto).
      const video = await view.current.recordAsync({ maxDuration: MAX_VIDEO_SECONDS });
      if (discard.current) return;
      if (!video?.uri) throw new Error('no_video');
      setRecordedVideo(video.uri);
      router.back();
    } catch {
      if (!discard.current) setFailed(true);
    } finally {
      setRecording(false);
    }
  }

  const granted = camera?.granted && mic?.granted;

  if (!camera || !mic) {
    return (
      <View style={styles.center}>
        <ApertureLoader />
      </View>
    );
  }

  if (!granted) {
    const blocked = (!camera.granted && !camera.canAskAgain) || (!mic.granted && !mic.canAskAgain);
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Câmera e microfone</Text>
        <Text style={styles.text}>
          Para gravar pelo 16:9, o app precisa da câmera e do microfone.
          {blocked ? ' Libere os dois nos Ajustes do aparelho.' : ''}
        </Text>
        {blocked ? (
          <Button title="Abrir Ajustes" onPress={() => Linking.openSettings()} />
        ) : (
          <Button title="Permitir" onPress={() => (camera.granted ? askMic() : askCamera())} />
        )}
        <Button variant="ghost" title="Voltar" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* A imagem aparece no enquadramento 16:9, igual ao que vai para o feed. */}
      <View style={styles.frame}>
        <CameraView
          ref={view}
          style={StyleSheet.absoluteFill}
          mode="video"
          facing={facing}
          videoQuality="1080p"
          onCameraReady={() => setReady(true)}
          onMountError={() => setFailed(true)}
        />
      </View>

      <View style={[styles.left, { paddingLeft: Math.max(insets.left, Spacing.md) }]} pointerEvents="box-none">
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar a câmera" style={styles.pill}>
          <Text style={styles.pillText}>{recording ? 'Descartar' : 'Fechar'}</Text>
        </Pressable>
        {failed ? <Text style={styles.error}>Não foi possível gravar. Tente de novo.</Text> : null}
      </View>

      <View style={[styles.right, { paddingRight: Math.max(insets.right, Spacing.md) }]} pointerEvents="box-none">
        <Text style={[styles.clock, recording && styles.clockOn]}>
          {clock(seconds)} / {clock(MAX_VIDEO_SECONDS)}
        </Text>
        <Pressable
          onPress={() => (recording ? view.current?.stopRecording() : start())}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Parar a gravação' : 'Gravar'}
          style={[styles.shutter, !ready && styles.dimmed]}>
          <View style={recording ? styles.stop : styles.dot} />
        </Pressable>
        {recording ? (
          <View style={styles.pillSpace} />
        ) : (
          <Pressable
            onPress={() => {
              setReady(false);
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Trocar de câmera"
            style={styles.pill}>
            <Text style={styles.pillText}>Virar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const RED = '#FF5A4F';

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
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
    maxWidth: 440,
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  frame: {
    height: '100%',
    aspectRatio: FrameRatio,
    maxWidth: '100%',
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  left: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  right: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pillSpace: {
    height: 34,
  },
  pillText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: Colors.text,
    fontSize: 13,
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  clock: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  clockOn: {
    backgroundColor: RED,
  },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  dimmed: {
    opacity: 0.4,
  },
  dot: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: RED,
  },
  stop: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: RED,
  },
});
