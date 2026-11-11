import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FrameRatio } from '@/constants/theme';
import { settingsLine } from '@/lib/exif';
import { postImageUrl, type FeedPost } from '@/lib/posts';

type Props = {
  post: FeedPost;
  width: number;
  /** Mostra de quem é o trabalho e quantas curtidas tem (no Explorar). */
  showAuthor?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

/** Um trabalho em miniatura 16:9, para as grades do Explorar e dos perfis. */
export function WorkTile({ post, width, showAuthor, onPress, onLongPress }: Props) {
  const name = post.author?.display_name || post.author?.username || 'Alguém';
  const title = post.title || post.location || settingsLine(post);
  const likes = post.like_count === 1 ? '1 curtida' : `${post.like_count} curtidas`;
  return (
    <Pressable
      style={({ pressed }) => [{ width }, styles.tile, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${post.kind === 'video' ? 'Vídeo' : 'Foto'} de ${name}${post.title ? `: ${post.title}` : ''}`}>
      <View>
        <Image
          source={{ uri: postImageUrl(post) }}
          style={[styles.image, { width }]}
          contentFit="cover"
          transition={200}
          recyclingKey={post.id}
        />
        {post.kind === 'video' ? (
          <Text style={styles.tag}>
            {post.status === 'processing' ? 'Processando…' : post.status === 'failed' ? 'Falhou' : 'Vídeo'}
          </Text>
        ) : null}
      </View>
      {showAuthor ? (
        <>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.caption} numberOfLines={1}>
            {[title, post.like_count > 0 ? likes : ''].filter(Boolean).join(' · ') || ' '}
          </Text>
        </>
      ) : (
        <Text style={styles.caption} numberOfLines={1}>
          {title || ' '}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    gap: 3,
  },
  pressed: {
    opacity: 0.7,
  },
  image: {
    aspectRatio: FrameRatio,
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
  name: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  caption: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
});
