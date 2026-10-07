import { useState, type ReactNode } from "react";
import { BarChart3, Check, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import "@/components/expose/premiumExpose.css";
import "./kundenansicht.css";
import { Badge } from "@/components/ui/badge";
import { Galerie } from "@/components/objektseite/Galerie";
import { Hinweis, KartenTitel } from "@/components/objektseite/Bausteine";
import { Mikrolage } from "@/components/expose/Mikrolage";
import { marktQuelleHinweis, mikrolageZeigen, type ExposeInhalt } from "@/lib/exposeInhalt";
import { NurDeutschHinweis } from "@/components/kundensprache/NurDeutschHinweis";
import { datumUhrzeitText } from "@/lib/sprachFormat";
import { KUNDENANSICHT_TEXTE, useKundenTexte } from "./kundenansichtTexte";
import type { Merkmal } from "@/lib/investagonFelder";
import type { ObjektBild } from "@/lib/objekteStore";
import { cn } from "@/lib/utils";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

/**
 * Kleine Bausteine der Kundenansicht. Sie sehen aus wie die der internen
 * Einheitsseite, tragen aber nichts Internes: keine Stifte, keine
 * Kennzeichen, keine Sätze über das CRM.
 */

export const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";

/** Ein Rahmen, in dem Exposé-Bausteine ihre Gestaltung aus `premiumExpose.css` finden. */
export function ExposeRahmen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("premium-expose kundenansicht-einbettung", className)}>{children}</div>;
}

/** „Verfügbar“ oder „Für dich reserviert“. Andere Zustände zeigt die Kundenansicht nie. */
export function VerfuegbarChip({ fuerDich }: { fuerDich?: boolean }) {
  const { t } = useKundenTexte();
  return fuerDich ? (
    <Badge variant="outline" className="border-primary/40 bg-accent text-primary" data-testid="chip-fuer-dich">
      <CheckCircle2 className="mr-1 h-3 w-3" /> {t.chips.fuerDich}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" data-testid="chip-verfuegbar">
      <Check className="mr-1 h-3 w-3" /> {t.chips.verfuegbar}
    </Badge>
  );
}

/** Der Erklärsatz zur Rendite in den Kacheln, für Kunden. Englisch über `kundenansichtTexte.ts`. */
export const RENDITE_ERKLAERUNG = KUNDENANSICHT_TEXTE.de.renditeErklaerung;

/**
 * Die Fotos, bei einer Wohnung mit Umschalter zwischen Wohnung und Haus.
 * Fehlen eigene Fotos der Wohnung, stehen gleich die des Hauses da.
 */
