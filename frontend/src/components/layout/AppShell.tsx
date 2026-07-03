import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSettingsProvider } from "../../contexts/AppSettingsContext";
import { ChatProvider } from "../../contexts/ChatContext";
import { useShell } from "../../contexts/ShellContext";
import { Header } from "./Header";
import { SettingsModal } from "./SettingsModal";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const location = useLocation();
  const {
    isSettingsOpen,
    closeSidebar,
    closeSettings
  } = useShell();

  useEffect(() => {
    closeSidebar();
    closeSettings();
  }, [closeSettings, closeSidebar, location.pathname]);

  return (
    <AppSettingsProvider>
      <ChatProvider>
        <div className="app-shell">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            <Header />
            <Outlet />
          </main>
          <SettingsModal open={isSettingsOpen} onClose={closeSettings} />
        </div>
      </ChatProvider>
    </AppSettingsProvider>
  );
}
