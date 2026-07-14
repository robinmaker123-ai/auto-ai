import { LogoIcon } from "../brand/LogoIcon";
import { usePublishedGlobals } from "../../hooks/useCmsContent";

export function PublicFooter() {
  const content = usePublishedGlobals();
  return (
    <footer className="landing-footer">
      <span className="brand-mark"><span className="brand-icon"><LogoIcon /></span> {content?.["site.name"] || "Auto-AI"}</span>
      <p>{content?.["footer.description"] || "Premium AI workspace for contextual, human-feeling conversations."}</p>
      <small>{content?.["footer.copyright"] || "Copyright Auto-AI. All rights reserved."}</small>
    </footer>
  );
}
