import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';

import { FrameRatio } from '@/constants/theme';
import { cropAndResize, type CropRect } from '@/lib/images';
import { supabase } from '@/lib/supabase';

/** Limite do produto: vídeos de até 1 minuto. */
export const MAX_VIDEO_SECONDS = 60;

/** O maior recorte 16:9 centralizado que cabe em width × height. */
export function centerCrop(width: number, height: number): CropRect {
  if (width / height > FrameRatio) {
    const w = Math.round(height * FrameRatio);
    return { originX: Math.round((width - w) / 2), originY: 0, width: w, height };
  }
  const h = Math.round(width / FrameRatio);
  return { originX: 0, originY: Math.round((height - h) / 2), width, height: h };
}

/** No navegador não há módulo nativo: tira o quadro com <video> + <canvas>. */
function webFrame(uri: string, seconds: number) {
  return new Promise<{ uri: string; width: number; height: number }>((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = uri;
    video.onerror = () => reject(new Error('video_unreadable'));
    video.onloadeddata = () => {
      video.currentTime = Math.min(seconds, Math.max(0, (video.duration || 0) - 0.1));
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      resolve({ uri: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height });
    };
  });
}

/** Sem escolha da pessoa, a capa é um quadro do começo do vídeo. */
export const DEFAULT_COVER_SECONDS = 0.5;

/** Capa do vídeo: o quadro do instante escolhido, recortado em 16:9 e salvo em JPEG. */
export async function makePoster(videoUri: string, maxWidth: number, seconds = DEFAULT_COVER_SECONDS) {
  const frame =
    Platform.OS === 'web'
      ? await webFrame(videoUri, seconds)
      : await VideoThumbnails.getThumbnailAsync(videoUri, { time: Math.round(seconds * 1000), quality: 0.9 });
  return cropAndResize(frame.uri, centerCrop(frame.width, frame.height), maxWidth);
}

/** Pede ao servidor um endereço de envio direto para o Mux. */
export async function requestUpload() {
  const { data, error } = await supabase.functions.invoke<{ upload_id: string; url: string }>('video', {
    body: { action: 'upload' },
  });
  if (error || !data?.url) throw error ?? new Error('upload_unavailable');
  return data;
}

/** Envia o arquivo do vídeo. `onProgress` recebe de 0 a 1. */
export async function uploadVideo(url: string, uri: string, onProgress: (fraction: number) => void) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload_${xhr.status}`)));
      xhr.onerror = () => reject(new Error('upload_failed'));
      xhr.send(blob);
    });
    return;
  }
  // No celular o arquivo vai direto do disco, sem carregar o vídeo inteiro na memória.
  const task = LegacyFileSystem.createUploadTask(
    url,
    uri,
    { httpMethod: 'PUT', uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT },
    (p) => p.totalBytesExpectedToSend > 0 && onProgress(p.totalBytesSent / p.totalBytesExpectedToSend),
  );
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) throw new Error(`upload_${result?.status ?? 'cancelled'}`);
}

/** Avisa o servidor para apagar o vídeo no Mux (antes de apagar o post). */
export async function releaseVideo(postId: string) {
  const { error } = await supabase.functions.invoke('video', { body: { action: 'delete', post_id: postId } });
  if (error) throw error;
}

/**
 * Vídeo que acabou de ser gravado na tela de gravação, esperando o Publicar
 * pegar. Fica na memória: é só a passagem de uma tela para a outra.
 */
let recorded: string | null = null;

export function setRecordedVideo(uri: string) {
  recorded = uri;
}

/** Devolve o vídeo gravado (uma vez só) ou `null`. */
export function takeRecordedVideo() {
  const uri = recorded;
  recorded = null;
  return uri;
}
