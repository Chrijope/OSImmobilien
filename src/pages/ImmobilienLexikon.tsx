import { useState, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import lexikonData from "@/data/lexikon.json";

interface LexikonEintrag { term: string; definition: string; }

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function ImmobilienLexikon() {
  const [search, setSearch] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const entries = useMemo(() => {
    const raw = lexikonData as LexikonEintrag[];
    const seen = new Set<string>();
    return raw.filter((e) => {
      if (!e.definition || e.definition.length <= 5) return false;
      const key = e.term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const availableLetters = useMemo(() => {
    const letters = new Set(entries.map((e) => {
      const first = e.term[0].toUpperCase();
      return first === "\u00DC" ? "U" : first;
    }));
    return letters;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (activeLetter) {
      result = result.filter((e) => {
        const first = e.term[0].toUpperCase();
        return first === activeLetter || (activeLetter === "U" && first === "\u00DC");
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((e) => e.term.toLowerCase().includes(q));
    }
    return result;
  }, [entries, activeLetter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, LexikonEintrag[]> = {};
    for (const entry of filteredEntries) {
      let letter = entry.term[0].toUpperCase();
      if (letter === "\u00DC") letter = "U";
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(entry);
    }
    return groups;
  }, [filteredEntries]);

  const scrollToLetter = (letter: string) => {
    setActiveLetter((prev) => (prev === letter ? null : letter));
    setExpandedTerm(null);
    setTimeout(() => {
      sectionRefs.current[letter]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Immobilien-Lexikon" subtitle={`${entries.length} Fachbegriffe von A bis Z – verständlich erklärt.`} />

        {/* Search */}
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 pr-9" placeholder="Begriff suchen..." value={search} onChange={(e) => { setSearch(e.target.value); setExpandedTerm(null); }} />
          {search && (
            <button onClick={() => { setSearch(""); setActiveLetter(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Alphabet */}
        <div className="flex flex-wrap gap-1.5">
          {ALPHABET.map((letter) => {
            const isAvailable = availableLetters.has(letter);
            const isActive = activeLetter === letter;
            return (
              <button key={letter} onClick={() => isAvailable && scrollToLetter(letter)} disabled={!isAvailable}
                className={`w-9 h-9 rounded-xl text-xs font-semibold transition-all duration-200 ${isActive ? "bg-primary text-primary-foreground shadow-md scale-105" : isAvailable ? "bg-card border border-border hover:bg-accent cursor-pointer" : "bg-muted text-muted-foreground/30 cursor-not-allowed"}`}>
                {letter}
              </button>
            );
          })}
          {activeLetter && (
            <button onClick={() => { setActiveLetter(null); setExpandedTerm(null); }} className="ml-2 px-3 h-9 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all flex items-center gap-1">
              <X className="w-3 h-3" /> Alle
            </button>
          )}
        </div>


        {/* Entries */}
        <div className="space-y-16">
          {filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">Keine Einträge gefunden.</p>
          ) : (
            Object.keys(grouped).sort().map((letter) => (
              <div key={letter} ref={(el) => { sectionRefs.current[letter] = el; }}>
                <div className="flex items-end gap-4 mb-4 pb-3 border-b border-border">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center bg-gradient-to-br from-primary to-primary/70 shadow-lg shrink-0">
                    <span className="font-extrabold text-primary-foreground leading-none select-none" style={{ fontSize: "56px", letterSpacing: "-0.04em" }}>{letter}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{grouped[letter].length} {grouped[letter].length === 1 ? "Begriff" : "Begriffe"}</p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {grouped[letter].map((entry) => {
                    const isExpanded = expandedTerm === entry.term;
                    return (
                      <div key={entry.term} className={isExpanded ? "w-full" : ""}>
                        <button onClick={() => setExpandedTerm(isExpanded ? null : entry.term)}
                          className={`group inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${isExpanded ? "bg-primary/10 border-primary/40 text-foreground" : "bg-card border-border text-foreground hover:border-primary/30"}`}>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                          {entry.term}
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground opacity-60 group-hover:opacity-100" />}
                        </button>
                        {isExpanded && (
                          <div className="mt-3 rounded-xl p-5 bg-card border border-primary/20 shadow-sm">
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{entry.definition}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
