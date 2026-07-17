import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown, ArrowUp, Copy, Edit3, EyeOff, GripVertical, Lock, MoreHorizontal,
  Plus, Trash2, Unlock
} from "lucide-react";
import {
  cleanInlineText, closestCmsElement, findCmsElement, isTypingTarget,
  selectionFromElement, type CmsEditorMode, type CmsSelection
} from "./cmsSelection";

export type CmsSelectionAction = "edit" | "move-up" | "move-down" | "duplicate" | "copy" | "hide" | "lock" | "delete" | "insert-after";

type Rect = { key: string; left: number; top: number; right: number; bottom: number; width: number; height: number };

type Props = {
  rootRef: RefObject<HTMLElement>;
  mode: CmsEditorMode;
  primary: CmsSelection | null;
  selections: CmsSelection[];
  onSelect: (selection: CmsSelection | null, additive?: boolean) => void;
  onInlineCommit: (selection: CmsSelection, value: string) => void;
  onAction: (action: CmsSelectionAction, selections: CmsSelection[]) => void;
  onReorder: (sourceId: string, targetId: string, before: boolean) => void;
  onResize: (selection: CmsSelection, width: number) => void;
};

const DESTRUCTIVE_ACTIONS = new Set<CmsSelectionAction>(["move-up", "move-down", "duplicate", "hide", "lock", "delete"]);
const RESIZABLE_TYPES = new Set(["image", "container", "two_columns", "three_columns", "grid"]);

