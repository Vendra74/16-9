import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase();
}

/** Foto de perfil redonda; sem foto, as iniciais do nome. */
export function Avatar({ name, url, size }: { name: string; url?: string | null; size: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.circle, box]}>
      {url ? (
        <Image source={{ uri: url }} style={box} contentFit="cover" transition={200} />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.silver,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: Colors.text,
    fontWeight: '700',
  },
});
