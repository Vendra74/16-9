import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Avatar } from '@/components/avatar';
import { FormMessage } from '@/components/form';
import { WorkTile } from '@/components/work-tile';
import { Colors, Spacing } from '@/constants/theme';
import { fetchExplore, searchPosts, type FeedPost } from '@/lib/posts';
import { searchCreators, type Profile } from '@/lib/profile';
import { useSession } from '@/lib/session';
import { openViewer } from '@/lib/viewer';
import { t } from '@/lib/i18n';

type Sort = 'top' | 'recent';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'top', label: t('Em alta') },
  { key: 'recent', label: t('Recentes') },
];

const GAP = Spacing.sm;
/** Largura mínima de uma miniatura; a grade usa quantas colunas couberem. */
const MIN_TILE = 170;

/**
 * Explorar: os trabalhos mais curtidos e os mais novos de todo mundo, e a
 * busca por criadores (nome, @, especialidade, cidade) e por trabalhos
 * (título, lugar, câmera, lente).
 */
export default function ExploreScreen() {
  const { session } = useSession();
  const me = session?.user.id ?? '';
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('top');
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  /** A busca que produziu o que está na tela ('' = a grade do Explorar). */
  const [shown, setShown] = useState('');
  const [error, setError] = useState(false);
  const [width, setWidth] = useState(0);

  // Carrega ao abrir a aba e a cada mudança; na busca, espera a pessoa parar de digitar.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const q = query.trim();
      const timer = setTimeout(
        async () => {
          try {
            const [works, creators] = await Promise.all([
              q ? searchPosts(q) : fetchExplore(sort),
              q ? searchCreators(q, me) : Promise.resolve([]),
            ]);
            if (!active) return;
            setPosts(works);
            setPeople(creators);
            setShown(q);
            setError(false);
          } catch {
            if (active) setError(true);
          }
        },
        q ? 300 : 0,
      );
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [query, sort, me]),
  );

  const columns = Math.max(2, Math.floor((width + GAP) / (MIN_TILE + GAP)));
  const tile = Math.floor((width - GAP * (columns - 1)) / columns);

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, Spacing.md), paddingRight: Math.max(insets.right, Spacing.lg) }]}>
      <View style={styles.header}>
        <TextInput
          style={styles.search}
          placeholder={t('Buscar criadores e trabalhos')}
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          keyboardAppearance="dark"
          selectionColor={Colors.silver}
          accessibilityLabel={t('Buscar criadores e trabalhos')}
        />
        {query.trim() ? null : (
          <View style={styles.chips}>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => setSort(s.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: sort === s.key }}
                style={[styles.chip, sort === s.key && styles.chipOn]}>
                <Text style={[styles.chipText, sort === s.key && styles.chipTextOn]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <ScrollView
        style={styles.results}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {error ? <FormMessage text={t('Não foi possível carregar. Confira a internet.')} /> : null}

        {posts === null ? (
          error ? null : (
            <View style={styles.center}>
              <ApertureLoader />
            </View>
          )
        ) : (
          <>
            {people.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.heading}>{t('Criadores')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.people}>
                  {people.map((person) => {
                    const name = person.display_name || person.username;
                    return (
                      <Pressable
                        key={person.id}
                        style={({ pressed }) => [styles.person, pressed && styles.pressed]}
                        onPress={() => router.push({ pathname: '/user/[id]', params: { id: person.id } })}
                        accessibilityRole="button"
                        accessibilityLabel={t('Ver o perfil de {name}', { name })}>
                        <Avatar name={name} url={person.avatar_url} size={40} />
                        <View style={styles.personText}>
                          <Text style={styles.personName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.personMeta} numberOfLines={1}>
                            {[`@${person.username}`, person.specialty].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {posts.length > 0 ? (
              <View style={styles.section}>
                {shown ? <Text style={styles.heading}>{t('Trabalhos')}</Text> : null}
                {width > 0 ? (
                  <View style={styles.grid}>
                    {posts.map((post) => (
                      <WorkTile key={post.id} post={post} width={tile} showAuthor onPress={() => openViewer(posts, post.id)} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {posts.length === 0 && people.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>{shown ? t('Nada encontrado para "{query}"', { query: shown }) : t('Ainda não há trabalhos por aqui')}</Text>
                <Text style={styles.emptyText}>
                  {shown
                    ? t('Tente um nome, um @, uma cidade, uma câmera ou uma lente.')
                    : t('Quando alguém publicar, os trabalhos aparecem aqui.')}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingLeft: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  search: {
    flex: 1,
    maxWidth: 440,
    color: Colors.text,
    fontSize: 15,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  chipOn: {
    backgroundColor: Colors.silver,
    borderColor: Colors.silver,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextOn: {
    color: Colors.background,
  },
  results: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  section: {
    gap: Spacing.sm,
  },
  heading: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  people: {
    gap: Spacing.sm,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    maxWidth: 240,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  pressed: {
    backgroundColor: Colors.surfaceRaised,
  },
  personText: {
    flexShrink: 1,
  },
  personName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  personMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GAP,
    rowGap: Spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 420,
  },
});
