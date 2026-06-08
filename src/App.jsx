import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AuthPage from "./pages/AuthPage";
import MainPage from "./components/MainPage";
import ReceptionistPage from "./pages/ReceptionistPage";
import DoctorPage from "./pages/DoctorPage";
import DepartmentHeadPage from "./pages/DepartmentHeadPage";
import SeedPage from "./pages/SeedPage";

function AppRouter() {
  const { user } = useAuth();
  return (
    <Routes>
      {/* Public patient-facing app */}
      <Route path="/" element={user ? <MainPage /> : <AuthPage />} />

      {/* Secret staff portals — no auth required */}
      <Route path="/receptionist" element={<ReceptionistPage />} />
      <Route path="/doctor"       element={<DoctorPage />} />
      <Route path="/department-head" element={<DepartmentHeadPage />} />
      <Route path="/seed"            element={<SeedPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
