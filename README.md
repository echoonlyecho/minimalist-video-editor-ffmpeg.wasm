# Minimalist Video Editor (FFmpeg.wasm)

Client-side video previewer with a filmstrip timeline, built on React, FFmpeg.wasm, and Gemini for optional frame analysis.

## Features

- Import a local video and play it in the main preview.
- Extract timeline thumbnails in-browser with FFmpeg.wasm.
- Scrub the timeline with hover previews and a playhead.
- Optional Gemini analysis: summary + highlights from sampled frames.

## Architecture

- UI: React + Vite, styled via Tailwind CDN.
- Media: FFmpeg.wasm loads core assets from unpkg and extracts frames.
- AI: @google/genai uploads 3 sampled frames (first/middle/last) for analysis.

## Requirements

- Node.js 18+ (or Bun) for local dev.
- Modern browser with Web Worker support.
- Network access to load FFmpeg core assets and Tailwind CDN.

## Setup

```bash
npm install
npm run dev
```

## Configuration

- Gemini API key is read from `process.env.API_KEY` at build time.
- If you use a different toolchain, ensure it injects `API_KEY` into the client bundle.

## Notes / Limitations

- Export is UI-only (no render pipeline implemented).
- Frame extraction is capped (10-30 frames) to keep memory use low.
- Some browsers or private modes may block FFmpeg Web Workers.

## Project Structure

- `App.tsx`: main UI and state orchestration.
- `components/Timeline.tsx`: filmstrip timeline + scrubbing.
- `services/ffmpegService.ts`: FFmpeg load + frame extraction.
- `services/geminiService.ts`: Gemini analysis request.
