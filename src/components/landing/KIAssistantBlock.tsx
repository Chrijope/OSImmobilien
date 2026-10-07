import { useRef, useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Mode = "investment-check" | "faq";

interface Props {
  mode: Mode;
  title: string;
  subtitle?: string;
  placeholder: string;
  examples?: string[];
  badge?: string;
  variant?: "light" | "dark";
  ctaLabel?: string;
}

const KI_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ki-assistant`;

export default function KIAssistantBlock({
  mode,
  title,
  subtitle,
  placeholder,
  examples = [],
  badge = "KI-gestützt",
  variant = "light",
  ctaLabel = "KI-Analyse starten",
}: Props) {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setError(null);
    setAnswer("");
    setDone(false);
    setLoading(true);
    if (override) setInput(override);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(KI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mode, messages: [{ role: "user", content: text }] }),
        signal: controller.signal,
      });

      if (resp.status === 429) { setError("Zu viele Anfragen. Bitte kurz warten."); setLoading(false); return; }
      if (resp.status === 402) { setError("KI-Kontingent aktuell aufgebraucht. Bitte später erneut."); setLoading(false); return; }
      if (!resp.ok || !resp.body) { setError("Es gab einen Fehler. Bitte versuche es erneut."); setLoading(false); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let streamDone = false;

      while (!streamDone) {
        const r = await reader.read();
        if (r.done) break;
        buf += decoder.decode(r.value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (c) { acc += c; setAnswer(acc); }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
      setDone(true);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error(e);
        setError("Verbindungsfehler. Bitte erneut versuchen.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isDark = variant === "dark";

  return (
    <div className={`rounded-2xl p-6 md:p-8 lg:p-10 ${isDark ? "bg-[hsl(220,20%,14%)] border border-white/10" : "bg-white border border-[hsl(40,15%,88%)] shadow-[0_4px_24px_-4px_hsla(220,20%,14%,0.08)]"}`}>
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        <div
          className="flex items-center justify-center rounded-2xl shrink-0"
          style={{
            width: 48, height: 48,
            background: "hsl(157, 68%, 39%)",
            color: "#fff",
            boxShadow: "0 8px 24px -8px hsla(157, 68%, 39%, 0.5)",
          }}
        >
          <Sparkles className="w-5 h-5" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-2"
            style={{ background: "hsl(157, 68%, 46%, 0.12)" }}>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "hsl(157, 68%, 39%)" }}>
              {badge}
            </span>
          </div>
          <h3 className={`text-xl md:text-2xl font-extrabold leading-tight ${isDark ? "text-white" : "text-[hsl(30,8%,16%)]"}`}>{title}</h3>
          {subtitle && <p className={`text-sm mt-2 leading-relaxed ${isDark ? "text-white/65" : "text-[hsl(220,10%,46%)]"}`}>{subtitle}</p>}
        </div>
      </div>

      {/* Input */}
      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
          }}
          placeholder={placeholder}
          rows={3}
          disabled={loading}
          maxLength={1500}
          className={`w-full resize-none px-4 py-3 pr-14 rounded-2xl text-sm focus:outline-none focus:ring-2 transition-all ${
            isDark
              ? "bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:ring-blue-400/40"
              : "bg-[hsl(40,20%,97%)]/60 border border-[hsl(40,15%,88%)] text-[hsl(30,8%,16%)] placeholder:text-[hsl(220,10%,46%)]/60 focus:ring-blue-400/40"
          }`}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          aria-label="Senden"
          className="absolute right-3 bottom-3 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
          style={{
            background: input.trim() && !loading ? "hsl(157, 68%, 39%)" : "#9ca3af",
            color: "#fff",
          }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {/* Examples */}
      {examples.length > 0 && !answer && !loading && (
        <div className="flex flex-wrap gap-2 mt-3">
          <span className={`text-[11px] self-center mr-1 ${isDark ? "text-white/50" : "text-[hsl(220,10%,46%)]"}`}>Beispiele:</span>
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => send(ex)}
              className={`text-[11px] px-3 py-1.5 rounded-full transition-all hover:scale-[1.02] ${
                isDark
                  ? "bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
                  : "bg-[hsl(40,20%,97%)]/80 border border-[hsl(40,15%,88%)] text-[hsl(220,10%,46%)] hover:border-blue-400/40"
              }`}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* CTA hint */}
      {!answer && !loading && !error && (
        <p className={`text-[11px] mt-3 flex items-center gap-1.5 ${isDark ? "text-white/50" : "text-[hsl(220,10%,46%)]"}`}>
          <Sparkles className="w-3 h-3" style={{ color: "hsl(157, 68%, 39%)" }} />
          {ctaLabel} . Cmd/Ctrl + Enter zum Senden.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 text-xs px-3 py-2 rounded-lg" style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !answer && (
        <div className={`mt-5 flex items-center gap-2 text-sm ${isDark ? "text-white/50" : "text-[hsl(220,10%,46%)]"}`}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "hsl(157, 68%, 39%)" }} />
          KI analysiert deine Eingabe...
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div className="mt-5">
          <div className={`rounded-2xl p-5 md:p-7 ${isDark ? "bg-white/5 border border-white/10" : "bg-[hsl(40,20%,97%)]/80 border border-[hsl(40,15%,88%)]"}`}>
            <div className={`text-sm leading-relaxed prose prose-sm max-w-none ${isDark ? "text-white/90 prose-invert" : "text-[hsl(30,8%,16%)]"}`}>
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          </div>

          {done && (
            <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={() => { setAnswer(""); setDone(false); setInput(""); }}
                className={`text-xs font-semibold px-4 py-2.5 rounded-xl transition-all ${
                  isDark
                    ? "text-white/70 hover:text-white border border-white/10 hover:border-white/30"
                    : "text-[hsl(220,10%,46%)] hover:text-[hsl(30,8%,16%)] border border-[hsl(40,15%,88%)] hover:border-[hsl(30,8%,16%)]/30"
                }`}
              >
                Neue Frage stellen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}