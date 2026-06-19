import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { BrowserRouter } from "react-router-dom";
import { AdminDashboard } from "./components/admin/AdminDashboard";
import { LoginPage } from "./components/auth/LoginPage";
import { RegisterPage } from "./components/auth/RegisterPage";
import { ChatPage } from "./components/chat/ChatPage";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ChatProvider } from "./contexts/ChatContext";
import { ThemeProvider } from "./contexts/ThemeContext";

function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-600 dark:bg-neutral-950 dark:text-neutral-300">Loading Auto-AI...</div>;
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function AppShell() {
  return (
    <ChatProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-950 dark:bg-neutral-950 dark:text-neutral-100">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Header />
          <Outlet />
        </main>
      </div>
    </ChatProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<ChatPage />} />
                <Route path="/admin" element={<AdminDashboard />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

