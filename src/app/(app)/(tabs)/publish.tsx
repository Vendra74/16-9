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
import { createPost, deletePost, MAX_PHOTOS } from '@/lib/posts';
import { useSession } from '@/lib/session';
import {
  DEFAULT_COVER_SECONDS,
  makePoster,
  MAX_VIDEO_SECONDS,
  requestUpload,
  takeRecordedVideo,
  uploadVideo,
} from '@/lib/video';

type Picked = { kind: 'video'; uri: string; width: number; height: number };
type Photo = { uri: string; width: number; height: number };

/** Largura máxima do arquivo publicado (16:9 → 2048×1152). */
const MAX_WIDTH = 2048;
const FORM_WIDTH = 300;
/** Altura da fileira de miniaturas do carrossel, abaixo da moldura. */
const STRIP_HEIGHT = 44;
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
  /** O vídeo escolhido, ou as fotos (uma, ou várias num carrossel). Nunca os dois. */
  const [picked, setPicked] = useState<Picked | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  /** Qual foto do carrossel está na moldura para enquadrar. */
  const [current, setCurrent] = useState(0);
  const [gear, setGear] = useState<Gear>(EMPTY_GEAR);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  /** Instante do vídeo que vira a capa. */
  const [cover, setCover] = useState(DEFAULT_COVER_SECONDS);
  /** O enquadramento de cada foto, pelo endereço dela. */
  const crops = useRef<Record<string, CropRect>>({});
  const onCropChange = useCallback((uri: string, rect: CropRect) => {
    crops.current[uri] = rect;
  }, []);

  // Voltando da tela de gravação, o vídeo gravado entra como se tivesse sido escolhido.
  useFocusEffect(
    useCallback(() => {
      const uri = takeRecordedVideo();
      if (!uri) return;
      // A gravação do app já sai na horizontal, em 1080p e com até 1 minuto.
      setPicked({ kind: 'video', uri, width: 1920, height: 1080 });
      setPhotos([]);
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
   * Com `add`, abre só as fotos e acrescenta as escolhidas ao carrossel.
   */
  async function pick(trim = false, add = false) {
    setError(null);
    // Depois de escolher um vídeo, o iPhone ainda o converte para 1080p antes de devolver.
    // Isso leva alguns segundos, e a tela mostra que está trabalhando.
    setOpening(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: trim ? ['videos'] : add ? ['images'] : ['images', 'videos'],
        allowsEditing: trim,
        // Várias fotos de uma vez viram um carrossel, na ordem em que foram tocadas.
        allowsMultipleSelection: !trim,
        selectionLimit: add ? MAX_PHOTOS - photos.length : MAX_PHOTOS,
        orderedSelection: true,
        exif: true,
        quality: 1,
        videoMaxDuration: MAX_VIDEO_SECONDS,
        // Converte para 1080p antes de enviar: um minuto em 4K passaria de 300 MB.
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1920x1080,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      if (result.assets.length === 1 && asset.type === 'video') {
        const { width, height } = asset;
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
        setPhotos([]);
        setGear(EMPTY_GEAR);
        setCover(DEFAULT_COVER_SECONDS);
        return;
      }

      if (result.assets.some((a) => a.type === 'video')) {
        refuse('Vídeo vai sozinho', `Um post leva um vídeo ou até ${MAX_PHOTOS} fotos. Escolha só o vídeo, ou só as fotos.`);
        return;
      }
      const chosen: Photo[] = [];
      for (const a of result.assets) {
        let { width, height } = a;
        // No web o seletor às vezes não informa o tamanho.
        if (!width || !height) ({ width, height } = await Image.getSize(a.uri));
        chosen.push({ uri: a.uri, width, height });
      }
      if (add) {
        const known = new Set(photos.map((p) => p.uri));
        const next = [...photos, ...chosen.filter((p) => !known.has(p.uri))].slice(0, MAX_PHOTOS);
        setCurrent(Math.min(photos.length, next.length - 1));
        setPhotos(next);
        return;
      }
      crops.current = {};
      setPicked(null);
      setPhotos(chosen.slice(0, MAX_PHOTOS));
      setCurrent(0);
      // A ficha técnica vem da primeira foto.
      setGear(gearFromExif(asset.exif));
    } catch {
      setError('Não foi possível abrir esse arquivo. Tente escolher de novo.');
    } finally {
      setOpening(false);
    }
  }

  function reset() {
    setPicked(null);
    setPhotos([]);
    setCurrent(0);
    setGear(EMPTY_GEAR);
    setTitle('');
    setLocation('');
    crops.current = {};
  }

  async function publish() {
    if ((!picked && photos.length === 0) || !session) return;
    setError(null);
    try {
      const video = picked !== null;
      const extra_images: string[] = [];
      let image;
      let path;
      if (picked) {
        setStep('Preparando a capa…');
        image = await makePoster(picked.uri, MAX_WIDTH, cover);
        setStep('Enviando…');
        path = await uploadJpeg('posts', session.user.id, image.uri);
      } else {
        // Uma foto por vez: prepara, envia e segue para a próxima.
        for (const [index, photo] of photos.entries()) {
          setStep(photos.length > 1 ? `Enviando foto ${index + 1} de ${photos.length}…` : 'Enviando…');
          const ready = await cropAndResize(photo.uri, crops.current[photo.uri] ?? null, MAX_WIDTH);
          const uploaded = await uploadJpeg('posts', session.user.id, ready.uri);
          if (index === 0) {
            image = ready;
            path = uploaded;
          } else {
            extra_images.push(uploaded);
          }
        }
      }
      if (!image || !path) return;
      const upload = video ? await requestUpload() : null;
      const postId = await createPost({
        image_path: path,
        width: image.width,
        height: image.height,
        ...(upload ? { kind: 'video' as const, mux_upload_id: upload.upload_id } : {}),
        ...(extra_images.length > 0 ? { extra_images } : {}),
        title: title.trim(),
        location: location.trim(),
        camera: gear.camera.trim(),
        lens: gear.lens.trim(),
        focal_length: gear.focal_length.trim(),
        aperture: gear.aperture.trim(),
        shutter: gear.shutter.trim(),
        iso: gear.iso.trim(),
      });
      if (upload && picked) {
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

  if (!picked && photos.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Publicar</Text>
        <Text style={styles.text}>
          Escolha uma foto, várias fotos (viram um carrossel) ou um vídeo de até 1 minuto, na horizontal{CAN_RECORD ? ', ou grave na hora' : ''}. A foto
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
    Math.min(area.width - FORM_WIDTH - Spacing.lg * 3, (area.height - Spacing.lg * 2 - 54 - (picked ? 0 : STRIP_HEIGHT)) * FrameRatio),
  );
  const set = (key: keyof Gear) => (value: string) => setGear((g) => ({ ...g, [key]: value }));
  const busy = step !== null;
  const shown = Math.min(current, photos.length - 1);

  return (
    <View style={[styles.screen, { paddingRight: insets.right }]}>
      <View style={styles.preview}>
        {frameWidth <= 0 ? null : picked ? (
          <VideoPreview key={picked.uri} uri={picked.uri} width={frameWidth} cover={cover} onCover={setCover} disabled={busy} />
        ) : (
          <>
            {/* Todas ficam montadas, para cada foto guardar o seu enquadramento; só a atual aparece. */}
            {photos.map((photo, index) => (
              <View key={photo.uri} style={index === shown ? undefined : styles.hidden}>
                <PhotoFrame photo={photo} width={frameWidth} onCropChange={onCropChange} />
              </View>
            ))}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
              {photos.map((photo, index) => (
                <Pressable
                  key={photo.uri}
                  onPress={() => setCurrent(index)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Foto ${index + 1} de ${photos.length}`}
                  style={[styles.thumb, index === shown && styles.thumbOn]}>
                  <Image source={{ uri: photo.uri }} style={styles.thumbImage} resizeMode="cover" />
                </Pressable>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <Pressable
                  onPress={() => pick(false, true)}
                  disabled={busy || opening}
                  accessibilityRole="button"
                  accessibilityLabel="Adicionar fotos"
                  style={[styles.thumb, styles.thumbAdd]}>
                  <Text style={styles.thumbAddText}>+</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </>
        )}
        <View style={styles.previewActions}>
          {photos.length > 1 ? (
            <Button
              variant="ghost"
              title="Tirar esta foto"
              disabled={busy}
              onPress={() => {
                setPhotos(photos.filter((_, index) => index !== shown));
                setCurrent(Math.max(0, shown - 1));
              }}
            />
          ) : null}
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

/** A moldura de enquadramento de uma das fotos. */
function PhotoFrame({
  photo,
  width,
  onCropChange,
}: {
  photo: Photo;
  width: number;
  onCropChange: (uri: string, rect: CropRect) => void;
}) {
  const { uri } = photo;
  const report = useCallback((rect: CropRect) => onCropChange(uri, rect), [uri, onCropChange]);
  return <CropFrame uri={uri} imageWidth={photo.width} imageHeight={photo.height} width={width} onCropChange={report} />;
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
  hidden: {
    display: 'none',
  },
  strip: {
    flexGrow: 0,
    height: STRIP_HEIGHT - Spacing.xs,
  },
  stripContent: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  thumb: {
    width: 60,
    height: 34,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: Colors.surface,
  },
  thumbOn: {
    borderColor: Colors.text,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: Colors.border,
  },
  thumbAddText: {
    color: Colors.textSecondary,
    fontSize: 20,
    lineHeight: 22,
  },
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
