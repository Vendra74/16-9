import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Button } from '@/components/form';
import { PostList } from '@/components/post-list';
import { Colors, Spacing } from '@/constants/theme';
import { fetchFeed, fetchFollowingFeed, type FeedPost } from '@/lib/posts';
import { t } from '@/lib/i18n';

/**
 * Feed: um trabalho por vez, na maior moldura 16:9 que cabe ao lado do
 * trilho. Deslize para cima para o próximo; puxe no topo para atualizar.
 */
type Mode = 'all' | 'following';

export default function FeedScreen() {
  const [mode, setMode] = useState<Mode>('all');
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [error, setError] = useState(false);
  const waiting = posts?.some((p) => p.status === 'processing') ?? false;

  const load = useCallback(async () => {
    try {
      setPosts(mode === 'following' ? await fetchFollowingFeed() : await fetchFeed());
      setError(false);
    } catch {
      setError(true);
    }
  }, [mode]);

  function switchTo(next: Mode) {
    if (next === mode) return;
    setPosts(null);
    setError(false);
    setMode(next);
  }

  return (
    <View style={styles.screen}>
      <Body mode={mode} posts={posts} error={error} waiting={waiting} load={load} setPosts={setPosts} />
      <ModeSwitch mode={mode} onChange={switchTo} />
    </View>
  );
}

/** "Para você" (todo mundo) ou "Seguindo" (só quem você segue), por cima do feed. */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const insets = useSafeAreaInsets();
  const options: { value: Mode; label: string }[] = [
    { value: 'all', label: t('Para você') },
    { value: 'following', label: t('Seguindo') },
  ];
  return (
    <View style={[styles.switchWrap, { top: Math.max(insets.top, Spacing.sm) + 6 }]} pointerEvents="box-none">
      <View style={styles.switch}>
        {options.map((option) => {
          const selected = option.value === mode;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.switchItem, selected && styles.switchItemSelected]}>
              <Text style={[styles.switchText, selected && styles.switchTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type BodyProps = {
  mode: Mode;
  posts: FeedPost[] | null;
  error: boolean;
  waiting: boolean;
  load: () => Promise<void>;
  setPosts: React.Dispatch<React.SetStateAction<FeedPost[] | null>>;
};

function Body({ mode, posts, error, waiting, load, setPosts }: BodyProps) {
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

  if (posts.length === 0 && mode === 'following') {
    return (
      <View style={styles.container}>
        <Empty
          title={t('Siga criadores para ver os trabalhos deles aqui')}
          text={t('Encontre gente no Explorar e toque em Seguir no perfil.')}>
          <Button title={t('Explorar')} onPress={() => router.navigate('/explore')} />
        </Empty>
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
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  switchWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  switch: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  switchItem: {
    paddingVertical: 5,
    paddingHorizontal: Spacing.md,
    borderRadius: 999,
  },
  switchItemSelected: {
    backgroundColor: Colors.text,
  },
  switchText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  switchTextSelected: {
    color: Colors.background,
  },
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
