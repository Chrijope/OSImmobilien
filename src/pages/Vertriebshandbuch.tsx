import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, X, AlertTriangle, BookOpen, ArrowUpRight, ChevronRight, Zap } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VERTRIEBSHANDBUCH, HANDBUCH_STAND, PROZESS_KETTE, type HandbuchBlock, type HandbuchBild } from "@/lib/vertriebshandbuch";
import { sucheImHandbuch, textAusschnitt } from "@/lib/vertriebshandbuchSuche";
import { seitenRoller } from "@/lib/rollen";
import { BegriffsText } from "@/components/vertriebsakademie/BegriffsText";
import { neuerMarkierer, type BegriffsSegment } from "@/lib/akademieBegriffeErkennung";
import { AKADEMIE_BEGRIFFE } from "@/lib/akademieBegriffe";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { objektbereichGesperrt } from "@/lib/sidebarNavigation";

/**
 * Das Vertriebshandbuch: eine Seite, die den ganzen Kundenabwicklungsprozess
 * erklaert.
 *
 * Aufbau wie in der Vertriebsakademie: links die Abschnitte, rechts der Text.
 * Oben eine Suche, die ganze Fragen versteht, nicht nur Stichwoerter.
 *
 * Der Inhalt steht bewusst nicht in dieser Datei, sondern in
 * `src/lib/vertriebshandbuch.ts`. So laesst er sich pflegen und durchsuchen,
 * ohne die Darstellung anzufassen, und die Suche arbeitet auf denselben Daten,
 * die auch angezeigt werden.
 */

/**
 * Ein Textstueck, fertig zerlegt: Fettschrift und erkannte Fachbegriffe.
 *
 * Der Handbuchtext benutzt dieselben Erklaerknoepfe wie die
 * Vertriebsakademie: Ein erkannter Begriff wird gepunktet unterstrichen und
 * erklaert sich auf Antippen in einem Satz. Achtzig Begriffe stehen in
 * `src/lib/akademieBegriffe.ts`, gepflegt samt Beugungen.
 *
 * Markiert wird **nur die erste Nennung je Abschnitt**, dafuer sorgt der
 * Markierer mit seiner Merkliste. Sonst waere der halbe Text gepunktet und
 * niemand laese ihn mehr.
 */
type TextStueck = { fett: boolean; segmente: BegriffsSegment[] };

function zerlege(text: string, markiere: (t: string) => BegriffsSegment[]): TextStueck[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((teil) => {
    const fett = teil.startsWith("**") && teil.endsWith("**");
    const roh = fett ? teil.slice(2, -2) : teil;
    return { fett, segmente: markiere(roh) };
  });
}

function MitFett({ stuecke }: { stuecke: TextStueck[] }) {
  return (
    <>
      {stuecke.map((s, i) =>
        s.fett
          ? <strong key={i} className="font-semibold text-foreground"><BegriffsText segmente={s.segmente} /></strong>
          : <BegriffsText key={i} segmente={s.segmente} />,
      )}
    </>
  );
}

/**
 * Ein Bildschirmfoto mit nummerierten Markierungen.
 *
 * Die Punkte sitzen in Prozent auf dem Bild, die Erklaerungen stehen darunter
 * in derselben Nummerierung. So bleibt der Text lesbar, auch wenn das Bild auf
 * dem Handy klein wird. Ein Klick vergroessert das Bild.
 */
function BildAnsicht({ bild }: { bild: HandbuchBild }) {
  const [offen, setOffen] = useState(false);
  // Eigener Markierer je Bild, damit die Erklaerungen unter dem Bild dieselben
  // Erklaerknoepfe tragen wie der Fliesstext.
  const erklaerungen = useMemo(() => {
    const markierer = neuerMarkierer(AKADEMIE_BEGRIFFE);
    return (bild.markierungen || []).map((m) => zerlege(m.text, (t) => markierer.markiere(t)));
  }, [bild]);
  return (
    <figure className="space-y-2">
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="relative block w-full overflow-hidden rounded-lg border border-border bg-muted/30 hover:border-primary transition-colors"
        aria-label="Bild vergrößern"
      >
        <img src={bild.bild} alt={bild.alt} loading="lazy" className="w-full" />
        {bild.markierungen?.map((m) => (
          <span
            key={m.nr}
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-md ring-2 ring-background"
          >
            {m.nr}
          </span>
        ))}
      </button>

      {bild.markierungen && bild.markierungen.length > 0 && (
        <ol className="space-y-1.5">
          {bild.markierungen.map((m, i) => (
            <li key={m.nr} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                {m.nr}
              </span>
              <span><MitFett stuecke={erklaerungen[i] || []} /></span>
            </li>
          ))}
        </ol>
      )}

      {bild.bildunterschrift && (
        <figcaption className="text-xs text-muted-foreground italic">{bild.bildunterschrift}</figcaption>
      )}

      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-5xl p-2">
          <img src={bild.bild} alt={bild.alt} className="w-full rounded-md" />
        </DialogContent>
      </Dialog>
    </figure>
  );
}

