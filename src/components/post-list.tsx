import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { CommentsPanel } from '@/components/comments-panel';
import { PeoplePicker } from '@/components/people-picker';
import { PostCard } from '@/components/post-card';
import { Colors, FrameRatio } from '@/constants/theme';
import { like, unlike } from '@/lib/likes';
import { sendMessage, startConversation } from '@/lib/messages';
import { askModeration } from '@/lib/moderation';
import type { FeedPost } from '@/lib/posts';
import { useSession } from '@/lib/session';
import { openConversation, openMyProfile } from '@/lib/viewer';

/** Um post conta como "na tela" quando mais da metade dele aparece. */
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

type Props = {
  posts: FeedPost[];
  /** Curtidas e comentários mudam a lista de quem a guarda. */
  onChange: (update: (list: FeedPost[]) => FeedPost[]) => void;
  /** Depois que a pessoa bloqueia alguém pelo "…". */
  onBlocked: (userId: string) => void;
  /** Com isto, puxar no topo atualiza. */
  onRefresh?: () => Promise<void>;
  /** Começa neste post em vez do primeiro. */
  startId?: string;
};

/**
 * Trabalhos em sequência: um por vez, na maior moldura 16:9 que cabe,
 * deslizando para cima para o próximo. É o corpo do feed e da tela que abre
 * um trabalho a partir do Explorar ou de um perfil.
 */
export function PostList({ posts, onChange, onBlocked, onRefresh, startId }: Props) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState<FeedPost | null>(null);
  const [commenting, setCommenting] = useState<FeedPost | null>(null);
  const [focused, setFocused] = useState(false);
  const [visibleId, setVisibleId] = useState<string | null>(null);
  // O som vale para a sequência toda: ligou num vídeo, os próximos já tocam com som.
  const [muted, setMuted] = useState(true);
  const { session } = useSession();
  const me = session?.user.id;
  const list = useRef<FlatList<FeedPost>>(null);
  const firstId = posts[0]?.id;
  const startIndex = startId ? Math.max(0, posts.findIndex((p) => p.id === startId)) : 0;
  const [initialIndex] = useState(startIndex);

  // Fora da tela o vídeo para.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Chegou post novo no topo (ex.: você acabou de publicar): volta para o começo.
  useEffect(() => {
    if (firstId && !startId) list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [firstId, startId]);

  // Precisa ser sempre a mesma função: a lista não aceita trocar esse aviso depois de montada.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: { isViewable: boolean; item: FeedPost }[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first) setVisibleId(first.item.id);
  }, []);

  async function refresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  function openAuthor(post: FeedPost) {
    if (post.user_id === me) openMyProfile();
    else router.push({ pathname: '/user/[id]', params: { id: post.user_id } });
  }

  async function messageAuthor(post: FeedPost) {
    try {
      const c = await startConversation(post.user_id);
      openConversation(c);
    } catch (e) {
      Alert.alert('Não foi possível abrir a conversa', e instanceof Error ? e.message : undefined);
    }
  }

  async function shareTo(post: FeedPost, personId: string) {
    setSharing(null);
    try {
      const c = await startConversation(personId);
      await sendMessage(c, '', post.id);
      openConversation(c);
    } catch (e) {
      Alert.alert('Não foi possível enviar', e instanceof Error ? e.message : undefined);
    }
  }

  /** Curtida otimista: a claquete bate na hora e volta se o servidor recusar. */
  function setLiked(postId: string, liked: boolean) {
    onChange((rows) =>
      rows.map((p) =>
        p.id === postId
          ? {
              ...p,
              my_like: liked && me ? [{ user_id: me }] : [],
              like_count: Math.max(0, p.like_count + (liked ? 1 : -1)),
            }
          : p,
      ),
    );
  }

  async function toggleLike(post: FeedPost) {
    if (!me) return;
    const liked = post.my_like.length === 0;
    setLiked(post.id, liked);
    try {
      if (liked) await like(post.id);
      else await unlike(post.id, me);
    } catch {
      setLiked(post.id, !liked);
    }
  }

  function bumpComments(postId: string, delta: number) {
    onChange((rows) =>
      rows.map((p) => (p.id === postId ? { ...p, comment_count: Math.max(0, p.comment_count + delta) } : p)),
    );
  }

  function more(post: FeedPost) {
    const name = post.author?.display_name || post.author?.username || 'esta pessoa';
    askModeration({ id: post.user_id, name }, { postId: post.id }, () => onBlocked(post.user_id));
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };

  const frameW = Math.min(area.width, area.height * FrameRatio);
  const frameH = frameW / FrameRatio;
  const activeId = visibleId ?? posts[initialIndex]?.id;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {area.height > 0 ? (
        <FlatList
          ref={list}
          style={styles.list}
          data={posts}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          initialScrollIndex={initialIndex}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.silver} /> : undefined
          }
          viewabilityConfig={VIEWABILITY}
          onViewableItemsChanged={onViewable}
          getItemLayout={(_, index) => ({ length: area.height, offset: area.height * index, index })}
          renderItem={({ item }) => (
            <View style={[styles.page, { height: area.height }]}>
              <PostCard
                post={item}
                width={frameW}
                height={frameH}
                isMine={item.user_id === me}
                active={focused && item.id === activeId}
                muted={muted}
                onToggleSound={() => setMuted((m) => !m)}
                liked={item.my_like.length > 0}
                onLike={() => toggleLike(item)}
                onAuthor={() => openAuthor(item)}
                onComment={() => setCommenting(item)}
                onMessage={() => messageAuthor(item)}
                onShare={() => setSharing(item)}
                onMore={() => more(item)}
              />
            </View>
          )}
        />
      ) : null}
      <CommentsPanel
        post={commenting}
        onClose={() => setCommenting(null)}
        onCountChange={(delta) => commenting && bumpComments(commenting.id, delta)}
      />
      <PeoplePicker
        visible={sharing !== null}
        title="Enviar para…"
        onPick={(person) => sharing && shareTo(sharing, person.id)}
        onClose={() => setSharing(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.background,
  },
  list: {
    alignSelf: 'stretch',
  },
  // A moldura encosta no trilho: a sobra fica à direita, do mesmo tamanho do trilho.
  page: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
});
