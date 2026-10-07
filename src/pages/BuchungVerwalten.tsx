import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarX, Calendar, Clock, User, Phone, Mail } from "lucide-react";
import { Buehne, Balken, Kennung, FLAECHE_HINWEIS } from "@/components/videoraum/Buehne";
import { AnsprechpartnerKarte, Karte, KartenTitel } from "@/components/videoraum/Warteraum";
import {
  BuchungLaedt, BuchungMeldung, Fehlerzeile, Feld, Hauptknopf, Nebenknopf,
} from "@/components/buchung/Bausteine";
import { Zeitauswahl } from "@/components/buchung/Zeitauswahl";
import {
  ladeBuchungMitToken, ladeFreieZeiten, ladeZugang, sageAb, verschiebe, TERMINART_STANDARD,
  type BuchungAnsicht, type BuchungZugang,
} from "@/lib/buchungStore";
import {
  beschriftungDauer, beschriftungZeitraum, deuteBuchungsfehler, waehleTerminart,
} from "@/lib/buchungAuswahl";
import { supabase } from "@/integrations/supabase/client";
import { useSeitentitel, oeffentlicherTitel } from "@/lib/seitentitel";
import { texteFuer, useLinkSprache } from "@/lib/seitenSprache";
import { BUCHUNG_VERWALTEN_TEXTE } from "./buchungVerwaltenTexte";

/**
 * Der Kunde verwaltet seinen eigenen Termin: ansehen, absagen, verschieben.
 *
 * Der Absagetoken in der Adresse ist der ganze Ausweis. Er steht nur in der
 * Bestätigung des Kunden und lässt sich nicht erraten.
 *
 * Zum Verschieben braucht die Seite die freien Zeiten, und dafür verlangt
 * `buchung_freie_zeiten` einen Zugangstoken samt Terminart. `buchung_ansicht`
 * gibt beides nicht heraus. Deshalb hängt die Buchungsseite den Zugangstoken
 * als `?zugang=` an den Verwaltungslink. Fehlt er oder ist er inzwischen
 * verbraucht, etwa bei einem einmaligen Link, bleibt das Absagen. Verschwiegen
 * wird das nicht, es steht dann als Hinweis auf der Seite.
 *
 * Sprache (Kundensprache, Etappe 3): Die Datenbank nennt die Sprache über den
 * Absagetoken (`kundensprache_zum_link`, Art „buchung_verwalten“), `?lang=`
 * überschreibt nur die Anzeige, Rückfall Deutsch. Texte in
 * `buchungVerwaltenTexte.ts`.
 */

type Phase = "laden" | "fehlt" | "da";
type Modus = "uebersicht" | "absagen" | "verschieben";

/**
 * Mails und Glocke nach einer Absage oder Verschiebung anstoßen.
 *
 * Übergeben wird ausschliesslich der Absagetoken, niemals Name oder E-Mail aus
 * dem Browser: sonst wäre der Aufruf ein Versandwerkzeug, mit dem sich Mails an
 * Fremde auslösen liessen. Welche Mail hinausgeht, entscheidet die Function
 * selbst anhand des Zustands der Buchung.
 *
 * Bewusst ohne `await` und ohne `throw`. Geht die Mail nicht hinaus, ist der
 * Termin trotzdem abgesagt oder verschoben, und der Kunde soll deswegen keine
 * Fehlermeldung sehen. Derselbe Weg wie nach dem Buchen in `buchungStore.ts`.
 */
function meldeAenderung(absageToken: string) {
  void supabase.functions
    .invoke("send-buchung-aenderung", { body: { absageToken } })
    .then(({ error }) => {
      if (error) console.error("send-buchung-aenderung:", error);
    })
    .catch((fehler) => console.error("send-buchung-aenderung:", fehler));
}

