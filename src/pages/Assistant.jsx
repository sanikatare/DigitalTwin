import { useState, useRef, useEffect } from "react";
import { Send, RotateCcw } from "lucide-react";
import { phase7 } from "../api/client";
import { PageHeader, StatusPill, Loading } from "../components/ui";
import { useVehicle } from "../context/VehicleContext";

const SUGGESTIONS = [
  "Why is my engine health dropping?",
  "What does P0420 mean?",
  "Can I drive with P0101?",
  "What maintenance should I do next?",
];

export default function Assistant() {
  const { vehicleId } = useVehicle();
  const sessionId = useRef(`dash-${Math.random().toString(36).slice(2, 10)}`);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setSending(true);
    try {
      const { data } = await phase7.post("/chat", {
        vehicle_id: vehicleId,
        session_id: sessionId.current,
        message,
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer,
          intent: data.intent,
          sources: data.data_sources,
          codes: data.obd_codes,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: err.response?.data?.detail || "Assistant unavailable.",
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function clearChat() {
    try {
      await phase7.post("/chat/clear", { session_id: sessionId.current });
    } catch {
      /* ignore */
    }
    setMessages([]);
  }

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col max-w-6xl">
      <PageHeader
        eyebrow="07. Assistant"
        title="Vehicle Assistant"
        right={
          <button
            type="button"
            onClick={clearChat}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-brand px-2.5 py-1.5 rounded-lg bg-white border border-base-border transition-all whitespace-nowrap"
          >
            <RotateCcw size={12} /> Reset
          </button>
        }
      />

      <div className="panel flex-1 flex flex-col overflow-hidden animate-fade-up">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s, idx) => (
              <button
                key={s}
                type="button"
                style={{ animationDelay: `${idx * 40}ms` }}
                onClick={() => send(s)}
                className="text-xs px-3 py-1.5 rounded-lg bg-base-inset border border-base-border text-ink-muted hover:border-accent/50 hover:text-brand transition-all duration-150 animate-scale-in whitespace-nowrap"
              >
                {s}
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
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  m.role === "user"
                    ? "bg-brand text-white"
                    : m.error
                    ? "bg-crit/10 text-crit border border-crit/25"
                    : "bg-base-inset text-ink border border-base-border"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.intent && (
                  <div className="mt-2 pt-2 border-t border-base-border flex flex-wrap items-center gap-3 text-xs font-mono text-ink-faint">
                    <span>{m.intent}</span>
                    {m.codes?.map((c) => (
                      <StatusPill key={c} level="warn">
                        {c}
                      </StatusPill>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && <Loading label="Analyzing…" />}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-base-border p-3 flex items-center gap-2 bg-white">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={`Ask about ${vehicleId}…`}
            className="flex-1 bg-base-inset border border-base-border rounded-lg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={sending}
            className="w-10 h-10 rounded-lg bg-brand hover:bg-brand-dark text-white flex items-center justify-center disabled:opacity-40 transition-all duration-150 hover:-translate-y-0.5 active:scale-95 shadow-sm"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
