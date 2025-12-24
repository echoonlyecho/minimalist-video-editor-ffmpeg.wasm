
import React, { useState, useRef } from 'react';
import { VideoState, GeminiAnalysis } from './types';
import { loadFFmpeg, extractFrames } from './services/ffmpegService';
import { analyzeVideoFrames } from './services/geminiService';
import Timeline from './components/Timeline';
import { 
  PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, 
  UploadIcon, ScissorsIcon, WandIcon, DownloadIcon, 
  InfoIcon, TrashIcon 
} from './components/Icons';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const duration = e.currentTarget.duration;
    setVideo(prev => ({ ...prev, duration }));
    if (video.file) {
      processFrames(video.file, duration);
    }
  };

  const processFrames = async (file: File, duration: number) => {
    try {
      const frames = await extractFrames(file, duration, (p) => {
        setExtractProgress(Math.floor(p * 100));
      });
      setVideo(prev => ({ ...prev, frames, isProcessing: false }));
    } catch (err) {
      console.error("FFmpeg Startup Error:", err);
      setVideo(prev => ({ ...prev, isProcessing: false }));
      alert("Video processing core failed to start. This usually means the browser blocked the WebWorker. Please try using Chrome in a normal window.");
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (video.isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setVideo(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const handleSeek = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setVideo(prev => ({ ...prev, currentTime: time }));
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setVideo(prev => ({ ...prev, currentTime: videoRef.current!.currentTime }));
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

  const reset = () => {
    if (video.url) URL.revokeObjectURL(video.url);
    video.frames.forEach(f => URL.revokeObjectURL(f.url));
    setVideo({
      file: null, url: null, duration: 0, currentTime: 0,
      isPlaying: false, isProcessing: false, frames: []
    });
    setAiAnalysis(null);
    setExtractProgress(0);
  };

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
          <button disabled={!video.url} className="text-[10px] font-bold uppercase tracking-widest px-6 py-2 rounded-sm bg-white text-black hover:bg-gray-200 transition-all disabled:opacity-10 flex items-center gap-3">
            <DownloadIcon /> Export
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-16 border-r border-white/5 flex flex-col items-center py-12 gap-10 bg-[#050505]">
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

        <div className="flex-1 relative bg-[#080808] flex items-center justify-center p-12">
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
            <div className="relative group flex flex-col items-center w-full h-full justify-center">
              <video 
                ref={videoRef} src={video.url} 
                className="max-h-[60vh] max-w-[90%] rounded-lg shadow-2xl border border-white/5"
                onLoadedMetadata={onLoadedMetadata} 
                onTimeUpdate={handleTimeUpdate} 
                onClick={handlePlayPause}
              />
              {video.isProcessing && (
                <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center z-[60]">
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
              <div className="mt-12 flex items-center gap-16 bg-black/40 backdrop-blur-2xl px-14 py-6 rounded-full border border-white/5 opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={() => handleSeek(video.currentTime - 5)} className="text-gray-500 hover:text-white"><SkipBackIcon /></button>
                <button onClick={handlePlayPause} className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 shadow-xl transition-all">
                  {video.isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button onClick={() => handleSeek(video.currentTime + 5)} className="text-gray-500 hover:text-white"><SkipForwardIcon /></button>
              </div>
            </div>
          )}
        </div>

        <aside className="w-80 border-l border-white/5 bg-[#050505] p-8 flex flex-col gap-10 overflow-y-auto">
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

      <footer className="h-44 bg-[#050505]">
        <Timeline 
          duration={video.duration} currentTime={video.currentTime} 
          frames={video.frames} onSeek={handleSeek}
        />
      </footer>
    </div>
  );
};

export default App;
