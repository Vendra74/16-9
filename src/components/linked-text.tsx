import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';

/** Endereços com http(s) ou começando por www. Para de capturar na pontuação final. */
const URL = /((?:https?:\/\/|www\.)[^\s<>]+[^\s<>.,;:!?)\]}'"])/gi;

function open(url: string) {
  const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  Linking.openURL(full).catch(() => {});
}

/** Texto de mensagem com os links clicáveis. */
export function LinkedText({ text, style, linkStyle }: { text: string; style?: StyleProp<TextStyle>; linkStyle?: StyleProp<TextStyle> }) {
  // Com o grupo de captura, o split devolve texto e link alternados: os ímpares são links.
  const parts = text.split(URL);
  return (
    <Text style={style}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Text key={index} style={linkStyle} onPress={() => open(part)} accessibilityRole="link" suppressHighlighting>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
