import { GoogleGenerativeAI } from "@google/generative-ai";
import systemPromptRaw from "./aiSystemPrompt.txt?raw";

/**
 * ⚙️ AI CONFIGURATION
 */
export const AI_CONFIG = {
  apiKey: "AIzaSyADDR1mFuHoyNH6hpy0X6Du61_NH3DRm5w",
  model: "gemini-3-flash-preview", 
};

// ── GEMINI IMPLEMENTATION ──────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(AI_CONFIG.apiKey);

export const createTriageChat = () => {
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.model,
    systemInstruction: systemPromptRaw,
  });
  
  const chat = model.startChat({
    history: [],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  });

  // Directly augment the chat object to preserve prototype methods like sendMessage
  chat.sendMessageWithAudio = async (text, audioBase64) => {
    const parts = [
      { text: text || "Please analyze this voice message for triage." },
      {
        inlineData: {
          mimeType: "audio/webm", 
          data: audioBase64,
        },
      },
    ];
    return chat.sendMessage(parts);
  };

  return chat;
};

/**
 * Parse the PATIENT_SUMMARY_JSON from the AI's final message
 */
export const parseSummaryFromResponse = (text) => {
  const marker = "PATIENT_SUMMARY_JSON:";
  const idx = text.indexOf(marker);
  
  let jsonStr = "";
  if (idx !== -1) {
    jsonStr = text.slice(idx + marker.length).trim();
  } else {
    // Fallback: try to find a JSON block starting with { and ending with }
    const match = text.match(/\{[\s\S]*"triageLevel"[\s\S]*\}/);
    if (match) jsonStr = match[0];
    else return null;
  }

  try {
    // Clean up potential markdown code blocks
    const cleanJson = jsonStr.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.error("Failed to parse AI JSON:", err);
    return null;
  }
};
