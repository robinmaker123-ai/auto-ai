import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { coerceTextContent } from "../../utils/text";
import { CodeBlock } from "./CodeBlock";

function textFromMarkdownNode(node: any): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  if (Array.isArray(node.children)) {
    return node.children.map(textFromMarkdownNode).join("");
  }
  return "";
}

function languageFromClassName(className?: string) {
  return className?.match(/language-([^\s]+)/)?.[1];
}

function classNameFromNode(node: any) {
  const className = node?.properties?.className;
  if (Array.isArray(className)) return className.join(" ");
  return typeof className === "string" ? className : undefined;
}

function findCodeNode(node: any): any {
  if (!node) return undefined;
  if (node.tagName === "code") return node;
  if (!Array.isArray(node.children)) return undefined;
  return node.children.map(findCodeNode).find(Boolean);
}

function highlightedCodeFromChildren(children: ReactNode): ReactNode {
  const child = Children.toArray(children).find(isValidElement);
  if (isValidElement(child)) {
    return (child.props as { children?: ReactNode }).children;
  }
  return children;
}

export function MarkdownMessage({ content }: { content: unknown }) {
  const markdown = coerceTextContent(content);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true }]]}
      components={{
        pre({ node, children }: any) {
          const codeNode = findCodeNode(node);
          const className = classNameFromNode(codeNode);
          const rawCode = textFromMarkdownNode(codeNode) || coerceTextContent(children);
          const language = languageFromClassName(className);
          return (
            <CodeBlock
              code={rawCode.replace(/\n$/, "")}
              language={language}
              highlightedCode={highlightedCodeFromChildren(children)}
              className={className}
            />
          );
        },
        code({ className, children }: any) {
          return <code className={className}>{children}</code>;
        }
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
