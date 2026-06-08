import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Database, Zap, CheckCircle2, Loader2, Home, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const MOCK_PATIENTS = [
  { name: "Ali Bin Ibrahim", age: 52, complaint: "Sudden sharp chest pain and sweating", triage: 5, duration: "30 mins", pain: 9 },
  { name: "Siti Nurhaliza", age: 28, complaint: "Mild sore throat and sneezing", triage: 1, duration: "2 days", pain: 2 },
  { name: "Tan Ah Teck", age: 65, complaint: "Severe headache and blurred vision", triage: 3, duration: "4 hours", pain: 7 },
  { name: "Muthu Samy", age: 40, complaint: "High fever and persistent dry cough", triage: 4, duration: "3 days", pain: 5 },
  { name: "John Doe", age: 19, complaint: "Sprained ankle during football", triage: 2, duration: "1 hour", pain: 6 },
  { name: "Sarah Connor", age: 35, complaint: "Difficulty breathing and wheezing", triage: 5, duration: "20 mins", pain: 8 },
  { name: "Wei Ling", age: 45, complaint: "Deep laceration on left forearm", triage: 4, duration: "15 mins", pain: 8 },
  { name: "Amy Wong", age: 31, complaint: "Persistent abdominal cramps", triage: 3, duration: "6 hours", pain: 7 },
  { name: "Robert Smith", age: 72, complaint: "Minor skin rash on back", triage: 1, duration: "1 week", pain: 1 },
  { name: "Lisa Ray", age: 24, complaint: "Nausea and dizziness", triage: 2, duration: "5 hours", pain: 4 },
  { name: "Zul Ariffin", age: 38, complaint: "Broken wrist after a fall", triage: 3, duration: "2 hours", pain: 8 },
  { name: "Mei Mei", age: 5, complaint: "High fever and earache", triage: 3, duration: "12 hours", pain: 7 },
  { name: "Rajesh Kumar", age: 50, complaint: "Weakness in left arm and slurred speech", triage: 5, duration: "10 mins", pain: 2 },
  { name: "Emily Blunt", age: 29, complaint: "Allergic reaction to peanuts", triage: 4, duration: "15 mins", pain: 6 },
  { name: "Kevin Hart", age: 42, complaint: "Lower back muscle strain", triage: 2, duration: "1 day", pain: 5 },
  { name: "Sandra Bullock", age: 58, complaint: "Frequent urination and thirst", triage: 2, duration: "2 weeks", pain: 0 },
  { name: "Tom Cruise", age: 60, complaint: "Shoulder dislocation", triage: 3, duration: "1 hour", pain: 8 },
  { name: "Will Smith", age: 53, complaint: "Severe toothache", triage: 1, duration: "3 days", pain: 9 },
  { name: "Gal Gadot", age: 36, complaint: "Migraine with aura", triage: 2, duration: "4 hours", pain: 8 },
  { name: "Chris Evans", age: 40, complaint: "Burn on hand from cooking", triage: 2, duration: "30 mins", pain: 7 }
];

export default function SeedPage() {
  const [seeding, setSeeding] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleSeed = async () => {
    setSeeding(true);
    setDone(false);
    setProgress(0);

    try {
      for (let i = 0; i < MOCK_PATIENTS.length; i++) {
        const p = MOCK_PATIENTS[i];
        await addDoc(collection(db, "EDMAT"), {
          patientName: p.name,
          userName: p.name,
          age: p.age,
          chiefComplaint: p.complaint,
          symptomDuration: p.duration,
          painLevel: p.pain,
          triageLevel: p.triage,
          aiSummary: `Simulated patient with ${p.complaint}. Triage level assessment based on standard ER protocols.`,
          status: "pending",
          createdAt: serverTimestamp(),
          redFlagSymptoms: p.triage >= 4 ? "Detected" : "None",
          medicalHistory: "None",
          userEmail: "test@example.com"
        });
        setProgress(i + 1);
      }
      setDone(true);
    } catch (err) {
      console.error("Seeding failed:", err);
      alert("Failed to seed data: " + err.message);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-mono flex items-center justify-center p-6 relative overflow-hidden">
      {/* Matrix-like background effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:20px_20px]"></div>
      </div>

      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
            <Database className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">System Seeder</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Authorized Access Only</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400">Target Collection:</span>
              <span className="text-xs font-bold text-emerald-400">EDMAT</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">Payload Count:</span>
              <span className="text-xs font-bold text-emerald-400">{MOCK_PATIENTS.length} Records</span>
            </div>
          </div>

          {!done ? (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-900/20 group"
            >
              {seeding ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing... {progress}/{MOCK_PATIENTS.length}</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 group-hover:animate-pulse" />
                  <span>Execute Seed Protocol</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-emerald-400 animate-in zoom-in-95">
                <CheckCircle2 className="w-6 h-6" />
                <div className="flex-1">
                  <p className="text-sm font-bold">Protocol Succeeded</p>
                  <p className="text-[10px] opacity-80">20 patients dispatched to receptionist.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Link to="/" className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-center text-sm font-bold flex items-center justify-center gap-2">
                  <Home className="w-4 h-4" /> Home
                </Link>
                <Link to="/receptionist" className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-center text-sm font-bold flex items-center justify-center gap-2">
                  Verify <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800">
          <p className="text-[10px] text-slate-600 text-center uppercase tracking-tighter">
            Warning: This action will populate the live database. Use for testing environments only.
          </p>
        </div>
      </div>
    </div>
  );
}
