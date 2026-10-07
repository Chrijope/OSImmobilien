/**
 * Die Eingabefelder des Steuerrechners, je Frage eines.
 *
 * Sie liegen bewusst getrennt von der Strecke, weil sie an ZWEI Stellen
 * gebraucht werden: in der Frage-Ansicht und noch einmal auf der Ergebnisseite,
 * wo sich jede Angabe nachtraeglich aendern laesst und sofort neu gerechnet
 * wird. Genau das fehlt der Vorlage, dort kommt man ohne Neuladen nicht mehr an
 * seine Eingaben heran.
 */
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { BUNDESLAENDER, KAUFNEBENKOSTEN_HOECHSTSATZ } from "@/lib/grunderwerbsteuer";
import { FREIBETRAG_KIND, type Hebelziel, type Steuerklasse } from "@/lib/steuerRechner";
import {
  BESCHAEFTIGUNG_AUSWAHL,
  EINKOMMEN_MAX,
  EINKOMMEN_MIN,
  EINKOMMEN_SCHRITT,
  STARTZEITPUNKTE,
  begrenzeEinkommen,
  brauchtPartnereinkommen,
  partnereinkommen,
  type SteuerAntworten,
} from "@/lib/steuerrechnerStrecke";
import { Kachel } from "@/components/steuerrechner/bausteine";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { STEUERRECHNER_TEXTE } from "@/components/steuerrechner/steuerrechnerTexte";
import { STEUER_KENNUNG_TEXTE } from "@/lib/steuerrechnerKennungTexte";

export interface FeldProps {
  antworten: SteuerAntworten;
  aendern: (teil: Partial<SteuerAntworten>) => void;
}

const AUSWAHL = "h-12 w-full rounded-xl";

/** Ein Betragsfeld: getrennte Tausender, Euro-Zeichen fest am rechten Rand. */
const BETRAGSFELD =
  "h-12 w-full rounded-xl border border-border bg-background pl-4 pr-10 text-[17px] font-medium tabular-nums text-foreground transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/40";

/* ── Einkommen ──────────────────────────────────────────────────────────── */

export function EinkommenFeld({ antworten, aendern }: FeldProps) {
  const texte = useSeitenTexte(STEUERRECHNER_TEXTE);
  const t = texte.felder.einkommen;
  const englisch = useSeitenSprache() === "en";
  const wert = begrenzeEinkommen(antworten.jahresbrutto);
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const uebernehmen = () => {
    if (entwurf !== null) {
      aendern({ jahresbrutto: begrenzeEinkommen(Number(entwurf.replace(/[^\d]/g, ""))) });
      setEntwurf(null);
    }
  };
  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium text-foreground">{t.label}</span>
        <span className="relative mt-2 block">
          <input
            inputMode="numeric"
            /* Tausendertrennung fuers Auge, ohne Waehrung: die steht als Zeichen
               daneben. Beim Tippen bleibt das Trennzeichen der Sprache stehen,
               uebernommen werden ohnehin nur die Ziffern. */
            value={entwurf ?? texte.zahl(wert)}
            onChange={(e) => setEntwurf(e.target.value.replace(englisch ? /[^\d,]/g : /[^\d.]/g, ""))}
            onBlur={uebernehmen}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); uebernehmen(); } }}
            className={`${BETRAGSFELD} !h-16 !text-3xl`}
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xl text-muted-foreground">€</span>
        </span>
      </label>
      <div className="mt-7">
        <Slider className="steuer-regler" value={[wert]} min={EINKOMMEN_MIN} max={EINKOMMEN_MAX} step={EINKOMMEN_SCHRITT}
          onValueChange={([v]) => { setEntwurf(null); aendern({ jahresbrutto: v }); }} aria-label={t.regler} />
        <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground"><span>{texte.betrag(EINKOMMEN_MIN)}</span><span>{texte.betrag(EINKOMMEN_MAX)}</span></div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t.hinweis(EINKOMMEN_MIN, EINKOMMEN_MAX)}</p>
    </div>
  );
}

/* ── Beschaeftigungsverhaeltnis ─────────────────────────────────────────── */

/**
 * Die Frage aendert die Steuerzahlen nicht, und das ist richtig so: Der Tarif
 * kennt keine Einkunftsart. Sie aendert die EMPFEHLUNG, weil sie darueber
 * entscheidet, welches Objekt eine Bank mitgeht. Auf der Ergebnisseite steht
 * die Wirkung offen, samt anerkanntem Einkommen.
 */
