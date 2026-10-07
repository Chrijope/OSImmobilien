/**
 * Eintragung vor dem Ergebnis.
 *
 * Bisher sah jeder das vollständige Ergebnis, und das Formular stand ganz
 * unten. Wer alles gesehen hat, hat keinen Anlass mehr, seine Daten zu
 * hinterlassen. Deshalb sitzt die Eintragung jetzt davor.
 *
 * Damit das nicht als Datenfalle wirkt, zeigt die Seite vorher einen Beleg,
 * dass wirklich gerechnet wurde: die Ampelfarbe, die Einordnung und die
 * Kennzahlen unscharf im Hintergrund. Und sie sagt in einem Satz, was mit den
 * Daten passiert.
 */
import { useEffect, useState } from "react";
import { ArrowRight, Check, Lock, ShieldCheck } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import type { AnalysisData, ScoreResult } from "@/lib/scoringEngine";
import type { BeraterInfo } from "@/pages/AnalysePublic";
import { sendeAnalyseLead } from "@/lib/analyseLead";
import { protokolliereAnalyseEreignis } from "@/lib/analysetoolEreignisse";
import { sortiereTypenNachPassung, waehleMusterobjekt } from "@/lib/objekttypen";
import EinwilligungFelder, { einwilligungsTexte } from "@/components/analysis/EinwilligungFelder";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { euroText } from "@/lib/sprachFormat";
import { ANALYSE_TEXTE } from "./analyseTexte";
import { kategorieAnzeige, objekttypAnzeige } from "./analyseRechenkernTexte";

interface Props {
  result: ScoreResult;
  data: AnalysisData;
  berater?: BeraterInfo;
  /** Wird nach erfolgreicher Eintragung aufgerufen und gibt das Ergebnis frei. */
  onFreigeschaltet: () => void;
}

