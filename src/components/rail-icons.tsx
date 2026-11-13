import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = { color: string; size?: number };

/** Feed: um quadro 16:9 com o "play". */
export function FeedIcon({ color, size = 26 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={6} width={20} height={11.25} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Path d="M10.25 9.4v4.45l3.85-2.22-3.85-2.23Z" fill={color} />
    </Svg>
  );
}

export function ExploreIcon({ color, size = 26 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.5} stroke={color} strokeWidth={1.8} />
      <Path d="m16 16 4.5 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function PublishIcon({ color, size = 26 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={6} width={20} height={11.25} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Path d="M12 8.6v6.05M8.98 11.62h6.05" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function ProfileIcon({ color, size = 26 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.5} r={3.8} stroke={color} strokeWidth={1.8} />
      <Path d="M4.5 20c1.2-3.6 4.1-5.4 7.5-5.4s6.3 1.8 7.5 5.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function MessagesIcon({ color, size = 26 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 17.5V6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Enviar: um avião de papel. */
export function SendIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/** Balão com linhas de texto: comentar (o balão liso é a mensagem direta). */
export function CommentIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4.5 3.5V17H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M7.5 9.3h9M7.5 12.7h5.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/** Alto-falante: com ondas (som ligado) ou com um X (mudo). */
export function SoundIcon({ color, size = 22, muted = false }: IconProps & { muted?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4v-5Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      {muted ? (
        <Path d="m16 9.5 5 5m0-5-5 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      ) : (
        <Path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      )}
    </Svg>
  );
}

export function MoreIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={5} cy={12} r={1.8} />
      <Circle cx={12} cy={12} r={1.8} />
      <Circle cx={19} cy={12} r={1.8} />
    </Svg>
  );
}

export function BackIcon({ color, size = 26 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 5.5 8 12l6.5 6.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Microfone: gravar mensagem de voz. */
export function MicIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Tocar (triângulo) ou pausar (duas barras). */
export function PlayIcon({ color, size = 22, playing = false }: IconProps & { playing?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      {playing ? <Path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <Path d="M8 4.8v14.4a.6.6 0 0 0 .92.5l11.1-7.2a.6.6 0 0 0 0-1L8.92 4.3A.6.6 0 0 0 8 4.8Z" />}
    </Svg>
  );
}

/**
 * Marcador de uma mensagem enviada. Uma seta para cima: saiu daqui. Com a
 * seta para baixo ao lado: chegou do outro lado. A cor (azul) diz que foi lida.
 */
export function ReceiptIcon({ color, size = 14, both }: IconProps & { both: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={both ? 'M8 20V5M3.5 9.5 8 5l4.5 4.5' : 'M12 20V5M7.5 9.5 12 5l4.5 4.5'}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {both ? (
        <Path d="M17 4v15M12.5 14.5 17 19l4.5-4.5" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </Svg>
  );
}
