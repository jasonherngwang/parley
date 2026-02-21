import { google } from '@ai-sdk/google';

// Fast model: used for specialists, Mutineer, and Arbitrator
export const geminiFlashLite = google(
  process.env.GEMINI_FAST_MODEL ?? 'gemini-2.5-flash-lite-preview-06-17'
);

// Deep model: used for Synthesis only
export const geminiPro = google(
  process.env.GEMINI_DEEP_MODEL ?? 'gemini-2.5-pro'
);
