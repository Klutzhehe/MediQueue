import { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Stethoscope,
  User,
  Clock,
  CheckCircle,
  Circle,
  ChevronDown,
  Activity,
  CalendarClock,
  AlertCircle,
  Loader2,
  Bell,
  X,
  Info,
  BedDouble
} from "lucide-react";

const DOCTORS = [
  { id: "dr-lim", name: "Dr. Lim Wei Jian", specialty: "General Medicine", avatar: "LW" },
  { id: "dr-tan", name: "Dr. Tan Mei Ling", specialty: "Emergency", avatar: "TM" },
  { id: "dr-kumar", name: "Dr. Kumar Raj", specialty: "Cardiology", avatar: "KR" },
  { id: "dr-hassan", name: "Dr. Hassan Aziz", specialty: "Orthopaedics", avatar: "HA" },
  { id: "dr-chen", name: "Dr. Chen Xiao Hong", specialty: "Neurology", avatar: "CX" },
];

const TRIAGE_COLORS = {
  0: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  1: "bg-green-500/20 text-green-400 border-green-500/30",
  2: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  3: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  4: "bg-red-500/20 text-red-400 border-red-500/30",
  5: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const TRIAGE_LABELS = {
  0: "No Concern",
  1: "Minor",
  2: "Low Urgency",
  3: "Moderate",
  4: "High Urgency",
  5: "CRITICAL",
};

const STATUS_CONFIG = {
  accepted: { label: "Waiting", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  admitted: { label: "Admitted", color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20" },
  "in-progress": { label: "In Progress", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  completed: { label: "Done", color: "text-green-400 bg-green-400/10 border-green-400/20" },
};

export default function DoctorPage() {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(() => localStorage.getItem("selectedDoctorId") || "");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState({});
  const [starting, setStarting] = useState({});
  const [admitting, setAdmitting] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const [admissionPending, setAdmissionPending] = useState(null); // patient ID
  const [admitDetails, setAdmitDetails] = useState({ 
    admitTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), 
    nextApptDate: new Date().toISOString().split('T')[0],
    nextApptTime: "" 
  });

  useEffect(() => {
    // 1. Fetch doctors dynamically
    const unsubDocs = onSnapshot(collection(db, "doctors"), (snap) => {
      setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Fetch notifications
    const qNotifs = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc")
    );
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(notifs);
      // For demo, we'll just count all as unread if they were created in the last 1 hour
      const recent = notifs.filter(n => {
        const time = n.createdAt?.toDate?.() || new Date(n.createdAt);
        return (new Date() - time) < 3600000;
      });
      setUnreadCount(recent.length);
    });

    return () => { unsubDocs(); unsubNotifs(); };
  }, []);

  const doctor = doctors.find((d) => d.id === selectedDoc);

  useEffect(() => {
    if (!selectedDoc || !db) {
      setPatients([]);
      return;
    }
    setLoading(true);
    
    // Listening specifically for patients assigned to this doctor
    const q = query(
      collection(db, "EDMAT"),
      where("assignedDoctorId", "==", selectedDoc)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPatients(data);
      setLoading(false);
    }, (err) => {
      console.error("Firestore error in DoctorPage:", err);
      setLoading(false);
    });

    return unsub;
  }, [selectedDoc]);

  const handleStartPatient = async (id) => {
    setStarting((prev) => ({ ...prev, [id]: true }));
    try {
      await updateDoc(doc(db, "EDMAT", id), {
        status: "in-progress",
        startedAt: serverTimestamp(),
      });
    } finally {
      setStarting((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleAdmit = async (id) => {
    if (!admitDetails.admitTime) return;
    setAdmitting((prev) => ({ ...prev, [id]: true }));
    try {
      await updateDoc(doc(db, "EDMAT", id), {
        status: "admitted",
        admittedAt: serverTimestamp(),
        actualAdmitTime: admitDetails.admitTime,
        nextAppointmentDate: admitDetails.nextApptDate,
        nextAppointmentTime: admitDetails.nextApptTime,
      });
      setAdmissionPending(null);
      setAdmitDetails({ 
        admitTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), 
        nextApptDate: new Date().toISOString().split('T')[0],
        nextApptTime: "" 
      });
    } finally {
      setAdmitting((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleComplete = async (id) => {
    setCompleting((prev) => ({ ...prev, [id]: true }));
    try {
      // 1. Update patient status
      await updateDoc(doc(db, "EDMAT", id), {
        status: "completed",
        completedAt: serverTimestamp(),
      });

      // 2. Decrement doctor's active load
      if (selectedDoc) {
        await updateDoc(doc(db, "doctors", selectedDoc), {
          currentLoad: increment(-1)
        });
      }
    } finally {
      setCompleting((prev) => ({ ...prev, [id]: false }));
    }
  };

  const sortedPatients = [...patients].sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));
  const waiting = sortedPatients.filter((p) => p.status === "accepted");
  const admitted = sortedPatients.filter((p) => p.status === "admitted");
  const inProgress = sortedPatients.filter((p) => p.status === "in-progress");
  const done = sortedPatients.filter((p) => p.status === "completed");

  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-50 via-beige-100 to-beige-200">
      {/* Header */}
      <header className="border-b border-beige-200 backdrop-blur-sm bg-white/70 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-lg leading-none">Doctor Portal</h1>
              <p className="text-muted-foreground text-xs mt-0.5">Patient Schedule</p>
            </div>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifs(!showNotifs);
                setUnreadCount(0);
              }}
              className="p-2.5 rounded-xl bg-white border border-beige-200 text-beige-600 hover:bg-beige-50 transition relative"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl border border-beige-200 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                <div className="p-4 border-b border-beige-100 flex items-center justify-between">
                  <h3 className="font-bold text-sm">Notifications</h3>
                  <button onClick={() => setShowNotifs(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-xs">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="p-4 border-b border-beige-50 hover:bg-beige-50/50 transition flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Info className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{n.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-2">
                            {n.createdAt?.toDate?.() ? n.createdAt.toDate().toLocaleTimeString() : "Just now"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Doctor selector */}
          <div className="relative">
            <select
              value={selectedDoc}
              onChange={(e) => {
                setSelectedDoc(e.target.value);
                localStorage.setItem("selectedDoctorId", e.target.value);
              }}
              className="appearance-none bg-white text-foreground text-sm rounded-xl pl-4 pr-10 py-2.5 border border-beige-200 focus:outline-none focus:ring-2 focus:ring-beige-400 font-medium min-w-[200px]"
            >
              <option value="">— I am... —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* No doctor selected */}
        {!selectedDoc && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-white border border-beige-200 flex items-center justify-center mb-6 shadow-sm">
              <Stethoscope className="w-10 h-10 text-beige-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Select Your Profile</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Choose your name from the dropdown above to view your patient schedule for today.
            </p>
          </div>
        )}

        {/* Doctor selected */}
        {selectedDoc && (
          <>
            {/* Doctor card */}
            {doctor && (
              <div className="bg-white/80 backdrop-blur-sm border border-beige-200 rounded-2xl p-5 mb-6 flex items-center gap-4 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-beige-400 to-beige-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-lg">
                  {doctor.avatar}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-foreground">{doctor.name}</h2>
                  <p className="text-beige-600 text-sm">{doctor.specialty}</p>
                </div>
                <div className="flex gap-3 text-right">
                  <Stat label="Waiting" value={waiting.length} color="text-amber-600" />
                  <Stat label="Admitted" value={admitted.length} color="text-indigo-600" />
                  <Stat label="Active" value={inProgress.length} color="text-blue-600" />
                  <Stat label="Done" value={done.length} color="text-green-600" />
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-beige-500 animate-spin" />
                <span className="ml-3 text-muted-foreground">Loading schedule...</span>
              </div>
            )}

            {!loading && patients.length === 0 && (
              <div className="text-center py-20">
                <CalendarClock className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400 font-medium">No patients assigned yet</p>
                <p className="text-slate-600 text-sm mt-1">Patients assigned by reception will appear here</p>
              </div>
            )}

            {!loading && patients.length > 0 && (
              <div className="space-y-6">
                {/* In Progress */}
                {inProgress.length > 0 && (
                  <Section title="🔵 Currently Seeing" count={inProgress.length}>
                    {inProgress.map((p) => (
                      <PatientCard
                        key={p.id}
                        patient={p}
                        onComplete={() => handleComplete(p.id)}
                        completing={completing[p.id]}
                        starting={starting[p.id]}
                        onStart={() => handleStartPatient(p.id)}
                        onAdmit={() => setAdmissionPending(p.id)}
                        admitting={admitting[p.id]}
                        highlight
                      />
                    ))}
                  </Section>
                )}

                {/* Admitted */}
                {admitted.length > 0 && (
                  <Section title="🏥 Admitted to Bed" count={admitted.length}>
                    {admitted.map((p) => (
                      <PatientCard
                        key={p.id}
                        patient={p}
                        onStart={() => handleStartPatient(p.id)}
                        starting={starting[p.id]}
                        onAdmit={() => setAdmissionPending(p.id)}
                        admitting={admitting[p.id]}
                        onComplete={() => handleComplete(p.id)}
                        completing={completing[p.id]}
                      />
                    ))}
                  </Section>
                )}

                {/* Waiting */}
                {waiting.length > 0 && (
                  <Section title="⏳ Waiting Queue" count={waiting.length}>
                    {waiting.map((p, i) => (
                      <PatientCard
                        key={p.id}
                        patient={p}
                        position={i + 1}
                        onStart={() => handleStartPatient(p.id)}
                        starting={starting[p.id]}
                        onAdmit={() => setAdmissionPending(p.id)}
                        admitting={admitting[p.id]}
                        onComplete={() => handleComplete(p.id)}
                        completing={completing[p.id]}
                      />
                    ))}
                  </Section>
                )}

                {/* Completed */}
                {done.length > 0 && (
                  <Section title="✅ Completed Today" count={done.length} muted>
                    {done.map((p) => (
                      <PatientCard
                        key={p.id}
                        patient={p}
                        done
                        onComplete={() => {}}
                        completing={false}
                        starting={false}
                        onStart={() => {}}
                        onAdmit={() => {}}
                        admitting={false}
                      />
                    ))}
                  </Section>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Admission Modal */}
      {admissionPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-beige-100 flex items-center justify-between bg-beige-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white flex items-center justify-center">
                  <BedDouble className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Admit Patient</h3>
                  <p className="text-xs text-muted-foreground">Select admission details</p>
                </div>
              </div>
              <button onClick={() => setAdmissionPending(null)} className="p-2 hover:bg-beige-100 rounded-full transition">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Admission Time</label>
                <input
                  type="time"
                  value={admitDetails.admitTime}
                  onChange={e => setAdmitDetails(prev => ({ ...prev, admitTime: e.target.value }))}
                  className="w-full bg-beige-50 border border-beige-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Next Appointment</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={admitDetails.nextApptDate}
                    onChange={e => setAdmitDetails(prev => ({ ...prev, nextApptDate: e.target.value }))}
                    className="w-full bg-beige-50 border border-beige-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <input
                    type="time"
                    value={admitDetails.nextApptTime}
                    onChange={e => setAdmitDetails(prev => ({ ...prev, nextApptTime: e.target.value }))}
                    className="w-full bg-beige-50 border border-beige-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>
              <button
                onClick={() => handleAdmit(admissionPending)}
                disabled={!admitDetails.admitTime || admitting[admissionPending]}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {admitting[admissionPending] ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Confirm Admission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children, muted = false }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className={`font-bold text-base ${muted ? "text-muted-foreground" : "text-foreground"}`}>
          {title}
        </h3>
        <span className="text-xs bg-beige-100 text-beige-600 px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function PatientCard({ 
  patient: p, position, onComplete, completing, onStart, starting, onAdmit, admitting, done = false, highlight = false 
}) {
  const triage = p.triageLevel ?? 1;

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all ${
        done
          ? "bg-white/40 border-beige-100 opacity-60"
          : highlight
          ? "bg-blue-50/50 border-blue-200 shadow-lg shadow-blue-100"
          : "bg-white/80 backdrop-blur-sm border-beige-200 hover:border-beige-300 shadow-sm"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Position badge */}
          {position && (
            <div className="w-7 h-7 rounded-lg bg-beige-100 flex items-center justify-center text-beige-500 text-xs font-bold flex-shrink-0">
              {position}
            </div>
          )}
          {highlight && (
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            </div>
          )}
          {done && (
            <div className="w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-foreground text-sm">
                {p.patientName || p.userName || "Unknown Patient"}
              </h4>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${TRIAGE_COLORS[triage]}`}
              >
                L{triage} {TRIAGE_LABELS[triage]}
              </span>
            </div>
            <p className="text-muted-foreground text-xs mt-0.5">
              {p.age ? `Age ${p.age}` : ""}
              {p.chiefComplaint ? ` · ${p.chiefComplaint}` : ""}
            </p>
          </div>

          {/* Time slot */}
          <div className="flex-shrink-0 text-right">
            <div className="flex items-center gap-1 text-beige-600 font-semibold text-sm">
              <Clock className="w-3.5 h-3.5" />
              {p.appointmentTime || "—"}
            </div>
            <p className="text-muted-foreground text-xs">slot time</p>
          </div>
        </div>

        {/* Extra info row */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {p.symptomDuration && (
            <Chip label="Duration" value={p.symptomDuration} />
          )}
          {p.painLevel && (
            <Chip label="Pain" value={`${p.painLevel}/10`} />
          )}
          {p.medicalHistory && p.medicalHistory !== "None" && (
            <Chip label="History" value={p.medicalHistory} />
          )}
        </div>

        {p.redFlagSymptoms && p.redFlagSymptoms !== "None" && (
          <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-100 text-red-500 rounded-xl p-2.5 text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{p.redFlagSymptoms}</span>
          </div>
        )}

        {/* Action buttons */}
        {!done && (
          <div className="mt-3 flex gap-2">
            {p.status === "accepted" && (
              <button
                onClick={onStart}
                disabled={starting}
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {starting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
                Start Consultation
              </button>
            )}
            {p.status === "admitted" && (
              <button
                onClick={onStart}
                disabled={starting}
                className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg"
              >
                {starting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
                Start Consultation
              </button>
            )}
            {p.status === "in-progress" && (
              <>
                <button
                  onClick={onAdmit}
                  disabled={admitting}
                  className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {admitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BedDouble className="w-4 h-4" />
                  )}
                  Admit Patient
                </button>
                <button
                  onClick={onComplete}
                  disabled={completing}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg"
                >
                  {completing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Mark as Done
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ label, value }) {
  return (
    <span className="bg-beige-50/80 text-beige-700 border border-beige-100 px-2 py-1 rounded-lg">
      <span className="text-beige-400 mr-1">{label}:</span>
      {value}
    </span>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}
