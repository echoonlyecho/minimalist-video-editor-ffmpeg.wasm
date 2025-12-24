
import React from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, 
  Upload, Scissors, Wand2, Download, 
  ChevronRight, ChevronLeft, Trash2,
  Info
} from 'lucide-react';

export const PlayIcon = () => <Play size={20} fill="currentColor" />;
export const PauseIcon = () => <Pause size={20} fill="currentColor" />;
export const SkipBackIcon = () => <SkipBack size={20} />;
export const SkipForwardIcon = () => <SkipForward size={20} />;
export const UploadIcon = () => <Upload size={20} />;
export const ScissorsIcon = () => <Scissors size={18} />;
export const WandIcon = () => <Wand2 size={18} />;
export const DownloadIcon = () => <Download size={20} />;
export const InfoIcon = () => <Info size={16} />;
export const TrashIcon = () => <Trash2 size={18} />;
