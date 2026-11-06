import { DarkTheme, ThemeProvider } from 'expo-router';
import { TabSlot, Tabs } from 'expo-router/ui';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';

import { SideRail } from '@/components/side-rail';
import { SplashOverlay } from '@/components/splash-overlay';
import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: Colors.background, card: Colors.background },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar hidden />
      <Tabs style={styles.root}>
        <SideRail />
        <TabSlot style={styles.content} />
      </Tabs>
      <SplashOverlay />
    </ThemeProvider>
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
