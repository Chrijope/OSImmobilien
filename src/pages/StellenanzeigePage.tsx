import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PartnerBewerbungFormular } from "@/components/landing/PartnerBewerbungFormular";
import { SpamHinweis } from "@/components/bewerbung/SpamHinweis";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { kennenlernUeberleitung, type PartnerBewerbungAntwort } from "@/lib/partnerBewerbung";
import {
  STELLENANZEIGEN,
  STELLENANZEIGE_KOPF,
  STELLENANZEIGE_WERTE,
  TIPPGEBER_BESTAETIGUNG,
  stelleZuSlug,
  stellenKennzeichen,
  type StellenMerkmal,
  type Stellenanzeige,
} from "@/lib/stellenanzeigen";
import logoImg from "@/assets/moreimmo-logo.png";
import {
  ArrowRight, BadgeCheck, Building2, CalendarCheck, Calculator, Check, CheckCircle,
  ChevronDown, Clock, Compass, Gift, Handshake, HeartHandshake, KeyRound, Landmark, Layers, Lightbulb,
  ListChecks, Mail, MapPin, ShieldCheck, Briefcase,
} from "lucide-react";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

/**
 * Die öffentliche Stellenanzeige, `/karriere/stellenanzeige`.
 *
 * Aufbau nach Christians Vorgabe vom 24.09.2026: oben kurz, wer OS Immobilien ist
 * und wofür das Haus steht, darunter die offenen Partnerschaften als Kacheln.
 * Eine Kachel klappt auf, ihr Inhalt steht am Schreibtisch über die ganze
 * Breite unter den Kacheln, am Handy direkt unter der eigenen Kachel. Es ist
 * immer höchstens eine offen, so bleibt die Seite ruhig.
 *
 * „Jetzt bewerben" öffnet dasselbe Formular wie die Landingpage
 * (`PartnerBewerbungFormular`). Danach:
 *   * Berater: weiter in den eigenen Kennenlernbogen. Den Schlüssel dazu gibt
 *     `submit-bewerbung` nur dem zurück, der die Bewerbung gerade abgeschickt
 *     hat. Fehlt er, steht der Rückfall „Schau bitte in dein Postfach".
 *   * Tippgeber: eine freundliche Bestätigung.
 *
 * Wortlaut der Stellen in `lib/stellenanzeigen.ts`, dort auch, warum sie nicht
 * aus der Stellenverwaltung kommen.
 *
 * Liquid Glass: Die Kacheln sind echte Karten (`Card`, `data-ui="card"`) und
 * werden von `styles/design-liquid.css` zu Glas. Die Seite selbst ist in dieser
 * Schicht durchsichtig, damit der bewegte Grund durchscheint. Keine Neigung.
 */

const MERKMAL_SYMBOL: Record<StellenMerkmal["art"], typeof MapPin> = {
  standort: MapPin,
  zeit: Clock,
  bereich: Briefcase,
  start: CalendarCheck,
};

const WERT_SYMBOLE = [Calculator, Lightbulb, ShieldCheck, HeartHandshake];

const STELLEN_SYMBOL: Record<Stellenanzeige["weg"], typeof MapPin> = {
  vertriebspartner: KeyRound,
  tippgeber: Handshake,
  finanzdienstleister: Landmark,
};

/**
 * Der farbige Schein in der Ecke jeder Kachel. Ein weicher Verlauf, keine
 * Weichzeichnung: Die Glasschicht erlaubt Weichzeichnung nur über ihre Tokens.
 */
const STELLEN_SCHEIN: Record<Stellenanzeige["weg"], string> = {
  vertriebspartner: "radial-gradient(circle at center, hsl(157 69% 39% / .28), transparent 68%)",
  tippgeber: "radial-gradient(circle at center, hsl(22 95% 60% / .24), transparent 68%)",
  finanzdienstleister: "radial-gradient(circle at center, hsl(160 70% 42% / .24), transparent 68%)",
};

type Phase = "formular" | "danke-tippgeber" | "postfach";

/**
 * Das Etikett oben rechts auf der Kachel. Die Stelle für Finanzdienstleister
 * bekommt ein eigenes, grünes, damit sie als eigene Zielgruppe auffällt,
 * sonst sieht sie aus wie die anderen.
 */
