
export interface FrameThumbnail {
  timestamp: number;
  url: string;
}

export interface VideoState {
  file: File | null;
  url: string | null;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isProcessing: boolean;
  frames: FrameThumbnail[];
}

export interface GeminiAnalysis {
  summary: string;
  highlights: string[];
}
