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

/** Envia um JPEG para `<bucket>/<pasta>/<nome>.jpg` e devolve o caminho. */
export async function uploadJpeg(bucket: 'posts' | 'avatars' | 'messages', folder: string, uri: string) {
  const random = Math.random().toString(36).slice(2, 10);
  const path = `${folder}/${Date.now()}-${random}.jpg`;
  const body = await readBytes(uri);
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

/** Endereços temporários das imagens das conversas (bucket privado), guardados enquanto valem. */
const signed = new Map<string, { url: string; expires: number }>();
const SIGNED_SECONDS = 3600;

/** Endereço temporário para abrir uma imagem de conversa. Só funciona para quem está nela. */
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
