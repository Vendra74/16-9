import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ApertureLoader } from '@/components/aperture';
import { Colors, Spacing } from '@/constants/theme';
import type { Post } from '@/data/mock-feed';

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} mil` : String(n);
}

function initials(name: string) {
  const parts = name.split(' ');
  return (parts[0][0] + (parts.at(-1)?.[0] ?? '')).toUpperCase();
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"
        fill={filled ? Colors.text : 'none'}
        stroke={Colors.text}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CommentIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 18.5V6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5l-4 2Z"
        stroke={Colors.text}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Um trabalho no feed, ocupando a moldura 16:9 inteira.
 * Um toque mostra ou esconde as informações; a imagem é a protagonista.
 */
export function PostCard({ post, width, height }: { post: Post; width: number; height: number }) {
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [liked, setLiked] = useState(false);

  return (
    <Pressable style={[styles.frame, { width, height }]} onPress={() => setShowInfo((v) => !v)}>
      <Image
        source={{ uri: post.imageUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
        recyclingKey={post.id}
        onLoad={() => setLoaded(true)}
        accessibilityLabel={post.title}
      />

      {!loaded && (
        <View style={styles.loader}>
          <ApertureLoader size={44} background={Colors.surface} />
        </View>
      )}

      {showInfo && (
        <>
          <View style={styles.top}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(post.author.name)}</Text>
            </View>
            <View>
              <Text style={styles.author}>{post.author.name}</Text>
              <Text style={styles.meta}>
                @{post.author.handle} · {post.author.specialty}
              </Text>
            </View>
          </View>

          <View style={styles.bottom}>
            <View style={styles.caption}>
              <Text style={styles.category}>{post.category.toUpperCase()}</Text>
              <Text style={styles.title}>{post.title}</Text>
              <Text style={styles.meta}>{post.location}</Text>
              {post.gear && (
                <Text style={styles.gear}>
                  {post.gear.camera} · {post.gear.lens} · {post.gear.settings}
                </Text>
              )}
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.action} onPress={() => setLiked((v) => !v)} hitSlop={8}>
                <HeartIcon filled={liked} />
                <Text style={styles.actionText}>{formatCount(post.likes + (liked ? 1 : 0))}</Text>
              </Pressable>
              <View style={styles.action}>
                <CommentIcon />
                <Text style={styles.actionText}>{formatCount(post.comments)}</Text>
              </View>
            </View>
          </View>
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
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.silver,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  caption: {
    flex: 1,
    gap: 2,
  },
  category: {
    color: Colors.silver,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    ...shadow,
  },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    ...shadow,
  },
  gear: {
    color: Colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
    ...shadow,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  action: {
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
    ...shadow,
  },
});
