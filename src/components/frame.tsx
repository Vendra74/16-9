import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Colors, FrameRatio } from '@/constants/theme';

/**
 * Moldura 16:9: o maior retângulo 16:9 que cabe na área disponível ao lado
 * do trilho. Todo trabalho publicado é exibido dentro dela.
 */
export function Frame({ children }: { children?: ReactNode }) {
  const [area, setArea] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };

  const frameW = Math.min(area.width, area.height * FrameRatio);
  const frameH = frameW / FrameRatio;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {frameW > 0 && <View style={[styles.frame, { width: frameW, height: frameH }]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  frame: {
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
