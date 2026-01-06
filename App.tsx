
import React, { useState, useRef } from 'react';
import { VideoState, GeminiAnalysis, TimeRange } from './types';
import { trimVideo } from './services/ffmpegService';
import { extractTimelineFrames } from './services/frameExtractService';
import { analyzeVideoFrames } from './services/geminiService';
import Timeline from './components/Timeline';
import { 
  PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, 
  UploadIcon, ScissorsIcon, WandIcon, DownloadIcon, 
  InfoIcon, TrashIcon 
} from './components/Icons';

const describeProcessingError = (err: unknown) => {
  const text =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();

  const lower = text.toLowerCase();
  if (lower.includes('out of memory') || lower.includes('oom') || lower.includes('allocation failed')) {
    return `内存不足：这个视频的解码/抽帧超出浏览器可用内存。\n\n建议：关掉其它标签页/应用后重试，或先把视频转成更低分辨率/更低码率。`;
  }
  if (lower.includes('failed to import ffmpeg-core') || lower.includes('failed to fetch')) {
    return `FFmpeg 核心加载失败（网络/CORS/缓存问题）。\n\n建议：用 Chrome 正常窗口、确保能访问 CDN，再重试。`;
  }
  if (lower.includes('ffmpeg is not loaded')) {
    return `FFmpeg Worker 未就绪或已崩溃。\n\n建议：刷新页面重试；若持续出现，基本是浏览器/扩展阻止了 Worker。`;
  }
  if (lower.includes('no such file') || lower.includes('not found')) {
    return `输入文件在 Worker 中不可用（WorkerFS 挂载失败或权限问题）。\n\n建议：用 Chrome 正常窗口重试。`;
  }
  return `视频处理失败：${text}`;
};

