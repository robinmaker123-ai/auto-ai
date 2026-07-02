import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ShellContextValue = {
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  openSettings: () => void;
  closeSettings: () => void;
};

const ShellContext = createContext<ShellContextValue | undefined>(undefined);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setIsSidebarOpen((current) => !current), []);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const value = useMemo<ShellContextValue>(
    () => ({
      isSidebarOpen,
      isSettingsOpen,
      openSidebar,
      closeSidebar,
      toggleSidebar,
      openSettings,
      closeSettings
    }),
    [
      closeSettings,
      closeSidebar,
      isSettingsOpen,
      isSidebarOpen,
      openSettings,
      openSidebar,
      toggleSidebar
    ]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShell must be used within ShellProvider");
  return context;
}
