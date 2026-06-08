import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import AICallModal from "./AICallModal";
import AppointmentList from "./AppointmentList";
import HospitalMapView from "./HospitalMapView";
import { Phone, Stethoscope, ActivitySquare, Users, Map as MapIcon, ArrowLeft } from "lucide-react";

export default function MainPage() {
  const navigate = useNavigate();
  const [callOpen, setCallOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentView, setCurrentView] = useState("home"); // home | map

  const handleAppointmentSaved = () => {
    setCallOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const handleNavItemClick = (id) => {
    if (id === "receptionist") {
      navigate("/receptionist");
    } else if (id === "map" || id === "home") {
      setCurrentView(id);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-50 via-beige-100 to-beige-200">
      <Header onSearch={setSearch} searchValue={search} onNavItemClick={handleNavItemClick} />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        
        {currentView === "home" ? (
          <>
            {/* Hero Stats */}
            <div className="grid grid-cols-3 gap-3 animate-fade-in">
              <StatCard icon={Users} label="In Queue" value="—" color="beige" />
              <StatCard icon={Stethoscope} label="Available" value="—" color="green" />
              <StatCard icon={ActivitySquare} label="Critical" value="—" color="red" />
            </div>

            {/* Call Button (Whole Card as Button) */}
            <div className="animate-fade-in">
              <button 
                onClick={() => setCallOpen(true)}
                className="glass-card w-full p-8 text-center relative overflow-hidden group hover:border-beige-300 transition-all active:scale-[0.98] shadow-lg hover:shadow-beige-200/50"
              >
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-beige-200/50 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
                <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-beige-300/40 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />

                <div className="relative flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-beige-500 text-white flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Phone className="w-8 h-8" />
                  </div>
                  
                  <p className="text-xs font-bold text-beige-500 uppercase tracking-widest mb-2">
                    Fast Track
                  </p>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    AI Symptom Triage
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Not sure where to go? Tap anywhere to start your digital assessment and get a queue number instantly.
                  </p>
                </div>
              </button>
            </div>

            {/* Appointments */}
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">My Appointments</h3>
                {search && (
                  <span className="text-xs text-muted-foreground">
                    Searching: "{search}"
                  </span>
                )}
              </div>
              <AppointmentList searchValue={search} refreshKey={refreshKey} />
            </div>
          </>
        ) : (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentView("home")} className="p-2 bg-white rounded-xl border border-beige-200 text-beige-600 hover:bg-beige-50 transition shadow-sm">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-foreground">Hospital Navigator</h2>
                <p className="text-xs text-muted-foreground">Find your way through the facility</p>
              </div>
            </div>
            
            <HospitalMapView />

            <div className="glass-card p-6 border-l-4 border-l-beige-500">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-beige-100 rounded-lg">
                  <MapIcon className="w-5 h-5 text-beige-600" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground text-sm">Interactive Map</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    Drag the map to move around and use your scroll wheel to zoom. 
                    Red zones represent critical care areas, while Green zones are for minor concerns.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* AI Call Modal */}
      {callOpen && (
        <AICallModal
          onClose={() => setCallOpen(false)}
          onAppointmentSaved={handleAppointmentSaved}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    beige: "text-beige-600 bg-beige-100",
    green: "text-green-600 bg-green-100",
    red: "text-red-600 bg-red-100",
  };

  return (
    <div className="glass-card px-3 py-4 flex flex-col items-center gap-1.5 text-center">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