function BlockAnsicht({ block, hervor }: { block: HandbuchBlock; hervor: boolean }) {
  /*
    Alle Texte dieses Blocks werden in Lesereihenfolge zerlegt, mit **einem**
    Markierer. Nur so trifft "erste Nennung" auch die erste, die auf dem
    Bildschirm steht. Tabellen bleiben aussen vor: Dort stehen kurze Werte
    nebeneinander, eine gepunktete Unterstreichung wuerde die Spalte zerreissen.
  */
  const texte = useMemo(() => {
    const markierer = neuerMarkierer(AKADEMIE_BEGRIFFE);
    const m = (t: string) => markierer.markiere(t);
    return {
      absaetze: block.absaetze.map((t) => zerlege(t, m)),
      liste: (block.liste || []).map((t) => zerlege(t, m)),
      achtung: block.achtung ? zerlege(block.achtung, m) : null,
    };
  }, [block]);

  /*
    Nach einem Sprung wird der Abschnitt drei Sekunden lang eingerahmt. Ohne
    das landet man irgendwo in einer Textwand und sucht die Stelle, auf die man
    gerade geklickt hat. Der Rahmen traegt die Hausfarbe und verschwindet von
    allein, damit er nicht zum Dauerzustand wird.
  */

  return (
    <div
      id={block.id}
      className={`scroll-mt-24 space-y-3 rounded-xl transition-all duration-500 ${
        hervor ? "ring-2 ring-primary ring-offset-4 ring-offset-background bg-primary/[0.04]" : "ring-0"
      }`}
    >
      <div>
        <h3 className="text-base font-semibold">{block.titel}</h3>
        {block.frage && (
          <p className="text-sm text-muted-foreground italic mt-0.5">{block.frage}</p>
        )}
      </div>

      {texte.absaetze.map((stuecke, i) => (
        <p key={i} className="text-sm leading-relaxed text-muted-foreground">
          <MitFett stuecke={stuecke} />
        </p>
      ))}

      {block.liste && (
        <ul className="space-y-2 pl-5 list-disc marker:text-muted-foreground/50">
          {texte.liste.map((stuecke, i) => (
            <li key={i} className="text-sm leading-relaxed text-muted-foreground">
              <MitFett stuecke={stuecke} />
            </li>
          ))}
        </ul>
      )}

      {block.tabelle && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {block.tabelle.kopf.map((k, i) => (
                  <th key={i} className="text-left font-medium px-3 py-2 whitespace-nowrap">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.tabelle.zeilen.map((zeile, i) => (
                <tr key={i} className="border-t border-border">
                  {zeile.map((zelle, j) => (
                    <td key={j} className={`px-3 py-2 align-top ${j === 0 ? "font-medium" : "text-muted-foreground"}`}>
                      {zelle}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {block.bilder?.map((bild, i) => <BildAnsicht key={i} bild={bild} />)}

      {block.achtung && (
        <div className="flex items-start gap-2.5 rounded-lg bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/25 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed"><MitFett stuecke={texte.achtung || []} /></p>
        </div>
      )}

    </div>
  );
}

export default function Vertriebshandbuch() {
  const [frage, setFrage] = useState("");
  const [aktiv, setAktiv] = useState(VERTRIEBSHANDBUCH[0].id);
  const inhaltRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { user } = useUser();
  /** Der Abschnitt, der gerade eingerahmt ist. Drei Sekunden, dann von allein weg. */
  const [hervor, setHervor] = useState<string | null>(null);

  useEffect(() => {
    if (!hervor) return;
    const uhr = window.setTimeout(() => setHervor(null), 3000);
    return () => window.clearTimeout(uhr);
  }, [hervor]);

  const treffer = useMemo(() => sucheImHandbuch(frage), [frage]);
  const sucht = frage.trim().length >= 2;

  const springeZu = (abschnittId: string, blockId?: string) => {
    setFrage("");
    setAktiv(abschnittId);
    setHervor(blockId ?? null);
    // Erst nach dem Zeichnen scrollen, sonst gibt es das Ziel noch nicht.
    window.setTimeout(() => {
      const ziel = blockId ? document.getElementById(blockId) : null;
      const roller = seitenRoller();
      if (ziel && roller) {
        const abstand = ziel.getBoundingClientRect().top - roller.getBoundingClientRect().top;
        roller.scrollTo({ top: roller.scrollTop + abstand - 24, behavior: "smooth" });
      } else if (roller) {
        roller.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 30);
  };

  const abschnitt = VERTRIEBSHANDBUCH.find((a) => a.id === aktiv) || VERTRIEBSHANDBUCH[0];

  return (
    <DashboardLayout>
      <PageHeader
        title="Vertriebshandbuch"
        subtitle={`Der Kundenabwicklungsprozess von der Anlage bis zum Abschluss. Stand ${HANDBUCH_STAND}.`}
      />

      {/* Suche. Sie steht oben und gilt fuer das ganze Handbuch, nicht nur fuer den offenen Abschnitt. */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={frage}
          onChange={(e) => setFrage(e.target.value)}
          placeholder="Frage stellen, zum Beispiel: Wann bekomme ich eine Glocke?"
          className="pl-9 pr-9 h-11"
          aria-label="Im Handbuch suchen"
        />
        {frage && (
          <button
            type="button"
            onClick={() => setFrage("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Suche leeren"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/*
        Das Ablaufbild. Es steht oben und bleibt stehen, damit jeder sieht, an
        welcher Stelle der Kette er gerade liest. Die Blitze markieren die
        Uebergaenge, die von allein geschehen; ueberall sonst zieht ein Mensch
        weiter. Ein Klick springt in den passenden Abschnitt.
      */}
      {!sucht && (
        <Card className="p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Der Weg eines Kunden</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Zap className="h-3 w-3 text-primary" /> rückt von allein weiter
            </span>
          </div>
          <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
            {PROZESS_KETTE.map((stufe, i) => (
              <div key={`${stufe.titel}-${i}`} className="flex items-stretch gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => springeZu(stufe.abschnitt)}
                  title={stufe.automatik ? `Rückt von allein weiter: ${stufe.automatik}` : undefined}
                  className="rounded-lg border border-border px-2.5 py-2 text-left hover:border-primary hover:bg-muted/40 transition-colors min-w-[104px]"
                >
                  <span className="block text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="block text-xs font-medium leading-tight">{stufe.titel}</span>
                  {stufe.automatik && (
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-primary leading-tight">
                      <Zap className="h-2.5 w-2.5 shrink-0" /> automatisch
                    </span>
                  )}
                </button>
                {i < PROZESS_KETTE.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 self-center shrink-0" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {sucht ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground mb-4">
            {treffer.length === 0
              ? "Dazu steht nichts im Handbuch. Versuche es mit einem anderen Wort, oder frag deinen Ansprechpartner."
              : `${treffer.length} ${treffer.length === 1 ? "Stelle" : "Stellen"} gefunden.`}
          </p>
          <div className="space-y-2">
            {treffer.slice(0, 12).map((t) => (
              <button
                key={t.block.id}
                type="button"
                onClick={() => springeZu(t.abschnitt.id, t.block.id)}
                className="w-full text-left rounded-lg border border-border px-4 py-3 hover:border-primary hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className="text-[10px]">{t.abschnitt.titel}</Badge>
                  <span className="text-sm font-semibold">{t.block.titel}</span>
                </div>
                {t.block.frage && (
                  <p className="text-xs text-muted-foreground italic mb-1">{t.block.frage}</p>
                )}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {textAusschnitt(t.block, t.getroffen[0] || "")}
                </p>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_1fr] items-start">
          {/* Links die Abschnitte, wie in der Vertriebsakademie. */}
          <Card className="p-2 lg:sticky lg:top-4">
            <nav className="space-y-0.5">
              {VERTRIEBSHANDBUCH.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => springeZu(a.id)}
                  className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                    a.id === aktiv
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/60 text-foreground"
                  }`}
                >
                  <span className="block text-sm font-medium leading-tight">{a.titel}</span>
                  <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">{a.kurz}</span>
                </button>
              ))}
            </nav>
          </Card>

          <div ref={inhaltRef} className="space-y-5">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold">{abschnitt.titel}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{abschnitt.kurz}</p>

              {/*
                Sprungknoepfe statt Bildschirmfotos: Sie fuehren dorthin, wo der
                Abschnitt im CRM wirklich stattfindet. Ein Bild von heute zeigt
                morgen etwas anderes, ein Knopf nicht.
              */}
              {/* Ohne Freigabe des Eintrags „Objekte" fuehrte „Zur Objektliste" nur aufs Dashboard. */}
              {abschnitt.ziele && abschnitt.ziele.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {abschnitt.ziele.filter((ziel) => !objektbereichGesperrt(ziel.url, { rolle: user.role })).map((ziel) => (
                    <Button
                      key={ziel.url}
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(ziel.url)}
                    >
                      {ziel.label}
                      <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  ))}
                </div>
              )}
              <div className="space-y-8">
                {abschnitt.bloecke.map((b) => <BlockAnsicht key={b.id} block={b} hervor={hervor === b.id} />)}
              </div>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={VERTRIEBSHANDBUCH.findIndex((a) => a.id === aktiv) === 0}
                onClick={() => {
                  const i = VERTRIEBSHANDBUCH.findIndex((a) => a.id === aktiv);
                  if (i > 0) springeZu(VERTRIEBSHANDBUCH[i - 1].id);
                }}
              >
                Zurück
              </Button>
              <Button
                size="sm"
                disabled={VERTRIEBSHANDBUCH.findIndex((a) => a.id === aktiv) === VERTRIEBSHANDBUCH.length - 1}
                onClick={() => {
                  const i = VERTRIEBSHANDBUCH.findIndex((a) => a.id === aktiv);
                  if (i < VERTRIEBSHANDBUCH.length - 1) springeZu(VERTRIEBSHANDBUCH[i + 1].id);
                }}
              >
                Weiter
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
