import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  Menu,
  Search,
  X,
  Hospital,
  Home,
  Calendar,
  LogOut,
  User,
  ChevronRight,
  Shield,
  Map,
} from "lucide-react";

export default function Header({ onSearch, searchValue, onNavItemClick }) {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const navItems = [
    { icon: Home, label: "Home", id: "home" },
    { icon: Map, label: "Hospital Map", id: "map" },
    { icon: Calendar, label: "My Appointments", id: "appointments" },
    { icon: Shield, label: "Receptionist View", id: "receptionist" },
  ];

  return (
    <>
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-beige-50/80 backdrop-blur-md border-b border-beige-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* Drawer Toggle */}
          <button
            id="header-menu-btn"
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-xl hover:bg-beige-200 text-beige-700 transition-colors flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-beige-500" />
            <input
              id="header-search"
              type="text"
              placeholder="Search appointments..."
              value={searchValue}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/80 border border-beige-200 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-beige-400 transition"
            />
          </div>

          {/* Profile Button */}
          <div className="relative flex-shrink-0">
            <button
              id="header-profile-btn"
              onClick={() => setProfileOpen((v) => !v)}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-beige-400 to-beige-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm hover:shadow-md transition-shadow"
            >
              {user?.displayName?.[0]?.toUpperCase() || "?"}
            </button>

            {profileOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setProfileOpen(false)}
                />
                <div className="absolute right-0 top-11 z-20 w-60 glass-card p-3 shadow-xl animate-fade-in">
                  <div className="flex items-center gap-3 pb-3 border-b border-beige-100 mb-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-beige-400 to-beige-600 flex items-center justify-center text-white font-semibold">
                      {user?.displayName?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {user?.displayName || "User"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                  </div>
                  <button
                    id="profile-logout-btn"
                    onClick={() => { logout(); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Drawer Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Drawer Panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 z-50 bg-beige-50 border-r border-beige-200 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-beige-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-beige-500 to-beige-700 rounded-xl flex items-center justify-center shadow">
              <Hospital className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-sm">MediQueue</h2>
              <p className="text-xs text-muted-foreground">Hospital Traffic Control</p>
            </div>
          </div>
          <button
            id="drawer-close-btn"
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg hover:bg-beige-200 text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ icon: Icon, label, id }) => (
            <button
              key={id}
              id={id}
              onClick={() => {
                setDrawerOpen(false);
                if (onNavItemClick) onNavItemClick(id);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-beige-200 transition-colors group"
            >
              <Icon className="w-4 h-4 text-beige-600" />
              <span className="flex-1 text-left">{label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </nav>

        {/* Drawer Footer */}
        <div className="px-3 py-4 border-t border-beige-200">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-beige-100">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-beige-400 to-beige-600 flex items-center justify-center text-white text-xs font-semibold">
              {user?.displayName?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.displayName || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