export default function ErgebnisFreischalten({ result, data, berater, onFreigeschaltet }: Props) {
  const texte = useSeitenTexte(ANALYSE_TEXTE);
  const t = texte.freischalten;
  const f = texte.formular;
  const sprache = useSeitenSprache();
  const eur = (v: number) => euroText(Math.round(v), sprache);
  // Die Meldung zum fehlenden Haken in der Sprache der Seite, siehe `EinwilligungFelder`.
  const einwilligungFehltText = einwilligungsTexte(sprache).fehlt;
  const kategorie = kategorieAnzeige(result, sprache);
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [strasse, setStrasse] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");
  const [notizen, setNotizen] = useState("");
  const [mehrOffen, setMehrOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Pflichthaken und freiwilliger Haken, siehe `leadEinwilligung.ts`.
  const [einwilligung, setEinwilligung] = useState(false);
  const [werbeeinwilligung, setWerbeeinwilligung] = useState(false);
  // Der Hinweis am Haken erscheint erst nach dem ersten Versuch, sonst steht
  // das Formular von Anfang an rot da.
  const [einwilligungFehlt, setEinwilligungFehlt] = useState(false);

  // Dieselbe Auswahl wie auf der Ergebnisseite, damit die verdeckte Vorschau
  // schon die Zahlen zeigt, die nach der Eintragung wirklich dastehen.
  const grenzsteuersatz =
    data.incomeClass === "ueber_120k" || data.incomeClass === "80k_120k"
      ? 0.42
      : data.incomeClass === "50k_80k"
      ? 0.35
      : 0.25;
  const rahmenBis = result.financingEstimate.maxVolume;
  const besterTyp = sortiereTypenNachPassung(grenzsteuersatz, rahmenBis)[0];
  const musterObjekt = waehleMusterobjekt(besterTyp, {
    rahmenBis,
    grenzsteuersatz,
    bundeslandId: data.bundeslandId,
  });

  useEffect(() => {
    protokolliereAnalyseEreignis("eintragung_gesehen", berater?.userId);
  }, [berater?.userId]);

  const emailOk = /.+@.+\..+/.test(email.trim());
  const vollstaendig = !!vorname.trim() && !!nachname.trim() && emailOk && telefon.trim().length >= 6;

  const ampelFarbe =
    result.ampel.overall === "gruen"
      ? "hsl(var(--success))"
      : result.ampel.overall === "orange"
      ? "hsl(var(--warning))"
      : "hsl(var(--destructive))";

  const absenden = async () => {
    if (!vollstaendig || laeuft) return;
    // Ohne Einwilligung wird nichts abgeschickt, und die Meldung sagt, was
    // fehlt. Der Knopf bleibt bedienbar, damit der Grund ueberhaupt erscheint.
    if (!einwilligung) {
      setEinwilligungFehlt(true);
      setFehler(einwilligungFehltText);
      return;
    }
    setEinwilligungFehlt(false);
    setLaeuft(true);
    setFehler(null);
    const antwort = await sendeAnalyseLead(
      {
        vorname,
        nachname,
        email,
        telefon,
        strasse,
        plz,
        ort,
        notizen,
        einwilligung,
        werbeeinwilligung,
      },
      result,
      data,
      berater,
      sprache,
    );
    setLaeuft(false);
    if (!antwort.ok) {
      setFehler(antwort.fehler || f.fehlerAllgemein);
      return;
    }
    protokolliereAnalyseEreignis("eintragung_abgesendet", berater?.userId);
    onFreigeschaltet();
  };

  const feldKlasse =
    "w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary";

  return (
    <div className="py-12 sm:py-16 px-4">
      <div className="max-w-xl mx-auto">
        {/* Beleg, dass gerechnet wurde */}
        <div data-ui="card" className="rounded-3xl border border-border bg-card p-6 sm:p-8 mb-5 text-center relative overflow-hidden">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full" style={{ background: ampelFarbe }} />
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t.auswertungSteht}</span>
          </div>
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">{kategorie.label}</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            {kategorie.beschreibung}
          </p>

          {/* Kennzahlen bewusst unscharf: sichtbar, dass es sie gibt, ohne sie zu verraten. */}
          <div className="grid grid-cols-3 gap-3 mt-6" aria-hidden="true">
            {[
              { label: t.kennzahlRahmen, wert: eur(rahmenBis) },
              { label: t.kennzahlTyp, wert: objekttypAnzeige(besterTyp, sprache).name },
              { label: t.kennzahlZuzahlung, wert: eur(Math.round(musterObjekt.zuzahlungMonat)) },
            ].map((k) => (
              <div key={k.label} className="rounded-xl bg-muted/60 p-3">
                <p className="text-[10px] text-muted-foreground leading-tight">{k.label}</p>
                <p className="text-base font-bold mt-1 blur-[7px] select-none">{k.wert}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> {t.nochEinSchritt}
          </p>
        </div>

        {/* Eintragung */}
        <div data-ui="card" className="rounded-3xl border border-border bg-card p-6 sm:p-8">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{t.titel}</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            {t.text}
          </p>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={f.vorname}
                value={vorname}
                onChange={(e) => setVorname(e.target.value)}
                className={feldKlasse}
                autoComplete="given-name"
              />
              <input
                type="text"
                placeholder={f.nachname}
                value={nachname}
                onChange={(e) => setNachname(e.target.value)}
                className={feldKlasse}
                autoComplete="family-name"
              />
            </div>
            <input
              type="email"
              placeholder={f.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={feldKlasse}
              autoComplete="email"
            />
            <PhoneInput value={telefon} onChange={setTelefon} />

            <button
              type="button"
              onClick={() => setMehrOffen((o) => !o)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {mehrOffen ? t.mehrAusblenden : t.mehrZeigen}
            </button>

            {mehrOffen && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder={f.strasse}
                    value={strasse}
                    onChange={(e) => setStrasse(e.target.value)}
                    className={feldKlasse}
                  />
                  <div className="grid grid-cols-5 gap-2">
                    <input
                      type="text"
                      placeholder={f.plz}
                      value={plz}
                      onChange={(e) => setPlz(e.target.value)}
                      className={`col-span-2 ${feldKlasse}`}
                    />
                    <input
                      type="text"
                      placeholder={f.ort}
                      value={ort}
                      onChange={(e) => setOrt(e.target.value)}
                      className={`col-span-3 ${feldKlasse}`}
                    />
                  </div>
                </div>
                <textarea
                  placeholder={f.nachricht}
                  value={notizen}
                  onChange={(e) => setNotizen(e.target.value)}
                  rows={2}
                  className={`${feldKlasse} resize-none`}
                />
              </div>
            )}

            <EinwilligungFelder
              einwilligung={einwilligung}
              onEinwilligung={(w) => {
                setEinwilligung(w);
                if (w) {
                  setEinwilligungFehlt(false);
                  setFehler((alt) => (alt === einwilligungFehltText ? null : alt));
                }
              }}
              werbung={werbeeinwilligung}
              onWerbung={setWerbeeinwilligung}
              fehlt={einwilligungFehlt}
              sprache={sprache}
            />

            {/* Die Meldung am Haken steht schon dort, hier nur alles andere. */}
            {fehler && fehler !== einwilligungFehltText && (
              <p className="text-sm text-destructive">{fehler}</p>
            )}

            <button
              disabled={!vollstaendig || laeuft}
              onClick={absenden}
              className="w-full apple-btn apple-btn-primary mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {laeuft ? t.laeuft : t.absenden}
              {laeuft ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>

            <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {berater?.name ? t.meldetSichName(berater.name) : t.meldetSichAllgemein}
                {t.datenschutzRest}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
