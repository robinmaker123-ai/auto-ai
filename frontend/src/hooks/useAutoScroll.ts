import { RefObject, useEffect, useRef } from "react";

export function useAutoScroll<T extends HTMLElement>(ref: RefObject<T>, deps: unknown[]) {
  const pinnedToBottomRef = useRef(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      pinnedToBottomRef.current = distanceFromBottom < 160;
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => element.removeEventListener("scroll", handleScroll);
  }, [ref]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !pinnedToBottomRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, deps);
}
