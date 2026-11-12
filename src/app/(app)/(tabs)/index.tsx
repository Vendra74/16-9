import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApertureLoader } from '@/components/aperture';
import { Button } from '@/components/form';
import { PostList } from '@/components/post-list';
import { Colors, Spacing } from '@/constants/theme';
import { fetchFeed, type FeedPost } from '@/lib/posts';
import { t } from '@/lib/i18n';

/**
 * Feed: um trabalho por vez, na maior moldura 16:9 que cabe ao lado do
 * trilho. Deslize para cima para o próximo; puxe no topo para atualizar.
 */
export default function FeedScreen() {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState(false);
  const waiting = posts?.some((p) => p.status === 'processing') ?? false;

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

  // Enquanto um vídeo seu está sendo processado, confere de tempos em tempos se ficou pronto.
  useFocusEffect(
    useCallback(() => {
      if (!waiting) return;
      const timer = setInterval(load, 5000);
      return () => clearInterval(timer);
    }, [waiting, load]),
  );

  if (posts === null) {
    return (
      <View style={styles.container}>
        {error ? (
          <Empty title={t('Sem conexão')} text={t('Não foi possível carregar o feed.')}>
            <Button variant="ghost" title={t('Tentar de novo')} onPress={load} />
          </Empty>
        ) : (
          <ApertureLoader />
        )}
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.container}>
        <Empty title={t('O feed está esperando o primeiro frame')} text={t('Publique uma foto em 16:9 e ela aparece aqui para todo mundo.')}>
          <Button title={t('Publicar')} onPress={() => router.navigate('/publish')} />
        </Empty>
      </View>
    );
  }

  return (
    <PostList
      posts={posts}
      onChange={(update) => setPosts((list) => (list ? update(list) : list))}
      onBlocked={load}
      onRefresh={load}
    />
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
