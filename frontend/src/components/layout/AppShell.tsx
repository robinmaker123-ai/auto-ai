import { useEffect } from "react";
import { PanelLeftOpen } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSettingsProvider } from "../../contexts/AppSettingsContext";
import { ChatProvider } from "../../contexts/ChatContext";
import { useShell } from "../../contexts/ShellContext";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { CallProvider } from "../../features/calls/CallProvider";
import { CallOverlay } from "../../features/calls/CallOverlay";
import "../../features/calls/calls.css";

export function AppShell() {
  const location = useLocation();
  const {
    closeSidebar,
    expandSidebar,
    isSidebarCollapsed
  } = useShell();

  useEffect(() => {
    closeSidebar();
  }, [closeSidebar, location.pathname]);

  return (
    <AppSettingsProvider>
      <CallProvider>
        <ChatProvider>
          <div className="app-shell">
            <Sidebar />
            {isSidebarCollapsed && (
              <button
                className="sidebar-restore-button hidden md:inline-flex"
                onClick={expandSidebar}
                title="Show chat history"
                type="button"
              >
                <PanelLeftOpen size={17} />
              </button>
            )}
            <main className="flex min-w-0 flex-1 flex-col">
              <Header />
              <Outlet />
            </main>
            <CallOverlay />
          </div>
        </ChatProvider>
      </CallProvider>
    </AppSettingsProvider>
  );
}
