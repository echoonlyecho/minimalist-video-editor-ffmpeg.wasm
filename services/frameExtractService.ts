import { FrameThumbnail } from '../types';
import { extractFrames as extractFramesWithFFmpeg } from './ffmpegService';

const waitForEvent = (target: EventTarget, event: string) =>
  new Promise<void>((resolve) => target.addEventListener(event, () => resolve(), { once: true }));

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('canvas.toBlob() returned null'));
        else resolve(blob);
      },
      type,
      quality
    );
  });

const waitForReadyState = async (video: HTMLVideoElement, minState: number, timeoutMs = 2000) => {
  if (video.readyState >= minState) return;
  const start = performance.now();
  while (video.readyState < minState) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for decoded video frame');
    }
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
};

const extractFramesWithVideo = async (
  file: File,
  duration: number,
  onProgress?: (p: number) => void,
  opts?: { videoWidth?: number; videoHeight?: number }
): Promise<FrameThumbnail[]> => {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (!safeDuration) return [];

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  (video as any).playsInline = true;
  video.src = url;

  const cleanupUrls: string[] = [];
  try {
    if (video.readyState < 1) {
      await waitForEvent(video, 'loadedmetadata');
    }

    const sourceWidth = opts?.videoWidth ?? video.videoWidth ?? 0;
    const sourceHeight = opts?.videoHeight ?? video.videoHeight ?? 0;
    const pixelCount = sourceWidth * sourceHeight;
    const thumbWidth = pixelCount >= 8_000_000 ? 240 : 320;

    const totalFrames = Math.min(30, Math.max(10, Math.floor(safeDuration * 1.5)));
    const timeStep = safeDuration / totalFrames;
    const maxTimestamp = Math.max(0, safeDuration - 0.01);

    const frames: FrameThumbnail[] = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Failed to create 2D canvas context');

    for (let i = 0; i < totalFrames; i++) {
      const timestamp = Math.min(maxTimestamp, i * timeStep);
      video.currentTime = timestamp;
      await waitForEvent(video, 'seeked');
      await waitForReadyState(video, 2);

      const vw = video.videoWidth || sourceWidth;
      const vh = video.videoHeight || sourceHeight;
      if (!vw || !vh) throw new Error('Video has invalid dimensions');

      const scale = thumbWidth / vw;
      canvas.width = thumbWidth;
      canvas.height = Math.max(1, Math.round(vh * scale));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await toBlob(canvas, 'image/jpeg', 0.7);
      const frameUrl = URL.createObjectURL(blob);
      cleanupUrls.push(frameUrl);
      frames.push({ timestamp, url: frameUrl });
      onProgress?.((i + 1) / totalFrames);
    }

    cleanupUrls.length = 0;
    return frames;
  } catch (e) {
    for (const u of cleanupUrls) URL.revokeObjectURL(u);
    throw e;
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
};

export const extractTimelineFrames = async (
  file: File,
  duration: number,
  onProgress?: (p: number) => void,
  opts?: { videoWidth?: number; videoHeight?: number }
): Promise<FrameThumbnail[]> => {
  try {
    return await extractFramesWithVideo(file, duration, onProgress, opts);
  } catch (err) {
    console.warn('Video+canvas frame extraction failed, falling back to FFmpeg.wasm:', err);
    return await extractFramesWithFFmpeg(file, duration, onProgress, opts);
  }
};
