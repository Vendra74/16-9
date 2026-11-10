import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { ApertureLoader } from '@/components/aperture';
import { CommentsPanel } from '@/components/comments-panel';
import { Button } from '@/components/form';
import { PeoplePicker } from '@/components/people-picker';
import { PostCard } from '@/components/post-card';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { sendMessage, startConversation } from '@/lib/messages';
import { like, unlike } from '@/lib/likes';
import { askModeration } from '@/lib/moderation';
import { fetchFeed, type FeedPost } from '@/lib/posts';
import { useSession } from '@/lib/session';

/**
 * Feed: um trabalho por vez, na maior moldura 16:9 que cabe ao lado do
 * trilho. Deslize para cima para o próximo; puxe no topo para atualizar.
 */
export default function FeedScreen() {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState<FeedPost | null>(null);
  const [commenting, setCommenting] = useState<FeedPost | null>(null);
  const { session } = useSession();
  const me = session?.user.id;

  const load = useCallback(async () => {
    try {
      setPosts(await fetchFeed());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  // Recarrega sempre que a aba volta a aparecer (ex.: depois de publicar).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function messageAuthor(post: FeedPost) {
    try {
      const c = await startConversation(post.user_id);
      router.navigate({ pathname: '/messages', params: { c } });
    } catch (e) {
      Alert.alert('Não foi possível abrir a conversa', e instanceof Error ? e.message : undefined);
    }
  }

  async function shareTo(post: FeedPost, personId: string) {
    setSharing(null);
    try {
      const c = await startConversation(personId);
      await sendMessage(c, '', post.id);
      router.navigate({ pathname: '/messages', params: { c } });
    } catch (e) {
      Alert.alert('Não foi possível enviar', e instanceof Error ? e.message : undefined);
    }
  }

  /** Curtida otimista: a claquete bate na hora e volta se o servidor recusar. */
  function setLiked(postId: string, liked: boolean) {
    setPosts((list) =>
      list?.map((p) =>
        p.id === postId
          ? {
              ...p,
              my_like: liked && me ? [{ user_id: me }] : [],
              like_count: Math.max(0, p.like_count + (liked ? 1 : -1)),
            }
          : p,
      ) ?? null,
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
    setPosts((list) =>
      list?.map((p) => (p.id === postId ? { ...p, comment_count: Math.max(0, p.comment_count + delta) } : p)) ?? null,
    );
  }

  function more(post: FeedPost) {
    const name = post.author?.display_name || post.author?.username || 'esta pessoa';
    askModeration({ id: post.user_id, name }, { postId: post.id }, load);
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };

  const frameW = Math.min(area.width, area.height * FrameRatio);
  const frameH = frameW / FrameRatio;

  let content = null;
  if (posts === null) {
    content = error ? (
      <Empty title="Sem conexão" text="Não foi possível carregar o feed.">
        <Button variant="ghost" title="Tentar de novo" onPress={load} />
      </Empty>
    ) : (
      <ApertureLoader />
    );
  } else if (posts.length === 0) {
    content = (
      <Empty title="O feed está esperando o primeiro frame" text="Publique uma foto em 16:9 e ela aparece aqui para todo mundo.">
        <Button title="Publicar" onPress={() => router.navigate('/publish')} />
      </Empty>
    );
  } else if (area.height > 0) {
    content = (
      <FlatList
        style={styles.list}
        data={posts}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.silver} />}
        getItemLayout={(_, index) => ({ length: area.height, offset: area.height * index, index })}
        renderItem={({ item }) => (
          <View style={[styles.page, { height: area.height }]}>
            <PostCard
              post={item}
              width={frameW}
              height={frameH}
              isMine={item.user_id === me}
              liked={item.my_like.length > 0}
              onLike={() => toggleLike(item)}
              onComment={() => setCommenting(item)}
              onMessage={() => messageAuthor(item)}
              onShare={() => setSharing(item)}
              onMore={() => more(item)}
            />
          </View>
        )}
      />
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {content}
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

function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {children}
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
  list: {
    alignSelf: 'stretch',
  },
  // A moldura encosta no trilho: a sobra fica à direita, do mesmo tamanho do trilho.
  page: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 420,
    marginBottom: Spacing.sm,
  },
});
