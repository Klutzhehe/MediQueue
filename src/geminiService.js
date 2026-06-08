// =====================================================
// GEMINI API KEY
// =====================================================
// Replace with your actual Gemini API key from Google AI Studio
// https://aistudio.google.com/app/apikey
// =====================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import systemPromptRaw from "./aiSystemPrompt.txt?raw";

const API_KEY = ""; // <-- Replace this

const genAI = new GoogleGenerativeAI(API_KEY);

export const createTriageChat = () => {
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    systemInstruction: systemPromptRaw,
  });

  const chat = model.startChat({
    history: [],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  return chat;
};

/**
 * Parse the PATIENT_SUMMARY_JSON from the AI's final message
 */
export const parseSummaryFromResponse = (text) => {
  const marker = "PATIENT_SUMMARY_JSON:";
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  try {
    const jsonStr = text.slice(idx + marker.length).trim();
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
};
