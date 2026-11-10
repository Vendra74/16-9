import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { ApertureLoader } from '@/components/aperture';
import { Button } from '@/components/form';
import { PostCard } from '@/components/post-card';
import { Colors, FrameRatio, Spacing } from '@/constants/theme';
import { fetchFeed, type FeedPost } from '@/lib/posts';

/**
 * Feed: um trabalho por vez, na maior moldura 16:9 que cabe ao lado do
 * trilho. Deslize para cima para o próximo; puxe no topo para atualizar.
 */
export default function FeedScreen() {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
            <PostCard post={item} width={frameW} height={frameH} />
          </View>
        )}
      />
    );
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {content}
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
