import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { CropFrame } from '@/components/crop-frame';
import { useRailWidth } from '@/components/side-rail';
import { Button, Field, FormMessage } from '@/components/form';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { EMPTY_GEAR, gearFromExif, type Gear } from '@/lib/exif';
import { cropAndResize, uploadJpeg, type CropRect } from '@/lib/images';
import { createPost } from '@/lib/posts';
import { useSession } from '@/lib/session';

type Picked = { uri: string; width: number; height: number };

/** Largura máxima do arquivo publicado (16:9 → 2048×1152). */
const MAX_WIDTH = 2048;
const FORM_WIDTH = 300;

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
  const crop = useRef<CropRect | null>(null);
  const onCropChange = useCallback((rect: CropRect) => {
    crop.current = rect;
  }, []);

  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      exif: true,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    let { width, height } = asset;
    // No web o seletor às vezes não informa o tamanho.
    if (!width || !height) ({ width, height } = await Image.getSize(asset.uri));
    setPicked({ uri: asset.uri, width, height });
    setGear(gearFromExif(asset.exif));
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
      setStep('Preparando a imagem…');
      const image = await cropAndResize(picked.uri, crop.current, MAX_WIDTH);
      setStep('Enviando…');
      const path = await uploadJpeg('posts', session.user.id, image.uri);
      await createPost({
        image_path: path,
        width: image.width,
        height: image.height,
        title: title.trim(),
        location: location.trim(),
        camera: gear.camera.trim(),
        lens: gear.lens.trim(),
        focal_length: gear.focal_length.trim(),
        aperture: gear.aperture.trim(),
        shutter: gear.shutter.trim(),
        iso: gear.iso.trim(),
      });
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
          Escolha uma foto. Você enquadra em 16:9 e a ficha técnica (câmera, lente, abertura, velocidade e ISO) é
          preenchida a partir da própria foto.
        </Text>
        <Button title="Escolher foto" onPress={pick} />
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
        {frameWidth > 0 ? (
          <CropFrame
            key={picked.uri}
            uri={picked.uri}
            imageWidth={picked.width}
            imageHeight={picked.height}
            width={frameWidth}
            onCropChange={onCropChange}
          />
        ) : null}
        <View style={styles.previewActions}>
          <Button variant="ghost" title="Trocar foto" onPress={pick} disabled={busy} />
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
