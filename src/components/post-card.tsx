import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { ClapperButton } from '@/components/clapper-button';
import { CommentIcon, MessagesIcon, MoreIcon, SendIcon, SoundIcon } from '@/components/rail-icons';
import { Colors, Spacing } from '@/constants/theme';
import { settingsLine } from '@/lib/exif';
import { postImageUrl, postImageUrls, type FeedPost } from '@/lib/posts';
import { t } from '@/lib/i18n';

/**
 * Um trabalho no feed, ocupando a moldura 16:9 inteira.
 * Um toque mostra ou esconde as informações; a imagem é a protagonista.
 */
type Props = {
  post: FeedPost;
  width: number;
  height: number;
  isMine: boolean;
  /** É o post na tela agora? Só o post ativo toca vídeo. */
  active: boolean;
  muted: boolean;
  onToggleSound: () => void;
  liked: boolean;
  onLike: () => void;
  /** Toque no número de curtidas: abre a lista de quem curtiu. */
  onLikers: () => void;
  /** Toque na foto ou no nome de quem publicou: abre o perfil. */
  onAuthor: () => void;
  onComment: () => void;
  onMessage: () => void;
  onShare: () => void;
  onMore: () => void;
};

export function PostCard({ post, width, height, isMine, active, muted, onToggleSound, liked, onLike, onLikers, onAuthor, onComment, onMessage, onShare, onMore }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  /** Carrossel: qual foto está na moldura. */
  const [page, setPage] = useState(0);
  const images = postImageUrls(post);
  const carousel = post.kind !== 'video' && images.length > 1;
  const name = post.author?.display_name || post.author?.username || t('Alguém');
  const settings = settingsLine(post);
  const gear = [post.camera, post.lens, settings].filter(Boolean).join(' · ');
  const isVideo = post.kind === 'video';
  const playable = isVideo && post.status === 'ready' && Boolean(post.video_url);
  const hasCaption = Boolean(post.title || post.location || gear);

  return (
    <Pressable style={[styles.frame, { width, height }]} onPress={() => setShowInfo((v) => !v)}>
      {carousel ? (
        // Carrossel: deslizar de lado troca a foto; o toque continua mostrando ou escondendo as informações.
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
          scrollEventThrottle={32}
          onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}>
          {images.map((uri, index) => (
            <Pressable key={uri} onPress={() => setShowInfo((v) => !v)} accessible={false}>
              <Image
                source={{ uri }}
                style={{ width, height }}
                contentFit="cover"
                transition={index === 0 ? 400 : 0}
                onLoad={index === 0 ? () => setLoaded(true) : undefined}
                accessibilityLabel={t('{title}, {n} de {total}', { title: post.title || t('Foto de {name}', { name }), n: index + 1, total: images.length })}
              />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Image
          source={{ uri: postImageUrl(post) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={400}
          recyclingKey={post.id}
          onLoad={() => setLoaded(true)}
          accessibilityLabel={post.title || t('Foto de {name}', { name })}
        />
      )}

      {carousel ? (
        <View style={styles.counter} pointerEvents="none">
          <Text style={styles.counterText}>
            {Math.min(page, images.length - 1) + 1}/{images.length}
          </Text>
        </View>
      ) : null}

      {/* A capa fica por baixo; o vídeo só é montado no post que está na tela. */}
      {playable && active && post.video_url ? <PostVideo uri={post.video_url} muted={muted} width={width} height={height} /> : null}

      {isVideo && !playable ? (
        <View style={styles.loader} pointerEvents="none">
          <Text style={styles.notice}>
            {post.status === 'failed'
              ? t('Não foi possível processar este vídeo. Apague no seu perfil e envie de novo.')
              : t('Processando o vídeo… Ele aparece para todo mundo em instantes.')}
          </Text>
        </View>
      ) : null}

      {!loaded && (
        <View style={styles.loader}>
          <ApertureLoader size={44} background={Colors.surface} />
        </View>
      )}

      {showInfo && (
        <>
          <View style={styles.top} pointerEvents="box-none">
            <Pressable
              style={styles.authorRow}
              onPress={onAuthor}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('Ver o perfil de {name}', { name })}>
              <Avatar name={name} url={post.author?.avatar_url} size={34} />
              <View style={styles.shrink}>
                <Text style={styles.author}>{name}</Text>
                <Text style={styles.meta}>
                  {[post.author && `@${post.author.username}`, post.author?.specialty].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
            <View style={styles.flex} pointerEvents="none" />
            {playable ? (
              <Pressable
                onPress={onToggleSound}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={muted ? t('Ligar o som') : t('Desligar o som')}>
                <SoundIcon color={Colors.text} muted={muted} />
              </Pressable>
            ) : null}
            {!isMine ? (
              <Pressable onPress={onMore} hitSlop={10} accessibilityLabel={t('Denunciar ou bloquear')}>
                <MoreIcon color={Colors.text} />
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.bottom, !hasCaption && styles.bottomBare]} pointerEvents="box-none">
            <View style={styles.caption} pointerEvents="none">
              {post.title ? <Text style={styles.title}>{post.title}</Text> : null}
              {post.location ? <Text style={styles.meta}>{post.location}</Text> : null}
              {gear ? <Text style={styles.gear}>{gear}</Text> : null}
            </View>
            <View style={styles.actions} pointerEvents="box-none">
              <ClapperButton liked={liked} count={post.like_count} onToggle={onLike} onCountPress={onLikers} size={24} />
              <Pressable
                style={styles.action}
                onPress={onComment}
                hitSlop={8}
                accessibilityLabel={t('Comentar, {n} comentários', { n: post.comment_count })}>
                <CommentIcon color={Colors.text} size={24} />
                <Text style={styles.actionText}>{post.comment_count > 0 ? post.comment_count : t('Comentar')}</Text>
              </Pressable>
              {!isMine ? (
                <Pressable style={styles.action} onPress={onMessage} hitSlop={8} accessibilityLabel={t('Mandar mensagem para {name}', { name })}>
                  <MessagesIcon color={Colors.text} size={24} />
                  <Text style={styles.actionText}>{t('Mensagem')}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.action} onPress={onShare} hitSlop={8} accessibilityLabel={t('Enviar para alguém')}>
                <SendIcon color={Colors.text} size={24} />
                <Text style={styles.actionText}>{t('Enviar')}</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

/** O vídeo do post, em laço. Começa mudo; o som é ligado por quem assiste. */
function PostVideo({ uri, muted, width, height }: { uri: string; muted: boolean; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
    // Mudo, não interrompe a música que a pessoa esteja ouvindo.
    p.audioMixingMode = muted ? 'mixWithOthers' : 'auto';
  });

  // Dá o play depois que a tela do vídeo existe (no navegador, antes disso não há o que tocar).
  useEffect(() => {
    player.play();
  }, [player]);

  // O player do expo-video é controlado por atribuição direta; é a API dele.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    player.muted = muted;
    player.audioMixingMode = muted ? 'mixWithOthers' : 'auto';
  }, [player, muted]);
  /* eslint-enable react-hooks/immutability */

  return (
    <VideoView
      player={player}
      // Tamanho explícito: no navegador o vídeo ignora "preencher" e usa o tamanho original.
      style={[styles.video, { width, height }]}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;

const styles = StyleSheet.create({
  counter: {
    position: 'absolute',
    top: Spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  counterText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  shrink: {
    flexShrink: 1,
  },
  authorRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  notice: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 320,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
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
