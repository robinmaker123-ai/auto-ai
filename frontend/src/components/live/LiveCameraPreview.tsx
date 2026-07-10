import { CameraOff } from "lucide-react";
import type { VisionStatus } from "../../hooks/useLiveVision";

type Props = {
  active: boolean;
  native: boolean;
  facing: "user" | "environment";
  status: VisionStatus;
  previewFrame: string;
  setVideoElement: (element: HTMLVideoElement | null) => void;
};

export function LiveCameraPreview({ active, native, facing, status, previewFrame, setVideoElement }: Props) {
  if (!active) {
    return (
      <div className="live-camera-placeholder" aria-hidden="true">
        <CameraOff size={72} />
      </div>
    );
  }
  return (
    <div className={`live-camera-preview ${native ? "is-native" : ""}`}>
      {native
        ? previewFrame && <img src={previewFrame} alt="Live camera preview" />
        : <video ref={setVideoElement} muted playsInline autoPlay />}
      <span className="live-camera-facing">{facing === "user" ? "Front camera" : "Back camera"}</span>
      <span className="live-vision-status">{status}</span>
    </div>
  );
}
