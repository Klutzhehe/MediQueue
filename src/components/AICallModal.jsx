import { useState, useRef, useEffect } from "react";
import { createTriageChat, parseSummaryFromResponse } from "../llmService";
import { db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { 
  X, Send, Bot, Loader2, ShieldCheck, ClipboardList, CheckCircle
} from "lucide-react";

const AICallModal = ({ onClose, onAppointmentSaved }) => {
  const { user } = useAuth();
  const [phase, setPhase] = useState("chat"); // Directly start in chat
  const [messages, setMessages] = useState([
    { 
      role: "ai", 
      text: "Hello! I am your AI Triage assistant. I'll summarize your condition for our medical team so they can prioritize your care.\n\nPlease describe your symptoms, how long you've had them, and any medical history or regular medications you have. Once I have enough information, I'll immediately pass your report to our staff." 
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState(null);
  
  const chatRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Initialize chat reference immediately
  useEffect(() => {
    if (!chatRef.current) {
      chatRef.current = createTriageChat();
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSendMessage = async (overrideText = null) => {
    const text = overrideText || inputText.trim();
    if (!text || sending) return;

    if (!overrideText) setInputText("");
    setMessages(prev => [...prev, { role: "user", text }]);
    setSending(true);

    try {
      if (!chatRef.current) chatRef.current = createTriageChat();
      
      const res = await chatRef.current.sendMessage(text);
      const aiText = res.response.text();

      // Check for summary
      const parsed = parseSummaryFromResponse(aiText);
      const marker = "PATIENT_SUMMARY_JSON:";
      const userFacingText = aiText.includes(marker) ? aiText.slice(0, aiText.indexOf(marker)).trim() : aiText;

      if (parsed) {
        if (userFacingText) setMessages(prev => [...prev, { role: "ai", text: userFacingText }]);
        setSummary({ ...parsed, timestamp: new Date().toISOString() });
        // Automatically trigger save instead of showing summary phase
        autoSaveTriage({ ...parsed, timestamp: new Date().toISOString() });
      } else {
        setMessages(prev => [...prev, { role: "ai", text: userFacingText }]);
      }
    } catch (err) {
      console.error("Gemini Error:", err);
      setMessages(prev => [...prev, { role: "ai", text: "I'm having trouble connecting. Please try again." }]);
    } finally {
      setSending(false);
    }
  };

  const autoSaveTriage = async (finalSummary) => {
    setPhase("saving");
    try {
      await addDoc(collection(db, "EDMAT"), {
        ...finalSummary,
        userId: user?.uid || "anonymous",
        userEmail: user?.email || "unknown",
        userName: user?.displayName || "Unknown Patient",
        createdAt: serverTimestamp(),
        status: "pending",
        source: "ai-chat",
      });
      setPhase("done");
      onAppointmentSaved?.();
      // Auto-close after 3 seconds of showing "Done"
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err) {
      console.error("Firestore error:", err);
      setPhase("summary"); // Fallback to manual if auto fails
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const saveToFirestore = async () => {
    if (!summary) return;
    setPhase("saving");
    try {
      await addDoc(collection(db, "EDMAT"), {
        ...summary,
        userId: user?.uid || "anonymous",
        userEmail: user?.email || "unknown",
        userName: user?.displayName || "Unknown Patient",
        createdAt: serverTimestamp(),
        status: "pending",
        source: "ai-chat",
      });
      setPhase("done");
      onAppointmentSaved?.();
    } catch (err) {
      console.error("Firestore error:", err);
      setPhase("summary");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg h-[100dvh] sm:h-[85vh] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        
        {/* HEADER */}
        <div className="p-4 border-b border-beige-100 flex items-center justify-between bg-beige-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-beige-500 flex items-center justify-center text-white shadow-sm">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground leading-none">AI Triage Assistant</h3>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Online</span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-beige-100 transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-hidden flex flex-col">
          
          {/* CHAT PHASE */}
          {phase === "chat" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Messages Area */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-beige-50/30">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm ${
                      m.role === "user" 
                        ? "bg-beige-500 text-white rounded-br-none" 
                        : "bg-white border border-beige-100 text-foreground rounded-bl-none"
                    }`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start animate-in fade-in">
                    <div className="bg-white border border-beige-100 px-4 py-2.5 rounded-2xl rounded-bl-none flex items-center gap-2 shadow-sm">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-beige-300 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-beige-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-beige-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Bar */}
              <div className="p-4 bg-white border-t border-beige-100">
                <div className="relative flex items-center gap-2">
                  <textarea
                    rows={1}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your symptoms here..."
                    className="flex-1 bg-beige-50 border border-beige-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-beige-500/20 focus:border-beige-300 resize-none max-h-32"
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputText.trim() || sending}
                    className="p-3 bg-beige-500 hover:bg-beige-600 text-white rounded-xl shadow-md disabled:opacity-50 transition-all active:scale-90 flex-shrink-0"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-[10px] text-center text-muted-foreground mt-2 font-medium uppercase tracking-widest">
                  Secure Medical Encryption Enabled
                </p>
              </div>
            </div>
          )}

          {/* SUMMARY PHASE */}
          {phase === "summary" && (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              <div className="bg-beige-50 rounded-2xl p-6 border border-beige-100 space-y-6 animate-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 text-beige-600">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold">Consultation Summary</h3>
                    <p className="text-[10px] uppercase tracking-wider font-bold opacity-60">Internal Medical Report</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-beige-100 shadow-sm">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Triage Priority</p>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          summary?.priority === "Immediate" ? "bg-red-500" :
                          summary?.priority === "Urgent" ? "bg-orange-500" : "bg-green-500"
                        }`} />
                        <span className="text-sm font-bold">{summary?.priority || "Normal"}</span>
                      </div>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-beige-100 shadow-sm">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">Consultation ID</p>
                      <span className="text-sm font-bold">#AI-{Math.floor(Math.random()*9000)+1000}</span>
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-beige-100 shadow-sm">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Clinical Findings</p>
                    <p className="text-sm leading-relaxed text-foreground/80">{summary?.summary}</p>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-beige-100 shadow-sm">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Key Symptoms</p>
                    <div className="flex flex-wrap gap-2">
                      {summary?.symptoms?.map((s, i) => (
                        <span key={i} className="px-2 py-1 bg-beige-50 text-beige-700 rounded-md text-xs font-medium border border-beige-200">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <button
                  onClick={saveToFirestore}
                  className="w-full py-4 bg-beige-500 hover:bg-beige-600 text-white rounded-2xl font-bold shadow-lg shadow-beige-100 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Confirm & Submit
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-3 text-muted-foreground font-medium hover:text-foreground transition-colors"
                >
                  Cancel Assessment
                </button>
              </div>
            </div>
          )}

          {/* SAVING PHASE */}
          {phase === "saving" && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
              <Loader2 className="w-12 h-12 text-beige-500 animate-spin" />
              <p className="font-medium text-foreground">Submitting clinical report...</p>
            </div>
          )}

          {/* DONE PHASE */}
          {phase === "done" && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center animate-in zoom-in">
                <ShieldCheck className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">Successfully Submitted</h3>
                <p className="text-sm text-muted-foreground">
                  Your symptoms have been recorded. A medical professional will review your case and call you shortly.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-4 bg-beige-500 hover:bg-beige-600 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-[0.98]"
              >
                Return to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AICallModal;
