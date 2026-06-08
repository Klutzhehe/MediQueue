import { useState, useEffect, Fragment } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  increment,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  ClipboardList,
  User,
  Clock,
  Stethoscope,
  CheckCircle,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Calendar,
  Hash,
  Activity,
  BedDouble,
  Info,
  X,
} from "lucide-react";

const TRIAGE_LABELS = {
  0: "No Concern",
  1: "Minor",
  2: "Low Urgency",
  3: "Moderate",
  4: "High Urgency",
  5: "CRITICAL",
};

const TRIAGE_COLORS = {
  0: "bg-gray-100 text-gray-600 border-gray-200",
  1: "bg-green-100 text-green-700 border-green-200",
  2: "bg-yellow-100 text-yellow-700 border-yellow-200",
  3: "bg-orange-100 text-orange-700 border-orange-200",
  4: "bg-red-100 text-red-700 border-red-200",
  5: "bg-purple-100 text-purple-700 border-purple-200",
};

const ZONE_COLORS = {
  red:    { border: "#ef4444", label: "Red Zone" },
  yellow: { border: "#eab308", label: "Yellow Zone" },
  green:  { border: "#22c55e", label: "Green Zone" },
  blue:   { border: "#3b82f6", label: "Blue Zone" },
};

const TRIAGE_RING = {
  0: "ring-gray-300",
  1: "ring-green-300",
  2: "ring-yellow-300",
  3: "ring-orange-300",
  4: "ring-red-400",
  5: "ring-purple-400",
};

const DOCTORS = [
  { id: "dr-lim", name: "Dr. Lim Wei Jian", specialty: "General Medicine" },
  { id: "dr-tan", name: "Dr. Tan Mei Ling", specialty: "Emergency" },
  { id: "dr-kumar", name: "Dr. Kumar Raj", specialty: "Cardiology" },
  { id: "dr-hassan", name: "Dr. Hassan Aziz", specialty: "Orthopaedics" },
  { id: "dr-chen", name: "Dr. Chen Xiao Hong", specialty: "Neurology" },
];

// Round current time up to next 5-minute slot, then return slot N
function computeAppointmentTime(slotsUsed = 0) {
  const now = new Date();
  const ms = now.getTime();
  const fiveMin = 5 * 60 * 1000;
  const nextSlot = Math.ceil(ms / fiveMin) * fiveMin + slotsUsed * fiveMin;
  const d = new Date(nextSlot);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "pm" : "am";
  const h12 = d.getHours() % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
}

function minutesSince(timestamp) {
  if (!timestamp) return 1;
  const created =
    timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return Math.max(1, Math.floor((Date.now() - created.getTime()) / 60000));
}

// urgency = symptom_severity × time_waiting / resource_availability
// resource_availability = number of available doctors (more doctors = easier to schedule)
function calcUrgencyScore(triageLevel, createdAt, resourceAvailability = 5) {
  const severity = triageLevel || 1;
  const waiting = minutesSince(createdAt);
  const score = (severity * waiting) / Math.max(1, resourceAvailability);
  return Math.round(score * 10) / 10;
}