const ETIKETT_FARBE: Record<Stellenanzeige["weg"], string> = {
  vertriebspartner: "border-primary/25 bg-primary/10 text-primary",
  tippgeber: "border-primary/25 bg-primary/10 text-primary",
  finanzdienstleister:
    "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/30 dark:text-emerald-300",
};

/** Welcher Weg im Kennenlernbogen vorausgewählt wird. Weg 2: „Ich berate zu Geld". */
const VORBELEGTER_WEG: Partial<Record<Stellenanzeige["weg"], string>> = {
  finanzdienstleister: "weg2",
};

function Merkmale({ merkmale, className }: { merkmale: StellenMerkmal[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Merkmale der Stelle">
      {merkmale.map((m) => {
        const Symbol = MERKMAL_SYMBOL[m.art];
        return (
          <li
            key={m.art}
            title={m.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground/85"
          >
            <Symbol className="h-3.5 w-3.5 text-primary" aria-hidden />
            <span className="sr-only">{m.label}: </span>
            {m.wert}
          </li>
        );
      })}
    </ul>
  );
}

function Abschnitt({
  titel,
  symbol: Symbol,
  children,
}: {
  titel: string;
  symbol: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-3 flex items-center gap-2.5 text-base font-bold tracking-tight">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Symbol className="h-4 w-4" aria-hidden />
        </span>
        {titel}
      </h4>
      {children}
    </section>
  );
}

function Liste({ punkte }: { punkte: string[] }) {
  return (
    <ul className="space-y-2.5">
      {punkte.map((p) => (
        <li key={p} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

function StellenKachel({
  stelle,
  offen,
  onUmschalten,
}: {
  stelle: Stellenanzeige;
  offen: boolean;
  onUmschalten: () => void;
}) {
  const Symbol = STELLEN_SYMBOL[stelle.weg];
  return (
    <Card
      data-stelle={stelle.slug}
      className={cn(
        "group relative flex overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl md:order-1",
        offen && "ring-2 ring-primary/50",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full opacity-70 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: STELLEN_SCHEIN[stelle.weg] }}
      />
      <button
        type="button"
        id={`stelle-${stelle.slug}-kopf`}
        aria-expanded={offen}
        aria-controls={`stelle-${stelle.slug}-inhalt`}
        onClick={onUmschalten}
        className="relative flex w-full flex-col gap-5 rounded-[inherit] p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-sky-500 text-white shadow-lg shadow-primary/25">
            <Symbol className="h-6 w-6" aria-hidden />
          </span>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
              ETIKETT_FARBE[stelle.weg],
            )}
          >
            {stelle.marke}
          </span>
        </div>
        <div className="space-y-3">
          <h3 className="text-xl font-bold leading-snug tracking-tight md:text-2xl">{stelle.titel}</h3>
          <p className="leading-relaxed text-muted-foreground">{stelle.kurz}</p>
        </div>
        <Merkmale merkmale={stelle.merkmale} />
        <span className="mt-auto inline-flex items-center gap-2 pt-1 text-sm font-semibold text-primary">
          {offen ? "Weniger anzeigen" : "Alles zur Stelle lesen"}
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", offen && "rotate-180")} aria-hidden />
        </span>
      </button>
    </Card>
  );
}

function StellenInhalt({
  stelle,
  onBewerben,
  innenRef,
}: {
  stelle: Stellenanzeige;
  onBewerben: () => void;
  innenRef: React.Ref<HTMLDivElement>;
}) {
  const istBerater = stelle.weg !== "tippgeber";
  return (
    <Card
      ref={innenRef}
      id={`stelle-${stelle.slug}-inhalt`}
      role="region"
      aria-labelledby={`stelle-${stelle.slug}-kopf`}
      className="scroll-mt-6 p-6 animate-in fade-in-0 slide-in-from-top-2 duration-300 md:order-2 md:col-span-full md:p-10"
    >
      <div className="grid gap-8 md:grid-cols-2">
        <Abschnitt titel="Wer wir sind" symbol={Building2}>
          <p className="text-sm leading-relaxed text-muted-foreground">{stelle.werWirSind}</p>
        </Abschnitt>
        <Abschnitt titel="Deine Rolle" symbol={Compass}>
          <p className="text-sm leading-relaxed text-muted-foreground">{stelle.deineRolle}</p>
        </Abschnitt>
      </div>

      <div aria-hidden className="my-8 h-px bg-border/70" />

      <div className="grid gap-8 lg:grid-cols-3">
        <Abschnitt titel="Deine Aufgaben" symbol={ListChecks}>
          <Liste punkte={stelle.aufgaben} />
        </Abschnitt>
        <Abschnitt titel="Das bringst du mit" symbol={BadgeCheck}>
          <Liste punkte={stelle.mitbringen} />
        </Abschnitt>
        <Abschnitt titel="Was wir dir bieten" symbol={Gift}>
          <Liste punkte={stelle.bieten} />
        </Abschnitt>
      </div>

      {stelle.zweitesProdukt && <ZweitesProduktKasten produkt={stelle.zweitesProdukt} />}

      <div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-2xl border border-primary/20 bg-primary/[0.06] p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-lg font-semibold tracking-tight">Klingt nach dir?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {istBerater
              ? "Nach dem Absenden geht es direkt mit deinem persönlichen Kennenlernbogen weiter."
              : "Schick uns ein paar Angaben. Wir melden uns in den nächsten Tagen telefonisch bei dir."}
          </p>
        </div>
        <Button size="lg" onClick={onBewerben} className="w-full gap-2 rounded-xl px-8 sm:w-auto">
          Jetzt bewerben <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

const StellenanzeigePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [offen, setOffen] = useState<string | null>(() => stelleZuSlug(location.hash)?.slug ?? null);
  const [formStelle, setFormStelle] = useState<Stellenanzeige | null>(null);
  const [phase, setPhase] = useState<Phase>("formular");
  const [vorname, setVorname] = useState("");
  const inhaltRef = useRef<HTMLDivElement>(null);
  const stellenRef = useRef<HTMLElement>(null);
  const ersterAufbau = useRef(true);

  // reCAPTCHA lädt erst, wenn jemand das Formular benutzt (siehe
  // `PartnerBewerbungFormular`). Wer die Stelle nur liest, schickt Google nichts.

  // Eine aufgeklappte Stelle ins Blickfeld holen, ohne die Seite zu springen.
  useEffect(() => {
    if (!offen) return;
    const beimLaden = ersterAufbau.current;
    ersterAufbau.current = false;
    const ruhig = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ziel = beimLaden ? stellenRef.current : inhaltRef.current;
    ziel?.scrollIntoView?.({ behavior: ruhig ? "auto" : "smooth", block: beimLaden ? "start" : "nearest" });
  }, [offen]);

  const umschalten = (slug: string) => {
    ersterAufbau.current = false;
    setOffen((jetzt) => (jetzt === slug ? null : slug));
  };

  const bewerben = (stelle: Stellenanzeige) => {
    setPhase("formular");
    setVorname("");
    setFormStelle(stelle);
  };

  const nachAbsenden = (stelle: Stellenanzeige) => (antwort: PartnerBewerbungAntwort, name: string) => {
    setVorname(name);
    if (stelle.weg === "tippgeber") {
      setPhase("danke-tippgeber");
      return;
    }
    const ziel = kennenlernUeberleitung(antwort, VORBELEGTER_WEG[stelle.weg]);
    if (ziel) {
      toast({ title: "Deine Bewerbung ist angekommen", description: "Weiter geht es mit deinem Kennenlernbogen." });
      // `replace`: Der Schritt zurück führt nicht noch einmal ins leere Formular.
      navigate(ziel, { replace: true });
      return;
    }
    setPhase("postfach");
  };

  const kopf = STELLENANZEIGE_KOPF;

  return (
    <div
      data-lg="seite"
      className="flex min-h-screen flex-col bg-background text-foreground [[data-glas=liquid]_&]:bg-transparent"
    >
      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/karriere" aria-label="Zur Karriereübersicht">
            <img src={logoImg} alt="OS Immobilien" className="h-8 object-contain dark:brightness-0 dark:invert" />
          </Link>
          <Link to="/partner-werden" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Mehr zur Partnerschaft
          </Link>
        </div>
      </header>

      {/*
        `grow shrink-0` statt `flex-1`: Am Handy setzt `index.css` auf jedes
        `main` `overflow-x: hidden`. Mit `flex-1` (Grundmass null) durfte der
        Inhalt dann auf null schrumpfen und wurde zum eigenen Scrollbereich,
        die Fusszeile klebte unten über dem Text.
      */}
      <main className="grow shrink-0">
        {/* Kopf: wer wir sind, in drei Sätzen */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-18rem] h-[36rem] w-[60rem] -translate-x-1/2 rounded-full"
            style={{ background: "radial-gradient(ellipse at center, hsl(157 69% 39% / .16), transparent 66%)" }}
          />
          <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-10 text-center sm:px-6 md:pb-20 md:pt-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">{kopf.marke}</p>
            <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
              {kopf.titelZeile1}
              <br />
              <span className="bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-transparent dark:from-sky-300 dark:to-sky-500">
                {kopf.titelZeile2}
              </span>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              {kopf.einleitung}
            </p>
            <ul className="mt-8 flex flex-wrap justify-center gap-2.5">
              {kopf.fakten.map((f) => (
                <li
                  key={f}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3.5 py-1.5 text-sm text-foreground/85"
                >
                  <CheckCircle className="h-4 w-4 text-primary" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              size="lg"
              className="mt-10 h-12 gap-2 rounded-xl px-8 text-base"
              onClick={() => stellenRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
            >
              {kopf.stellenMarke} ansehen <ArrowRight className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        </section>

        {/* Werte */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6" aria-labelledby="werte-titel">
          <h2 id="werte-titel" className="mb-8 text-center text-2xl font-bold tracking-tight md:text-3xl">
            {kopf.werteTitel}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STELLENANZEIGE_WERTE.map((w, i) => {
              const Symbol = WERT_SYMBOLE[i % WERT_SYMBOLE.length];
              return (
                <Card key={w.titel} className="p-6">
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Symbol className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="font-semibold tracking-tight">{w.titel}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.text}</p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Offene Partnerschaften */}
        <section
          ref={stellenRef}
          id="stellen"
          className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-24 sm:px-6"
          aria-labelledby="stellen-titel"
        >
          <div className="mb-10 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">{kopf.stellenMarke}</p>
            <h2 id="stellen-titel" className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              {kopf.stellenTitel}
            </h2>
            <p className="mt-3 text-muted-foreground">{kopf.stellenEinleitung}</p>
          </div>

          {/*
            Reihenfolge im Dokument: Kachel, Inhalt, Kachel, Inhalt. Am Handy
            steht der Inhalt damit direkt unter seiner Kachel. Am Schreibtisch
            ziehen `md:order-1` und `md:order-2` beide Kacheln nach oben und den
            offenen Inhalt über die volle Breite darunter.
          */}
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {STELLENANZEIGEN.map((stelle) => (
              <StellenBlock
                key={stelle.slug}
                stelle={stelle}
                offen={offen === stelle.slug}
                onUmschalten={() => umschalten(stelle.slug)}
                onBewerben={() => bewerben(stelle)}
                innenRef={inhaltRef}
              />
            ))}
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
            {kopf.stellenHinweis}
          </p>
        </section>
      </main>

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <img src={logoImg} alt="OS Immobilien" className="h-7 object-contain opacity-60 dark:brightness-0 dark:invert" />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
            <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
            <CookieEinstellungenLink className="hover:text-foreground" />
            <span>© {new Date().getFullYear()} OS Immobilien Holding GmbH</span>
          </div>
        </div>
      </footer>

      <Dialog open={!!formStelle} onOpenChange={(auf) => { if (!auf) setFormStelle(null); }}>
        <DialogContent className="max-w-2xl sm:p-8">
          {formStelle && phase === "formular" && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 text-xl leading-snug">Bewerbung: {formStelle.titel}</DialogTitle>
                <DialogDescription>
                  {formStelle.weg !== "tippgeber"
                    ? "Nach dem Absenden geht es direkt mit deinem persönlichen Kennenlernbogen weiter."
                    : "Wir melden uns in den nächsten Tagen telefonisch bei dir. Deshalb brauchen wir deine Handynummer."}
                </DialogDescription>
              </DialogHeader>
              <PartnerBewerbungFormular
                key={formStelle.slug}
                weg={formStelle.weg === "tippgeber" ? "tippgeber" : "vertriebspartner"}
                stelleId={formStelle.stelleId}
                stelleTitel={formStelle.titel}
                beschaeftigungsart={formStelle.taetigkeit}
                quelle="Website Stellenanzeige"
                erfahrungPlaceholder={formStelle.erfahrungPlatzhalter}
                kennenlernLink={formStelle.weg !== "tippgeber"}
                stelle={stellenKennzeichen(formStelle)}
                onAbgesendet={nachAbsenden(formStelle)}
                abbrechenKnopf={
                  <Button type="button" variant="outline" className="w-full sm:order-1 sm:w-auto" onClick={() => setFormStelle(null)}>
                    Abbrechen
                  </Button>
                }
              />
            </>
          )}

          {formStelle && phase === "danke-tippgeber" && (
            <Bestaetigung
              titel={vorname ? `Danke, ${vorname}!` : "Danke für deine Bewerbung!"}
              // Ehrlich: Es geht keine Mail hinaus, das Team ruft an (Christian, 24.09.2026).
              text={TIPPGEBER_BESTAETIGUNG}
              onSchliessen={() => setFormStelle(null)}
            />
          )}

          {formStelle && phase === "postfach" && (
            <Bestaetigung
              titel="Deine Bewerbung ist angekommen"
              // Der Satz zum Spam-Ordner steht seit dem 26.09.2026 im Hinweiskasten darunter.
              text="Schau bitte in dein Postfach, dort liegt dein Kennenlernbogen. Wir melden uns außerdem persönlich bei dir."
              symbol={Mail}
              spamHinweis
              onSchliessen={() => setFormStelle(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/**
 * Der Kasten zum zweiten Produkt, nur bei Finanzdienstleistern. Das Produkt
 * bleibt namenlos. Unter der Renditezeile steht der Risikohinweis, lesbar
 * und nicht als Fußnote versteckt.
 */
function ZweitesProduktKasten({ produkt }: { produkt: NonNullable<Stellenanzeige["zweitesProdukt"]> }) {
  const punkte = produkt.rendite ? [...produkt.punkte, produkt.rendite.punkt] : produkt.punkte;
  return (
    <section
      aria-labelledby="zweites-produkt-titel"
      className="mt-10 rounded-2xl border border-emerald-600/25 bg-emerald-500/[0.06] p-6 dark:border-emerald-400/25 md:p-8"
    >
      <h4 id="zweites-produkt-titel" className="flex items-center gap-2.5 text-base font-bold tracking-tight">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
          <Layers className="h-4 w-4" aria-hidden />
        </span>
        {produkt.titel}
      </h4>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{produkt.einleitung}</p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-3">
        {punkte.map((p) => (
          <li key={p.titel} className="rounded-xl border border-border/60 bg-background/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
              {p.titel}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
          </li>
        ))}
      </ul>
      {produkt.rendite && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground" data-testid="risikohinweis">
          {produkt.rendite.risikohinweis}
        </p>
      )}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{produkt.fuss}</p>
    </section>
  );
}

/** Kachel und Inhalt einer Stelle, als Geschwister im selben Raster. */
function StellenBlock({
  stelle,
  offen,
  onUmschalten,
  onBewerben,
  innenRef,
}: {
  stelle: Stellenanzeige;
  offen: boolean;
  onUmschalten: () => void;
  onBewerben: () => void;
  innenRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <>
      <StellenKachel stelle={stelle} offen={offen} onUmschalten={onUmschalten} />
      {offen && <StellenInhalt stelle={stelle} onBewerben={onBewerben} innenRef={innenRef} />}
    </>
  );
}

function Bestaetigung({
  titel,
  text,
  symbol: Symbol = CheckCircle,
  spamHinweis = false,
  onSchliessen,
}: {
  titel: string;
  text: string;
  symbol?: typeof MapPin;
  /** Nur wenn eine Mail von uns folgt. Tippgeber bekommen keine, sie werden angerufen. */
  spamHinweis?: boolean;
  onSchliessen: () => void;
}) {
  return (
    <div className="space-y-5 py-4 text-center" role="status">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Symbol className="h-8 w-8 text-primary" aria-hidden />
      </div>
      <DialogHeader className="space-y-3 sm:text-center">
        <DialogTitle className="text-2xl">{titel}</DialogTitle>
        <DialogDescription className="mx-auto max-w-md text-base leading-relaxed">{text}</DialogDescription>
      </DialogHeader>
      {spamHinweis && <SpamHinweis className="mx-auto max-w-md" />}
      <Button variant="outline" onClick={onSchliessen}>Zurück zur Stellenanzeige</Button>
    </div>
  );
}

export default StellenanzeigePage;
