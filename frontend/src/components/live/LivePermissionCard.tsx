type Props = {
  permanentlyDenied: boolean;
  onTryAgain: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
};

export function LivePermissionCard({ permanentlyDenied, onTryAgain, onOpenSettings, onClose }: Props) {
  return (
    <section className="live-permission-card" role="alert" aria-live="assertive">
      <span className="live-permission-dot" aria-hidden="true" />
      <div>
        <strong>Microphone access is required for Live Mode.</strong>
        <p>{permanentlyDenied ? "Allow microphone access from Auto-AI app settings." : "Allow access, then try again."}</p>
      </div>
      <div className="live-permission-actions">
        {!permanentlyDenied && <button type="button" onClick={onTryAgain}>Try Again</button>}
        <button type="button" onClick={onOpenSettings}>Open App Settings</button>
        <button type="button" onClick={onClose}>Close Live Mode</button>
      </div>
    </section>
  );
}
