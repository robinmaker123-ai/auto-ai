import { useContext } from "react";
import { CallContext } from "../CallContext";

export function useCallSession() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCallSession must be used within CallProvider");
  return context;
}
