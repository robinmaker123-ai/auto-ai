export function LogoIcon({ className = "app-logo" }: { className?: string }) {
  return <img className={className} src="/logo.svg" alt="" aria-hidden="true" draggable={false} />;
}
