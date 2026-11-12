import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { SplashOverlay } from '@/components/splash-overlay';
import { Colors } from '@/constants/theme';
import { loadLanguage, useLanguage } from '@/lib/i18n';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: Colors.background, card: Colors.background },
};

export default function RootLayout() {
  return (
    <SessionProvider>
      <ThemeProvider value={theme}>
        <StatusBar hidden />
        {/* Android: esconde a barra de botões do sistema; um deslize na borda a mostra por um instante. */}
        <NavigationBar hidden style="light" />
        <RootNavigator />
        <SplashOverlay />
      </ThemeProvider>
    </SessionProvider>
  );
}

/** Sem sessão, só a tela de entrada existe; com sessão, o app inteiro. */
function RootNavigator() {
  const { session, loading } = useSession();
  const { language, loaded } = useLanguage();

  useEffect(() => {
    loadLanguage();
  }, []);

  // A abertura com o diafragma cobre a tela enquanto a sessão e o idioma salvos são lidos.
  if (loading || !loaded) return <View style={styles.blank} />;

  // A chave remonta as telas quando o idioma muda, para todos os textos saírem no idioma novo.
  return (
    <Stack key={language} screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
