
import { GoogleGenAI, Type } from "@google/genai";

export const analyzeVideoFrames = async (frames: string[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Use first, middle, and last frame for analysis
  const sampleIndices = [0, Math.floor(frames.length / 2), frames.length - 1];
  const selectedFrames = sampleIndices
    .map(i => frames[i])
    .filter(Boolean)
    .map(url => url.split(',')[1] || url); // Ensure it's just base64 if needed, but our URLs are blob URLs

  // Since these are Blob URLs, we need to convert to base64 for Gemini
  const base64Frames = await Promise.all(
    sampleIndices.map(async (i) => {
      const url = frames[i];
      if (!url) return null;
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    })
  );

  const parts = base64Frames
    .filter((b): b is string => !!b)
    .map(b => ({
      inlineData: {
        data: b.split(',')[1],
        mimeType: 'image/jpeg'
      }
    }));

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        ...parts,
        { text: "Analyze these video frames and provide a summary of the video content and key highlights." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          highlights: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["summary", "highlights"]
      }
    }
  });

  return JSON.parse(response.text);
};
