
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { FrameThumbnail } from '../types';

let ffmpeg: FFmpeg | null = null;

const ignore = () => {};

const safeUnmount = async (ff: FFmpeg, mountPoint: string) => {
  try {
    await ff.unmount(mountPoint);
  } catch {
    ignore();
  }
};

const safeCreateDir = async (ff: FFmpeg, path: string) => {
  try {
    await ff.createDir(path);
  } catch {
    ignore();
  }
};

const safeDeleteDir = async (ff: FFmpeg, path: string) => {
  try {
    await ff.deleteDir(path);
  } catch {
    ignore();
  }
};

const cleanupThumbs = async (ff: FFmpeg) => {
  try {
    const list = await ff.listDir('.');
    for (const f of list) {
      if (f.name.startsWith('thumb_')) {
        try {
          await ff.deleteFile(f.name);
        } catch {
          ignore();
        }
      }
    }
  } catch {
    ignore();
  }
};

/**
 * Robustly loads FFmpeg assets by fetching them and creating local Blob URLs.
 * This bypasses Cross-Origin restrictions for Web Workers by creating a same-origin Blob URL.
 */
const getSafeURL = async (url: string, mimeType: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    
    const blob = await response.blob();
    // Re-wrap in the correct mime-type to ensure browser treats it as the expected format
    const safeBlob = new Blob([blob], { type: mimeType });
    return URL.createObjectURL(safeBlob);
  } catch (err) {
    console.error(`Failed to fetch asset with CORS: ${url}`, err);
    // Fallback to library utility if manual fetch fails
    return await toBlobURL(url, mimeType);
  }
};

export const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  
  // Specific versions to ensure compatibility
  const CORE_VERSION = '0.12.6';
  const FFMPEG_VERSION = '0.12.10';
  
  // Use ESM build since the worker is created as type="module"
  const coreBase = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
  try {
    console.log("Fetching FFmpeg core assets...");
    
    // Fetch all required assets in parallel and convert to same-origin Blob URLs
    const [coreURL, wasmURL] = await Promise.all([
      getSafeURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript'),
      getSafeURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm')
    ]);

    console.log("Loading FFmpeg wasm core...");
    await ffmpeg.load({
      coreURL,
      wasmURL,
    });
    
    console.log("FFmpeg system ready.");
  } catch (error) {
    console.error("Critical: FFmpeg load failure", error);
    ffmpeg = null; // Allow retry on next call
    throw error;
  }
  
  return ffmpeg;
};