export default function BuchungVerwalten() {
  const { absageToken = "" } = useParams();
  const [suche] = useSearchParams();
  const zugangToken = suche.get("zugang") ?? "";
  const { sprache, bereit } = useLinkSprache("buchung_verwalten", absageToken);
  const t = texteFuer(BUCHUNG_VERWALTEN_TEXTE, sprache);

  const [phase, setPhase] = useState<Phase>("laden");
  const [ansicht, setAnsicht] = useState<BuchungAnsicht | null>(null);
  const [modus, setModus] = useState<Modus>("uebersicht");
  const [grund, setGrund] = useState("");
  const [gewaehlteZeit, setGewaehlteZeit] = useState<string | null>(null);
  const [neuLaden, setNeuLaden] = useState(0);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useSeitentitel(oeffentlicherTitel(t.seitentitel));
  const [erfolg, setErfolg] = useState<string | null>(null);

  /**
   * Terminart des Termins, sofern sie sich über den Zugangstoken finden lässt.
   * Gebraucht werden ihre Kennung für die freien Zeiten und ihre Vorausschau
   * für den angezeigten Zeitraum.
   */
  const [terminart, setTerminart] = useState<BuchungZugang["terminarten"][number] | null>(null);
  const terminartId = terminart?.id ?? null;

  const hole = useCallback(async () => {
    const daten = await ladeBuchungMitToken(absageToken);
    if (!daten) { setPhase("fehlt"); return null; }
    setAnsicht(daten);
    setPhase("da");
    return daten;
  }, [absageToken]);

  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const daten = await ladeBuchungMitToken(absageToken);
      if (!aktiv) return;
      if (!daten) { setPhase("fehlt"); return; }
      setAnsicht(daten);
      setPhase("da");

      // Der Zugang ist nur für die Zeitauswahl nötig. Fehlt er, geht der Rest
      // der Seite trotzdem.
      if (!zugangToken) return;
      const zugang = await ladeZugang(zugangToken);
      if (!aktiv || !zugang) return;
      // Maßgeblich ist die Kennung aus der Ansicht. Nur wenn sie fehlt, etwa
      // weil die Terminart gelöscht wurde, wird über Bezeichnung und Dauer
      // geraten.
      setTerminart(waehleTerminart(zugang.terminarten, {
        id: daten.terminart_id,
        bezeichnung: daten.bezeichnung,
        dauerMinuten: daten.dauer_minuten,
      }));
    })();
    return () => { aktiv = false; };
  }, [absageToken, zugangToken]);

  const zeitzone = ansicht?.zeitzone ?? "Europe/Berlin";
  const kannVerschieben = Boolean(terminartId) && ansicht?.status === "offen";

  const ladeZeiten = useCallback(
    (vonTag: string, bisTag: string) => {
      if (!terminartId || !zugangToken) return Promise.resolve([] as string[]);
      return ladeFreieZeiten({ token: zugangToken, terminartId, vonTag, bisTag });
    },
    [zugangToken, terminartId],
  );

  const berater = useMemo(
    () => ({
      name: ansicht?.berater.name || t.ansprechpartnerErsatz,
      email: ansicht?.berater.email ?? undefined,
      telefon: ansicht?.berater.telefon ?? undefined,
    }),
    [ansicht, t],
  );

  const absagen = async () => {
    if (arbeitet) return;
    setArbeitet(true);
    setFehler(null);
    const geklappt = await sageAb(absageToken, grund.trim() || undefined);
    setArbeitet(false);
    if (!geklappt) {
      setFehler(t.absageFehler);
      return;
    }
    setModus("uebersicht");
    meldeAenderung(absageToken);
    setErfolg(t.abgesagtErfolg);
    await hole();
  };

  const verschieben = async () => {
    if (!gewaehlteZeit || arbeitet) return;
    setArbeitet(true);
    setFehler(null);
    try {
      await verschiebe(absageToken, gewaehlteZeit);
      setModus("uebersicht");
      setGewaehlteZeit(null);
      meldeAenderung(absageToken);
      setErfolg(t.verschobenErfolg);
      await hole();
    } catch (e) {
      const deutung = deuteBuchungsfehler(e, sprache);
      setFehler(deutung.text);
      if (deutung.neuLaden) {
        setGewaehlteZeit(null);
        setNeuLaden((z) => z + 1);
      }
    } finally {
      setArbeitet(false);
    }
  };

  // ---------------------------------------------------------------- Zustände

  // Auch auf die Sprache warten, damit die Seite nicht sichtbar umspringt.
  if (phase === "laden" || !bereit) return <BuchungLaedt sprache={sprache} />;

  if (phase === "fehlt" || !ansicht) {
    return (
      <BuchungMeldung
        kennung={t.kennung}
        titel={t.fehltTitel}
        text={t.fehltText}
      />
    );
  }

  const abgesagt = ansicht.status === "abgesagt";
  // Nur ein offener Termin lässt sich noch ändern. Ein wahrgenommener bleibt,
  // wie er ist, das entscheidet ohnehin die Datenbank.
  const offen = ansicht.status === "offen";

  return (
    <Buehne>
      <div className="mx-auto min-h-[100dvh] max-w-5xl px-6 py-24 sm:px-10">
        <Kennung>{t.kennung}</Kennung>
        <h1 className="mt-3 max-w-2xl text-[30px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[38px]">
          {abgesagt ? t.titelAbgesagt : t.gruss(ansicht.name.trim().split(" ")[0] || ansicht.name)}
        </h1>
        <Balken className="mt-6" />
        <p className="mt-5 max-w-[520px] text-[15.5px] leading-relaxed text-white/60">
          {abgesagt
            ? t.einleitungAbgesagt
            : offen
              ? t.einleitungOffen
              : t.einleitungVorbei}
        </p>

        {erfolg && (
          <div
            role="status"
            className="mt-7 rounded-[14px] border border-[#34C759]/30 bg-[#34C759]/10 px-4 py-3 text-[13.5px] text-[#7EE29B]"
          >
            {erfolg}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-6">
            <Karte>
              <KartenTitel>{abgesagt ? t.abgesagterTermin : t.deinTermin}</KartenTitel>
              <div className="flex flex-col gap-4">
                <Zeile icon={<Calendar className="h-3.5 w-3.5" />} beschriftung={t.wann}>
                  <span className={abgesagt ? "line-through decoration-white/30" : ""}>
                    {beschriftungZeitraum(ansicht.start_at, ansicht.dauer_minuten, zeitzone, sprache)}
                  </span>
                </Zeile>
                <Zeile icon={<Clock className="h-3.5 w-3.5" />} beschriftung={t.dauer}>
                  {beschriftungDauer(ansicht.dauer_minuten, sprache)}
                </Zeile>
                <Zeile icon={<User className="h-3.5 w-3.5" />} beschriftung={t.anliegen}>
                  {ansicht.bezeichnung || t.terminErsatz}
                </Zeile>
                <Zeile icon={<Mail className="h-3.5 w-3.5" />} beschriftung={t.gebuchtAuf}>
                  {ansicht.name} · {ansicht.email}
                </Zeile>
              </div>

              {offen && modus === "uebersicht" && (
                <div className="mt-7 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row">
                  <Nebenknopf aufKlick={() => { setFehler(null); setErfolg(null); setModus("absagen"); }}>
                    <CalendarX className="h-4 w-4" /> {t.absagen}
                  </Nebenknopf>
                  <Hauptknopf
                    gesperrt={!kannVerschieben}
                    aufKlick={() => { setFehler(null); setErfolg(null); setModus("verschieben"); }}
                  >
                    {t.verschieben} <ArrowRight className="h-4 w-4" />
                  </Hauptknopf>
                </div>
              )}

              {offen && modus === "uebersicht" && !kannVerschieben && (
                <p className="mt-4 text-[12.5px] leading-relaxed text-white/40">
                  {t.keinVerschieben}
                </p>
              )}
            </Karte>

            {/* Absagen */}
            {offen && modus === "absagen" && (
              <Karte>
                <KartenTitel>{t.absagen}</KartenTitel>
                <p className="text-[13.5px] leading-relaxed text-white/60">
                  {t.absageErklaerung}
                </p>
                <div className="mt-5">
                  <Feld
                    id="absage-grund"
                    beschriftung={t.grund}
                    wert={grund}
                    aufWert={setGrund}
                    platzhalter={t.grundPlatzhalter}
                    maxLaenge={500}
                    mehrzeilig
                    sprache={sprache}
                  />
                </div>
                <div className="mt-6 flex flex-col gap-3">
                  <Fehlerzeile text={fehler} />
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Nebenknopf aufKlick={() => { setModus("uebersicht"); setFehler(null); }} gesperrt={arbeitet}>
                      <ArrowLeft className="h-4 w-4" /> {t.dochNicht}
                    </Nebenknopf>
                    <Hauptknopf laedt={arbeitet} aufKlick={() => void absagen()} sprache={sprache}>
                      {t.absageBestaetigen}
                    </Hauptknopf>
                  </div>
                </div>
              </Karte>
            )}

            {/* Verschieben */}
            {offen && modus === "verschieben" && kannVerschieben && (
              <Karte>
                <KartenTitel>
                  {t.neueZeit} · {beschriftungDauer(ansicht.dauer_minuten, sprache)}
                </KartenTitel>
                <Zeitauswahl
                  zeitzone={zeitzone}
                  vorausschauTage={terminart?.vorausschau_tage ?? TERMINART_STANDARD.vorausschauTage}
                  lade={ladeZeiten}
                  gewaehlt={gewaehlteZeit}
                  aufWahl={setGewaehlteZeit}
                  neuLaden={neuLaden}
                  sprache={sprache}
                />
                <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-6">
                  <Fehlerzeile text={fehler} />
                  {gewaehlteZeit && (
                    <p className="text-[13.5px] text-white/60">
                      {t.neu}{" "}
                      <b className="font-semibold text-white">
                        {beschriftungZeitraum(gewaehlteZeit, ansicht.dauer_minuten, zeitzone, sprache)}
                      </b>
                    </p>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Nebenknopf
                      aufKlick={() => { setModus("uebersicht"); setGewaehlteZeit(null); setFehler(null); }}
                      gesperrt={arbeitet}
                    >
                      <ArrowLeft className="h-4 w-4" /> {t.zurueck}
                    </Nebenknopf>
                    <Hauptknopf gesperrt={!gewaehlteZeit} laedt={arbeitet} aufKlick={() => void verschieben()} sprache={sprache}>
                      {t.aufDieseZeit} <ArrowRight className="h-4 w-4" />
                    </Hauptknopf>
                  </div>
                </div>
              </Karte>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <AnsprechpartnerKarte gastgeber={berater} sprache={sprache} />
            {(berater.telefon || berater.email) && (
              <div className={`rounded-[14px] border border-[#30E19E]/15 ${FLAECHE_HINWEIS} p-4`}>
                <p className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-white/60">
                  <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#30E19E]" />
                  {t.anrufHinweis}
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="mt-10 text-center text-[10.5px] text-white/30">
          OS Immobilien · Am Ostbahnhof 1, 15749 Mittenwalde
        </p>
      </div>
    </Buehne>
  );
}

function Zeile({
  icon,
  beschriftung,
  children,
}: {
  icon: React.ReactNode;
  beschriftung: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#30E19E]/[0.13] text-[#30E19E]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-[0.14em] text-white/40">{beschriftung}</span>
        <span className="mt-0.5 block text-[14.5px] text-white">{children}</span>
      </span>
    </div>
  );
}
