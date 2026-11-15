import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApertureLoader } from '@/components/aperture';
import { Button } from '@/components/form';
import { MusicIcon, PlayIcon } from '@/components/rail-icons';
import { Colors, Spacing } from '@/constants/theme';
import { fetchLibrary, moodLabel, pickOwnMusic, type ChosenMusic, type Track } from '@/lib/music';
import { t } from '@/lib/i18n';

type Props = {
  visible: boolean;
  /** A música escolhida até agora (`null` = sem música). */
  music: ChosenMusic | null;
  onChange: (music: ChosenMusic | null) => void;
  /** Só vídeo tem som original para regular. */
  isVideo: boolean;
  videoVolume: number;
  onVideoVolume: (volume: number) => void;
  onClose: () => void;
};

const PLAYBACK = { allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix' } as const;
const MUSIC_STEPS = [0.25, 0.5, 0.75, 1];
const VIDEO_STEPS = [0, 0.25, 0.5, 0.75, 1];

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function percent(volume: number) {
  return volume === 0 ? t('Mudo') : `${Math.round(volume * 100)}%`;
}

/**
 * Escolha da música de fundo, no Publicar: a lista da biblioteca, a opção de
 * enviar um arquivo próprio, o trecho onde a música começa e os volumes.
 * Tocar numa faixa já toca a prévia.
 */
export function MusicPanel({ visible, music, onChange, isVideo, videoVolume, onVideoVolume, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [library, setLibrary] = useState<Track[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const source = music?.url ?? music?.localUri ?? null;

  useEffect(() => {
    if (!visible || library) return;
    let active = true;
    fetchLibrary()
      .then((list) => active && (setLibrary(list), setFailed(false)))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [visible, library, attempt]);

  // Troca a música da prévia quando a escolha muda.
  useEffect(() => {
    if (!source) {
      player.pause();
      return;
    }
    player.replace({ uri: source });
  }, [player, source]);

  // Fechou o painel: a prévia para.
  useEffect(() => {
    if (!visible) player.pause();
  }, [visible, player]);

  // O player do expo-audio é controlado por atribuição direta; é a API dele.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    player.volume = music?.volume ?? 1;
    player.loop = true;
  }, [player, music?.volume]);
  /* eslint-enable react-hooks/immutability */

  // Arquivo próprio: a duração só se sabe depois de carregar.
  useEffect(() => {
    if (music && status.isLoaded && status.duration > 0 && Math.abs(music.duration - status.duration) > 0.5) {
      onChange({ ...music, duration: status.duration, start: Math.min(music.start, Math.max(0, status.duration - 5)) });
    }
  }, [music, status.isLoaded, status.duration, onChange]);

  async function listen(from: number) {
    await setAudioModeAsync(PLAYBACK).catch(() => {});
    await player.seekTo(from).catch(() => {});
    player.play();
  }

  function stop() {
    player.pause();
  }

  function chooseTrack(track: Track) {
    if (music?.url === track.url) {
      if (playing) stop();
      else listen(music.start);
      return;
    }
    onChange({ url: track.url, title: track.title, artist: track.artist, duration: track.duration, start: 0, volume: music?.volume ?? 1 });
    // A prévia começa assim que a faixa nova carregar.
    setTimeout(() => listen(0), 300);
  }

  async function chooseOwn() {
    stop();
    const own = await pickOwnMusic();
    if (own) onChange({ ...own, volume: music?.volume ?? 1 });
  }

  function moveStart(delta: number) {
    if (!music) return;
    const max = music.duration > 0 ? Math.max(0, music.duration - 5) : 3600;
    const start = Math.min(max, Math.max(0, music.start + delta));
    onChange({ ...music, start });
    if (playing) listen(start);
  }

  const own = Boolean(music && !music.url);
  return (
    <Modal visible={visible} animationType="fade" transparent supportedOrientations={['landscape']} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { marginTop: Math.max(insets.top, Spacing.md) }]}>
          <View style={styles.header}>
            <MusicIcon color={Colors.text} size={20} />
            <Text style={styles.title}>{t('Música de fundo')}</Text>
            <View style={styles.flex} />
            <Button variant="ghost" title={t('Pronto')} onPress={onClose} />
          </View>

          <View style={styles.body}>
            <View style={styles.listColumn}>
              <Pressable style={[styles.row, !music && styles.rowOn]} onPress={() => onChange(null)} accessibilityRole="button">
                <Text style={styles.rowTitle}>{t('Sem música')}</Text>
              </Pressable>
              <Pressable style={[styles.row, own && styles.rowOn]} onPress={chooseOwn} accessibilityRole="button">
                <View style={styles.flex}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {own && music ? music.title : t('Enviar minha música')}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {own ? t('Arquivo seu · tocar de novo para trocar') : t('MP3, M4A ou WAV, só com os direitos de uso')}
                  </Text>
                </View>
              </Pressable>
              <Text style={styles.section}>{t('Biblioteca do 16:9 · livre de direitos')}</Text>
              {library ? (
                <FlatList
                  data={library}
                  keyExtractor={(track) => track.id}
                  renderItem={({ item }) => {
                    const on = music?.url === item.url;
                    return (
                      <Pressable
                        style={[styles.row, on && styles.rowOn]}
                        onPress={() => chooseTrack(item)}
                        accessibilityRole="button"
                        accessibilityLabel={t('{title}, {mood}', { title: item.title, mood: moodLabel(item.mood) })}>
                        <PlayIcon color={on ? Colors.text : Colors.textSecondary} size={16} playing={on && playing} />
                        <View style={styles.flex}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {moodLabel(item.mood)} · {clock(item.duration)}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  }}
                />
              ) : failed ? (
                <View style={styles.center}>
                  <Text style={styles.rowMeta}>{t('Não foi possível carregar as músicas.')}</Text>
                  <Button variant="ghost" title={t('Tentar de novo')} onPress={() => setAttempt((n) => n + 1)} />
                </View>
              ) : (
                <View style={styles.center}>
                  <ApertureLoader size={28} />
                </View>
              )}
            </View>

            <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
              {music ? (
                <>
                  <Text style={styles.label}>{t('Começa em {time}', { time: clock(music.start) })}</Text>
                  <View style={styles.steps}>
                    {[-10, -1, 1, 10].map((delta) => (
                      <Pressable key={delta} style={styles.step} onPress={() => moveStart(delta)} accessibilityRole="button">
                        <Text style={styles.stepText}>{delta > 0 ? `+${delta}s` : `${delta}s`}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    style={styles.listen}
                    onPress={() => (playing ? stop() : listen(music.start))}
                    accessibilityRole="button"
                    accessibilityLabel={playing ? t('Parar a prévia') : t('Ouvir deste ponto')}>
                    <PlayIcon color={Colors.background} size={16} playing={playing} />
                    <Text style={styles.listenText}>{playing ? t('Parar') : t('Ouvir deste ponto')}</Text>
                  </Pressable>

                  <Text style={styles.label}>{t('Volume da música')}</Text>
                  <View style={styles.steps}>
                    {MUSIC_STEPS.map((v) => (
                      <Pressable
                        key={v}
                        style={[styles.step, music.volume === v && styles.stepOn]}
                        onPress={() => onChange({ ...music, volume: v })}
                        accessibilityRole="button">
                        <Text style={[styles.stepText, music.volume === v && styles.stepTextOn]}>{percent(v)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.rowMeta}>{t('Escolha uma faixa da biblioteca ou envie uma música sua.')}</Text>
              )}

              {isVideo ? (
                <>
                  <Text style={styles.label}>{t('Som original do vídeo')}</Text>
                  <View style={styles.steps}>
                    {VIDEO_STEPS.map((v) => (
                      <Pressable
                        key={v}
                        style={[styles.step, videoVolume === v && styles.stepOn]}
                        onPress={() => onVideoVolume(v)}
                        accessibilityRole="button">
                        <Text style={[styles.stepText, videoVolume === v && styles.stepTextOn]}>{percent(v)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
  },
  sheet: {
    width: 680,
    maxWidth: '94%',
    flex: 1,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  listColumn: {
    flex: 1,
    gap: 4,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: Spacing.sm,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: Spacing.sm,
    borderRadius: 10,
  },
  rowOn: {
    backgroundColor: Colors.surfaceRaised,
  },
  rowTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  controls: {
    width: 240,
    flexGrow: 0,
  },
  controlsContent: {
    gap: Spacing.sm,
  },
  label: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  steps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  step: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepOn: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  stepText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stepTextOn: {
    color: Colors.background,
  },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: Colors.text,
  },
  listenText: {
    color: Colors.background,
    fontSize: 13,
    fontWeight: '700',
  },
});
