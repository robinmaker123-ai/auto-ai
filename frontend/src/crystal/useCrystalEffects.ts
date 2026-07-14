import { useAppSettings } from "../contexts/AppSettingsContext";
import { useMotionMode } from "../motion/MotionProvider";
import { crystalUiEnabled, type CrystalEffectsLevel } from "./tokens";

export function useCrystalEffects() {
  const { settings } = useAppSettings();
  const { safeMode, systemReduced, visible } = useMotionMode();
  const level: CrystalEffectsLevel = !crystalUiEnabled || safeMode
    ? "off"
    : systemReduced
      ? "reduced"
      : settings.visualEffectsLevel;
  const active = level !== "off";

  return {
    level,
    active,
    visible,
    orb: active && settings.crystalOrb,
    surfaces: active && settings.crystalSurfaces,
    buttonMotion: active && visible && settings.crystalButtonMotion,
    voiceVisualizer: active && settings.crystalVoiceVisualizer
  };
}