export function BeschaeftigungFeld({ antworten, aendern }: FeldProps) {
  /* Titel ueber die Kennung: Der deutsche Wortlaut aus dem Rechenkern geht
     auch ins CRM und bleibt deshalb, wie er ist. */
  const anzeige = useSeitenTexte(STEUER_KENNUNG_TEXTE).beschaeftigung;
  return (
    <div className="space-y-2.5">
      {BESCHAEFTIGUNG_AUSWAHL.map((b) => (
        <Kachel
          key={b.id}
          titel={anzeige[b.id]?.titel ?? b.titel}
          unterzeile={anzeige[b.id]?.unterzeile ?? b.unterzeile}
          gewaehlt={antworten.beschaeftigung === b.id}
          onClick={() => aendern({ beschaeftigung: b.id })}
        />
      ))}
    </div>
  );
}

/* ── Steuerklasse ───────────────────────────────────────────────────────── */

/** Die Reihenfolge der Klassen. Ihre Texte stehen in `steuerrechnerTexte.ts`. */
const KLASSEN: Steuerklasse[] = ["I", "II", "III", "IV", "V"];

export function SteuerklasseFeld({ antworten, aendern }: FeldProps) {
  const texte = useSeitenTexte(STEUERRECHNER_TEXTE).felder.klassen;
  return (
    <div className="space-y-2.5">
      {KLASSEN.map((id) => (
        <Kachel
          key={id}
          titel={texte[id].titel}
          unterzeile={texte[id].unterzeile}
          gewaehlt={antworten.steuerklasse === id}
          // Die Vorbelegung des Partnereinkommens haengt an der Klasse. Wer die
          // Klasse wechselt, bekommt deshalb wieder den Vorschlag, sonst stuende
          // dort der Wert der alten Klasse.
          onClick={() => aendern({ steuerklasse: id, partnerBrutto: null })}
        />
      ))}
    </div>
  );
}

/* ── Partnereinkommen ───────────────────────────────────────────────────── */

export function PartnerFeld({ antworten, aendern }: FeldProps) {
  const texte = useSeitenTexte(STEUERRECHNER_TEXTE);
  const t = texte.felder.partner;
  if (!brauchtPartnereinkommen(antworten)) return null;
  const wert = partnereinkommen(antworten);
  return (
    <div>
      {/* Der Betrag steht gross darueber, so wie beim eigenen Einkommen. Vorher
          war das Partnereinkommen das einzige nackte Eingabefeld der Strecke
          und fiel gegen alles andere ab. */}
      <div className="text-center">
        <div className="text-4xl font-semibold tabular-nums tracking-tight text-foreground md:text-5xl">
          {texte.betrag(wert)}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t.unterschrift}</p>
      </div>
      <label className="relative mt-5 block">
        <input
          inputMode="numeric"
          value={texte.zahl(wert)}
          onChange={(e) =>
            aendern({ partnerBrutto: Math.max(0, Number(e.target.value.replace(/[^\d]/g, ""))) })
          }
          className={BETRAGSFELD}
          aria-label={t.unterschrift}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[17px] text-muted-foreground"
        >
          €
        </span>
      </label>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.hinweis}</p>
    </div>
  );
}

/* ── Kinder ─────────────────────────────────────────────────────────────── */

export function KinderFeld({ antworten, aendern }: FeldProps) {
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).felder.kinder;
  const voll = brauchtPartnereinkommen(antworten);
  const optionen = [0, 1, 2, 3, 4];
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {optionen.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => aendern({ kinder: n })}
            aria-pressed={antworten.kinder === n}
            className={`h-14 rounded-xl border text-base font-semibold tabular-nums transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
              antworten.kinder === n
                ? "border-primary bg-accent text-accent-foreground shadow-apple-xs"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 active:bg-muted/60"
            }`}
          >
            {n === 4 ? "4+" : n}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {voll ? t.voll(FREIBETRAG_KIND) : t.halb(FREIBETRAG_KIND / 2)}
      </p>
    </div>
  );
}

/* ── Wohnort und Kirchensteuer ──────────────────────────────────────────── */

/**
 * Wohnsitz und Kirchensteuer.
 *
 * Hier lag ein Fehler, der lange nicht auffiel: An diesem einen Feld hingen
 * ZWEI Dinge, die nicht dasselbe Bundesland meinen. Die Kirchensteuer richtet
 * sich nach dem Wohnsitz, die Grunderwerbsteuer nach der Lage der Immobilie.
 * Wer in Hamburg wohnt und in Magdeburg kauft, zahlt die Grunderwerbsteuer von
 * Sachsen-Anhalt. Ein Feld konnte also nie beides richtig beantworten.
 *
 * Jetzt fragt das Feld nur noch den Wohnsitz, denn nur er ist an dieser Stelle
 * bekannt. Die Kaufnebenkosten setzt der Rechner fest mit dem Hoechstsatz an,
 * und der Hinweis darunter sagt das offen. Siehe `zuEingaben` und
 * `KAUFNEBENKOSTEN_HOECHSTSATZ`.
 */
