import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { phase6 } from "../api/client";
import { PageHeader, Card, Loading, ErrorState, LoadingSkeleton } from "../components/ui";
import { useApi, errorMessage } from "../hooks/useApi";

const CATEGORIES = [
  { value: "", label: "All docs" },
  { value: "manuals", label: "Manuals" },
  { value: "obd_docs", label: "OBD docs" },
  { value: "service_guides", label: "Service" },
  { value: "maintenance_guides", label: "Maintenance" },
];

const QUICK_QUESTIONS = [
  "Low brake fluid procedure?",
  "Engine oil replacement interval?",
  "Causes of P0420 catalyst fault?",
];

export default function KnowledgeBase() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("");
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef(null);

  const {
    data: docs,
    loading: docsLoading,
    error: docsError,
    refetch,
  } = useApi(() => phase6.get("/documents").then((r) => r.data), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ask(customQuestion) {
    const question = (customQuestion ?? input).trim();
    if (!question || asking) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    if (customQuestion == null) setInput("");
    setAsking(true);
    try {
      const { data } = await phase6.post("/ask", {
        question,
        category: category || null,
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer,
          sources: data.sources,
          confidence: data.confidence,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: err.response?.data?.detail || "Knowledge Base unavailable.",
          error: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[calc(100vh-140px)] max-w-6xl">
      <div className="lg:col-span-2 flex flex-col min-h-[420px] lg:min-h-0">
        <PageHeader eyebrow="06. RAG" title="Knowledge Base" />

        <div className="panel flex-1 flex flex-col overflow-hidden min-h-[320px] animate-fade-up">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex flex-wrap gap-2 pb-1">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-base-inset border border-base-border text-ink-muted hover:text-brand hover:border-accent/40 transition-all duration-150 whitespace-nowrap"
                >
                  {q}
                </button>
              ))}
            </div>

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex animate-fade-up ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-brand text-white"
                      : m.error
                      ? "bg-crit/10 text-crit border border-crit/20"
                      : "bg-base-inset text-ink border border-base-border"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.sources?.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-base-border space-y-1">
                      {m.sources.map((s, j) => (
                        <div
                          key={j}
                          className="flex items-center justify-between gap-2 text-xs font-mono text-ink-muted"
                        >
                          <span className="truncate">
                            {s.file_name}
                            {s.page != null && ` · p${s.page}`}
                          </span>
                          <span className="text-brand font-semibold shrink-0 tabular-nums">
                            {s.score.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {asking && <Loading label="Retrieving…" />}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-base-border p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-base-inset border border-base-border rounded-lg text-xs px-2.5 py-2.5 outline-none text-ink-muted sm:max-w-[140px] focus:border-accent transition-colors"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask manuals or service docs…"
              className="flex-1 bg-base-inset border border-base-border rounded-lg px-3 py-2.5 text-sm outline-none text-ink min-w-0 focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all"
            />
            <button
              type="button"
              onClick={() => ask()}
              disabled={asking}
              className="w-full sm:w-10 sm:h-10 h-10 rounded-lg bg-brand hover:bg-brand-dark text-white flex items-center justify-center disabled:opacity-40 shrink-0 transition-all duration-150 hover:-translate-y-0.5 active:scale-95 shadow-sm"
              aria-label="Send question"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="lg:pt-[52px]">
        <Card title="Indexed Corpus" style={{ animationDelay: "80ms" }}>
          {docsLoading ? (
            <LoadingSkeleton rows={6} />
          ) : docsError ? (
            <ErrorState message={errorMessage(docsError, "Knowledge Base")} onRetry={refetch} />
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {docs.documents.map((d, idx) => (
                <div
                  key={d.file_name}
                  style={{ animationDelay: `${idx * 40}ms` }}
                  className="bg-base-inset/70 rounded-lg p-3 border border-base-border hover:border-accent/40 transition-all duration-150 animate-fade-up"
                >
                  <div className="text-xs text-ink font-medium truncate">{d.file_name}</div>
                  <div className="text-[11px] text-ink-faint mt-0.5 font-mono tabular-nums">
                    {d.category} · {d.chunk_count} chunks
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
