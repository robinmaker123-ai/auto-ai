import { useEffect } from "react";
import { PanelLeftOpen } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const {
    closeSidebar,
    expandSidebar,
    isSidebarCollapsed
  } = useShell();

  useEffect(() => {
    closeSidebar();
  }, [closeSidebar, location.pathname]);

  useEffect(() => {
    const openChatThread = (event: Event) => {
      const rawDetail = event instanceof CustomEvent ? event.detail : null;
      try {
        const detail = typeof rawDetail === "string" ? JSON.parse(rawDetail) : rawDetail;
        if (detail?.threadId) navigate(`/messages/${encodeURIComponent(detail.threadId)}`);
      } catch {
        return;
      }
    };
    window.addEventListener("auto-ai-open-chat-thread", openChatThread);
    return () => window.removeEventListener("auto-ai-open-chat-thread", openChatThread);
  }, [navigate]);

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