export function KundenGalerie({ wohnungsBilder, hausBilder, adresse, titel }: {
  wohnungsBilder?: ObjektBild[];
  hausBilder: ObjektBild[];
  adresse: string;
  titel: string;
}) {
  const { t } = useKundenTexte();
  const mitWahl = !!wohnungsBilder && wohnungsBilder.length > 0 && hausBilder.length > 0;
  const [quelle, setQuelle] = useState<"wohnung" | "haus">(wohnungsBilder && wohnungsBilder.length > 0 ? "wohnung" : "haus");
  const bilder = quelle === "wohnung" && wohnungsBilder && wohnungsBilder.length > 0 ? wohnungsBilder : hausBilder;
  const knopf = (aktiv: boolean) => cn(
    "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
    aktiv ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
  return (
    <div className="space-y-2">
      {mitWahl && (
        <div role="group" aria-label={t.galerie.gruppe} className="flex w-full gap-1 rounded-xl bg-muted p-1 sm:w-auto sm:inline-flex">
          <button type="button" aria-pressed={quelle === "wohnung"} className={knopf(quelle === "wohnung")} onClick={() => setQuelle("wohnung")}>{t.galerie.wohnung}</button>
          <button type="button" aria-pressed={quelle === "haus"} className={knopf(quelle === "haus")} onClick={() => setQuelle("haus")}>{t.galerie.haus}</button>
        </div>
      )}
      <Galerie key={quelle} bilder={bilder} adresse={adresse} titel={titel} kundenModus />
    </div>
  );
}

/**
 * Die Lagekarte aus dem Exposé, dieselbe wie dort: mit gemessener
 * Standortanalyse Karte und Listen, sonst die Karte mit der Nadel aus der
 * gespeicherten Lage `meta.koordinaten`, sonst Adresse und Hinweis
 * (`Mikrolage.tsx`). Keine Adresssuche im Browser. Ohne Lage und ohne
 * brauchbare Adresse gibt es nichts. Dieselbe Bedingung wie im Exposé
 * (`mikrolageZeigen`).
 */
export function Lagekarte({ mikrolage, titel }: { mikrolage: ExposeInhalt["mikrolage"]; titel: string }) {
  const { t } = useKundenTexte();
  if (!mikrolageZeigen(mikrolage)) return null;
  return (
    <section className={KARTE} data-testid="kunden-lagekarte" aria-label={t.lage.titel}>
      <KartenTitel>{t.lage.titel}</KartenTitel>
      <ExposeRahmen>
        <Mikrolage mikrolage={mikrolage} titel={titel} />
      </ExposeRahmen>
    </section>
  );
}

/** Der Satz im Reiter Karte, wenn zur Lage gar nichts vorliegt. Ehrlich statt einer leeren Karte. */
export const KARTE_LEER = KUNDENANSICHT_TEXTE.de.lage.leer;

/**
 * Der Reiter „Karte“ der Wohnungsebene (Christian, 24.09.2026): zuerst die
 * Karte, daneben auf breiten Bildschirmen, darunter auf dem Handy, Mikro- und
 * Makrolage. Es ist dieselbe `Lagekarte` wie im Exposé, nur über einen Reiter
 * direkt erreichbar statt ganz unten in der Übersicht.
 */
export function KartenReiter({ mikrolage, titel }: { mikrolage: ExposeInhalt["mikrolage"]; titel: string }) {
  const { t } = useKundenTexte();
  if (!mikrolageZeigen(mikrolage)) {
    return (
      <section className={KARTE} data-testid="kunden-karte-leer" aria-label={t.lage.titel}>
        <KartenTitel>{t.lage.titel}</KartenTitel>
        <p className="text-sm text-muted-foreground">{t.lage.leer}</p>
      </section>
    );
  }
  return <Lagekarte mikrolage={mikrolage} titel={titel} />;
}

/**
 * Beschreibung, Standortargumente und darunter „Markt und Standort“. Seit dem
 * 24.09.2026 ohne Vermerk „Automatisch erstellt …“. Kundenlink und Vorschau
 * im CRM nutzen diese eine Karte.
 *
 * Auf Englisch (Kundensprache, Entscheidung 12): Texte, für die es noch
 * keine englische Fassung gibt, stehen deutsch da, mit dem Vermerk
 * „Description available in German only“ (`inhalt.nurDeutsch`).
 */
export function BeschreibungKarte({ inhalt, className }: { inhalt: ExposeInhalt; className?: string }) {
  const { t, sprache } = useKundenTexte();
  const argumente = inhalt.standort.argumente;
  const markt = inhalt.standort.marktargumente;
  if (!inhalt.beschreibung && argumente.length === 0 && markt.length === 0) return null;
  const nurDeutsch = inhalt.nurDeutsch;
  return (
    <section className={cn(KARTE, className)} data-testid="kunden-beschreibung">
      <KartenTitel>{t.beschreibung.titel}</KartenTitel>
      {inhalt.beschreibung && <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{inhalt.beschreibung}</p>}
      {inhalt.beschreibung && nurDeutsch?.beschreibung && <NurDeutschHinweis />}
      {argumente.length > 0 && (
        <ol className="mt-4 space-y-2" data-testid="kunden-standortargumente">
          {argumente.map((a, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary" aria-hidden="true">{i + 1}</span>
              <span><b className="font-semibold text-foreground">{a.titel}</b>{a.text ? <span className="text-muted-foreground"> {a.text}</span> : null}</span>
            </li>
          ))}
        </ol>
      )}
      {argumente.length > 0 && nurDeutsch?.standortargumente && <NurDeutschHinweis />}
      {markt.length > 0 && (
        <div className="mt-5" data-testid="kunden-marktargumente">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.beschreibung.markt}</div>
          <ul className="space-y-2">
            {markt.map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" aria-hidden="true">
                  <BarChart3 className="h-3.5 w-3.5" />
                </span>
                <span><b className="font-semibold text-foreground">{a.titel}</b>{a.text ? <span className="text-muted-foreground"> {a.text}</span> : null}</span>
              </li>
            ))}
          </ul>
          {nurDeutsch?.marktargumente && <NurDeutschHinweis />}
          <Hinweis>{marktQuelleHinweis(sprache)}</Hinweis>
        </div>
      )}
    </section>
  );
}