function toRect(key: string, rect: DOMRect): Rect {
  return { key, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}

function insertPlainText(value: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  selection.deleteFromDocument();
  const range = selection.getRangeAt(0);
  const node = document.createTextNode(value);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaret(element: HTMLElement, event?: MouseEvent) {
  element.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return;
  let range: Range | null = null;
  if (event && "caretRangeFromPoint" in document) {
    range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range && !element.contains(range.startContainer)) range = null;
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

export function CmsSelectionEngine({
  rootRef, mode, primary, selections, onSelect, onInlineCommit, onAction, onReorder, onResize
}: Props) {
  const [hover, setHover] = useState<CmsSelection | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const [selectedRects, setSelectedRects] = useState<Rect[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [dropLine, setDropLine] = useState<Rect | null>(null);
  const [resizing, setResizing] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<CmsSelection[]>([]);
  const animationFrame = useRef<number | null>(null);
  const editingRef = useRef<{ element: HTMLElement; selection: CmsSelection; original: string; cancelled: boolean } | null>(null);
  const dragSourceRef = useRef<string | null>(null);

  const scheduleMeasure = useCallback(() => {
    if (animationFrame.current !== null) return;
    animationFrame.current = window.requestAnimationFrame(() => {
      animationFrame.current = null;
      const root = rootRef.current;
      if (!root || mode === "preview") {
        setHoverRect(null);
        setSelectedRects([]);
        return;
      }
      if (hover) {
        const element = findCmsElement(root, hover);
        setHoverRect(element ? toRect(hover.key, element.getBoundingClientRect()) : null);
      } else {
        setHoverRect(null);
      }
      setSelectedRects(selections.flatMap((selection) => {
        const element = findCmsElement(root, selection);
        return element ? [toRect(selection.key, element.getBoundingClientRect())] : [];
      }));
    });
  }, [hover, mode, rootRef, selections]);

  const finishInlineEdit = useCallback((cancel = false) => {
    const editing = editingRef.current;
    if (!editing) return;
    editing.cancelled = cancel;
    if (cancel) editing.element.textContent = editing.original;
    editing.element.blur();
  }, []);

  const beginInlineEdit = useCallback((selection: CmsSelection, pointerEvent?: MouseEvent) => {
    if (mode !== "select" || selection.editable !== "text" || selection.locked) return;
    const root = rootRef.current;
    const element = root ? findCmsElement(root, selection) : null;
    if (!element) return;
    if (editingRef.current?.element === element) return;
    if (editingRef.current) finishInlineEdit(false);
    const original = element.textContent ?? "";
    editingRef.current = { element, selection, original, cancelled: false };
    element.contentEditable = "true";
    element.spellcheck = true;
    element.dataset.cmsInlineEditing = "true";
    const onBlur = () => {
      const current = editingRef.current;
      if (!current || current.element !== element) return;
      const value = cleanInlineText(element.textContent ?? "");
      element.contentEditable = "false";
      delete element.dataset.cmsInlineEditing;
      editingRef.current = null;
      if (!current.cancelled && value !== cleanInlineText(current.original)) {
        // Restore React's last rendered DOM before updating canonical state. Leaving the
        // browser-mutated content in place can make React append the new text on reconcile.
        element.textContent = current.original;
        onInlineCommit(current.selection, value);
      }
      scheduleMeasure();
    };
    element.addEventListener("blur", onBlur, { once: true });
    placeCaret(element, pointerEvent);
  }, [finishInlineEdit, mode, onInlineCommit, rootRef, scheduleMeasure]);

  useEffect(() => {
    if (animationFrame.current !== null) {
      window.cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    scheduleMeasure();
  }, [scheduleMeasure]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || mode === "preview") return;
    const update = () => scheduleMeasure();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(root);
    selections.forEach((selection) => {
      const element = findCmsElement(root, selection);
      if (element) resizeObserver.observe(element);
    });
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("scroll", update, { passive: true, capture: true });
    root.addEventListener("load", update, { capture: true });
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true, capture: true });
    void document.fonts?.ready.then(update);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      root.removeEventListener("scroll", update, true);
      root.removeEventListener("load", update, true);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [mode, rootRef, scheduleMeasure, selections]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || mode === "preview") return;

    const selectElement = (element: HTMLElement | null, additive = false) => {
      const selection = element ? selectionFromElement(element) : null;
      onSelect(selection, additive);
      setContextMenu(null);
      if (!selection || !element) {
        setBreadcrumbs([]);
        return;
      }
      const parents: CmsSelection[] = [];
      let parent = element.parentElement?.closest<HTMLElement>("[data-cms-block-id]") ?? null;
      while (parent && root.contains(parent)) {
        const metadata = selectionFromElement(parent);
        if (metadata && !parents.some((item) => item.key === metadata.key)) parents.unshift(metadata);
        parent = parent.parentElement?.closest<HTMLElement>("[data-cms-block-id]") ?? null;
      }
      setBreadcrumbs(parents);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (editingRef.current || event.pointerType === "touch") return;
      const element = closestCmsElement(event.target, root);
      const selection = element ? selectionFromElement(element) : null;
      setHover((current) => current?.key === selection?.key ? current : selection);
    };
    const onPointerLeave = () => setHover(null);
    const blockPageAction = (event: Event) => {
      const target = event.target as Element | null;
      if (!target?.closest("a,button,input,textarea,select,form,[role='button']")) return;
      if (target.closest("[data-cms-editor-ui]")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest("[data-cms-editor-ui]") || editingRef.current) return;
      blockPageAction(event);
      selectElement(closestCmsElement(event.target, root, event.altKey), event.shiftKey);
    };
    const onDoubleClick = (event: MouseEvent) => {
      const element = closestCmsElement(event.target, root);
      const selection = element ? selectionFromElement(element) : null;
      if (!selection) return;
      event.preventDefault();
      event.stopPropagation();
      selectElement(element);
      beginInlineEdit(selection, event);
    };
    const onContextMenu = (event: MouseEvent) => {
      const element = closestCmsElement(event.target, root);
      if (!element) return;
      event.preventDefault();
      selectElement(element);
      setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 290) });
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!editingRef.current) return;
      event.preventDefault();
      insertPlainText(event.clipboardData?.getData("text/plain") ?? "");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const editing = editingRef.current;
      if (editing) {
        if (event.key === "Escape") {
          event.preventDefault();
          finishInlineEdit(true);
          return;
        }
        const multiline = ["paragraph", "rich_text", "quote", "testimonial"].includes(editing.selection.blockType);
        if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          finishInlineEdit(false);
        }
        return;
      }
      if (isTypingTarget(event.target) || (event.target as Element | null)?.closest("[data-cms-editor-ui]")) return;
      if (event.key === "Escape") {
        setContextMenu(null);
        onSelect(null);
        return;
      }
      const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-cms-block-id][data-cms-editable='text']"));
      if ((event.key === "Tab" || event.key.startsWith("Arrow")) && elements.length) {
        event.preventDefault();
        const current = primary ? elements.findIndex((element) => selectionFromElement(element)?.key === primary.key) : -1;
        const backwards = event.shiftKey || event.key === "ArrowUp" || event.key === "ArrowLeft";
        const next = elements[(current + (backwards ? -1 : 1) + elements.length) % elements.length];
        selectElement(next);
        next.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (event.key === "Enter" && primary) {
        event.preventDefault();
        beginInlineEdit(primary);
      }
    };
    const onSubmit = (event: SubmitEvent) => blockPageAction(event);
    const onDragStart = (event: DragEvent) => {
      const element = closestCmsElement(event.target, root);
      const selection = element ? selectionFromElement(element) : null;
      if (!selection || selection.locked || selection.global || selection.blockId.startsWith("page-") || selection.blockId.startsWith("hero_")) {
        event.preventDefault();
        return;
      }
      dragSourceRef.current = selection.blockId;
      event.dataTransfer?.setData("text/x-cms-block", selection.blockId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      selectElement(element);
    };
    const onDragOver = (event: DragEvent) => {
      if (!dragSourceRef.current) return;
      const element = closestCmsElement(event.target, root);
      const selection = element ? selectionFromElement(element) : null;
      if (!element || !selection || selection.blockId === dragSourceRef.current || selection.locked || selection.global) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      const y = before ? rect.top : rect.bottom;
      setDropLine({ key: `${selection.blockId}:${before}`, left: rect.left, right: rect.right, top: y - 1, bottom: y + 1, width: rect.width, height: 2 });
    };
    const onDrop = (event: DragEvent) => {
      const sourceId = dragSourceRef.current;
      const element = closestCmsElement(event.target, root);
      const target = element ? selectionFromElement(element) : null;
      if (sourceId && element && target && sourceId !== target.blockId) {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        onReorder(sourceId, target.blockId, event.clientY < rect.top + rect.height / 2);
      }
      dragSourceRef.current = null;
      setDropLine(null);
    };
    const onDragEnd = () => {
      dragSourceRef.current = null;
      setDropLine(null);
    };

    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave, { passive: true });
    root.addEventListener("click", onClick, true);
    root.addEventListener("dblclick", onDoubleClick, true);
    root.addEventListener("contextmenu", onContextMenu);
    root.addEventListener("paste", onPaste, true);
    root.addEventListener("submit", onSubmit, true);
    root.addEventListener("dragstart", onDragStart);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("drop", onDrop);
    root.addEventListener("dragend", onDragEnd);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("click", onClick, true);
      root.removeEventListener("dblclick", onDoubleClick, true);
      root.removeEventListener("contextmenu", onContextMenu);
      root.removeEventListener("paste", onPaste, true);
      root.removeEventListener("submit", onSubmit, true);
      root.removeEventListener("dragstart", onDragStart);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("drop", onDrop);
      root.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [beginInlineEdit, finishInlineEdit, mode, onReorder, onSelect, primary, rootRef]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  const toolbarPosition = useMemo(() => {
    const rect = selectedRects.find((item) => item.key === primary?.key) ?? selectedRects[0];
    if (!rect) return null;
    const width = Math.min(520, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.top > 58 ? rect.top - 48 : Math.min(window.innerHeight - 48, rect.bottom + 8);
    return { left, top, width };
  }, [primary?.key, selectedRects]);

  const invoke = (action: CmsSelectionAction) => {
    if (!primary) return;
    if (action === "edit") {
      beginInlineEdit(primary);
      return;
    }
    onAction(action, selections.length ? selections : [primary]);
    setContextMenu(null);
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!primary || primary.locked) return;
    const root = rootRef.current;
    const element = root ? findCmsElement(root, primary) : null;
    if (!root || !element) return;
    event.preventDefault();
    event.stopPropagation();
    const container = element.parentElement?.getBoundingClientRect() ?? root.getBoundingClientRect();
    setResizing(true);
    const onMove = (pointer: PointerEvent) => {
      const raw = Math.max(25, Math.min(100, ((pointer.clientX - container.left) / container.width) * 100));
      const snapped = [25, 33, 50, 67, 75, 100].reduce((best, value) => Math.abs(value - raw) < Math.abs(best - raw) ? value : best, 100);
      element.style.width = `${snapped}%`;
      element.dataset.cmsResizeValue = String(snapped);
      scheduleMeasure();
    };
    const onUp = () => {
      const width = Number(element.dataset.cmsResizeValue || 100);
      delete element.dataset.cmsResizeValue;
      setResizing(false);
      onResize(primary, width);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  if (mode === "preview" || typeof document === "undefined") return null;

  const isPageField = primary?.blockId === "hero_heading" || primary?.blockId === "hero_description";
  const isPageButton = primary?.blockId.startsWith("page-button-") ?? false;
  const isPageElement = primary?.blockId.startsWith("element:") ?? false;
  const canStructure = Boolean(primary && !primary.locked && !primary.global && !isPageField);
  const canMove = canStructure && !isPageButton && !isPageElement;
  const canDuplicate = canStructure && !isPageElement;
  const canHide = canStructure && !isPageButton;
  const canLock = Boolean(primary && !primary.protected && !primary.global && !isPageField && !isPageButton && !isPageElement);
  const canDelete = Boolean(primary && !primary.locked && !primary.global);
  const canCopy = canStructure && !isPageButton && !isPageElement;

  return createPortal(
    <div className="cms-selection-portal" data-cms-editor-ui="true" aria-hidden={!primary}>
      {hoverRect && hover?.key !== primary?.key && (
        <div className="cms-selection-box is-hover" style={{ left: hoverRect.left, top: hoverRect.top, width: hoverRect.width, height: hoverRect.height }}>
          <span>{hover?.label}</span>
        </div>
      )}
      {selectedRects.map((rect) => {
        const selection = selections.find((item) => item.key === rect.key) ?? primary;
        return (
          <div className={`cms-selection-box is-selected${selection?.locked ? " is-locked" : ""}${selection?.invalid ? " is-invalid" : ""}`} key={rect.key} style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
            <span>{selection?.global ? "Global · " : ""}{selection?.label}{selection?.locked ? " · Locked" : ""}</span>
          </div>
        );
      })}
      {dropLine && <div className="cms-drop-line" style={{ left: dropLine.left, top: dropLine.top, width: dropLine.width }} />}
      {(dropLine || resizing) && <><div className="cms-alignment-guide is-horizontal" /><div className="cms-alignment-guide is-vertical" /></>}
      {toolbarPosition && primary && (
        <div className="cms-floating-toolbar" data-cms-editor-ui="true" role="toolbar" aria-label={`${primary.label} actions`} style={toolbarPosition}>
          <button disabled={primary.editable !== "text" || primary.locked} onClick={() => invoke("edit")} type="button"><Edit3 size={14} /> Edit</button>
          <button disabled={!canMove} onClick={() => invoke("move-up")} type="button"><ArrowUp size={14} /> Up</button>
          <button disabled={!canMove} onClick={() => invoke("move-down")} type="button"><ArrowDown size={14} /> Down</button>
          <button disabled={!canDuplicate} onClick={() => invoke("duplicate")} type="button"><Copy size={14} /> Duplicate</button>
          <button disabled={!canHide} onClick={() => invoke("hide")} type="button"><EyeOff size={14} /> Hide</button>
          <button disabled={!canLock} onClick={() => invoke("lock")} type="button">{primary.locked ? <Unlock size={14} /> : <Lock size={14} />} {primary.locked ? "Unlock" : "Lock"}</button>
          <button className="is-danger" disabled={!canDelete} onClick={() => invoke("delete")} type="button"><Trash2 size={14} /> Delete</button>
          <button title="More actions" onClick={() => setContextMenu({ x: toolbarPosition.left + toolbarPosition.width - 200, y: toolbarPosition.top + 42 })} type="button"><MoreHorizontal size={14} /></button>
        </div>
      )}
      {primary && selectedRects[0] && !primary.locked && !primary.global && (
        <button
          className="cms-insert-control"
          data-cms-editor-ui="true"
          aria-label={`Insert after ${primary.label}`}
          onClick={() => invoke("insert-after")}
          style={{ left: Math.max(8, selectedRects[0].left + selectedRects[0].width / 2 - 14), top: selectedRects[0].bottom - 14 }}
          type="button"
        ><Plus size={15} /></button>
      )}
      {primary && RESIZABLE_TYPES.has(primary.blockType) && !primary.locked && selectedRects[0] && (
        <button
          className="cms-resize-handle"
          data-cms-editor-ui="true"
          aria-label={`Resize ${primary.label}`}
          onPointerDown={startResize}
          style={{ left: selectedRects[0].right - 6, top: selectedRects[0].top + selectedRects[0].height / 2 - 6 }}
          type="button"
        />
      )}
      {breadcrumbs.length > 0 && primary && (
        <nav className="cms-selection-breadcrumbs" data-cms-editor-ui="true" aria-label="Selected element hierarchy">
          {breadcrumbs.map((item) => <button key={item.key} onClick={() => onSelect(item)} type="button">{item.label}</button>)}
          <span>{primary.label}</span>
        </nav>
      )}
      {contextMenu && primary && (
        <div className="cms-context-menu" data-cms-editor-ui="true" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button disabled={primary.editable !== "text" || primary.locked} onClick={() => invoke("edit")} role="menuitem" type="button"><Edit3 size={14} /> Edit</button>
          <button disabled={!canCopy} onClick={() => invoke("copy")} role="menuitem" type="button"><Copy size={14} /> Copy</button>
          <button disabled={!canDuplicate} onClick={() => invoke("duplicate")} role="menuitem" type="button"><Copy size={14} /> Duplicate</button>
          <button disabled={!canMove} onClick={() => invoke("move-up")} role="menuitem" type="button"><GripVertical size={14} /> Move up</button>
          <button disabled={!canHide} onClick={() => invoke("hide")} role="menuitem" type="button"><EyeOff size={14} /> Hide</button>
          <button disabled={!canLock} onClick={() => invoke("lock")} role="menuitem" type="button"><Lock size={14} /> {primary.locked ? "Unlock" : "Lock"}</button>
          <button className="is-danger" disabled={!canDelete} onClick={() => invoke("delete")} role="menuitem" type="button"><Trash2 size={14} /> Delete</button>
        </div>
      )}
    </div>,
    document.body
  );
}

export function isDestructiveSelectionAction(action: CmsSelectionAction) {
  return DESTRUCTIVE_ACTIONS.has(action);
}
