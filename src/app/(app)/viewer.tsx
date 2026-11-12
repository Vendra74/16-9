import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PostList } from '@/components/post-list';
import { BackRail } from '@/components/side-rail';
import { Colors } from '@/constants/theme';
import { viewerContent } from '@/lib/viewer';

/**
 * Trabalhos em tela cheia, abertos a partir do Explorar ou de um perfil:
 * começa no escolhido e segue pelos outros da mesma lista, como no feed.
 */
export default function ViewerScreen() {
  const [content] = useState(viewerContent);
  const [posts, setPosts] = useState(content?.posts ?? []);

  // Sem lista (ex.: a página foi recarregada no navegador), volta para o Explorar.
  if (!content || posts.length === 0) return <Redirect href="/explore" />;

  function hideAuthor(userId: string) {
    const rest = posts.filter((p) => p.user_id !== userId);
    if (rest.length === 0 && router.canGoBack()) router.back();
    else setPosts(rest);
  }

  return (
    <View style={styles.screen}>
      <BackRail />
      <PostList posts={posts} onChange={(update) => setPosts(update)} onBlocked={hideAuthor} startId={content.startId} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
});