export const extractFrames = async (
  file: File, 
  duration: number, 
  onProgress?: (p: number) => void,
  opts?: {
    videoWidth?: number;
    videoHeight?: number;
    preferKeyframes?: boolean;
  }
): Promise<FrameThumbnail[]> => {
  const ff = await loadFFmpeg();
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (!safeDuration) return [];
  
  await cleanupThumbs(ff);

  const inputMount = '/input';
  const inputName = 'input_buffer.mp4';
  let inputPath = inputName;
  let cleanupInput = async () => {
    try {
      await ff.deleteFile(inputName);
    } catch {
      ignore();
    }
  };

  // Prefer WORKERFS to avoid copying large files into MEMFS (which makes "upload" feel stuck).
  try {
    await safeUnmount(ff, inputMount);
    await safeDeleteDir(ff, inputMount);
    await safeCreateDir(ff, inputMount);
    await ff.mount('WORKERFS' as any, { files: [file] }, inputMount);
    inputPath = `${inputMount}/${file.name}`;
    cleanupInput = async () => {
      await safeUnmount(ff, inputMount);
      await safeDeleteDir(ff, inputMount);
    };
  } catch {
    await ff.writeFile(inputName, await fetchFile(file));
  }

  // Frame count: ~1.5 fps, capped at 30 to manage memory in restricted sandbox environments
  const totalFrames = Math.min(30, Math.max(10, Math.floor(safeDuration * 1.5)));
  const timeStep = safeDuration / totalFrames;
  const frames: FrameThumbnail[] = [];
  const maxTimestamp = Math.max(0, safeDuration - 0.01);
  const pixelCount = (opts?.videoWidth ?? 0) * (opts?.videoHeight ?? 0);
  const keyframeOnly =
    opts?.preferKeyframes === true ||
    pixelCount >= 3_000_000 ||
    file.size >= 80 * 1024 * 1024;

  const thumbWidth = pixelCount >= 8_000_000 ? 240 : 320;

  let lastProgress = 0;
  const reportProgress = (p: number) => {
    if (!onProgress) return;
    const clamped = Math.min(1, Math.max(0, p));
    if (clamped < lastProgress) return;
    lastProgress = clamped;
    onProgress(clamped);
  };

  reportProgress(0);

  try {
    for (let i = 0; i < totalFrames; i++) {
      const timestamp = Math.min(maxTimestamp, i * timeStep);
      const frameName = `thumb_${String(i).padStart(3, '0')}.jpg`;

      const execProgress = ({ progress, time }: { progress: number; time: number }) => {
        const ratioFromProgress = Number.isFinite(progress) ? progress : 0;
        const ratioFromTime =
          Number.isFinite(time) && safeDuration > 0
            ? Math.min(1, time / (safeDuration * 1_000_000))
            : 0;
        const ratio = Math.max(0, Math.min(1, Math.max(ratioFromProgress, ratioFromTime)));
        reportProgress((i + ratio) / totalFrames);
      };

      ff.on('progress', execProgress);
      try {
        await ff.exec([
          ...(keyframeOnly ? ['-skip_frame', 'nokey'] : []),
          '-ss', `${timestamp}`,
          '-i', inputPath,
          '-frames:v', '1',
          '-vf', `scale=${thumbWidth}:-1`,
          '-q:v', '4',
          frameName
        ]);
      } finally {
        ff.off('progress', execProgress);
      }

      const data = await ff.readFile(frameName);
      const blob = new Blob([data as any], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      frames.push({
        timestamp,
        url
      });

      reportProgress((i + 1) / totalFrames);

      // Delete from virtual FS immediately to save memory
      try {
        await ff.deleteFile(frameName);
      } catch {
        ignore();
      }
    }

    return frames;
  } finally {
    await cleanupInput();
  }
};

export const trimVideo = async (
  file: File,
  start: number,
  end: number
): Promise<Blob | null> => {
  const ff = await loadFFmpeg();
  const outputName = 'trim_output.mp4';
  const inputMount = '/input';
  const inputName = 'trim_input.mp4';
  const safeStart = Math.max(0, Math.min(start, end));
  const safeEnd = Math.max(start, end);
  const duration = Math.max(0, safeEnd - safeStart);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  try { await ff.deleteFile(outputName); } catch(e) {}

  let inputPath = inputName;
  let cleanupInput = async () => {
    try {
      await ff.deleteFile(inputName);
    } catch {
      ignore();
    }
  };
  try {
    await safeUnmount(ff, inputMount);
    await safeDeleteDir(ff, inputMount);
    await safeCreateDir(ff, inputMount);
    await ff.mount('WORKERFS' as any, { files: [file] }, inputMount);
    inputPath = `${inputMount}/${file.name}`;
    cleanupInput = async () => {
      await safeUnmount(ff, inputMount);
      await safeDeleteDir(ff, inputMount);
    };
  } catch {
    try { await ff.deleteFile(inputName); } catch(e) {}
    await ff.writeFile(inputName, await fetchFile(file));
  }

  try {
    await ff.exec([
      '-i', inputPath,
      '-ss', `${safeStart}`,
      '-t', `${duration}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName
    ]);

    const data = await ff.readFile(outputName);
    return new Blob([data as any], { type: 'video/mp4' });
  } finally {
    await cleanupInput();
    try {
      await ff.deleteFile(outputName);
    } catch {
      ignore();
    }
  }
};
