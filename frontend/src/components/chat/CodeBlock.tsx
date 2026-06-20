import { Check, Copy, Download, Play } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";

const LANGUAGE_ALIASES: Record<string, string> = {
  py: "python",
  python: "python",
  js: "javascript",
  jsx: "javascript",
  javascript: "javascript",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  java: "java",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  "c++": "cpp",
  hpp: "cpp",
  cs: "csharp",
  "c#": "csharp",
  csharp: "csharp",
  html: "html",
  css: "css",
  sql: "sql",
  sh: "bash",
  shell: "bash",
  bash: "bash",
  zsh: "bash"
};

const LANGUAGE_LABELS: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  bash: "Bash"
};

const EXTENSIONS: Record<string, string> = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  html: "html",
  css: "css",
  sql: "sql",
  bash: "sh"
};

function normalizeLanguage(language?: string) {
  if (!language) return "";
  const normalized = language.toLowerCase().trim();
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function detectLanguage(code: string) {
  const sample = code.trim();
  if (!sample) return "";
  if (/^<!doctype html|^<html[\s>]|<\/[a-z][\w-]*>/i.test(sample)) return "html";
  if (/^\s*(select|insert|update|delete|create|alter|drop)\s+/i.test(sample)) return "sql";
  if (/^#!.*\b(bash|sh)\b|(^|\n)\s*(npm|pnpm|yarn|git|curl|sudo|echo)\s+/i.test(sample)) return "bash";
  if (/\busing\s+System\b|Console\.WriteLine|namespace\s+\w+/i.test(sample)) return "csharp";
  if (/#include\s*<iostream>|std::|cout\s*<</.test(sample)) return "cpp";
  if (/#include\s*<stdio\.h>|printf\s*\(|scanf\s*\(/.test(sample)) return "c";
  if (/\bpublic\s+class\b|System\.out\.println|public\s+static\s+void\s+main/.test(sample)) return "java";
  if (/\binterface\s+\w+|:\s*(string|number|boolean)\b|type\s+\w+\s*=/.test(sample)) return "typescript";
  if (/\b(const|let|var|function)\b|=>|console\.log/.test(sample)) return "javascript";
  if (/^\s*(def|class|import|from)\s+|\bprint\s*\(/m.test(sample)) return "python";
  if (/[.#]?[\w-]+\s*\{[\s\S]*:\s*[^}]+;[\s\S]*\}/.test(sample)) return "css";
  return "";
}

function filenameFor(language: string) {
  const extension = EXTENSIONS[language] ?? "txt";
  return `auto-ai-code.${extension}`;
}

export function CodeBlock({
  code,
  language,
  highlightedCode,
  className
}: {
  code: string;
  language?: string;
  highlightedCode?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const detectedLanguage = useMemo(() => normalizeLanguage(language) || detectLanguage(code), [code, language]);
  const label = LANGUAGE_LABELS[detectedLanguage] ?? (detectedLanguage || "Code");
  const codeClassName = [className, detectedLanguage ? `language-${detectedLanguage}` : "", "hljs"]
    .filter(Boolean)
    .join(" ");

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function downloadCode() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFor(detectedLanguage);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="code-block not-prose">
      <div className="code-block-header">
        <span>{label}</span>
        <div className="code-block-actions">
          <button className="code-block-action" type="button" onClick={copyCode} title="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
          <button className="code-block-action" type="button" onClick={downloadCode} title="Download code">
            <Download size={14} />
            Download
          </button>
          <button className="code-block-action" type="button" disabled title="Run code support is coming soon">
            <Play size={14} />
            Run
          </button>
        </div>
      </div>
      <pre>
        <code className={codeClassName}>{highlightedCode ?? code}</code>
      </pre>
    </div>
  );
}
