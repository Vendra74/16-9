import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Alert, Image as NativeImage, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { messageImageUrl } from '@/lib/images';
import type { Media, Message } from '@/lib/messages';
import { MAX_VIDEO_SECONDS } from '@/lib/video';
import { t } from '@/lib/i18n';

const THUMB_WIDTH = 240;
const THUMB_MAX_HEIGHT = 200;

/** Endereço temporário da imagem da mensagem (o bucket das conversas é privado). */
function useMessageImage(path: string | null) {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let active = true;
    messageImageUrl(path)
      .then((url) => active && setLoaded({ path, url }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [path]);
  return loaded && loaded.path === path ? loaded.url : null;
}

/** Abre a galeria e confere as regras do vídeo. Devolve `null` se a pessoa desistiu ou o arquivo não serve. */
export async function pickMedia(): Promise<Media | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
    videoMaxDuration: MAX_VIDEO_SECONDS,
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1920x1080,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  let { width, height } = asset;
  // No web o seletor às vezes não informa o tamanho.
  if ((!width || !height) && asset.type !== 'video') ({ width, height } = await NativeImage.getSize(asset.uri));
  if (asset.type === 'video') {
    const refuse = (title: string, message: string) => setTimeout(() => Alert.alert(title, message), 500);
    if ((asset.duration ?? 0) > (MAX_VIDEO_SECONDS + 0.5) * 1000) {
      refuse(t('Vídeo longo demais'), t('Nas mensagens o vídeo também precisa ter até {seconds} segundos.', { seconds: MAX_VIDEO_SECONDS }));
      return null;
    }
    if (width && height && height > width) {
      refuse(t('Vídeo na vertical'), t('No 16:9 só entra vídeo na horizontal.'));
      return null;
    }
    return { kind: 'video', uri: asset.uri, width, height };
  }
  return { kind: 'photo', uri: asset.uri, width, height };
}

/** A foto ou o vídeo dentro do balão da conversa. Tocar abre em tela cheia. */
export function MediaThumb({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const url = useMessageImage(message.image_path);
  const video = message.kind === 'video';
  const ratio = message.image_width && message.image_height ? message.image_width / message.image_height : FrameRatio;
  const height = Math.min(THUMB_MAX_HEIGHT, THUMB_WIDTH / ratio);
  const width = height * ratio;
  const playable = !video || (message.status === 'ready' && Boolean(message.video_url));
  const label = !video
    ? null
    : message.status === 'processing'
      ? t('Processando…')
      : message.status === 'failed'
        ? t('Não foi possível processar')
        : t('Vídeo');
  return (
    <Pressable
      onPress={onOpen}
      disabled={!playable}
      accessibilityRole="button"
      accessibilityLabel={video ? t('Abrir o vídeo') : t('Abrir a foto')}
      style={[styles.thumb, { width, height }]}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
      {label ? <Text style={styles.tag}>{label}</Text> : null}
      {video && playable ? (
        <View style={styles.play}>
          <View style={styles.playTriangle} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** A foto ou o vídeo de uma mensagem em tela cheia. `null` fecha. */
export function MediaViewer({ message, onClose }: { message: Message | null; onClose: () => void }) {
  return (
    <Modal visible={message !== null} animationType="fade" supportedOrientations={['landscape']} onRequestClose={onClose}>
      {message ? <Viewer key={message.id} message={message} onClose={onClose} /> : null}
    </Modal>
  );
}

function Viewer({ message, onClose }: { message: Message; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const url = useMessageImage(message.image_path);
  return (
    <View style={styles.viewer}>
      {message.kind === 'video' && message.video_url ? (
        <ViewerVideo uri={message.video_url} width={window.width} height={window.height} />
      ) : url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : (
        <ApertureLoader />
      )}
      <Pressable
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('Fechar')}
        style={[styles.close, { top: Math.max(insets.top, Spacing.md), right: Math.max(insets.right, Spacing.md) }]}>
        <Text style={styles.closeText}>{t('Fechar')}</Text>
      </Pressable>
    </View>
  );
}

function ViewerVideo({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  // Dá o play depois que a tela do vídeo existe (no navegador, antes disso não há o que tocar).
  useEffect(() => {
    player.play();
  }, [player]);
  return <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  tag: {
    position: 'absolute',
    top: 6,
    left: 6,
    color: Colors.text,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  playTriangle: {
    marginLeft: 4,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: Colors.text,
  },
  viewer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  close: {
    position: 'absolute',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  closeText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
