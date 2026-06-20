const TEXT_KEYS = ["text", "content", "delta", "message", "value", "output"] as const;

function stripObjectArtifacts(value: string) {
  return value.replace(/\[object Object\]/g, "");
}

export function coerceTextContent(value: unknown, seen = new WeakSet<object>()): string {
  if (value == null) return "";
  if (typeof value === "string") return stripObjectArtifacts(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => coerceTextContent(item, seen)).join("");
  }
  if (typeof value !== "object") return "";

  if (seen.has(value)) return "";
  seen.add(value);

  if ("props" in value && value.props && typeof value.props === "object" && "children" in value.props) {
    return coerceTextContent((value.props as { children?: unknown }).children, seen);
  }

  for (const key of TEXT_KEYS) {
    if (key in value) {
      const text = coerceTextContent((value as Record<string, unknown>)[key], seen);
      if (text) return text;
    }
  }

  return "";
}
