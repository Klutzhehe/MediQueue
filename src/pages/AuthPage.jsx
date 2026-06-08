import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Hospital, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
    } catch (err) {
      const msgs = {
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/email-already-in-use": "This email is already registered.",
        "auth/weak-password": "Password should be at least 6 characters.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/invalid-credential": "Invalid email or password.",
      };
      setError(msgs[err.code] || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-50 via-beige-100 to-beige-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 animate-fade-in">
          <div className="w-16 h-16 bg-gradient-to-br from-beige-500 to-beige-700 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <Hospital className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-beige-900">MediQueue</h1>
          <p className="text-sm text-beige-600 mt-1">Hospital Traffic Control</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 animate-fade-in">
          <h2 className="text-xl font-semibold text-foreground mb-1">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "login"
              ? "Sign in to your patient account"
              : "Register to book your consultation"}
          </p>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-5 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-beige-200 bg-white/80 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-beige-400 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-beige-200 bg-white/80 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-beige-400 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-2.5 pr-11 rounded-xl border border-beige-200 bg-white/80 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-beige-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="auth-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-beige-500 to-beige-600 hover:from-beige-600 hover:to-beige-700 text-white font-semibold text-sm transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              id="auth-toggle"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="text-beige-600 hover:text-beige-800 font-semibold transition"
            >
              {mode === "login" ? "Register" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