export default function ReceptionistPage() {
  const [queue, setQueue] = useState([]);
  const [accepted, setAccepted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState({}); // docId → overrideLevel
  const [appointments, setAppointments] = useState({}); // patientId → { date, time }
  const [assignments, setAssignments] = useState({}); // docId → doctorId
  const [calendarOpen, setCalendarOpen] = useState(null); // { patient, doctorId }
  const [accepting, setAccepting] = useState({}); // docId → bool
  const [tab, setTab] = useState("pending"); // "pending" | "accepted" | "schedule"
  const [now, setNow] = useState(Date.now());
  const [mapConfig, setMapConfig] = useState({ zones: [], beds: [] });
  const [bedAssignments, setBedAssignments] = useState({}); // patientId → bedId
  const [showBedInfo, setShowBedInfo] = useState(false);

  const [doctorsList, setDoctorsList] = useState([]);

  useEffect(() => {
    // 1. Listen to dynamic doctors collection (managed by Head Dept)
    const unsubDocs = onSnapshot(collection(db, "doctors"), (snap) => {
      setDoctorsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Fetch map config
    const unsubMap = onSnapshot(doc(db, "mapConfig", "hospital"), (snap) => {
      if (snap.exists()) setMapConfig(snap.data());
    });

    // 3. Refresh "time waiting" every 30s
    const t = setInterval(() => setNow(Date.now()), 30000);
    
    return () => { unsubDocs(); unsubMap(); clearInterval(t); };
  }, []);

  useEffect(() => {
    const q = query(collection(db, "EDMAT"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setQueue(all.filter((x) => x.status === "pending"));
      setAccepted(all.filter((x) => x.status !== "pending"));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleAdjust = (id, delta, current) => {
    const cur = adjustments[id] ?? current;
    const next = Math.max(0, Math.min(5, cur + delta));
    setAdjustments((prev) => ({ ...prev, [id]: next }));
    
    // Smooth scroll back to the card after it moves in the sorted list
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  const handleAccept = async (item) => {
    const doctorId = assignments[item.id];
    if (!doctorId) return;
    setAccepting((prev) => ({ ...prev, [item.id]: true }));

    const finalTriage = adjustments[item.id] ?? item.triageLevel;
    const urgency = calcUrgencyScore(finalTriage, item.createdAt);
    
    const durationMap = { 0: 5, 1: 10, 2: 10, 3: 15, 4: 20, 5: 30 };
    const duration = durationMap[finalTriage] || 10;

    const manual = appointments[item.id] || {};
    let apptTime = manual.time || "";
    let apptDate = manual.date || new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    
    if (!apptTime) {
      const doctorAppts = accepted.filter((a) => a.assignedDoctorId === doctorId);
      apptTime = computeAppointmentTime(doctorAppts.length * 2); // default logic
    }

      const doctor = doctorsList.find((d) => d.id === doctorId);
    const bedId = bedAssignments[item.id];
    const bed = mapConfig.beds.find(b => b.id === bedId);

    try {
      await updateDoc(doc(db, "EDMAT", item.id), {
        status: "accepted",
        triageLevel: finalTriage,
        urgencyScore: urgency,
        assignedDoctorId: doctorId,
        assignedDoctorName: doctor?.name || doctorId,
        assignedBedId: bedId || null,
        assignedBedName: bed?.name || null,
        appointmentTime: apptTime,
        appointmentDate: apptDate,
        appointmentDuration: duration,
        acceptedAt: serverTimestamp(),
      });

      // 2. Update the Doctor's Schedule Database
      const doctorRef = doc(db, "doctors", doctorId);
      await updateDoc(doctorRef, {
        currentLoad: increment(1),
        lastAssignedAt: serverTimestamp(),
        totalPatientsToday: increment(1),
      });

    } finally {
      setAccepting((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const sortedQueue = [...queue].sort((a, b) => {
    const ua = calcUrgencyScore(
      adjustments[a.id] ?? a.triageLevel,
      a.createdAt
    );
    const ub = calcUrgencyScore(
      adjustments[b.id] ?? b.triageLevel,
      b.createdAt
    );
    return ub - ua;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-50 via-beige-100 to-beige-200">
      {/* Header */}
      <header className="border-b border-beige-200 backdrop-blur-sm bg-white/70 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-beige-400 to-beige-600 flex items-center justify-center shadow-lg">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-lg leading-none">Reception Dashboard</h1>
              <p className="text-muted-foreground text-xs mt-0.5">EDMAT Triage Queue</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Bed Stats */}
            <div className="flex items-center gap-1.5 bg-beige-500/10 text-beige-600 border border-beige-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold mr-2">
              <BedDouble className="w-3.5 h-3.5" />
              <span>Beds: {mapConfig.beds.length - accepted.filter(a => a.assignedBedId && a.status !== "completed").length}/{mapConfig.beds.length}</span>
              <button onClick={() => setShowBedInfo(true)} className="ml-1 p-0.5 hover:bg-beige-500/20 rounded transition">
                <Info className="w-3 h-3" />
              </button>
            </div>

            <span className="flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {queue.length} Pending
            </span>
            <span className="flex items-center gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <CheckCircle className="w-3.5 h-3.5" />
              {accepted.length} Accepted
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
          {[
            { key: "pending", label: "Pending Queue", count: queue.length },
            { key: "accepted", label: "Scheduled", count: accepted.length },
            { key: "schedule", label: "Doctor Timetables", count: doctorsList.length },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 flex-shrink-0 ${
                tab === t.key
                  ? "bg-beige-500 text-white shadow-lg"
                  : "bg-white text-muted-foreground hover:bg-beige-50 hover:text-foreground border border-beige-200"
              }`}
            >
              {t.label}
              <span
                className={`px-1.5 py-0.5 rounded-md text-xs ${
                  tab === t.key ? "bg-white/20" : "bg-beige-100"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-beige-400 animate-spin" />
            <span className="ml-3 text-muted-foreground">Loading queue...</span>
          </div>
        )}

        {/* PENDING TAB */}
        {tab === "pending" && !loading && (
          <div className="space-y-4">
            {sortedQueue.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No pending patients</p>
                <p className="text-sm mt-1">New triage submissions will appear here</p>
              </div>
            ) : (
              sortedQueue.map((item) => {
                const triage = adjustments[item.id] ?? item.triageLevel ?? 1;
                const urgency = calcUrgencyScore(triage, item.createdAt);
                const waiting = minutesSince(item.createdAt);
                const doctorId = assignments[item.id] || "";
                const isReady = !!doctorId;

                return (
                  <div
                    key={item.id}
                    id={item.id}
                    className={`bg-white/80 backdrop-blur-sm border rounded-2xl overflow-hidden transition-all hover:shadow-xl hover:shadow-beige-200/40 ${
                      triage >= 4
                        ? "border-red-500/30 shadow-red-900/10"
                        : triage >= 3
                        ? "border-orange-500/20"
                        : "border-beige-200"
                    }`}
                  >
                    {/* Card header strip */}
                    <div
                      className={`h-1 w-full ${
                        triage === 5
                          ? "bg-gradient-to-r from-purple-500 to-pink-500"
                          : triage === 4
                          ? "bg-gradient-to-r from-red-500 to-orange-400"
                          : triage === 3
                          ? "bg-gradient-to-r from-orange-400 to-yellow-400"
                          : triage === 2
                          ? "bg-gradient-to-r from-yellow-400 to-lime-400"
                          : "bg-gradient-to-r from-green-400 to-teal-400"
                      }`}
                    />

                    <div className="p-5">
                      {/* Top row: patient + triage */}
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-beige-100 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-beige-500" />
                          </div>
                          <div>
                            <h3 className="font-bold text-foreground text-base leading-tight">
                              {item.patientName || item.userName || "Unknown"}
                            </h3>
                            <p className="text-muted-foreground text-xs">
                              {item.age ? `Age ${item.age}` : ""}{" "}
                              {item.userEmail ? `· ${item.userEmail}` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Urgency score */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-amber-400 justify-end">
                              <Activity className="w-3.5 h-3.5" />
                              <span className="text-xs font-medium">Urgency</span>
                            </div>
                            <span className="text-2xl font-bold text-foreground">{urgency}</span>
                          </div>
                        </div>
                      </div>

                      {/* Details grid */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <InfoCell label="Chief Complaint" value={item.chiefComplaint} />
                        <InfoCell label="Duration" value={item.symptomDuration} />
                        <InfoCell label="Pain Level" value={item.painLevel ? `${item.painLevel}/10` : null} />
                        <InfoCell
                          label="Waiting"
                          value={
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {waiting} min
                            </span>
                          }
                        />
                        {item.redFlagSymptoms && item.redFlagSymptoms !== "None" && (
                          <div className="col-span-2">
                            <InfoCell
                              label="⚠ Red Flags"
                              value={item.redFlagSymptoms}
                              highlight
                            />
                          </div>
                        )}
                        {item.aiSummary && (
                          <div className="col-span-2 bg-beige-50/50 rounded-xl p-3 border border-beige-200">
                            <p className="text-xs text-muted-foreground font-medium mb-1">AI Summary</p>
                            <p className="text-sm text-foreground leading-relaxed">{item.aiSummary}</p>
                          </div>
                        )}
                      </div>

                      {/* Triage Adjuster + Doctor Assignment */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        {/* Triage score adjuster */}
                        <div className="flex-1 bg-beige-50/50 rounded-xl p-3 border border-beige-200">
                          <p className="text-xs text-muted-foreground font-medium mb-2">Triage Score (AI: {item.triageLevel})</p>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleAdjust(item.id, -1, item.triageLevel)}
                              className="w-8 h-8 rounded-lg bg-white border border-beige-200 hover:bg-beige-50 flex items-center justify-center text-muted-foreground transition"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <div
                              className={`flex-1 text-center py-1.5 rounded-lg font-bold text-sm border ${TRIAGE_COLORS[triage]}`}
                            >
                              {triage} — {TRIAGE_LABELS[triage]}
                            </div>
                            <button
                              onClick={() => handleAdjust(item.id, 1, item.triageLevel)}
                              className="w-8 h-8 rounded-lg bg-white border border-beige-200 hover:bg-beige-50 flex items-center justify-center text-muted-foreground transition"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Doctor assignment */}
                        <div className="flex-1 bg-beige-50/50 rounded-xl p-3 border border-beige-200">
                          <p className="text-xs text-muted-foreground font-medium mb-2">Assign Doctor</p>
                          <select
                            value={doctorId}
                            onChange={(e) =>
                              setAssignments((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="w-full bg-white text-foreground text-sm rounded-lg px-3 py-2 border border-beige-200 focus:outline-none focus:ring-2 focus:ring-beige-400"
                          >
                             <option value="">— Select Doctor —</option>
                             {doctorsList.map((d) => (
                               <option key={d.id} value={d.id}>
                                 {d.name} {d.isBusy ? `(ACTIVE: ${d.currentLoad} pts)` : "(AVAILABLE)"}
                               </option>
                             ))}
                          </select>
                        </div>

                        {/* Bed Assignment */}
                        <div className="flex-1 bg-beige-50/50 rounded-xl p-3 border border-beige-200">
                          <p className="text-xs text-muted-foreground font-medium mb-2">Assign Bed</p>
                          <select
                            value={bedAssignments[item.id] || ""}
                            onChange={(e) =>
                              setBedAssignments((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="w-full bg-white text-foreground text-sm rounded-lg px-3 py-2 border border-beige-200 focus:outline-none focus:ring-2 focus:ring-beige-400"
                          >
                             <option value="">— Select Bed —</option>
                             {(() => {
                               const level = adjustments[item.id] ?? item.triageLevel;
                               const targetColor = level >= 4 ? "red" : level >= 2 ? "yellow" : "green";
                               const zoneIds = mapConfig.zones.filter(z => z.color === targetColor).map(z => z.id);
                               
                               return mapConfig.beds
                                 .filter(b => {
                                   // Check if bed is in the target zones
                                   const inZone = mapConfig.zones.some(z => 
                                     zoneIds.includes(z.id) && 
                                     b.x >= z.x && b.x < z.x + z.w && 
                                     b.y >= z.y && b.y < z.y + z.h
                                   );
                                   return inZone;
                                 })
                                 .map(b => {
                                   const isOccupied = accepted.some(a => a.assignedBedId === b.id && a.status !== "completed");
                                   return (
                                     <option key={b.id} value={b.id} disabled={isOccupied}>
                                       {b.name || "Bed"} {isOccupied ? "(OCCUPIED)" : `(${targetColor.toUpperCase()} ZONE)`}
                                     </option>
                                   );
                                 });
                             })()}
                          </select>
                        </div>

                        {/* Smart Slot Picker (15min) */}
                        <div className="flex-1 bg-beige-50/50 rounded-xl p-3 border border-beige-200 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-muted-foreground font-medium">Select Time Slot (15m)</p>
                            <button 
                              onClick={() => setCalendarOpen({ item, doctorId })}
                              className="text-[10px] font-bold text-beige-600 hover:text-beige-700 underline"
                            >
                              📅 Weekly Calendar
                            </button>
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                            {(() => {
                              const slots = [];
                              const now = new Date();
                              let start = new Date(Math.ceil(now.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000));
                              
                              for (let i = 0; i < 16; i++) {
                                const d = new Date(start.getTime() + i * 15 * 60 * 1000);
                                const h12 = d.getHours() % 12 || 12;
                                const m = d.getMinutes().toString().padStart(2, "0");
                                const ampm = d.getHours() >= 12 ? "pm" : "am";
                                const timeStr = `${h12}:${m}${ampm}`;
                                const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                                
                                slots.push(
                                  <button
                                    key={i}
                                    onClick={() => setAppointments(prev => ({ ...prev, [item.id]: { date: dateStr, time: timeStr } }))}
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                      appointments[item.id]?.time === timeStr && (appointments[item.id]?.date === dateStr || !appointments[item.id]?.date)
                                        ? "bg-beige-500 text-white border-beige-600 shadow-md"
                                        : "bg-white text-muted-foreground border-beige-200 hover:border-beige-400"
                                    }`}
                                  >
                                    {timeStr}
                                  </button>
                                );
                              }
                              return slots;
                            })()}
                          </div>
                          {appointments[item.id]?.date && (
                            <p className="text-[10px] text-beige-500 mt-1 font-bold">Selected: {appointments[item.id].date} at {appointments[item.id].time}</p>
                          )}
                        </div>
                      </div>

                      {/* Accept button */}
                      <button
                        onClick={() => handleAccept(item)}
                        disabled={!isReady || accepting[item.id]}
                        className={`w-full mt-3 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                          isReady
                            ? "bg-gradient-to-r from-beige-500 to-beige-600 hover:from-beige-600 hover:to-beige-700 text-white shadow-lg"
                            : "bg-beige-100 text-beige-300 cursor-not-allowed"
                        }`}
                      >
                        {accepting[item.id] ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Scheduling...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" /> Accept & Schedule
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ACCEPTED TAB */}
        {tab === "accepted" && !loading && (
          <div className="space-y-3">
            {accepted.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No scheduled appointments yet</p>
              </div>
            ) : (
              [...accepted]
                .sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0))
                .map((item) => (
                  <div
                    key={item.id}
                    className="bg-white/80 backdrop-blur-sm border border-beige-200 rounded-2xl p-4 flex items-center gap-4"
                  >
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-lg border ${
                        TRIAGE_COLORS[item.triageLevel ?? 1]
                      }`}
                    >
                      {item.triageLevel}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-foreground text-sm truncate">
                        {item.patientName || item.userName}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-muted-foreground text-xs truncate">{item.assignedDoctorName}</p>
                        {item.assignedBedName && (
                          <>
                            <span className="text-beige-300">·</span>
                            <div className="flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                              <BedDouble className="w-2.5 h-2.5" />
                              {item.assignedBedName}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1.5 text-beige-600 font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        {item.appointmentTime}
                      </div>
                    </div>
                    <div
                      className={`px-2 py-1 rounded-lg text-xs font-semibold border ${
                        item.status === "completed"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : item.status === "in-progress"
                          ? "bg-blue-100 text-blue-700 border-blue-200"
                          : "bg-amber-100 text-amber-700 border-amber-200"
                      }`}
                    >
                      {item.status}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* SCHEDULE TAB */}
        {tab === "schedule" && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {doctorsList.map((doc) => {
              const docAppts = accepted.filter(a => a.assignedDoctorId === doc.id)
                .sort((a, b) => {
                  // Simple time sort (approximation)
                  return (a.appointmentTime || "").localeCompare(b.appointmentTime || "");
                });

              return (
                <div key={doc.id} className="bg-white/80 backdrop-blur-sm border border-beige-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                  <div className="p-4 bg-beige-50 border-b border-beige-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-beige-400 text-white flex items-center justify-center font-bold">
                        {doc.avatar || doc.name[0]}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-foreground leading-tight">{doc.name}</h4>
                        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">{doc.specialty}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex-1 space-y-2 overflow-y-auto max-h-[400px] bg-white/50">
                    {docAppts.length === 0 ? (
                      <p className="text-center py-10 text-[10px] text-muted-foreground">No appointments today</p>
                    ) : (
                      docAppts.map(a => (
                        <div key={a.id} className="flex items-center gap-3 p-2 bg-white rounded-xl border border-beige-100 shadow-sm">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border ${TRIAGE_COLORS[a.triageLevel]}`}>
                            {a.triageLevel}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold truncate">{a.patientName || a.userName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{a.appointmentTime}</p>
                          </div>
                          <div className={`w-2 h-2 rounded-full ${
                            a.status === 'completed' ? 'bg-green-400' :
                            a.status === 'in-progress' ? 'bg-blue-400' : 'bg-amber-400'
                          }`} />
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-3 bg-beige-50/50 border-t border-beige-100 flex justify-between text-[10px] font-semibold text-muted-foreground">
                    <span>Active: {doc.currentLoad || 0}</span>
                    <span>Total: {doc.totalPatientsToday || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Calendar Slide-down Modal */}
      {calendarOpen && (
        <WeeklyCalendarModal
          patient={calendarOpen.item}
          doctorId={calendarOpen.doctorId}
          doctorsList={doctorsList}
          acceptedAppointments={accepted}
          onSelect={(date, time) => {
            setAppointments(prev => ({ ...prev, [calendarOpen.item.id]: { date, time } }));
            setCalendarOpen(null);
          }}
          onClose={() => setCalendarOpen(null)}
        />
      )}

      {/* Bed Info Modal */}
      {showBedInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-beige-100 flex items-center justify-between bg-beige-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-beige-500 text-white flex items-center justify-center">
                  <BedDouble className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Bed Availability</h3>
                  <p className="text-xs text-muted-foreground">Current hospital capacity</p>
                </div>
              </div>
              <button onClick={() => setShowBedInfo(false)} className="p-2 hover:bg-beige-100 rounded-full transition">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div className="p-3 bg-beige-50 rounded-2xl border border-beige-100 text-center">
                  <p className="text-[10px] font-bold text-beige-400 uppercase">Total</p>
                  <p className="text-2xl font-black text-beige-700">{mapConfig.beds.length}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-2xl border border-green-100 text-center">
                  <p className="text-[10px] font-bold text-green-400 uppercase">Available</p>
                  <p className="text-2xl font-black text-green-700">
                    {mapConfig.beds.length - accepted.filter(a => a.assignedBedId && a.status !== "completed").length}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone Breakdown</p>
                {mapConfig.zones.map(z => {
                  const bedsInZone = mapConfig.beds.filter(b => 
                    b.x >= z.x && b.x < z.x + z.w && 
                    b.y >= z.y && b.y < z.y + z.h
                  );
                  const occupiedInZone = bedsInZone.filter(b => 
                    accepted.some(a => a.assignedBedId === b.id && a.status !== "completed")
                  ).length;
                  
                  return (
                    <div key={z.id} className="flex items-center justify-between p-3 bg-beige-50/50 rounded-xl border border-beige-100">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ZONE_COLORS[z.color]?.border || "#cbd5e1" }} />
                        <span className="text-sm font-bold text-slate-700">{z.name || (z.color + " Zone")}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900">{bedsInZone.length - occupiedInZone}</span>
                        <span className="text-xs text-slate-400 mx-1">/</span>
                        <span className="text-xs font-medium text-slate-500">{bedsInZone.length} free</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyCalendarModal({ patient, doctorId, doctorsList, acceptedAppointments, onSelect, onClose }) {
  const doctor = doctorsList.find(d => d.id === doctorId);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      full: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      short: d.toLocaleDateString(undefined, { weekday: 'short' }),
      day: d.getDate()
    });
  }

  const times = [];
  for (let h = 8; h <= 18; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = h % 12 || 12;
      const mm = m.toString().padStart(2, "0");
      const ampm = h >= 12 ? "pm" : "am";
      times.push(`${hh}:${mm}${ampm}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="p-4 border-b border-beige-100 bg-beige-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-beige-400 text-white flex items-center justify-center font-bold">
              {doctor?.avatar || "DR"}
            </div>
            <div>
              <h3 className="font-bold text-foreground">Weekly Schedule: {doctor?.name}</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Select a slot for {patient.patientName || patient.userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-beige-100 rounded-full transition">
            <ChevronDown className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-8 gap-2 min-w-[700px]">
            {/* Header row */}
            <div className="sticky top-0 z-10 bg-white" />
            {days.map(d => (
              <div key={d.full} className="sticky top-0 z-10 bg-white p-2 text-center border-b border-beige-100">
                <p className="text-[10px] font-bold text-beige-500 uppercase">{d.short}</p>
                <p className="text-sm font-bold text-foreground">{d.day}</p>
              </div>
            ))}

            {/* Time Rows */}
            {times.map(t => (
              <Fragment key={t}>
                <div className="text-[10px] font-bold text-muted-foreground flex items-center justify-end pr-2 py-1">
                  {t}
                </div>
                {days.map(d => {
                  const isBusy = acceptedAppointments.some(a => 
                    a.assignedDoctorId === doctorId && 
                    a.appointmentTime === t && 
                    a.appointmentDate === d.full
                  );
                  return (
                    <button
                      key={d.full + t}
                      disabled={isBusy}
                      onClick={() => onSelect(d.full, t)}
                      className={`h-10 rounded-lg border transition-all flex items-center justify-center text-[9px] font-bold ${
                        isBusy 
                          ? "bg-red-50 border-red-100 text-red-300 cursor-not-allowed"
                          : "bg-white border-beige-50 hover:bg-beige-500 hover:text-white hover:border-beige-600 hover:shadow-md"
                      }`}
                    >
                      {isBusy ? "BUSY" : "AVAILABLE"}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="p-4 bg-beige-50/30 border-t border-beige-100 flex justify-center">
          <p className="text-[10px] text-muted-foreground italic">Tip: Busy slots are already booked by other patients.</p>
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value, highlight = false }) {
  return (
    <div>
      <p className="text-xs text-slate-500 font-medium mb-0.5">{label}</p>
      <p
        className={`text-sm font-medium ${
          highlight ? "text-red-500" : "text-foreground"
        }`}
      >
        {value || <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}
