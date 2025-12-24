
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { FrameThumbnail } from '../types';

let ffmpeg: FFmpeg | null = null;

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
  onProgress?: (p: number) => void
): Promise<FrameThumbnail[]> => {
  const ff = await loadFFmpeg();
  const inputName = 'input_buffer.mp4';
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (!safeDuration) return [];
  
  // Clean up any stray files from previous failed runs
  try {
    const list = await ff.listDir('.');
    for (const f of list) {
      if (f.name.startsWith('thumb_') || f.name === inputName) {
        await ff.deleteFile(f.name);
      }
    }
  } catch (e) {}

  await ff.writeFile(inputName, await fetchFile(file));

  // Frame count: ~1.5 fps, capped at 30 to manage memory in restricted sandbox environments
  const totalFrames = Math.min(30, Math.max(10, Math.floor(safeDuration * 1.5)));
  const timeStep = safeDuration / totalFrames;
  const frames: FrameThumbnail[] = [];
  const maxTimestamp = Math.max(0, safeDuration - 0.01);

  for (let i = 0; i < totalFrames; i++) {
    const timestamp = Math.min(maxTimestamp, i * timeStep);
    const frameName = `thumb_${String(i).padStart(3, '0')}.jpg`;

    await ff.exec([
      '-ss', `${timestamp}`,
      '-i', inputName,
      '-frames:v', '1',
      '-vf', 'scale=320:-1',
      '-q:v', '4',
      frameName
    ]);

    const data = await ff.readFile(frameName);
    const url = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
    
    frames.push({
      timestamp,
      url
    });
    
    if (onProgress) onProgress((i + 1) / totalFrames);
    
    // Delete from virtual FS immediately to save memory
    try { await ff.deleteFile(frameName); } catch(e) {}
  }

  try { await ff.deleteFile(inputName); } catch(e) {}
  return frames;
};