const App: React.FC = () => {
  const [video, setVideo] = useState<VideoState>({
    file: null,
    url: null,
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    isProcessing: false,
    frames: []
  });

  const [extractProgress, setExtractProgress] = useState(0);
  const [aiAnalysis, setAiAnalysis] = useState<GeminiAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [trimRange, setTrimRange] = useState<TimeRange | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clampToRange = (time: number, range: TimeRange | null = trimRange) => {
    if (!range) return time;
    return Math.min(Math.max(time, range.start), range.end);
  };

  const updateTrimRange = (range: TimeRange) => {
    const normalized = range.start <= range.end ? range : { start: range.end, end: range.start };
    setTrimRange(normalized);
    if (!videoRef.current) return;
    const clamped = clampToRange(videoRef.current.currentTime, normalized);
    if (clamped !== videoRef.current.currentTime) {
      videoRef.current.currentTime = clamped;
      setVideo(prev => ({ ...prev, currentTime: clamped }));
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    const url = URL.createObjectURL(file);
    setVideo(prev => ({
      ...prev,
      file,
      url,
      isProcessing: true,
      frames: []
    }));
    setAiAnalysis(null);
    setExtractProgress(0);
    setTrimRange(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const duration = e.currentTarget.duration;
    const videoWidth = e.currentTarget.videoWidth;
    const videoHeight = e.currentTarget.videoHeight;
    setVideo(prev => ({ ...prev, duration }));
    setTrimRange({ start: 0, end: duration });
    if (video.file) {
      processFrames(video.file, duration, videoWidth, videoHeight);
    }
  };

  const processFrames = async (file: File, duration: number, videoWidth?: number, videoHeight?: number) => {
    try {
      const frames = await extractTimelineFrames(
        file,
        duration,
        (p) => setExtractProgress(Math.floor(p * 100)),
        { videoWidth, videoHeight }
      );
      setVideo(prev => ({ ...prev, frames, isProcessing: false }));
    } catch (err) {
      console.error("Video Processing Error:", err);
      setVideo(prev => ({ ...prev, isProcessing: false }));
      alert(describeProcessingError(err));
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (video.isPlaying) {
      videoRef.current.pause();
      setVideo(prev => ({ ...prev, isPlaying: false }));
      return;
    }
    const rangeStart = trimRange?.start ?? 0;
    const rangeEnd = trimRange?.end ?? video.duration;
    const atEnd = Number.isFinite(rangeEnd) && videoRef.current.currentTime >= rangeEnd - 0.02;
    const nextTime = clampToRange(atEnd ? rangeStart : videoRef.current.currentTime);
    if (nextTime !== videoRef.current.currentTime) {
      videoRef.current.currentTime = nextTime;
    }
    videoRef.current.play();
    setVideo(prev => ({ ...prev, isPlaying: true, currentTime: nextTime }));
  };

  const handleSeek = (time: number) => {
    if (!videoRef.current) return;
    const clamped = clampToRange(time);
    videoRef.current.currentTime = clamped;
    setVideo(prev => ({ ...prev, currentTime: clamped }));
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    if (trimRange) {
      if (current < trimRange.start) {
        videoRef.current.currentTime = trimRange.start;
        setVideo(prev => ({ ...prev, currentTime: trimRange.start }));
        return;
      }
      if (current > trimRange.end) {
        videoRef.current.pause();
        videoRef.current.currentTime = trimRange.end;
        setVideo(prev => ({ ...prev, currentTime: trimRange.end, isPlaying: false }));
        return;
      }
    }
    setVideo(prev => ({ ...prev, currentTime: current }));
  };

  const handleAnalyze = async () => {
    if (video.frames.length === 0) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeVideoFrames(video.frames.map(f => f.url));
      setAiAnalysis(result);
    } catch (err) { 
      console.error(err);
      alert("AI Scan interrupted. Check your API configuration.");
    } finally { 
      setIsAnalyzing(false); 
    }
  };

  const handleExport = async () => {
    if (!video.file || !trimRange) return;
    const safeStart = Math.max(0, Math.min(trimRange.start, trimRange.end));
    const safeEnd = Math.max(trimRange.start, trimRange.end);
    if (safeEnd <= safeStart) return;
    setIsExporting(true);
    try {
      const blob = await trimVideo(video.file, safeStart, safeEnd);
      if (!blob) {
        alert("Trim range is empty.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const baseName = video.file.name.replace(/\.[^/.]+$/, '') || 'trimmed';
      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}_trim.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const reset = () => {
    if (video.url) URL.revokeObjectURL(video.url);
    video.frames.forEach(f => URL.revokeObjectURL(f.url));
    setVideo({
      file: null, url: null, duration: 0, currentTime: 0,
      isPlaying: false, isProcessing: false, frames: []
    });
    setAiAnalysis(null);
    setExtractProgress(0);
    setTrimRange(null);
    setIsExporting(false);
  };

  const canExport = !!video.file && !!trimRange && trimRange.end > trimRange.start && !video.isProcessing;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#000] text-white overflow-hidden font-sans">
      <header className="h-14 border-b border-white/5 flex items-center justify-between px-8 bg-[#050505] z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-red-600 rounded-sm flex items-center justify-center">
             <div className="w-4 h-0.5 bg-black rotate-45 rounded-full"></div>
          </div>
          <span className="text-sm font-bold tracking-[0.2em] uppercase italic opacity-80">Vision Studio</span>
        </div>
        <div className="flex gap-4">
          <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-bold uppercase tracking-widest px-6 py-2 rounded-sm bg-[#111] hover:bg-[#1a1a1a] border border-white/10 transition-all flex items-center gap-3">
            <UploadIcon /> Import
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="video/*" className="hidden" />
          <button
            onClick={handleExport}
            disabled={!canExport || isExporting}
            className="text-[10px] font-bold uppercase tracking-widest px-6 py-2 rounded-sm bg-white text-black hover:bg-gray-200 transition-all disabled:opacity-10 flex items-center gap-3"
          >
            <DownloadIcon /> {isExporting ? 'Exporting' : 'Export'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="hidden md:flex w-16 border-r border-white/5 flex-col items-center py-12 gap-10 bg-[#050505]">
          <button className="text-gray-600 hover:text-white transition-all"><ScissorsIcon /></button>
          <button 
            onClick={handleAnalyze} 
            disabled={video.frames.length === 0 || isAnalyzing} 
            className={`p-3 rounded-xl transition-all ${isAnalyzing ? 'bg-blue-600 shadow-lg animate-pulse' : 'text-gray-600 hover:bg-white/5'}`}
          >
            <WandIcon />
          </button>
          <button onClick={reset} className="mt-auto mb-4 text-gray-800 hover:text-red-500 transition-colors"><TrashIcon /></button>
        </aside>

        <div className="flex-1 relative bg-[#080808] flex items-center justify-center p-4 sm:p-8 md:p-12 min-w-0">
          {!video.url ? (
            <div onClick={() => fileInputRef.current?.click()} className="group cursor-pointer flex flex-col items-center gap-12 border border-white/5 bg-[#030303] p-32 rounded-[2rem] transition-all hover:bg-[#050505]">
              <div className="p-12 rounded-full bg-[#080808] border border-white/5 group-hover:scale-105 transition-transform">
                <UploadIcon />
              </div>
              <div className="text-center">
                <h2 className="text-xs font-bold uppercase tracking-[0.6em] mb-4 text-white/20 group-hover:text-white/40 transition-colors">Select Master Clip</h2>
                <p className="text-[8px] text-gray-800 font-mono tracking-[0.5em]">H.264 / PRORES / WEBM</p>
              </div>
            </div>
          ) : (
            <div className="relative group w-full h-full flex items-center justify-center">
              <video 
                ref={videoRef} src={video.url} 
                className="w-full h-full max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-white/5"
                playsInline
                onLoadedMetadata={onLoadedMetadata} 
                onTimeUpdate={handleTimeUpdate} 
                onClick={handlePlayPause}
              />
              {video.isProcessing && (
                <div className="absolute inset-0 bg-black backdrop-blur-3xl flex flex-col items-center justify-center z-[60]">
                  <div className="relative w-32 h-32 mb-10 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                        <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/5" />
                        <circle cx="64" cy="64" r="60" stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray="377" strokeDashoffset={377 - (377 * extractProgress) / 100} className="text-red-600 transition-all duration-300" />
                    </svg>
                    <span className="text-2xl font-mono font-black italic">{extractProgress}%</span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-[1.5em] text-white/30">Decoding Streams</span>
                </div>
              )}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-10 bg-black/40 backdrop-blur-2xl px-10 py-4 rounded-full border border-white/5 opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={() => handleSeek(video.currentTime - 5)} className="text-gray-500 hover:text-white"><SkipBackIcon /></button>
                <button onClick={handlePlayPause} className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 shadow-xl transition-all">
                  {video.isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button onClick={() => handleSeek(video.currentTime + 5)} className="text-gray-500 hover:text-white"><SkipForwardIcon /></button>
              </div>
            </div>
          )}
        </div>

        <aside className="hidden lg:flex w-80 border-l border-white/5 bg-[#050505] p-8 flex-col gap-10 overflow-y-auto">
          <div className="flex items-center justify-between opacity-20">
            <span className="text-[10px] font-black uppercase tracking-widest">Metadata inspector</span>
            <InfoIcon />
          </div>
          
          <div className="flex flex-col gap-8">
            {!aiAnalysis ? (
              <div className="bg-[#030303] border border-white/5 p-10 rounded-2xl flex flex-col gap-6 text-center opacity-60">
                <div className="w-12 h-12 bg-white/5 rounded-2xl mx-auto flex items-center justify-center text-gray-600">
                  <WandIcon />
                </div>
                <div>
                  <h4 className="text-[10px] font-bold uppercase text-white/70 mb-2">Engine Off</h4>
                  <p className="text-[10px] text-gray-700 leading-relaxed italic">
                    Analysis will become available once extraction is complete.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="space-y-4">
                  <h3 className="text-[8px] font-black text-red-600 uppercase tracking-[0.4em]">Video Summary</h3>
                  <p className="text-[11px] leading-relaxed text-gray-400 font-medium">{aiAnalysis.summary}</p>
                </div>
                <div className="space-y-5">
                  <h3 className="text-[8px] font-black text-red-600 uppercase tracking-[0.4em]">Highlights</h3>
                  <div className="space-y-3">
                    {aiAnalysis.highlights.map((h, i) => (
                      <div key={i} className="text-[10px] flex gap-4 text-gray-500 bg-white/[0.02] p-4 rounded-lg border border-white/5 transition-all hover:bg-white/5">
                        <span className="text-white/40 font-mono">0{i+1}</span>
                        <span className="font-medium tracking-tight text-gray-300">{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>

      <footer className="h-32 md:h-44 bg-[#050505]">
        <Timeline 
          duration={video.duration} currentTime={video.currentTime} 
          frames={video.frames} onSeek={handleSeek}
          trimRange={trimRange}
          onTrimRangeChange={updateTrimRange}
        />
      </footer>
    </div>
  );
};

export default App;