/** Freitexte und Merkmale aus den Anbieterangaben, schon gefiltert (Positivliste im Server). */
export function MerkmaleKarte({ beschreibungen, merkmale, className }: { beschreibungen: string[]; merkmale: Merkmal[]; className?: string }) {
  const { t, sprache } = useKundenTexte();
  if (beschreibungen.length === 0 && merkmale.length === 0) return null;
  return (
    <section className={cn(KARTE, className)} data-testid="kunden-merkmale">
      <KartenTitel>{t.merkmale.titel}</KartenTitel>
      {beschreibungen.map((text, i) => <p key={i} className="mb-2 text-sm leading-relaxed text-foreground">{text}</p>)}
      {merkmale.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {merkmale.map((m, i) => (
            <li key={`${m.bezeichnung}-${i}`} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{m.wert ? <><b className="font-semibold">{m.bezeichnung}</b> {m.wert}</> : m.bezeichnung}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Freitexte und Merkmale des Anbieters kommen nur deutsch (Entscheidung 12). */}
      {sprache === "en" && <NurDeutschHinweis />}
      <Hinweis>{t.merkmale.quelle}</Hinweis>
    </section>
  );
}

/** Der Fuß: Stand, kurzer Haftungshinweis, Impressum und Datenschutz. */
export function KundenFuss({ stand }: { stand: Date }) {
  const { t, sprache } = useKundenTexte();
  // Deutsch wie bisher mit „Uhr“ aus der Textdatei, Englisch „25 Sep 2026, 14:30“.
  const zeit = sprache === "en"
    ? datumUhrzeitText(stand, "en")
    : stand.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
  // Impressum und Datenschutz gibt es englisch erst mit Etappe 4; der Parameter wirkt dann sofort.
  const lang = sprache === "en" ? "?lang=en" : "";
  return (
    <footer className="mt-8 border-t border-border/60 py-6 text-xs leading-relaxed text-muted-foreground" data-testid="kunden-fuss">
      <p>{t.fuss.stand(zeit)} {t.fuss.haftung}</p>
      {/* Auf dem Handy sind die beiden Links 40 px hohe Tippflächen statt einer Textzeile. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-1">OS Immobilien · <Link to={`/impressum${lang}`} className="inline-flex min-h-[40px] items-center underline-offset-2 hover:underline sm:min-h-0">{t.fuss.impressum}</Link> · <Link to={`/datenschutz${lang}`} className="inline-flex min-h-[40px] items-center underline-offset-2 hover:underline sm:min-h-0">{t.fuss.datenschutz}</Link> · <CookieEinstellungenLink sprache={sprache} className="inline-flex min-h-[40px] items-center underline-offset-2 hover:underline sm:min-h-0" /></p>
    </footer>
  );
}
