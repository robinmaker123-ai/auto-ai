import { createContext, useContext, useMemo, useState } from "react";

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

  const value = useMemo<ShellContextValue>(
    () => ({
      isSidebarOpen,
      isSettingsOpen,
      openSidebar: () => setIsSidebarOpen(true),
      closeSidebar: () => setIsSidebarOpen(false),
      toggleSidebar: () => setIsSidebarOpen((current) => !current),
      openSettings: () => setIsSettingsOpen(true),
      closeSettings: () => setIsSettingsOpen(false)
    }),
    [isSettingsOpen, isSidebarOpen]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShell must be used within ShellProvider");
  return context;
}