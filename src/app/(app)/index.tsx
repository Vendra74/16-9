import { useState } from 'react';
import { FlatList, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { PostCard } from '@/components/post-card';
import { Colors, FrameRatio } from '@/constants/theme';
import { MOCK_FEED } from '@/data/mock-feed';

/**
 * Feed: um trabalho por vez, na maior moldura 16:9 que cabe ao lado do
 * trilho. Deslize para cima para o próximo.
 */
export default function FeedScreen() {
  const [area, setArea] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };

  const frameW = Math.min(area.width, area.height * FrameRatio);
  const frameH = frameW / FrameRatio;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {area.height > 0 && (
        <FlatList
          data={MOCK_FEED}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: area.height, offset: area.height * index, index })}
          renderItem={({ item }) => (
            <View style={[styles.page, { height: area.height }]}>
              <PostCard post={item} width={frameW} height={frameH} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: Colors.background,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
