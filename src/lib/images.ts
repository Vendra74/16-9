import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type CropRect = { originX: number; originY: number; width: number; height: number };

/** Recorta, reduz para no máximo `maxWidth` e salva em JPEG. */
export async function cropAndResize(uri: string, crop: CropRect | null, maxWidth: number) {
  let ctx = ImageManipulator.manipulate(uri);
  if (crop) ctx = ctx.crop(crop);
  const width = crop?.width ?? maxWidth;
  if (width > maxWidth) ctx = ctx.resize({ width: maxWidth });
  const image = await ctx.renderAsync();
  return image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
}

async function readBytes(uri: string) {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

async function upload(bucket: string, folder: string, uri: string, extension: string, contentType: string) {
  const random = Math.random().toString(36).slice(2, 10);
  const path = `${folder}/${Date.now()}-${random}.${extension}`;
  const body = await readBytes(uri);
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType });
  if (error) throw error;
  return path;
}

/**
 * Copia uma foto ou um áudio de uma conversa para a pasta de outra (encaminhar).
 * Baixa pelo endereço temporário e envia de novo: o servidor só aceita arquivo
 * na pasta da conversa de quem está enviando.
 */
export async function copyMessageFile(path: string, folder: string) {
  const url = await messageImageUrl(path);
  const response = Platform.OS === 'web' ? await fetch(url) : await (await import('expo/fetch')).fetch(url);
  if (!response.ok) throw new Error('download_failed');
  const body = await response.arrayBuffer();
  const extension = path.split('.').pop() || 'jpg';
  const contentType =
    extension === 'jpg' ? 'image/jpeg' : extension === 'webm' ? 'audio/webm' : extension === 'm4a' ? 'audio/mp4' : 'application/octet-stream';
  const random = Math.random().toString(36).slice(2, 10);
  const copy = `${folder}/${Date.now()}-${random}.${extension}`;
  const { error } = await supabase.storage.from('messages').upload(copy, body, { contentType });
  if (error) throw error;
  return copy;
}

/** Envia um JPEG para `<bucket>/<pasta>/<nome>.jpg` e devolve o caminho. */
export function uploadJpeg(bucket: 'posts' | 'avatars' | 'messages', folder: string, uri: string) {
  return upload(bucket, folder, uri, 'jpg', 'image/jpeg');
}

/** Envia uma gravação de voz para a pasta da conversa e devolve o caminho. */
export function uploadVoice(folder: string, uri: string) {
  // O iPhone e o Android gravam em m4a; o navegador, em webm.
  return Platform.OS === 'web'
    ? upload('messages', folder, uri, 'webm', 'audio/webm')
    : upload('messages', folder, uri, 'm4a', 'audio/mp4');
}

/** Endereços temporários das imagens e dos áudios das conversas (bucket privado), guardados enquanto valem. */
const signed = new Map<string, { url: string; expires: number }>();
const SIGNED_SECONDS = 3600;

/** Endereço temporário para abrir uma imagem ou um áudio de conversa. Só funciona para quem está nela. */
export async function messageImageUrl(path: string) {
  const cached = signed.get(path);
  // Renova com folga, para a imagem não expirar no meio do uso.
  if (cached && cached.expires - Date.now() > 5 * 60e3) return cached.url;
  const { data, error } = await supabase.storage.from('messages').createSignedUrl(path, SIGNED_SECONDS);
  if (error) throw error;
  signed.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_SECONDS * 1000 });
  return data.signedUrl;
}

export function publicUrl(bucket: 'posts' | 'avatars', path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
