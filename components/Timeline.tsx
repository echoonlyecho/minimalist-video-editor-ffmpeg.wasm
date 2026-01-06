
import React, { useRef, useState } from 'react';
import { FrameThumbnail, TimeRange } from '../types';

interface TimelineProps {
  duration: number;
  currentTime: number;
  frames: FrameThumbnail[];
  onSeek: (time: number) => void;
  trimRange: TimeRange | null;
  onTrimRangeChange: (range: TimeRange) => void;
}

type TrimDragMode = 'move' | 'start' | 'end';

const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  frames,
  onSeek,
  trimRange,
  onTrimRangeChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; time: number; url: string | null } | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [trimDrag, setTrimDrag] = useState<{
    mode: TrimDragMode;
    startX: number;
    startRange: TimeRange;
  } | null>(null);

  const findFrame = (time: number) => {
    if (frames.length === 0) return null;
    return frames.reduce((prev, curr) => 
      Math.abs(curr.timestamp - time) < Math.abs(prev.timestamp - time) ? curr : prev
    );
  };

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const getPosition = (clientX: number) => {
    if (!containerRef.current || duration === 0) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pos = Math.max(0, Math.min(1, x / rect.width));
    return { x, time: pos * duration };
  };

  const updateHover = (clientX: number) => {
    const pos = getPosition(clientX);
    if (!pos) return;
    const frame = findFrame(pos.time);
    setHoverInfo({ x: pos.x, time: pos.time, url: frame ? frame.url : null });
  };

  const scrubTo = (clientX: number) => {
    const pos = getPosition(clientX);
    if (!pos) return;
    onSeek(pos.time);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || duration === 0) return;
    const target = e.target as HTMLElement;
    const role = target.dataset.role;
    if (trimRange && (role === 'trim-range' || role === 'trim-handle-start' || role === 'trim-handle-end')) {
      const mode: TrimDragMode =
        role === 'trim-range' ? 'move' : role === 'trim-handle-start' ? 'start' : 'end';
      containerRef.current.setPointerCapture(e.pointerId);
      setTrimDrag({ mode, startX: e.clientX, startRange: trimRange });
      return;
    }
    containerRef.current.setPointerCapture(e.pointerId);
    setIsScrubbing(true);
    scrubTo(e.clientX);
    if (e.pointerType === 'mouse') updateHover(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || duration === 0) return;
    if (trimDrag) {
      const rect = containerRef.current.getBoundingClientRect();
      const minDuration = Math.min(0.5, duration);
      const rangeDuration = trimDrag.startRange.end - trimDrag.startRange.start;
      const deltaTime = ((e.clientX - trimDrag.startX) / rect.width) * duration;
      let nextStart = trimDrag.startRange.start;
      let nextEnd = trimDrag.startRange.end;

      if (trimDrag.mode === 'move') {
        const maxStart = Math.max(0, duration - rangeDuration);
        nextStart = clamp(trimDrag.startRange.start + deltaTime, 0, maxStart);
        nextEnd = nextStart + rangeDuration;
      } else {
        const pos = getPosition(e.clientX);
        if (!pos) return;
        if (trimDrag.mode === 'start') {
          nextStart = clamp(pos.time, 0, trimDrag.startRange.end - minDuration);
          nextEnd = trimDrag.startRange.end;
        } else {
          nextStart = trimDrag.startRange.start;
          nextEnd = clamp(pos.time, trimDrag.startRange.start + minDuration, duration);
        }
      }

      onTrimRangeChange({ start: nextStart, end: nextEnd });
      return;
    }
    if (e.pointerType === 'mouse') updateHover(e.clientX);
    if (isScrubbing) scrubTo(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    setTrimDrag(null);
    setIsScrubbing(false);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    setIsScrubbing(false);
    setHoverInfo(null);
    setTrimDrag(null);
  };

  const playheadPosition = duration > 0 ? (currentTime / duration) * 100 : 0;
  const showTrim = !!trimRange && duration > 0;
  const trimStart = showTrim ? (trimRange!.start / duration) * 100 : 0;
  const trimEnd = showTrim ? (trimRange!.end / duration) * 100 : 0;
  const trimWidth = Math.max(0, trimEnd - trimStart);

  return (
    <div className="w-full bg-[#050505] border-t border-[#1a1a1a] p-3 md:p-5 flex flex-col gap-2 md:gap-3 select-none h-full">
      <div className="flex justify-between items-end px-1">
        <div className="flex flex-col">
          <span className="text-[8px] text-gray-600 font-bold uppercase tracking-tighter">Timeline Status</span>
          <span className="text-[10px] font-mono text-gray-400 italic">Ready</span>
        </div>
        <div className="bg-[#0d0d0d] px-4 py-1.5 rounded-lg border border-[#222] flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></div>
          <span className="text-xs font-mono text-white tracking-widest">
            {Math.floor(currentTime / 60).toString().padStart(2, '0')}:{(currentTime % 60).toFixed(2).padStart(5, '0')}
          </span>
        </div>
        <div className="text-[10px] font-mono text-gray-600">
           {Math.floor(duration / 60).toString().padStart(2, '0')}:{(duration % 60).toFixed(0).padStart(2, '0')}
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className="relative h-20 md:h-24 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a] overflow-visible cursor-ew-resize group shadow-2xl touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={() => {
          if (!isScrubbing) setHoverInfo(null);
        }}
      >
        {/* Filmstrip Background */}
        <div className="absolute inset-0 flex items-center overflow-hidden rounded-xl pointer-events-none border-x border-[#333]">
          {frames.length > 0 ? (
            <div className="flex w-full h-full">
              {frames.map((frame, idx) => (
                <div key={idx} className="h-full flex-1 border-r border-black/80 relative">
                   <img src={frame.url} className="w-full h-full object-cover grayscale-[0.5] opacity-50 transition-all group-hover:opacity-70 group-hover:grayscale-[0.2]" alt="" />
                   <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-stripes opacity-10">
               <span className="text-[8px] tracking-[1em] text-white">NO MEDIA LOADED</span>
            </div>
          )}
        </div>

        {/* Trim Range */}
        {showTrim && trimWidth > 0 && (
          <div
            data-role="trim-range"
            className={`absolute top-1 bottom-1 rounded-lg border-2 border-emerald-400/80 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(16,185,129,0.35)] ${trimDrag?.mode === 'move' ? 'cursor-grabbing' : 'cursor-grab'} z-40`}
            style={{ left: `${trimStart}%`, width: `${trimWidth}%` }}
          >
            <div
              data-role="trim-handle-start"
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-14 bg-emerald-400 rounded-sm shadow-md border border-black/40 cursor-ew-resize"
            />
            <div
              data-role="trim-handle-end"
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-14 bg-emerald-400 rounded-sm shadow-md border border-black/40 cursor-ew-resize"
            />
          </div>
        )}

        {/* Hover Frame Popup */}
        {hoverInfo && hoverInfo.url && (
          <div 
            className="absolute bottom-full mb-5 -translate-x-1/2 pointer-events-none z-[100] transition-transform duration-75 ease-out"
            style={{ left: `${hoverInfo.x}px` }}
          >
            <div className="bg-[#111] p-1 rounded-lg border border-white/30 shadow-[0_15px_40px_rgba(0,0,0,0.9)] overflow-hidden">
              <img src={hoverInfo.url} className="w-48 h-28 object-cover rounded-sm" alt="Preview" />
              <div className="bg-red-600 text-[10px] text-center font-bold font-mono py-0.5 text-white">
                {hoverInfo.time.toFixed(2)}s
              </div>
            </div>
          </div>
        )}

        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-[2px] bg-red-600 z-50 pointer-events-none"
          style={{ left: `${playheadPosition}%` }}
        >
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-white ring-4 ring-red-600/20"></div>
          <div className="h-full w-full shadow-[0_0_15px_rgba(220,38,38,0.5)]"></div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
