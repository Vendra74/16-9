import { StyleSheet, Text, View } from 'react-native';

import { ApertureLoader } from '@/components/aperture';
import { Frame } from '@/components/frame';
import { Colors, Spacing } from '@/constants/theme';

/** Feed: um trabalho por vez, ocupando a moldura 16:9 inteira. */
export default function FeedScreen() {
  return (
    <Frame>
      <View style={styles.center}>
        <ApertureLoader size={44} background={Colors.surface} />
        <Text style={styles.title}>Seu feed aparece aqui</Text>
        <Text style={styles.subtitle}>Fotos e vídeos em 16:9, um de cada vez, em tela cheia.</Text>
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
});
