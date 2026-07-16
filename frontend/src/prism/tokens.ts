export const prismTokens = {
  color: {
    ink: "#050816",
    navy: "#0a1025",
    cyan: "#36e4f7",
    violet: "#8b7cff",
    pink: "#ff6eb4",
    blue: "#77a9ff",
    text: "#f7fbff",
    muted: "#aebbd3"
  },
  radius: {
    small: "5px",
    medium: "8px"
  },
  motion: {
    fast: "140ms",
    standard: "190ms"
  },
  zIndex: {
    navigation: 80,
    dialog: 120,
    tooltip: 140
  }
} as const;

export type PrismStatusTone = "idle" | "active" | "success" | "warning" | "error" | "offline";
