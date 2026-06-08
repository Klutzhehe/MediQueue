import { useEffect, useState } from "react";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { Calendar, Clock, ChevronRight, Inbox } from "lucide-react";

const TRIAGE_LABELS = {
  0: "No Concern",
  1: "Minor",
  2: "Low Urgency",
  3: "Moderate",
  4: "High Urgency",
  5: "CRITICAL",
};

const STATUS_STYLES = {
  pending: "bg-yellow-100 text-yellow-700",
  "in-progress": "bg-blue-100 text-blue-700",
  seen: "bg-beige-100 text-beige-700",
  completed: "bg-green-100 text-green-700",
};

export default function AppointmentList({ searchValue, refreshKey }) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "EDMAT"),
      where("userId", "==", user.uid)
      // orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setAppointments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return unsub;
  }, [user, refreshKey]);

  const filtered = appointments
    .filter((a) => {
      if (!searchValue) return true;
      const s = searchValue.toLowerCase();
      return (
        a.patientName?.toLowerCase().includes(s) ||
        a.chiefComplaint?.toLowerCase().includes(s) ||
        TRIAGE_LABELS[a.triageLevel]?.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(a.timestamp || 0);
      const tb = b.createdAt?.toDate?.() || new Date(b.timestamp || 0);
      return tb - ta;
    });

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="glass-card p-4 h-24 animate-pulse bg-beige-100"
          />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center py-14 text-center animate-fade-in">
        <Inbox className="w-12 h-12 text-beige-300 mb-3" />
        <p className="font-medium text-muted-foreground">No appointments yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Use the Call button above to start an AI consultation
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((appt) => (
        <AppointmentCard key={appt.id} appt={appt} />
      ))}
    </div>
  );
}

function AppointmentCard({ appt }) {
  const [expanded, setExpanded] = useState(false);

  const createdAt = appt.createdAt?.toDate?.() || new Date(appt.timestamp || Date.now());

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      <button
        className="w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3 p-4">
          {/* Status Color Pillar */}
          <div
            className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${
              appt.status === "completed"
                ? "bg-green-500"
                : appt.status === "in-progress"
                ? "bg-blue-500"
                : "bg-beige-400"
            }`}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-sm text-foreground truncate">
                  {appt.chiefComplaint || "General Consultation"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {appt.assignedDoctorName ? `With ${appt.assignedDoctorName}` : "Awaiting assignment..."}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[appt.status] || STATUS_STYLES.pending}`}
                >
                  {appt.status === "accepted" ? "Scheduled" : appt.status || "Processing"}
                </span>
                {appt.appointmentTime && (
                  <span className="text-sm font-bold text-beige-600 bg-beige-50 px-2 py-0.5 rounded-lg border border-beige-200">
                    {appt.appointmentTime}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {appt.status === "completed" ? "Consultation Ended" : appt.status === "in-progress" ? "Currently in Room" : "Waiting for Turn"}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {createdAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          <ChevronRight
            className={`w-4 h-4 text-muted-foreground mt-1 flex-shrink-0 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-1 border-t border-beige-100 space-y-2 text-sm animate-fade-in">
          <Detail label="Symptoms" value={appt.chiefComplaint} />
          <Detail label="Duration" value={appt.symptomDuration} />
          {appt.assignedDoctorName && <Detail label="Assigned Doctor" value={appt.assignedDoctorName} />}
          {appt.appointmentTime && <Detail label="Your Timeslot" value={appt.appointmentTime} />}
          <Detail label="Registration Time" value={createdAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} />
        </div>
      )}
    </div>
  );
}

const Detail = ({ label, value }) => (
  <div className="flex gap-2">
    <span className="text-muted-foreground font-medium min-w-[110px]">{label}</span>
    <span className="text-foreground">{value || "—"}</span>
  </div>
);
