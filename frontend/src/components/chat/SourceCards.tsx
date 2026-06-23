import { ExternalLink, ShieldCheck } from "lucide-react";
import type { SearchResultBundle } from "../../types";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function SourceCards({ search }: { search?: SearchResultBundle }) {
  if (!search?.sources?.length) return null;

  return (
    <div className="source-panel">
      <div className="source-panel-header">
        <span>
          Sources
          <strong>{percent(search.confidence_score)} confidence</strong>
        </span>
        <span>{search.provider}{search.cache_hit ? " cache" : ""}</span>
      </div>
      <div className="source-grid">
        {search.sources.slice(0, 6).map((source) => (
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
    </div>
  );
}
