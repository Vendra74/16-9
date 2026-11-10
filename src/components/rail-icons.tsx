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

export function MoreIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={5} cy={12} r={1.8} />
      <Circle cx={12} cy={12} r={1.8} />
      <Circle cx={19} cy={12} r={1.8} />
    </Svg>
  );
}
