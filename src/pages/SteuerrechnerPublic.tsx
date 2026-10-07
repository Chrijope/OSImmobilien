/**
 * Die OEFFENTLICHE Seite des Steuerrechners.
 *
 * Aufgeloest wird der Partner ausschliesslich ueber die Edge Function
 * `get-vp-microsite`. Das ist keine Geschmacksfrage, sondern ein bereits
 * behobener Fehler, der sich nicht wiederholen darf: Die Ansicht
 * `profiles_public` laeuft mit den Rechten des Aufrufers und ist fuer einen
 * nicht angemeldeten Besucher leer. Wer den Partner daraus erraten wollte,
 * bekam keinen, und der Lead landete ohne Zustaendigkeit im offenen Pool. Die
 * Function arbeitet mit Service-Rolle und loest ueber den dauerhaft vergebenen
 * `vp_slug` auf.
 *
 * SPRACHE (Plan Kundensprache, Etappe 6): Die Seite ermittelt ihre Sprache
 * selbst, `?lang=en`, dann die Wahl aus dem Umschalter oben rechts, dann die
 * Browsersprache, sonst Deutsch. Dafuer haengt sie in `SeitenSpracheProvider`.
 * Die Texte stehen in `steuerrechnerTexte.ts`. Auf Englisch sagt der Kopf gut
 * sichtbar, dass der Rechner auf deutschem Steuerrecht beruht, und verweist auf
 * den EXPATS Calculator (Entscheidung 13). Auf Deutsch gibt es diesen Hinweis
 * nicht.
 */
import "@/styles/steuerrechner.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, Info } from "lucide-react";
import moreimmoLogo from "@/assets/moreimmo-offices-logo.png";
import { nurEchteBezeichnung } from "@/lib/berufsbezeichnung";
import SteuerRechnerStrecke from "@/components/steuerrechner/SteuerRechnerStrecke";
import { moechteWenigBewegung } from "@/components/steuerrechner/bausteine";
import { STEUERRECHNER_TEXTE } from "@/components/steuerrechner/steuerrechnerTexte";
import { SeitenSprachUmschalter, SeitenSpracheProvider, useSeitenTexte } from "@/components/SeitenSprache";
import type { BeraterInfo } from "@/pages/AnalysePublic";

/** Die englische Seite fuer Expats in Deutschland, fest englisch. */
const EXPATS_RECHNER = "/expats-calculator";

export default function SteuerrechnerPublic() {
  return (
    <SeitenSpracheProvider>
      <SteuerrechnerSeite />
    </SeitenSpracheProvider>
  );
}

