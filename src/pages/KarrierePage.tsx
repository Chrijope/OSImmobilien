import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getPublishedStellen, getStelleById, type Stelle } from "@/lib/bewerbungStore";
import logoImg from "@/assets/moreimmo-logo.png";
import {
  Building2, MapPin, Briefcase, ArrowRight, ArrowLeft, Sparkles,
  CheckCircle, Star, Mail,
} from "lucide-react";

/**
 * Öffentliche Karriereseite.
 *
 * Sie zeigt alle veröffentlichten Stellen und ist darauf gebaut, dass weitere
 * dazukommen: Ab zwei Abteilungen gruppiert sie von selbst nach Abteilung,
 * darunter bleibt es eine einfache Liste. Es ist also nichts zu ändern, wenn
 * neue Ausschreibungen entstehen.
 *
 * Gestaltung nach der Markenrichtlinie: dunkle Bühne mit feinem Karo wie auf
 * den Deckblättern, Blaufamilie auf Farbton 204, Blau 600 für alle
 * Handlungsknöpfe. Signalorange kommt hier bewusst nicht vor: Die Regel
 * erlaubt höchstens eine orange Stelle je Ansicht, und eine Liste mit mehreren
 * gleichwertigen Stellen hat keine einzelne Hauptaktion. Orange bleibt der
 * Bewerbung auf der Partnerseite vorbehalten.
 */

const BEWERBUNG_MAIL = "os@os-immobilien.com";

/** Feines Karo wie auf den PDF-Deckblättern, nach aussen auslaufend. */
function KaroFlaeche() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.16]"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
        backgroundSize: "74px 74px",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, #000 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.12) 74%, transparent 90%)",
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, #000 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.12) 74%, transparent 90%)",
      }}
    />
  );
}

/** Kopfzeile mit Logo. Auf dunklem Grund die helle Fassung des Schriftzugs. */
function Kopf({ dunkel = false, rechts }: { dunkel?: boolean; rechts?: React.ReactNode }) {
  return (
    <header
      data-lg={dunkel ? undefined : "kopfscheibe"}
      className={
        dunkel
          ? "absolute inset-x-0 top-0 z-20"
          : "sticky top-0 z-20 border-b border-border/40 bg-card/70 backdrop-blur-xl"
      }
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/karriere" aria-label="Zur Karriereübersicht">
          <img
            src={logoImg}
            alt="OS Immobilien"
            className={`h-8 object-contain ${dunkel ? "brightness-0 invert" : ""}`}
          />
        </Link>
        {rechts}
      </div>
    </header>
  );
}

