import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useRef, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { CropFrame } from '@/components/crop-frame';
import { useRailWidth } from '@/components/side-rail';
import { Button, Field, FormMessage } from '@/components/form';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { EMPTY_GEAR, gearFromExif, type Gear } from '@/lib/exif';
import { cropAndResize, uploadJpeg, type CropRect } from '@/lib/images';
import { createPost, deletePost } from '@/lib/posts';
import { useSession } from '@/lib/session';
import {
  DEFAULT_COVER_SECONDS,
  makePoster,
  MAX_VIDEO_SECONDS,
  requestUpload,
  takeRecordedVideo,
  uploadVideo,
} from '@/lib/video';

type Picked = { kind: 'photo' | 'video'; uri: string; width: number; height: number };

/** Largura máxima do arquivo publicado (16:9 → 2048×1152). */
const MAX_WIDTH = 2048;
const FORM_WIDTH = 300;
/** O corte usa o editor de vídeo do iPhone; gravar precisa da câmera do aparelho. */
const CAN_TRIM = Platform.OS === 'ios';
const CAN_RECORD = Platform.OS !== 'web';

function clock(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function PublishScreen() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const railWidth = useRailWidth();
  const area = { width: window.width - railWidth - insets.right, height: window.height };
  const [picked, setPicked] = useState<Picked | null>(null);
  const [gear, setGear] = useState<Gear>(EMPTY_GEAR);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  /** Instante do vídeo que vira a capa. */
  const [cover, setCover] = useState(DEFAULT_COVER_SECONDS);
  const crop = useRef<CropRect | null>(null);
  const onCropChange = useCallback((rect: CropRect) => {
    crop.current = rect;
  }, []);

  // Voltando da tela de gravação, o vídeo gravado entra como se tivesse sido escolhido.
  useFocusEffect(
    useCallback(() => {
      const uri = takeRecordedVideo();
      if (!uri) return;
      // A gravação do app já sai na horizontal, em 1080p e com até 1 minuto.
      setPicked({ kind: 'video', uri, width: 1920, height: 1080 });
      setGear(EMPTY_GEAR);
      setCover(DEFAULT_COVER_SECONDS);
      setError(null);
    }, []),
  );

  /** Recusa a escolha: o motivo fica na tela e também num aviso, para não passar despercebido. */
  function refuse(title: string, message: string, offerTrim = false) {
    setError(message);
    // Espera o seletor terminar de fechar; antes disso o iOS não mostra o aviso.
    setTimeout(
      () =>
        Alert.alert(
          title,
          message,
          offerTrim
            ? [
                { text: 'Agora não', style: 'cancel' },
                { text: 'Cortar um trecho', onPress: () => pick(true) },
              ]
            : undefined,
        ),
      500,
    );
  }

  /**
   * Abre a galeria. Com `trim`, abre só os vídeos e passa pelo editor do
   * iPhone, onde a pessoa arrasta as alças para escolher um trecho de até 1 minuto.
   */
  async function pick(trim = false) {
    setError(null);
    // Depois de escolher um vídeo, o iPhone ainda o converte para 1080p antes de devolver.
    // Isso leva alguns segundos, e a tela mostra que está trabalhando.
    setOpening(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: trim ? ['videos'] : ['images', 'videos'],
        allowsEditing: trim,
        exif: true,
        quality: 1,
        videoMaxDuration: MAX_VIDEO_SECONDS,
        // Converte para 1080p antes de enviar: um minuto em 4K passaria de 300 MB.
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1920x1080,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      let { width, height } = asset;
      // No web o seletor às vezes não informa o tamanho.
      if (!width || !height) ({ width, height } = await Image.getSize(asset.uri));
      if (asset.type === 'video') {
        // O seletor informa a duração em milissegundos.
        if ((asset.duration ?? 0) > (MAX_VIDEO_SECONDS + 0.5) * 1000) {
          if (CAN_TRIM && !trim) {
            refuse(
              'Vídeo longo demais',
              `O vídeo precisa ter até ${MAX_VIDEO_SECONDS} segundos. Quer escolher um trecho dele? Você seleciona o vídeo de novo e arrasta as alças amarelas.`,
              true,
            );
          } else {
            refuse('Vídeo longo demais', `O vídeo precisa ter até ${MAX_VIDEO_SECONDS} segundos. Corte um trecho menor e tente de novo.`);
          }
          return;
        }
        if (width && height && height > width) {
          refuse(
            'Vídeo na vertical',
            'No 16:9 só entra vídeo na horizontal. Escolha um vídeo gravado com o celular deitado.',
          );
          return;
        }
        setPicked({ kind: 'video', uri: asset.uri, width, height });
        setGear(EMPTY_GEAR);
        setCover(DEFAULT_COVER_SECONDS);
        return;
      }
      setPicked({ kind: 'photo', uri: asset.uri, width, height });
      setGear(gearFromExif(asset.exif));
    } catch {
      setError('Não foi possível abrir esse arquivo. Tente escolher de novo.');
    } finally {
      setOpening(false);
    }
  }

  function reset() {
    setPicked(null);
    setGear(EMPTY_GEAR);
    setTitle('');
    setLocation('');
    crop.current = null;
  }

  async function publish() {
    if (!picked || !session) return;
    setError(null);
    try {
      const video = picked.kind === 'video';
      setStep(video ? 'Preparando a capa…' : 'Preparando a imagem…');
      const image = video
        ? await makePoster(picked.uri, MAX_WIDTH, cover)
        : await cropAndResize(picked.uri, crop.current, MAX_WIDTH);
      setStep('Enviando…');
      const path = await uploadJpeg('posts', session.user.id, image.uri);
      const upload = video ? await requestUpload() : null;
      const postId = await createPost({
        image_path: path,
        width: image.width,
        height: image.height,
        ...(upload ? { kind: 'video' as const, mux_upload_id: upload.upload_id } : {}),
        title: title.trim(),
        location: location.trim(),
        camera: gear.camera.trim(),
        lens: gear.lens.trim(),
        focal_length: gear.focal_length.trim(),
        aperture: gear.aperture.trim(),
        shutter: gear.shutter.trim(),
        iso: gear.iso.trim(),
      });
      if (upload) {
        // O post já existe (invisível para os outros) e só aparece quando o vídeo ficar pronto.
        try {
          setStep('Enviando o vídeo… 0%');
          await uploadVideo(upload.url, picked.uri, (f) => setStep(`Enviando o vídeo… ${Math.round(f * 100)}%`));
        } catch (e) {
          await deletePost({ id: postId, image_path: path, kind: 'video' }).catch(() => {});
          throw e;
        }
      }
      reset();
      router.navigate('/');
    } catch {
      setError('Não foi possível publicar. Confira a internet e tente de novo.');
    } finally {
      setStep(null);
    }
  }

  if (!picked) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Publicar</Text>
        <Text style={styles.text}>
          Escolha uma foto ou um vídeo de até 1 minuto, na horizontal{CAN_RECORD ? ', ou grave na hora' : ''}. A foto
          você enquadra em 16:9, e a ficha técnica (câmera, lente, abertura, velocidade e ISO) é preenchida a partir dela.
        </Text>
        <FormMessage text={error} />
        {opening ? (
          <View style={styles.busy}>
            <ApertureLoader size={28} />
            <Text style={styles.text}>Preparando… Vídeos levam alguns segundos.</Text>
          </View>
        ) : (
          <>
            <View style={styles.choices}>
              <Button title="Escolher foto ou vídeo" onPress={() => pick()} />
              {CAN_RECORD ? <Button title="Gravar um vídeo" onPress={() => router.push('/record')} /> : null}
            </View>
            {CAN_TRIM ? <Button variant="ghost" title="Cortar um trecho de um vídeo longo" onPress={() => pick(true)} /> : null}
          </>
        )}
      </View>
    );
  }

  // A moldura ocupa o que sobra ao lado do formulário, limitada pela altura.
  const frameWidth = Math.max(
    0,
    Math.min(area.width - FORM_WIDTH - Spacing.lg * 3, (area.height - Spacing.lg * 2 - 54) * FrameRatio),
  );
  const set = (key: keyof Gear) => (value: string) => setGear((g) => ({ ...g, [key]: value }));
  const busy = step !== null;

  return (
    <View style={[styles.screen, { paddingRight: insets.right }]}>
      <View style={styles.preview}>
        {frameWidth <= 0 ? null : picked.kind === 'video' ? (
          <VideoPreview key={picked.uri} uri={picked.uri} width={frameWidth} cover={cover} onCover={setCover} disabled={busy} />
        ) : (
          <CropFrame
            key={picked.uri}
            uri={picked.uri}
            imageWidth={picked.width}
            imageHeight={picked.height}
            width={frameWidth}
            onCropChange={onCropChange}
          />
        )}
        <View style={styles.previewActions}>
          <Button variant="ghost" title={opening ? 'Preparando…' : 'Trocar'} onPress={() => pick()} disabled={busy || opening} />
          <Button variant="ghost" title="Cancelar" onPress={reset} disabled={busy} />
        </View>
      </View>

      <ScrollView
        style={styles.form}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets>
        <Field label="Título" placeholder="Opcional" value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Local" placeholder="Cidade, lugar" value={location} onChangeText={setLocation} maxLength={120} />

        <Text style={styles.section}>Ficha técnica</Text>
        <Field label="Câmera" placeholder="Sony A7 IV" value={gear.camera} onChangeText={set('camera')} maxLength={80} />
        <Field label="Lente" placeholder="24-70mm f/2.8" value={gear.lens} onChangeText={set('lens')} maxLength={80} />
        <View style={styles.row}>
          <View style={styles.col}>
            <Field label="Focal" placeholder="35mm" value={gear.focal_length} onChangeText={set('focal_length')} maxLength={20} />
          </View>
          <View style={styles.col}>
            <Field label="Abertura" placeholder="f/8" value={gear.aperture} onChangeText={set('aperture')} maxLength={20} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.col}>
            <Field label="Velocidade" placeholder="1/250s" value={gear.shutter} onChangeText={set('shutter')} maxLength={20} />
          </View>
          <View style={styles.col}>
            <Field label="ISO" placeholder="100" value={gear.iso} onChangeText={set('iso')} maxLength={20} keyboardType="number-pad" />
          </View>
        </View>

        <FormMessage text={error} />
        {busy ? (
          <View style={styles.busy}>
            <ApertureLoader size={28} />
            <Text style={styles.text}>{step}</Text>
          </View>
        ) : (
          <Button title="Publicar" onPress={publish} />
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Como o vídeo vai aparecer no feed: preenchendo a moldura 16:9.
 * A pessoa para o vídeo no quadro que quiser e o marca como capa.
 */
function VideoPreview({
  uri,
  width,
  cover,
  onCover,
  disabled,
}: {
  uri: string;
  width: number;
  cover: number;
  onCover: (seconds: number) => void;
  disabled: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  const chosen = cover !== DEFAULT_COVER_SECONDS;
  return (
    <View>
      <VideoView
        player={player}
        style={{ width, height: width / FrameRatio, backgroundColor: Colors.surface }}
        contentFit="cover"
        nativeControls
      />
      <Pressable
        style={[styles.coverButton, disabled && styles.dimmed]}
        disabled={disabled}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Usar este quadro como capa"
        onPress={() => {
          // Para no quadro escolhido, para a pessoa ver o que virou capa.
          player.pause();
          onCover(Math.max(0, player.currentTime));
        }}>
        <Text style={styles.coverText}>
          {chosen ? `Capa em ${clock(cover)} · trocar para este quadro` : 'Usar este quadro como capa'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  choices: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  coverButton: {
    position: 'absolute',
    top: Spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  coverText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  dimmed: {
    opacity: 0.4,
  },
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
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  preview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingLeft: Spacing.lg,
  },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  form: {
    width: FORM_WIDTH + Spacing.lg * 2,
    flexGrow: 0,
  },
  formContent: {
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  section: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  col: {
    flex: 1,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 46,
  },
});