function SteuerrechnerSeite() {
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).seite;
  const [searchParams] = useSearchParams();
  const { slug } = useParams<{ slug?: string }>();

  // Rueckfallebene: Partner als Base64 im Link, so wie beim Analysetool.
  const ausQuery = useMemo<BeraterInfo | undefined>(() => {
    const kodiert = searchParams.get("b");
    if (!kodiert) return undefined;
    try {
      return JSON.parse(atob(kodiert));
    } catch {
      return undefined;
    }
  }, [searchParams]);

  const [ausSlug, setAusSlug] = useState<BeraterInfo | undefined>(undefined);
  const [laedt, setLaedt] = useState<boolean>(!!slug);

  useEffect(() => {
    if (!slug) {
      setLaedt(false);
      return;
    }
    let abgebrochen = false;
    (async () => {
      setLaedt(true);
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "DEIN-SUPABASE-PROJEKT";
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/get-vp-microsite?slug=${encodeURIComponent(slug.toLowerCase())}`,
        );
        if (!res.ok) {
          if (!abgebrochen) setAusSlug(undefined);
          return;
        }
        const json = await res.json();
        if (abgebrochen) return;
        if (!json?.userId) {
          setAusSlug(undefined);
          return;
        }
        setAusSlug({
          name: json.name || "",
          telefon: json.telefon || "",
          email: json.email || "",
          position: nurEchteBezeichnung(json.position),
          userId: json.userId,
          slug: String(json.slug || slug).toLowerCase(),
          ...(json.bild ? { bild: json.bild } : {}),
        });
      } catch (e) {
        console.warn("[steuer] Vertriebspartner konnte nicht aufgelöst werden", e);
        if (!abgebrochen) setAusSlug(undefined);
      } finally {
        if (!abgebrochen) setLaedt(false);
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [slug]);

  /* Mit Kuerzel im Link geht das Kuerzel immer mit dem Lead hinaus, auch wenn
     es sich hier nicht aufloesen liess. Der Server ermittelt den Partner
     selbst daraus, und ein unbekanntes Kuerzel landet dort mit Vermerk im
     Log, statt spurlos im Pool zu verschwinden. Ohne Namen zeigt die Seite
     dann einfach keinen Partner an. Der alte Link mit `?b=` gilt nur, wenn
     gar kein Kuerzel in der Adresse steht. */
  const berater: BeraterInfo | undefined = slug
    ? ausSlug || { name: "", telefon: "", email: "", slug: slug.toLowerCase() }
    : ausQuery;

  /* Der Sprung vom Kopfbereich zum Rechner. Weich, ausser jemand hat
     reduzierte Bewegung eingestellt, dann steht er sofort dort. */
  const rechnerRef = useRef<HTMLElement>(null);
  const zumRechner = useCallback(() => {
    rechnerRef.current?.scrollIntoView({
      behavior: moechteWenigBewegung() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  /* Ein Verweis mit `#rechner` soll auch beim Aufruf von aussen treffen. Der
     Browser sucht die Kennung, bevor React die Seite gezeichnet hat, und
     findet dann nichts. Deshalb hier noch einmal, nach dem ersten Aufbau.

     Ohne weiches Gleiten, und das ist Absicht: Wer einen Verweis auf den
     Rechner oeffnet, will dort sein und nicht zusehen, wie die Seite an ihm
     vorbeizieht. Ein gleitender Rollvorgang bricht beim Laden ausserdem ab,
     sobald sich die Seite darunter noch einmal aufbaut. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#rechner") return;
    let abgebrochen = false;
    const springen = () => {
      if (abgebrochen) return;
      rechnerRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    };
    /* Zwei Bildschirmbilder abwarten: das erste kommt nach dem Einbau, das
       zweite nach dem ersten Aufbau der Strecke. */
    const id = window.requestAnimationFrame(() => window.requestAnimationFrame(springen));
    return () => {
      abgebrochen = true;
      window.cancelAnimationFrame(id);
    };
  }, []);

  return (
    /* `steuer-flaeche` ist nur ein Anker fuer eine einzige Regel in
       `index.css`: Wer reduzierte Bewegung eingestellt hat, bekommt auf dieser
       Seite auch keine Uebergaenge, nicht nur keine Animationen. Gleiche
       Inhalte, gleiche Laengen, nur ohne den Weg dorthin.

       `steuer-mobil-gross` ist die Huelle fuer den Wunsch der Geschaeftsleitung:
       auf schmalen Bildschirmen alles mittig und deutlich groesser. Sie steht
       NUR hier. Die interne Seite `/steuerrechner` benutzt dieselben Bausteine
       und bleibt dadurch unveraendert. Die Regeln dazu stehen gesammelt am Ende
       von `src/styles/steuerrechner.css`. */
    <div data-lg="seite" className="steuer-flaeche steuer-mobil-gross min-h-screen bg-muted/30">
      {/* ── Der Kopfbereich ───────────────────────────────────────────────
          Er sagt in einem Bild, worum es geht, und fuehrt mit einem Knopf
          nach unten. Absichtlich HELL und nicht dunkel wie manche Vorbilder:
          Das einzige Logo, das als Datei vorliegt, traegt dunkle Schrift und
          waere auf dunklem Grund nicht zu lesen. Die Farben sind die
          vorhandenen Marken-Token, Blau 50 nach Seitengrau, dazu der
          Markenknopf. Nichts davon ist neu erfunden. */}
      <header className="steuer-hero">
        {/* `relative` nur fuer den Umschalter: Er sitzt klein oben rechts und
            liegt ueber dem Rand des Kopfbereichs, nicht im zentrierten Satz.
            So verdraengt er weder Logo noch Ueberschrift, auch auf 390 Pixeln
            nicht, denn das Logo beginnt erst unterhalb des oberen Abstands. */}
        <div className="relative mx-auto max-w-[1240px] px-4 py-12 md:px-8 md:py-16">
          <SeitenSprachUmschalter className="absolute right-4 top-3 min-h-[2.75rem] md:right-8 md:top-4" />
          <div className="steuer-public-header">
            <img
              src={moreimmoLogo}
              alt="MOREImmo"
              className="h-10 w-auto object-contain md:h-12"
            />
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {t.kicker}
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">
              {t.titelVor}{" "}
              <span className="text-primary">{t.titelBetont}</span>{t.titelNach}
            </h1>
            {/* Die Zusagen im Kopfbereich muessen halten, was die Strecke tut.
                Seit dem 17.09.2026 erscheint das Ergebnis oeffentlich NICHT
                mehr auf dem Bildschirm, es kommt als PDF per Mail. „Ergebnis
                direkt im Anschluss“ waere damit eine falsche Werbeaussage, und
                diese Seite steht bald hinter bezahlten Anzeigen. Die Liste der
                weiteren Stellen steht im Kopf von `SteuerRechnerStrecke`. */}
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {t.einleitung}
            </p>

            {/* Entscheidung 13: Nur auf Englisch, und gut sichtbar noch vor
                dem ersten Knopf. Der Rechner kennt nur deutsches Steuerrecht,
                wer auf einem Expat-Vertrag arbeitet, ist mit dem EXPATS
                Calculator besser bedient. Auf Deutsch sind die Texte leer. */}
            {t.steuerrecht.titel && (
              <div
                role="note"
                className="mx-auto mt-6 flex max-w-2xl flex-col items-center gap-2 rounded-2xl border border-primary/30 bg-card px-5 py-4 text-left text-sm leading-relaxed text-foreground sm:flex-row sm:items-start sm:gap-3"
              >
                <Info className="h-5 w-5 shrink-0 text-primary sm:mt-0.5" aria-hidden="true" />
                <div className="text-center sm:text-left">
                  <p className="font-semibold">{t.steuerrecht.titel}</p>
                  <p className="mt-1">{t.steuerrecht.text}</p>
                  <p className="mt-2">
                    {t.steuerrecht.expatsFrage}{" "}
                    <a
                      href={EXPATS_RECHNER}
                      className="font-medium text-primary underline underline-offset-4 hover:no-underline"
                    >
                      {t.steuerrecht.expatsLink}
                    </a>
                  </p>
                </div>
              </div>
            )}

            <ul className="steuer-hero-pillen">
              {t.pillen.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>

            <div className="steuer-hero-aktionen">
              <button
                type="button"
                onClick={zumRechner}
                className="btn-brand inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 active:scale-[0.995]"
              >
                {t.knopf}
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <a
                href="#so-geht-es"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {t.soGehtEs}
              </a>
            </div>

            {laedt && (
              <p className="mt-6 text-sm text-muted-foreground">{t.partnerLaedt}</p>
            )}
            {!laedt && berater?.name && (
              <p className="mt-6 text-sm text-muted-foreground">{t.bereitgestelltVon(berater.name)}</p>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-4 pb-6 md:px-8 md:pb-10">
        <section id="rechner" ref={rechnerRef} className="scroll-mt-4">
          <SteuerRechnerStrecke berater={berater} variante="oeffentlich" />
        </section>
      </div>
    </div>
  );
}