const KarrierePage = () => {
  const { stelleId } = useParams();
  const [stellen, setStellen] = useState<Stelle[]>([]);
  const [stelle, setStelle] = useState<Stelle | null>(null);

  useEffect(() => {
    if (stelleId) {
      const found = getStelleById(stelleId);
      setStelle(found || null);
    } else {
      setStellen(getPublishedStellen());
    }
  }, [stelleId]);

  /**
   * Ab zwei Abteilungen wird gruppiert. So bleibt die Seite bei einer Stelle
   * ruhig und wird bei zwanzig trotzdem nicht zur Bleiwüste.
   */
  const gruppen = useMemo(() => {
    const map = new Map<string, Stelle[]>();
    for (const s of stellen) {
      const key = s.abteilung?.trim() || "Weitere Positionen";
      map.set(key, [...(map.get(key) || []), s]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
  }, [stellen]);

  // ─── Einzelne Stellenausschreibung ───
  if (stelleId && stelle) {
    return (
      <div data-lg="seite" className="min-h-screen bg-background">
        <Kopf
          rechts={
            <Link to="/karriere">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />Alle Stellen
              </Button>
            </Link>
          }
        />

        {/* Dunkle Bühne, gleiche Bildsprache wie die Deckblätter */}
        <div className="relative overflow-hidden bg-[#0F1621] text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-40 -top-52 h-[520px] w-[520px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(21,114,79,.45) 0%, rgba(21,114,79,0) 65%)" }}
          />
          <KaroFlaeche />
          <div className="relative mx-auto max-w-5xl px-6 pb-16 pt-32">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#30E19E]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#30E19E]" />
              Bewerbungen offen
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">
              {stelle.titel}
            </h1>
            <div aria-hidden className="mt-5 h-[3px] w-11 rounded-full bg-[#15724F]" />
            <div className="mt-7 flex flex-wrap items-center gap-2.5 text-sm text-white/70">
              {[
                { icon: Building2, wert: stelle.abteilung },
                { icon: MapPin, wert: stelle.standort },
                { icon: Briefcase, wert: stelle.art },
              ]
                .filter((m) => !!m.wert)
                .map((m) => (
                  <span
                    key={m.wert}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5"
                  >
                    <m.icon className="h-3.5 w-3.5 text-[#30E19E]" />
                    {m.wert}
                  </span>
                ))}
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-5xl space-y-6 px-6 pb-24 pt-14">
          {[
            { titel: "Deine Aufgaben", icon: Sparkles, text: stelle.beschreibung },
            { titel: "Was Du mitbringst", icon: CheckCircle, text: stelle.anforderungen },
            { titel: "Das bieten wir Dir", icon: Star, text: stelle.benefits },
          ]
            .filter((b) => !!b.text)
            .map((b) => (
              <section data-ui="card" key={b.titel} className="rounded-2xl border border-border bg-card p-8 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2.5 text-lg font-bold tracking-tight">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <b.icon className="h-4 w-4" />
                  </span>
                  {b.titel}
                </h2>
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{b.text}</p>
              </section>
            ))}

          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/[0.07] to-transparent p-10 text-center">
            <p className="text-lg font-semibold tracking-tight">Bereit für den nächsten Schritt?</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Ein Lebenslauf genügt. Den Rest besprechen wir persönlich.
            </p>
            <Link to={`/bewerben/${stelle.id}`} className="mt-6 inline-block">
              <Button size="lg" className="h-12 rounded-xl px-10 text-base shadow-sm">
                Jetzt bewerben <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </main>

        <Fuss />
      </div>
    );
  }

  // ─── Stelle nicht gefunden ───
  if (stelleId && !stelle) {
    return (
      <div data-lg="seite" className="flex min-h-screen items-center justify-center bg-background px-6">
        <div data-ui="card" className="max-w-md space-y-4 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <h2 className="text-xl font-bold tracking-tight">Stelle nicht gefunden</h2>
          <p className="text-muted-foreground">
            Diese Stellenausschreibung existiert nicht oder wurde geschlossen.
          </p>
          <Link to="/karriere">
            <Button>Alle offenen Stellen</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Übersicht aller veröffentlichten Stellen ───
  return (
    <div data-lg="seite" className="flex min-h-screen flex-col bg-background">
      <Kopf dunkel />

      {/* Bühne */}
      <section className="relative overflow-hidden bg-[#0F1621] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 -top-56 h-[620px] w-[900px] -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(21,114,79,.42) 0%, rgba(21,114,79,0) 68%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-52 -right-32 h-[460px] w-[460px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(48,225,158,.16) 0%, rgba(48,225,158,0) 66%)" }}
        />
        <KaroFlaeche />

        <div className="relative mx-auto max-w-3xl px-6 pb-24 pt-36 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#30E19E]">Karriere</p>
          <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
            Werde Teil eines
            <br />
            <span className="text-[#30E19E]">exklusiven Teams.</span>
          </h1>
          <div aria-hidden className="mx-auto mt-7 h-[3px] w-11 rounded-full bg-[#15724F]" />
          <p className="mx-auto mt-7 max-w-xl leading-relaxed text-white/70">
            Wir suchen außergewöhnliche Persönlichkeiten, die mit uns den deutschen
            Immobilien-Kapitalanlagemarkt prägen.
          </p>
          {stellen.length > 0 && (
            <a href="#positionen" className="mt-9 inline-block">
              <Button size="lg" className="h-12 rounded-xl px-8 text-base shadow-sm">
                {stellen.length === 1 ? "Offene Position ansehen" : `${stellen.length} offene Positionen ansehen`}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
          )}
        </div>
      </section>

      {/* Offene Positionen */}
      <main id="positionen" className="flex-1 bg-muted/25 py-20">
        <div className="mx-auto w-full max-w-3xl px-6">
          <h2 className="mb-3 text-center text-3xl font-bold tracking-tight">Offene Positionen</h2>
          <p className="mb-12 text-center text-sm text-muted-foreground">
            {stellen.length === 0
              ? "Aktuell ist keine Stelle ausgeschrieben."
              : "Jede Bewerbung liest ein Mensch, keine Software."}
          </p>

          {stellen.length === 0 ? (
            <div data-ui="card" className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Briefcase className="h-5 w-5" />
              </span>
              <p className="font-medium">Gerade ist nichts ausgeschrieben.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Das heißt nicht, dass wir niemanden suchen. Wer zu uns passt, findet bei uns
                einen Platz. Schreib uns einfach.
              </p>
              <a href={`mailto:${BEWERBUNG_MAIL}`} className="mt-6 inline-block">
                <Button variant="outline" className="rounded-xl">
                  <Mail className="mr-2 h-4 w-4" />
                  Initiativ bewerben
                </Button>
              </a>
            </div>
          ) : (
            <div className="space-y-12">
              {gruppen.map(([abteilung, liste]) => (
                <section key={abteilung}>
                  {/* Abteilungsüberschrift erst ab zwei Gruppen, sonst ist sie Lärm. */}
                  {gruppen.length > 1 && (
                    <div className="mb-5 flex items-center gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {abteilung}
                      </h3>
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">
                        {liste.length === 1 ? "1 Stelle" : `${liste.length} Stellen`}
                      </span>
                    </div>
                  )}

                  <div className="space-y-4">
                    {liste.map((s) => {
                      // Die Vertriebspartner-Stelle hat eine eigene Landingpage.
                      const istVpImmo =
                        s.titel.toLowerCase().includes("vertriebspartner") &&
                        s.titel.toLowerCase().includes("immobilien");
                      const detailUrl = istVpImmo ? "/karriere/vertriebspartner-immobilien" : `/karriere/${s.id}`;
                      const bewerbenUrl = istVpImmo
                        ? "/karriere/vertriebspartner-immobilien#bewerben"
                        : `/bewerben/${s.id}`;

                      return (
                        <article data-ui="card"
                          key={s.id}
                          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                        >
                          {/* Blaue Kante, die beim Zeigen aufleuchtet */}
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 w-[3px] bg-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          />
                          <div className="flex items-start gap-5">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Briefcase className="h-5 w-5" strokeWidth={1.75} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-lg font-bold leading-snug tracking-tight transition-colors group-hover:text-primary">
                                {s.titel}
                              </h4>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                {[
                                  { icon: MapPin, wert: s.standort },
                                  { icon: Building2, wert: s.abteilung },
                                  { icon: Briefcase, wert: s.art },
                                ]
                                  .filter((m) => !!m.wert)
                                  .map((m) => (
                                    <span
                                      key={m.wert}
                                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                                    >
                                      <m.icon className="h-3 w-3" />
                                      {m.wert}
                                    </span>
                                  ))}
                              </div>
                              {s.beschreibung && (
                                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                                  {s.beschreibung}
                                </p>
                              )}
                              <div className="mt-6 flex flex-wrap gap-3">
                                <Link to={bewerbenUrl}>
                                  <Button size="sm" className="rounded-xl px-5">
                                    Jetzt bewerben <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                  </Button>
                                </Link>
                                <Link to={detailUrl}>
                                  <Button variant="outline" size="sm" className="rounded-xl px-5">
                                    Mehr erfahren
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* Initiativbewerbung */}
          {stellen.length > 0 && (
            <div data-ui="card" className="mt-12 rounded-2xl border border-border bg-card px-8 py-7 text-center shadow-sm">
              <p className="font-semibold tracking-tight">Nichts Passendes dabei?</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Dann schreib uns trotzdem. Die spannendsten Gespräche entstehen bei uns oft
                ausserhalb einer Ausschreibung.
              </p>
              <a
                href={`mailto:${BEWERBUNG_MAIL}`}
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
              >
                <Mail className="h-4 w-4" />
                {BEWERBUNG_MAIL}
              </a>
            </div>
          )}
        </div>
      </main>

      <Fuss />
    </div>
  );
};

function Fuss() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-5xl px-6 py-10 text-center">
        <img src={logoImg} alt="OS Immobilien" className="mx-auto mb-4 h-7 object-contain opacity-60" />
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} OS Immobilien Holding GmbH. Alle Rechte
          vorbehalten.
        </p>
      </div>
    </footer>
  );
}

export default KarrierePage;
