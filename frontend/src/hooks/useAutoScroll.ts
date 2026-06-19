import { RefObject, useEffect } from "react";

export function useAutoScroll<T extends HTMLElement>(ref: RefObject<T>, deps: unknown[]) {
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, deps);
}

