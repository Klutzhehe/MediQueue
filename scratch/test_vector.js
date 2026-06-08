import { transcribeAudio, generateSpeech } from "../src/vectorEngineService";

async function runTest() {
  console.log("🚀 Testing Vector Engine Service...");
  
  try {
    // This will fail if the API key is still 'sk-...'
    await transcribeAudio(new Blob([], { type: 'audio/wav' }));
  } catch (err) {
    console.log("✅ Expected failure (API Key check):", err.message);
  }

  console.log("Test script completed.");
}

// runTest();
