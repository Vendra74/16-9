import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { ClapperButton } from '@/components/clapper-button';
import { CommentIcon, MessagesIcon, MoreIcon, SendIcon } from '@/components/rail-icons';
import { Colors, Spacing } from '@/constants/theme';
import { settingsLine } from '@/lib/exif';
import { postImageUrl, type FeedPost } from '@/lib/posts';

/**
 * Um trabalho no feed, ocupando a moldura 16:9 inteira.
 * Um toque mostra ou esconde as informações; a imagem é a protagonista.
 */
type Props = {
  post: FeedPost;
  width: number;
  height: number;
  isMine: boolean;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
  onMessage: () => void;
  onShare: () => void;
  onMore: () => void;
};

export function PostCard({ post, width, height, isMine, liked, onLike, onComment, onMessage, onShare, onMore }: Props) {
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
            <View style={styles.flex}>
              <Text style={styles.author}>{name}</Text>
              <Text style={styles.meta}>
                {[post.author && `@${post.author.username}`, post.author?.specialty].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {!isMine ? (
              <Pressable onPress={onMore} hitSlop={10} accessibilityLabel="Denunciar ou bloquear">
                <MoreIcon color={Colors.text} />
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.bottom, !hasCaption && styles.bottomBare]}>
            <View style={styles.caption}>
              {post.title ? <Text style={styles.title}>{post.title}</Text> : null}
              {post.location ? <Text style={styles.meta}>{post.location}</Text> : null}
              {gear ? <Text style={styles.gear}>{gear}</Text> : null}
            </View>
            <View style={styles.actions}>
              <ClapperButton liked={liked} count={post.like_count} onToggle={onLike} size={24} />
              <Pressable
                style={styles.action}
                onPress={onComment}
                hitSlop={8}
                accessibilityLabel={`Comentar, ${post.comment_count} comentários`}>
                <CommentIcon color={Colors.text} size={24} />
                <Text style={styles.actionText}>{post.comment_count > 0 ? post.comment_count : 'Comentar'}</Text>
              </Pressable>
              {!isMine ? (
                <Pressable style={styles.action} onPress={onMessage} hitSlop={8} accessibilityLabel={`Mandar mensagem para ${name}`}>
                  <MessagesIcon color={Colors.text} size={24} />
                  <Text style={styles.actionText}>Mensagem</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.action} onPress={onShare} hitSlop={8} accessibilityLabel="Enviar para alguém">
                <SendIcon color={Colors.text} size={24} />
                <Text style={styles.actionText}>Enviar</Text>
              </Pressable>
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
  bottomBare: {
    backgroundColor: 'transparent',
  },
  caption: {
    flex: 1,
    gap: 2,
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
    fontSize: 10,
    fontWeight: '600',
    ...shadow,
  },
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
  flex: {
    flex: 1,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
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
