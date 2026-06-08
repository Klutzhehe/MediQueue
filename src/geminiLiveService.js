/**
 * Gemini Multimodal Live API Client
 * 
 * Handles WebSocket connection, setup, and base64 audio chunking.
 */

export class GeminiLiveClient {
  constructor(apiKey, model = "gemini-2.0-flash-exp") {
    this.apiKey = apiKey;
    this.model = model;
    this.ws = null;
    this.onAudioData = null;
    this.onTextData = null;
    this.onStatusChange = null;
    this.onError = null;
    this.isConnected = false;
  }

  connect(systemInstruction = "") {
    return new Promise((resolve, reject) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BiDiGenerateContent?key=${this.apiKey}`;
      
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("Gemini Live WebSocket connected");
        this.isConnected = true;
        this.onStatusChange?.("connected");

        // Send Setup message
        const setupMessage = {
          setup: {
            model: `models/${this.model}`,
            system_instruction: {
              parts: [{ text: systemInstruction }]
            },
            generation_config: {
              response_modalities: ["audio"] 
            }
          }
        };
        this.ws.send(JSON.stringify(setupMessage));
        resolve();
      };

      this.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        if (data.setupComplete) {
          console.log("Gemini Live Setup Complete");
          this.onStatusChange?.("ready");
        }

        if (data.serverContent) {
          const { modelTurn } = data.serverContent;
          if (modelTurn && modelTurn.parts) {
            for (const part of modelTurn.parts) {
              if (part.inlineData && part.inlineData.mimeType === "audio/pcm;rate=24000") {
                // Incoming audio is 24kHz PCM
                this.onAudioData?.(part.inlineData.data);
              }
              if (part.text) {
                this.onTextData?.(part.text);
              }
            }
          }

          if (data.serverContent.turnComplete) {
             this.onStatusChange?.("turnComplete");
          }

          if (data.serverContent.interrupted) {
             this.onStatusChange?.("interrupted");
          }
        }
      };

      this.ws.onclose = () => {
        console.log("Gemini Live WebSocket closed");
        this.isConnected = false;
        this.onStatusChange?.("disconnected");
      };

      this.ws.onerror = (error) => {
        console.error("Gemini Live WebSocket error:", error);
        this.onError?.(error);
        reject(error);
      };
    });
  }

  sendAudioChunk(base64Data) {
    if (!this.isConnected) return;
    
    const message = {
      realtime_input: {
        media_chunks: [
          {
            data: base64Data,
            mime_type: "audio/pcm;rate=16000"
          }
        ]
      }
    };
    this.ws.send(JSON.stringify(message));
  }

  sendText(text) {
     if (!this.isConnected) return;
     const message = {
        client_content: {
           turns: [{
              role: "user",
              parts: [{ text }]
           }]
        }
     };
     this.ws.send(JSON.stringify(message));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
