import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { ExploreIcon, FeedIcon, MessagesIcon, ProfileIcon, PublishIcon } from '@/components/rail-icons';
import { RailButton, RailSpacer, useRailStyle } from '@/components/side-rail';
import { Colors } from '@/constants/theme';
import { InboxProvider, useInbox } from '@/lib/inbox';
import { registerForPush, usePushNavigation } from '@/lib/push';

/** Área logada: trilho lateral de navegação + a tela atual. */
export default function AppLayout() {
  return (
    <InboxProvider>
      <AppTabs />
    </InboxProvider>
  );
}

function AppTabs() {
  const railStyle = useRailStyle();
  const { unreadCount } = useInbox();

  // Ao entrar na área logada: registra o aparelho para notificações e trata o toque nelas.
  useEffect(() => {
    registerForPush();
  }, []);
  usePushNavigation();

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
        <RailSpacer />
        <TabTrigger name="publish" href="/publish" asChild>
          <RailButton label="Publicar" route="/publish" Icon={PublishIcon} />
        </TabTrigger>
        <TabTrigger name="messages" href="/messages" asChild>
          <RailButton label="Mensagens" route="/messages" Icon={MessagesIcon} badge={unreadCount > 0} />
        </TabTrigger>
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
