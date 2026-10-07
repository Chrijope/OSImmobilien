import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, ExternalLink, ChevronDown, Quote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface QuelleRef {
  titel: string;
  url?: string;
  hinweis?: string;
}

export interface MagazineHeroProps {
  image: string;
  /** Kleines Label oberhalb des Titels, z. B. "Kapitel 01 · Geschwindigkeit" */
  kicker?: string;
  /** Ausgaben-Label, z. B. "OS Immobilien Lead Playbook · Ausgabe 2026/01" */
  issue?: string;
  /** Optionale Bildunterschrift / Credit */
  caption?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  badge?: string;
  pdfLabel?: string;
  onDownloadPdf?: () => Promise<void> | void;
  children: ReactNode;
  quellen?: QuelleRef[];
  /** Optionales Magazin-Cover. Ersetzt den Standard-PageHeader durch ein editoriales Hero. */
  hero?: MagazineHeroProps;
}

export function UnterlagenDetailLayout({
  title,
  subtitle,
  badge,
  pdfLabel = "Komplette PDF herunterladen",
  onDownloadPdf,
  children,
  quellen,
  hero,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleDownload = async () => {
    if (!onDownloadPdf) return;
    try {
      await onDownloadPdf();
      toast({ title: "PDF heruntergeladen ✓" });
    } catch (err) {
      console.error(err);
      toast({ title: "Fehler beim Erstellen des PDFs", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 w-full max-w-[1200px] mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate("/unterlagen")} className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Zurück zu Unterlagen
        </Button>

        {hero ? (
          <MagazineCover
            title={title}
            subtitle={subtitle}
            badge={badge}
            hero={hero}
            onDownloadPdf={onDownloadPdf ? handleDownload : undefined}
            pdfLabel={pdfLabel}
          />
        ) : (
          <>
            <PageHeader title={title} subtitle={subtitle}>
              {onDownloadPdf && (
                /*
                  Hauptaktion jeder Unterlagen-Detailseite, deshalb
                  Marken-Orange. Es bleibt bei genau einem orangefarbenen
                  Knopf je Seite, der Rueckweg oben bleibt unscheinbar.
                */
                <Button onClick={handleDownload} variant="brand" className="gap-2">
                  <Download className="h-4 w-4" /> {pdfLabel}
                </Button>
              )}
            </PageHeader>
            {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
          </>
        )}

        <article className="magazine-article space-y-7">{children}</article>

        {quellen && quellen.length > 0 && (
          <Card className="p-6 bg-muted/30 border-dashed">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Endnoten
            </div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-primary" /> Quellen & weiterführende Hinweise
            </h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {quellen.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary font-medium shrink-0">[{i + 1}]</span>
                  <div className="min-w-0">
                    {q.url ? (
                      <a href={q.url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                        {q.titel}
                      </a>
                    ) : (
                      <span className="font-medium text-foreground/80">{q.titel}</span>
                    )}
                    {q.hinweis && <p className="mt-0.5 text-muted-foreground">{q.hinweis}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Magazin-Cover (Hero) ───
function MagazineCover({
  title,
  subtitle,
  badge,
  hero,
  onDownloadPdf,
  pdfLabel,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  hero: MagazineHeroProps;
  onDownloadPdf?: () => void;
  pdfLabel: string;
}) {
  return (
    <figure className="relative w-full overflow-hidden rounded-2xl border border-border bg-neutral-900 shadow-xl">
      <div
        className="relative w-full aspect-[16/10] sm:aspect-[16/8] bg-cover bg-center"
        style={{ backgroundImage: `url(${hero.image})` }}
      >
        {/* Editorial gradient + grain */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-neutral-950/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent_55%)]" />

        {/* Top stripe with issue line */}
        {(hero.issue || badge) && (
          <div className="absolute top-0 inset-x-0 px-5 sm:px-8 py-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">
            <span>{hero.issue || "OS Immobilien · Lead Playbook"}</span>
            {badge && <span className="hidden sm:inline">{badge}</span>}
          </div>
        )}

        {/* Bottom content block */}
        <div className="absolute bottom-0 inset-x-0 p-5 sm:p-10">
          {hero.kicker && (
            <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300 mb-3">
              <span className="h-px w-6 bg-amber-300/70" />
              {hero.kicker}
            </div>
          )}
          <h1 className="text-white text-3xl sm:text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight max-w-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-4 text-white/80 text-sm sm:text-base max-w-2xl leading-relaxed font-light">
              {subtitle}
            </p>
          )}
          {onDownloadPdf && (
            <div className="mt-5">
              <Button onClick={onDownloadPdf} size="sm" className="gap-2 bg-white text-neutral-900 hover:bg-white/90">
                <Download className="h-4 w-4" /> {pdfLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
      {hero.caption && (
        <figcaption className="px-5 sm:px-8 py-3 bg-neutral-950 text-[10px] uppercase tracking-[0.2em] text-white/50 border-t border-white/10">
          {hero.caption}
        </figcaption>
      )}
    </figure>
  );
}

// ─── Reusable Content-Komponenten ───
export function SectionCard({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-6 sm:p-8 border-l-[3px] border-l-primary/70">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
        {icon}
        <span>Kapitel</span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-semibold mb-5 leading-tight text-foreground tracking-tight">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-[1.75] text-foreground/85">{children}</div>
    </Card>
  );
}

// ─── Magazine-Pull-Quote ───
export function PullQuote({ children, author }: { children: ReactNode; author?: string }) {
  return (
    <figure className="my-6 px-2 sm:px-6">
      <Quote className="h-6 w-6 text-primary/40 mb-2" />
      <blockquote className="text-xl sm:text-2xl leading-snug text-foreground/90 italic font-medium">
        „{children}"
      </blockquote>
      {author && (
        <figcaption className="mt-3 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
          — {author}
        </figcaption>
      )}
    </figure>
  );
}

// ─── Magazine-Figure (Inline-Bild mit Caption) ───
export function MagazineFigure({
  image,
  caption,
  credit,
  alt = "",
  aspect = "aspect-[16/9]",
}: {
  image: string;
  caption?: string;
  credit?: string;
  alt?: string;
  aspect?: string;
}) {
  return (
    <figure className="my-6 -mx-2 sm:mx-0 rounded-xl overflow-hidden border border-border shadow-sm">
      <div className={cn("relative w-full bg-muted overflow-hidden", aspect)}>
        <img src={image} alt={alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      </div>
      {(caption || credit) && (
        <figcaption className="px-4 py-3 bg-muted/40 text-xs text-muted-foreground flex items-start justify-between gap-3">
          {caption && <span className="italic">{caption}</span>}
          {credit && <span className="text-[10px] uppercase tracking-[0.2em] shrink-0">{credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export function EinwandBlock({
  einwand,
  antwort,
  technik,
  beispiel,
  num,
}: {
  einwand: string;
  antwort: string;
  technik?: string;
  beispiel?: string;
  num?: number;
}) {
  return (
    <div className="border-l-4 border-primary/40 pl-4 py-2 space-y-2">
      <div className="flex items-start gap-2">
        {num !== undefined && (
          <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded shrink-0 mt-0.5">
            #{num}
          </span>
        )}
        <p className="font-semibold text-foreground/90 italic">„{einwand}"</p>
      </div>
      {technik && (
        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
          Technik: {technik}
        </Badge>
      )}
      <p className="text-foreground/80">{antwort}</p>
      {beispiel && (
        <div className="bg-muted/40 border border-border rounded p-3 text-xs">
          <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Beispiel: </span>
          <span className="text-foreground/80">{beispiel}</span>
        </div>
      )}
    </div>
  );
}

export function TechnikCard({
  name,
  kurz,
  schritte,
  beispiele,
  onDownload,
}: {
  name: string;
  kurz: string;
  schritte: string[];
  beispiele?: string[];
  onDownload?: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const handle = async () => {
    if (!onDownload) return;
    try {
      await onDownload();
      toast({ title: `${name}-PDF heruntergeladen ✓` });
    } catch {
      toast({ title: "Fehler beim Erstellen des PDFs", variant: "destructive" });
    }
  };

  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-bold text-base text-primary">{name}</h3>
        {onDownload && (
          <Button size="sm" variant="outline" onClick={handle} className="gap-1 shrink-0">
            <Download className="h-3 w-3" /> PDF
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-3">{kurz}</p>
      <ol className="space-y-1.5 text-sm mb-3">
        {schritte.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-primary font-semibold shrink-0">{i + 1}.</span>
            <span className="text-foreground/80">{s}</span>
          </li>
        ))}
      </ol>
      {beispiele && beispiele.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Beispielsätze
          </p>
          {beispiele.map((b, i) => (
            <div
              key={i}
              className="text-xs italic text-foreground/80 bg-muted/40 border-l-2 border-primary/40 pl-2 py-1.5 pr-2 rounded-r"
            >
              „{b}"
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export interface EinwandItem {
  einwand: string;
  antwort: string;
  technik?: string;
  beispiel?: string;
}

export function EinwandDropdownList({ items }: { items: EinwandItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={i}
            className={cn(
              "border rounded-lg transition-all overflow-hidden",
              isOpen ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-card"
            )}
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-start gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
            >
              <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded shrink-0 mt-0.5">
                #{i + 1}
              </span>
              <span className="flex-1 font-medium text-sm italic text-foreground/90">
                „{item.einwand}"
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 space-y-2 border-t border-border/60">
                {item.technik && (
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary mt-2">
                    Technik: {item.technik}
                  </Badge>
                )}
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                  {item.antwort}
                </p>
                {item.beispiel && (
                  <div className="bg-muted/40 border border-border rounded p-3 text-xs">
                    <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                      Beispiel:{" "}
                    </span>
                    <span className="text-foreground/80">{item.beispiel}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PhaseStep({ num, titel, text }: { num: number; titel: string; text: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-sm">
        {num}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-foreground mb-1">{titel}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{text}</p>
      </div>
    </div>
  );
}
