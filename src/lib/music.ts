import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';

import { publicUrl, uploadMusicFile } from '@/lib/images';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

/**
 * Música de fundo dos posts.
 *
 * A música não entra no arquivo do vídeo: o app toca as duas coisas juntas,
 * cada uma no seu volume. Vem da biblioteca do 16:9 (faixas originais, livres
 * de direitos) ou de um arquivo da própria pessoa, que declara ter os direitos.
 */

/** Uma faixa da biblioteca. */
export type Track = {
  id: string;
  title: string;
  artist: string;
  mood: string;
  url: string;
  duration: number;
};

/** A música escolhida para um post, ainda no Publicar. */
export type ChosenMusic = {
  /** Faixa da biblioteca: o endereço dela. */
  url?: string;
  /** Arquivo próprio: onde está no aparelho, até ser enviado. */
  localUri?: string;
  extension?: string;
  contentType?: string;
  title: string;
  artist: string;
  /** Duração da música em segundos (0 = ainda não se sabe). */
  duration: number;
  /** Segundo em que o post começa a tocar. */
  start: number;
  /** De 0 (mudo) a 1. */
  volume: number;
};

/** Arquivos próprios até este tamanho (o mesmo limite do servidor). */
export const MAX_MUSIC_BYTES = 20 * 1024 * 1024;

/** Nome de cada clima, pelo código gravado no banco. */
export function moodLabel(mood: string) {
  const labels: Record<string, string> = {
    epico: t('Épico'),
    calmo: t('Calmo'),
    suspense: t('Suspense'),
    alegre: t('Alegre'),
    melancolico: t('Melancólico'),
    lofi: t('Lo-fi'),
    eletronico: t('Eletrônico'),
    documentario: t('Documentário'),
  };
  return labels[mood] ?? t('Outros');
}

export async function fetchLibrary() {
  const { data, error } = await supabase
    .from('music_tracks')
    .select('id, title, artist, mood, url, duration')
    .order('position')
    .order('title')
    .overrideTypes<Track[], { merge: false }>();
  if (error) throw error;
  return data;
}

/** O endereço da música de um post, venha da biblioteca ou de um arquivo próprio. */
export function postMusicUrl(post: { music_url?: string | null; music_path?: string | null }) {
  if (post.music_url) return post.music_url;
  if (post.music_path) return publicUrl('music', post.music_path);
  return null;
}

/** "Título · Artista", para a legenda do post. */
export function musicLine(music: { title?: string | null; artist?: string | null }) {
  return [music.title, music.artist].filter(Boolean).join(' · ');
}

const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
};

/**
 * Termo de responsabilidade, antes de cada arquivo próprio. Aparece sempre
 * (não só na primeira vez), para ficar claro a cada envio.
 */
function confirmRights() {
  return new Promise<boolean>((resolve) =>
    Alert.alert(
      t('Você tem os direitos desta música?'),
      t(
        'Só use música sua, comprada com licença para redes sociais ou liberada pelo autor. Música de artistas famosos, de streaming ou de outros vídeos, sem licença, viola direitos autorais: o post pode ser removido e a conta suspensa.',
      ),
      [
        { text: t('Cancelar'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: t('Tenho os direitos'),
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

/**
 * Abre os arquivos do aparelho para escolher uma música própria.
 * Devolve `null` se a pessoa desistir ou o arquivo não servir (já avisando o motivo).
 */
export async function pickOwnMusic(): Promise<ChosenMusic | null> {
  if (!(await confirmRights())) return null;
  const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const extension = (asset.name.split('.').pop() || '').toLowerCase();
  const contentType = TYPES[extension];
  if (!contentType) {
    Alert.alert(t('Formato não aceito'), t('Use um arquivo de música em MP3, M4A, AAC ou WAV.'));
    return null;
  }
  if (asset.size && asset.size > MAX_MUSIC_BYTES) {
    Alert.alert(t('Arquivo grande demais'), t('A música pode ter até 20 MB. Um MP3 de 3 minutos costuma ter uns 7 MB.'));
    return null;
  }
  const title = asset.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 120) || t('Minha música');
  return { localUri: asset.uri, extension, contentType, title, artist: '', duration: 0, start: 0, volume: 1 };
}

/** As colunas da música num post novo. */
export type MusicColumns = {
  music_url?: string;
  music_path?: string;
  music_title?: string;
  music_artist?: string;
  music_start?: number;
  music_volume?: number;
};

/** Envia o arquivo próprio (se for o caso) e devolve as colunas do post. */
export async function musicColumns(music: ChosenMusic | null, userId: string): Promise<MusicColumns> {
  if (!music) return {};
  const common = {
    music_title: music.title.slice(0, 120),
    music_artist: music.artist.slice(0, 120),
    music_start: Math.max(0, Math.round(music.start * 10) / 10),
    music_volume: clamp01(music.volume),
  };
  if (music.url) return { ...common, music_url: music.url };
  if (music.localUri && music.extension && music.contentType) {
    const music_path = await uploadMusicFile(userId, music.localUri, music.extension, music.contentType);
    return { ...common, music_path };
  }
  return {};
}

/** Apaga o arquivo de música próprio de um post. */
export async function removeMusicFile(path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from('music').remove([path]);
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}
