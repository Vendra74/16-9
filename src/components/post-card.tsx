import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { Colors, Spacing } from '@/constants/theme';
import { settingsLine } from '@/lib/exif';
import { postImageUrl, type FeedPost } from '@/lib/posts';

/**
 * Um trabalho no feed, ocupando a moldura 16:9 inteira.
 * Um toque mostra ou esconde as informações; a imagem é a protagonista.
 */
export function PostCard({ post, width, height }: { post: FeedPost; width: number; height: number }) {
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const name = post.author?.display_name || post.author?.username || 'Alguém';
  const settings = settingsLine(post);
  const gear = [post.camera, post.lens, settings].filter(Boolean).join(' · ');
  const hasCaption = Boolean(post.title || post.location || gear);

  return (
    <Pressable style={[styles.frame, { width, height }]} onPress={() => setShowInfo((v) => !v)}>
      <Image
        source={{ uri: postImageUrl(post) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
        recyclingKey={post.id}
        onLoad={() => setLoaded(true)}
        accessibilityLabel={post.title || `Foto de ${name}`}
      />

      {!loaded && (
        <View style={styles.loader}>
          <ApertureLoader size={44} background={Colors.surface} />
        </View>
      )}

      {showInfo && (
        <>
          <View style={styles.top}>
            <Avatar name={name} url={post.author?.avatar_url} size={34} />
            <View>
              <Text style={styles.author}>{name}</Text>
              <Text style={styles.meta}>
                {[post.author && `@${post.author.username}`, post.author?.specialty].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>

          {hasCaption && (
            <View style={styles.bottom}>
              {post.title ? <Text style={styles.title}>{post.title}</Text> : null}
              {post.location ? <Text style={styles.meta}>{post.location}</Text> : null}
              {gear ? <Text style={styles.gear}>{gear}</Text> : null}
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

const styles = StyleSheet.create({
  frame: {
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  author: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    ...shadow,
  },
  meta: {
    color: Colors.silver,
    fontSize: 11,
    ...shadow,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 2,
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    ...shadow,
  },
  gear: {
    color: Colors.silver,
    fontSize: 11,
    marginTop: 2,
    ...shadow,
  },
});
