import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { Colors, FrameRatio } from '@/constants/theme';
import type { CropRect } from '@/lib/images';
import { t } from '@/lib/i18n';

type Props = {
  uri: string;
  /** Tamanho real da imagem, em pixels. */
  imageWidth: number;
  imageHeight: number;
  /** Largura da moldura na tela. */
  width: number;
  /** Recebe o recorte em pixels da imagem sempre que o enquadramento muda. */
  onCropChange: (crop: CropRect) => void;
};

/**
 * Moldura 16:9 com a foto cobrindo tudo. Arrastar move a foto para
 * escolher o enquadramento; o que fica dentro da moldura é o que será publicado.
 */
export function CropFrame({ uri, imageWidth, imageHeight, width, onCropChange }: Props) {
  const height = width / FrameRatio;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const shownW = imageWidth * scale;
  const shownH = imageHeight * scale;
  const minX = width - shownW;
  const minY = height - shownH;

  // Começa centralizado. (Para outra foto, o componente é recriado com outra `key`.)
  const [rawOffset, setOffset] = useState({ x: minX / 2, y: minY / 2 });
  // Se a moldura mudar de tamanho, mantém a foto cobrindo tudo.
  const offset = {
    x: Math.min(0, Math.max(minX, rawOffset.x)),
    y: Math.min(0, Math.max(minY, rawOffset.y)),
  };
  const start = useRef(offset);
  const latest = useRef(offset);
  useEffect(() => {
    latest.current = offset;
  });

  useEffect(() => {
    const cropW = Math.min(imageWidth, Math.round(width / scale));
    const cropH = Math.min(imageHeight, Math.round(height / scale));
    onCropChange({
      originX: Math.max(0, Math.min(imageWidth - cropW, Math.round(-offset.x / scale))),
      originY: Math.max(0, Math.min(imageHeight - cropH, Math.round(-offset.y / scale))),
      width: cropW,
      height: cropH,
    });
  }, [offset.x, offset.y, scale, width, height, imageWidth, imageHeight, onCropChange]);

  const responder = useMemo(
    () =>
      // Os callbacks só rodam em eventos de toque, nunca durante o render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = latest.current;
        },
        onPanResponderMove: (_, g) => {
          setOffset({
            x: Math.min(0, Math.max(minX, start.current.x + g.dx)),
            y: Math.min(0, Math.max(minY, start.current.y + g.dy)),
          });
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [minX, minY],
  );

  const movable = minX < -1 || minY < -1;

  return (
    <View style={[styles.frame, { width, height }]} {...responder.panHandlers}>
      <Image
        source={{ uri }}
        style={{ position: 'absolute', left: offset.x, top: offset.y, width: shownW, height: shownH }}
        contentFit="fill"
      />
      {/* Terços, como no visor da câmera. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.lineV, { left: width / 3 }]} />
        <View style={[styles.lineV, { left: (2 * width) / 3 }]} />
        <View style={[styles.lineH, { top: height / 3 }]} />
        <View style={[styles.lineH, { top: (2 * height) / 3 }]} />
      </View>
      {movable ? (
        <View pointerEvents="none" style={styles.hintBox}>
          <Text style={styles.hint}>{t('Arraste para enquadrar')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.silver,
  },
  lineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  lineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  hintBox: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hint: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
});
