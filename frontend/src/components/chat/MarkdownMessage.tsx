import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code(props: any) {
          const { className, children } = props;
          const match = /language-(\w+)/.exec(className || "");
          const code = String(children).replace(/\n$/, "");
          if (match) {
            return <CodeBlock code={code} language={match[1]} />;
          }
          return <code className="rounded bg-slate-200 px-1 py-0.5 text-sm dark:bg-neutral-800">{children}</code>;
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

