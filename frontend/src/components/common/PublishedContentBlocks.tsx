import { Link } from "react-router-dom";
import { Download, ExternalLink } from "lucide-react";
import { resolveApiAssetUrl } from "../../api/client";
import type { CmsBlock } from "../admin/cms/types";

function text(block: CmsBlock, ...keys: string[]) {
  for (const key of keys) {
    const value = block.content[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}
export function PublishedContentBlocks({ blocks }: { blocks?: CmsBlock[] }) {
  const visible = (blocks ?? []).filter((block) => block.is_visible);
  if (!visible.length) return null;
  return (
    <section className="landing-section cms-public-blocks" aria-label="Additional page content">
      {visible.map((block) => {
        const body = text(block, "text", "description", "body", "answer", "quote");
        const title = text(block, "heading", "title", "question", "label");
        const url = text(block, "url", "href", "image_url", "video_url", "target_url");
        if (block.block_type === "divider") return <hr key={block.id} />;
        if (block.block_type === "spacer") return <div className="h-10" key={block.id} aria-hidden="true" />;
        if (block.block_type === "image") return url ? <figure key={block.id}><img src={resolveApiAssetUrl(url)} alt={text(block, "alt")} />{body && <figcaption>{body}</figcaption>}</figure> : null;
        if (block.block_type === "video_link") return url ? <a className="btn-secondary" href={url} key={block.id} rel="noreferrer" target="_blank"><ExternalLink size={15} /> {title || "Open video"}</a> : null;
        if (["button", "download_button"].includes(block.block_type)) return url ? <Link className="btn-primary w-fit" key={block.id} to={url}><Download size={15} /> {title || "Open"}</Link> : null;
        if (block.block_type === "feature_grid" && Array.isArray(block.content.items)) return <div className="feature-grid" key={block.id}>{block.content.items.map((item, index) => <article className="premium-feature" key={index}>{String(item)}</article>)}</div>;
        return <article className="cms-public-content" key={block.id}>{title && <h2>{title}</h2>}{body && <p>{body}</p>}</article>;
      })}
    </section>
  );
}
