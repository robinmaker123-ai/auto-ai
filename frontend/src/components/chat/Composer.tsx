import { FormEvent, useState } from "react";
import { Globe2, Lightbulb, SendHorizonal } from "lucide-react";
import clsx from "clsx";
import { VoiceButton } from "./VoiceButton";

type ComposerOptions = {
  webSearch: boolean;
  reasoning: boolean;
  provider: Provider;
  model: string;
};

const PROVIDER_MODELS = {
  openai: [
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "gpt-4o-mini", label: "GPT-4o mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-5-mini", label: "GPT-5 mini" }
  ],
  groq: [
    { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
    { value: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { value: "qwen/qwen3-32b", label: "Qwen 3 32B" },
    { value: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout" }
  ],
  bedrock: [
    { value: "openai.gpt-oss-120b", label: "GPT-OSS 120B" },
    { value: "openai.gpt-oss-20b", label: "GPT-OSS 20B" },
    { value: "mistral.ministral-3-8b-instruct", label: "Ministral 3 8B" },
    { value: "mistral.ministral-3-14b-instruct", label: "Ministral 3 14B" },
    { value: "mistral.mistral-large-3-675b-instruct", label: "Mistral Large 3" },
    { value: "google.gemma-3-27b-it", label: "Gemma 3 27B" },
    { value: "qwen.qwen3-coder-30b-a3b-instruct", label: "Qwen 3 Coder 30B" }
  ]
} as const;

type Provider = keyof typeof PROVIDER_MODELS;

export function Composer({
  disabled,
  selectedDocumentCount,
  onSend
}: {
  disabled?: boolean;
  selectedDocumentCount: number;
  onSend: (text: string, options: ComposerOptions) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [provider, setProvider] = useState<Provider>("bedrock");
  const [model, setModel] = useState<string>(PROVIDER_MODELS.bedrock[0].value);
  const [sending, setSending] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || disabled || sending) return;
    setDraft("");
    setSending(true);
    try {
      await onSend(text, { webSearch, reasoning, provider, model });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="border-t border-slate-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950" onSubmit={submit}>
      <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-neutral-800 dark:bg-neutral-900">
        <textarea
          className="min-h-20 w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-neutral-500"
          placeholder={selectedDocumentCount ? `Ask about ${selectedDocumentCount} selected document${selectedDocumentCount > 1 ? "s" : ""}` : "Message Auto-AI"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={clsx("chip", webSearch && "chip-active")}
              disabled={provider !== "groq"}
              onClick={() => setWebSearch((value) => !value)}
              title={provider === "groq" ? "Toggle web search" : "Web search requires Groq"}
            >
              <Globe2 size={15} />
              Search
            </button>
            <button type="button" className={clsx("chip", reasoning && "chip-active")} onClick={() => setReasoning((value) => !value)}>
              <Lightbulb size={15} />
              Reason
            </button>
            <select
              aria-label="AI provider"
              className="model-select w-28"
              value={provider}
              onChange={(event) => {
                const nextProvider = event.target.value as Provider;
                setProvider(nextProvider);
                setModel(PROVIDER_MODELS[nextProvider][0].value);
                if (nextProvider !== "groq") setWebSearch(false);
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="groq">Groq</option>
              <option value="bedrock">Bedrock</option>
            </select>
            <select
              aria-label="AI model"
              className="model-select w-48 sm:w-52"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {PROVIDER_MODELS[provider].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <VoiceButton onTranscript={(text) => setDraft((current) => [current, text].filter(Boolean).join(" "))} />
            <button className="btn-primary h-9 px-3" disabled={disabled || sending || !draft.trim()} type="submit">
              <SendHorizonal size={17} />
              {sending ? "Sending" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
