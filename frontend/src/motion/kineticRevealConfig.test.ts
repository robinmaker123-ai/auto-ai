import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KINETIC_INNER_SEQUENCE,
  KINETIC_MOTION_PRESETS,
  KINETIC_REVEAL_VARIANTS,
  LANDING_KINETIC_MAP,
  alternatingDiagonal,
  alternatingFlight,
  cmsKineticRevealVariant,
  isCmsKineticRevealEnabled,
  isSimpleKineticDevice,
  splitKineticWords
} from "./kineticRevealConfig";

describe("kinetic reveal configuration", () => {
  it("maps public sections deterministically to every required motion family", () => {
    expect(KINETIC_REVEAL_VARIANTS).toHaveLength(9);
    expect(new Set(Object.values(LANDING_KINETIC_MAP))).toEqual(new Set(KINETIC_REVEAL_VARIANTS));
    expect(LANDING_KINETIC_MAP.sectionOneHeading).toBe("sky-drop");
    expect(LANDING_KINETIC_MAP.sectionTwoHeading).toBe("split-assembly");
    expect(LANDING_KINETIC_MAP.sectionThreeContent).toBe("container-drop");
    expect(LANDING_KINETIC_MAP.importantCta).toBe("depth-landing");
  });

  it("uses the required drop, side-flight, diagonal, depth, and timing values", () => {
    expect(KINETIC_MOTION_PRESETS["sky-drop"]).toMatchObject({ y: -110, rotateX: -4, duration: 650 });
    expect(KINETIC_MOTION_PRESETS["left-flight"]).toMatchObject({ x: -110, rotateY: 4, rotateZ: -2, duration: 620 });
    expect(KINETIC_MOTION_PRESETS["right-flight"]).toMatchObject({ x: 110, rotateY: -4, rotateZ: 2, duration: 620 });
    expect(KINETIC_MOTION_PRESETS["diagonal-prism-left"]).toMatchObject({ x: -108, y: -72, rotateZ: -4 });
    expect(KINETIC_MOTION_PRESETS["diagonal-prism-right"]).toMatchObject({ x: 108, y: -72, rotateZ: 4 });
    expect(KINETIC_MOTION_PRESETS["depth-landing"].scale).toBeGreaterThanOrEqual(0.9);
    expect(KINETIC_INNER_SEQUENCE.total).toBeLessThanOrEqual(850);
    expect(KINETIC_INNER_SEQUENCE.headingDelay).toBeLessThan(KINETIC_INNER_SEQUENCE.bodyDelay);
  });

  it("alternates left/right and diagonal directions without randomness", () => {
    expect([0, 1, 2, 3].map(alternatingFlight)).toEqual(["left-flight", "right-flight", "left-flight", "right-flight"]);
    expect([0, 1, 2, 3].map(alternatingDiagonal)).toEqual([
      "diagonal-prism-left", "diagonal-prism-right", "diagonal-prism-left", "diagonal-prism-right"
    ]);
  });

  it("preserves short heading text and refuses to split long copy", () => {
    const heading = "From first thought to finished answer.";
    expect(splitKineticWords(heading)?.join(" ")).toBe(heading);
    expect(splitKineticWords("one two three four five six seven eight nine")).toBeNull();
  });

  it("keeps forms and controls outside CMS motion and disables the editor canvas", () => {
    expect(cmsKineticRevealVariant("heading")).toBe("sky-drop");
    expect(cmsKineticRevealVariant("paragraph")).toBe("bottom-lift");
    expect(cmsKineticRevealVariant("form")).toBeUndefined();
    expect(cmsKineticRevealVariant("button")).toBeUndefined();
    expect(cmsKineticRevealVariant("submit_button")).toBeUndefined();
    expect(isCmsKineticRevealEnabled(true, false)).toBe(false);
    expect(isCmsKineticRevealEnabled(true, true)).toBe(true);
  });

  it("preserves directional mobile motion and simplifies only constrained devices", () => {
    expect(isSimpleKineticDevice({ width: 390, memoryGb: 8, cores: 8 })).toBe(false);
    expect(isSimpleKineticDevice({ width: 1440, memoryGb: 2, cores: 8 })).toBe(true);
    expect(isSimpleKineticDevice({ width: 1440, memoryGb: 16, cores: 12 })).toBe(false);
  });

  it("keeps the kinetic implementation free of canvas, WebGL, ocean, and continuous scroll loops", () => {
    const hook = readFileSync(new URL("../hooks/useKineticReveal.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/kineticReveal.css", import.meta.url), "utf8");
    expect(`${hook}\n${css}`).not.toMatch(/requestAnimationFrame|<canvas|WebGL|ocean|fish/i);
    expect(hook).toContain('target.addEventListener("scroll", handleScroll, { passive: true })');
    expect(hook).toContain('setRevealState(element, "pending")');
    expect(hook).toContain('setRevealState(element, "animating")');
    expect(hook).toContain('setRevealState(element, "revealed")');
    expect(css).toContain("transform: none");
    expect(css).toContain("@keyframes kinetic-fly-settle");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("loads the kinetic stylesheet exactly once from the landing page", () => {
    const landingPage = readFileSync(new URL("../components/landing/LandingPage.tsx", import.meta.url), "utf8");
    const globalCss = readFileSync(new URL("../styles/index.css", import.meta.url), "utf8");
    expect(landingPage.match(/styles\/kineticReveal\.css/g)).toHaveLength(1);
    expect(globalCss).toContain('html[data-auto-ai-motion="reduced"]:not([data-auto-ai-force-motion="true"]) *');
    expect(landingPage).toContain('document.addEventListener("pointerdown", onPointerDown)');
    expect(landingPage).toContain('if (event.key === "Escape") setMobileMenuOpen(false)');
    expect(landingPage).toContain("[location.hash, location.pathname, location.search]");
  });
});
