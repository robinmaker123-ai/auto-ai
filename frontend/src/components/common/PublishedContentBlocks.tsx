import { CmsPageRenderer } from "./CmsPageRenderer";
import type { CmsBlock } from "../admin/cms/types";
import type { CmsDevice } from "../admin/cms/cmsBlockLibrary";

export function PublishedContentBlocks({
  blocks,
  device,
  editMode,
  selectedBlockId,
  onSelect,
  onInlineChange
}: {
  blocks?: CmsBlock[];
  device?: CmsDevice;
  editMode?: boolean;
  selectedBlockId?: string | null;
  onSelect?: (blockId: string | null) => void;
  onInlineChange?: (blockId: string, key: string, value: string) => void;
}) {
  const visible = (blocks ?? []).filter((block) => block.is_visible);
  if (!visible.length) return null;
  return (
    <section className="landing-section cms-public-blocks" aria-label="Additional page content">
      {visible.map((block) => (
        <CmsPageRenderer
          block={block}
          device={device}
          editMode={editMode}
          key={block.id}
          selectedBlockId={selectedBlockId}
          onSelect={onSelect}
          onInlineChange={onInlineChange}
        />
      ))}
    </section>
  );
}
