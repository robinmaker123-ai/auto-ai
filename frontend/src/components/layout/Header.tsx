import { Link } from "react-router-dom";
import { LogOut, Moon, Shield, Sun } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

export function Header() {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-slate-800 dark:text-neutral-100">Auto-AI Assistant</h2>
        <p className="truncate text-xs text-slate-500 dark:text-neutral-500">{user?.email}</p>
      </div>
      <div className="flex items-center gap-2">
        {user?.is_admin && (
          <Link className="icon-button" to="/admin" title="Admin dashboard">
            <Shield size={18} />
          </Link>
        )}
        <button className="icon-button" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="icon-button" onClick={logout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