export function WohnortFeld({ antworten, aendern }: FeldProps) {
  /* Ohne Kirchensteuer aendert der Wohnsitz nichts mehr an der Rechnung, mit
     Kirchensteuer entscheidet er ueber 8 oder 9 Prozent. Nur dann ist er
     Pflicht, und nur dann steht die Aufforderung da. */
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).felder.wohnort;
  const fehltFuerKirchensteuer = antworten.kirchensteuer && !antworten.bundesland;
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-foreground">{t.label}</span>
        <span className="mt-2 block">
          <Select
            value={antworten.bundesland || "ohne"}
            onValueChange={(v) => aendern({ bundesland: v === "ohne" ? "" : v })}
          >
            <SelectTrigger className={AUSWAHL} aria-label={t.auswahl}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ohne">{t.bitteWaehlen}</SelectItem>
              {BUNDESLAENDER.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      </label>

      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">{t.kirche}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t.kircheSatz}</div>
          </div>
          <Switch
            checked={antworten.kirchensteuer}
            onCheckedChange={(v) => aendern({ kirchensteuer: v })}
            aria-label={t.kircheSchalter}
          />
        </div>
      </div>

      {fehltFuerKirchensteuer && (
        <p role="status" className="steuer-field-error">
          {t.fehlt}
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t.hinweis(KAUFNEBENKOSTEN_HOECHSTSATZ)}
      </p>
    </div>
  );
}

/* ── Bestehende Immobilien ──────────────────────────────────────────────── */

export function BestandFeld({ antworten, aendern }: FeldProps) {
  /* Die Position in der Liste ist die Zahl der Objekte: 0, 1, 2, 3 oder mehr. */
  const bestand = useSeitenTexte(STEUERRECHNER_TEXTE).felder.bestand.map((b, n) => ({ n, ...b }));
  return (
    <div className="space-y-2.5">
      {bestand.map((b) => (
        <Kachel
          key={b.n}
          titel={b.titel}
          unterzeile={b.unterzeile}
          gewaehlt={antworten.bestehendeImmobilien === b.n}
          onClick={() => aendern({ bestehendeImmobilien: b.n })}
        />
      ))}
    </div>
  );
}

/* ── Startzeitpunkt ─────────────────────────────────────────────────────── */

export function ZeitpunktFeld({ antworten, aendern }: FeldProps) {
  /* Wie bei der Beschaeftigung: Anzeige ueber die Kennung, der deutsche Titel
     aus der Strecke geht unveraendert ins CRM. */
  const anzeige = useSeitenTexte(STEUER_KENNUNG_TEXTE).startzeitpunkt;
  return (
    <div className="space-y-2.5">
      {STARTZEITPUNKTE.map((z) => (
        <Kachel
          key={z.id}
          titel={anzeige[z.id]?.titel ?? z.titel}
          unterzeile={anzeige[z.id]?.unterzeile ?? z.unterzeile}
          gewaehlt={antworten.startzeitpunkt === z.id}
          onClick={() => aendern({ startzeitpunkt: z.id })}
        />
      ))}
    </div>
  );
}

/* ── Hebelziel ──────────────────────────────────────────────────────────── */

const HEBEL: Array<{ id: Hebelziel; titel: string; unterzeile: string }> = [
  { id: "maximal", titel: "Das volle Potenzial", unterzeile: "Zeig mir, wie weit es geht." },
  { id: "ausgewogen", titel: "Etwa die Hälfte", unterzeile: "Ein spürbarer, aber ruhiger Schritt." },
  { id: "vorsichtig", titel: "Ein erster Schritt", unterzeile: "Rund ein Viertel meiner Steuerlast." },
];

/**
 * Das Hebelziel steht bewusst NICHT in der Fragestrecke, sondern erst auf der
 * Ergebnisseite. Es aendert die Kopfzahl nicht, sondern nur die Frage, wie
 * viele Wohnungen fuer das gewaehlte Ziel noetig waeren. Als eigene Frage vor
 * dem Ergebnis waere es eine Huerde ohne Gegenwert.
 */
export function HebelzielFeld({ antworten, aendern }: FeldProps) {
  return (
    <div className="space-y-2.5">
      {HEBEL.map((h) => (
        <Kachel
          key={h.id}
          titel={h.titel}
          unterzeile={h.unterzeile}
          gewaehlt={antworten.hebelziel === h.id}
          onClick={() => aendern({ hebelziel: h.id })}
        />
      ))}
    </div>
  );
}
