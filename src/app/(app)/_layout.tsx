import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { ExploreIcon, FeedIcon, ProfileIcon, PublishIcon } from '@/components/rail-icons';
import { RailButton, RailSpacer, useRailStyle } from '@/components/side-rail';
import { Colors } from '@/constants/theme';

/** Área logada: trilho lateral de navegação + a tela atual. */
export default function AppLayout() {
  const railStyle = useRailStyle();

  // O TabList precisa ser filho direto de Tabs, e os TabTrigger filhos
  // diretos do TabList: é assim que o Expo Router descobre as abas.
  return (
    <Tabs style={styles.root}>
      <TabList style={railStyle}>
        <TabTrigger name="index" href="/" asChild>
          <RailButton label="Feed" route="/" Icon={FeedIcon} />
        </TabTrigger>
        <TabTrigger name="explore" href="/explore" asChild>
          <RailButton label="Explorar" route="/explore" Icon={ExploreIcon} />
        </TabTrigger>
        <TabTrigger name="publish" href="/publish" asChild>
          <RailButton label="Publicar" route="/publish" Icon={PublishIcon} />
        </TabTrigger>
        <RailSpacer />
        <TabTrigger name="profile" href="/profile" asChild>
          <RailButton label="Perfil" route="/profile" Icon={ProfileIcon} />
        </TabTrigger>
      </TabList>
      <TabSlot style={styles.content} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
});
