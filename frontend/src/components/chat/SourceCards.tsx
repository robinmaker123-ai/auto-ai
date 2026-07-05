import { useState } from "react";
import { ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import type { SearchResultBundle } from "../../types";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function sourceDomain(url: string, fallback: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

export function SourceCards({ search }: { search?: SearchResultBundle }) {
  const [open, setOpen] = useState(false);
  if (!search?.sources?.length) return null;
  const visibleSources = search.sources.slice(0, 6);
  const previewSources = visibleSources.slice(0, 4);

  return (
    <div className="source-panel">
      <button
        className="source-summary"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="source-preview-list" aria-hidden="true">
          {previewSources.map((source) => (
            <span key={source.id} className="source-preview-chip" title={source.source}>
              <img
                alt=""
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(sourceDomain(source.url, source.source))}&sz=32`}
              />
            </span>
          ))}
          {visibleSources.length > previewSources.length && (
            <span className="source-preview-more">+{visibleSources.length - previewSources.length}</span>
          )}
        </span>
        <span className="source-summary-label">Sources</span>
        <ChevronDown className={open ? "source-summary-icon source-summary-icon-open" : "source-summary-icon"} size={16} />
      </button>
      {open && (
        <>
          <div className="source-panel-header">
            <span>
              Sources
              <strong>{percent(search.confidence_score)} confidence</strong>
            </span>
            <span>{search.provider}{search.cache_hit ? " cache" : ""}</span>
          </div>
          <div className="source-grid">
            {visibleSources.map((source) => (
              <a key={source.id} className="source-card" href={source.url} target="_blank" rel="noreferrer">
                <span className="source-card-topline">
                  <span>{source.id}</span>
                  <span><ShieldCheck size={13} /> {source.credibility_label}</span>
                </span>
                <strong>{source.title}</strong>
                <span className="source-domain">{source.source}</span>
                <span className="source-snippet">{source.snippet}</span>
                <span className="source-link">
                  Open source <ExternalLink size={13} />
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
