import { useState, useEffect, useRef, useId, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  CalendarClock,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  Pause,
  PencilLine,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  EINWILLIGUNG_TEXT,
  EINWILLIGUNG_VERSION,
} from "@/lib/bewerberFormular";
import {
  ABSCHLUSS_TEXTE,
  AUSSTIEG_GRUND_MAX,
  AUSSTIEG_TEXTE,
  KENNENLERNEN_FASSUNG,
  KONDITIONEN_ID,
  SCHRITT_TEXTE,
  absaetzeFuer,
  anschlussUnten,
  ansichtNummer,
  ansichtenFuer,
  wegAusAdresse,
  antwortHinweisFuer,
  antwortenZumSenden,
  fragenDerAnsicht,
  frageBeantwortet,
  kapitelZeile,
  kennenlernenUeberblick,
  naechsterSchritt,
  rueckmeldungFaellig,
  themenLabels,
  type KennenlernenAntworten,
  type KennenlernenFrage,
} from "@/lib/bewerberKennenlernen";
import {
  ladeFragebogenEntwurf,
  loescheFragebogenEntwurf,
  speichereFragebogenEntwurf,
} from "@/lib/bewerberFormularEntwurf";
import {
  hatOffenenTermin,
  terminZeile,
  type BewerberTerminZugang,
} from "@/lib/bewerberTermin";
import { ladeBewerberTerminZugang } from "@/lib/bewerberTerminStore";
import { kooperationsPfad } from "../../supabase/functions/_shared/bewerber-kooperationsgespraech-mail";
import { meldeBewerberSeitenAktion } from "@/lib/bewerberSeiteStore";
import { meldeLinkAufruf } from "@/lib/bewerberMailTracking";
import { SpamHinweis } from "@/components/bewerbung/SpamHinweis";
import {
  PAUSEN_WAHLEN,
  alsDatum,
  bewerberSeitePfad,
  erinnerungsDatum,
  type PausenWahl,
  type SeitenAktion,
} from "@/lib/bewerberSeite";
import {
  EinfahrKasten,
  Eyebrow,
  FARBE_BLAU,
  FARBE_DUNKEL,
  Freitext,
  Fussnote,
  Hauptknopf,
  KachelEinzel,
  KachelMehrfach,
  Kurztext,
  SchrittFuss,
  Skala,
} from "@/components/bewerberformular/FragebogenBausteine";
import { Motiv, MotivStil } from "@/components/bewerberformular/KennenlernenMotive";
import logo from "@/assets/moreimmo-logo.png";
import { ersterVorname } from "@/lib/kennenlerntermin";
// Liquid Glass fuer die Bewerberseiten (Huelle `.bewerber-seite`, Karte `.bewerber-karte`).
import "@/styles/lp-theme-liquid.css";

type SeitenStatus = "laedt" | "bereit" | "abgelaufen" | "ausgefuellt" | "fehler";

/** Was der Bewerber am Ende gewählt hat. */
type Abschluss = "offen" | "gesendet" | "pausiert" | "beendet";

/** Die Anzeige der Zwischenstände auf dem Gerät, Schlüssel im Entwurf. */
const ENTWURF_PRAEFIX = "kennenlernen-";

/**
 * Das Kennenlernen, so wie der Bewerber es erlebt.
 *
 * Eine Ansicht je Bildschirm, oben rechts das Kapitel mit Namen und das Motiv,
 * unten der Fortschritt. Der Inhalt kommt vollständig aus
 * `bewerberKennenlernen.ts`; diese Seite ist nur die Bühne.
 *
 * Vier Dinge, die diese Seite anders macht als der alte Vorabbogen:
 *
 *   1. **Der Ausstieg steht auf jeder Ansicht.** Klein unter Zurück und
 *      Weiter, und auch auf dem Abschluss (Punkt P11). Wer merkt, dass es
 *      nicht passt, muss dafür nicht bis zum Ende klicken und auch nicht in
 *      einer alten Mail nach einem Abmeldelink suchen.
 *   2. **Der Nebenweg zu den Konditionen.** Auf Ansicht 1. Er kostet eine
 *      Zeile und nimmt dem Einwand die Spitze, ohne die Reihenfolge für alle
 *      anderen zu opfern.
 *   3. **Die Rückmeldung kommt nach der Antwort.** Nicht davor. Ein Kasten,
 *      der die Antwort schon kommentiert, bevor sie gegeben ist, liest sich
 *      wie eine Vorgabe.
 *   4. **Die Pause ist kein Abbruch.** Pausieren setzt keinen Status und löst
 *      keinen Anruf aus. Kein Interesse dagegen heißt: nie wieder melden.
 *      Beides bleibt getrennt.
 *
 * Der Zwischenstand liegt auf dem Gerät, wie beim alten Bogen. Serverseitig
 * gespeichert wird erst beim Absenden; ein Gerätewechsel verliert den Entwurf.
 */
export default function BewerberKennenlernen() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<SeitenStatus>("laedt");
  const [vorname, setVorname] = useState("");
  const [ablauf, setAblauf] = useState("");
  const [antworten, setAntworten] = useState<KennenlernenAntworten>({});
  const [einwilligung, setEinwilligung] = useState(false);
  const [einwilligungFehlt, setEinwilligungFehlt] = useState(false);
  const [hp, setHp] = useState("");
  const [nummer, setNummer] = useState(1);
  const [sendet, setSendet] = useState(false);
  const [sendeFehler, setSendeFehler] = useState("");
  const [abschluss, setAbschluss] = useState<Abschluss>("offen");
  /**
   * Der Ausstieg liegt bewusst neben `abschluss` und nicht darin.
   *
   * Er ist von jeder Ansicht aus erreichbar, auch vom Abschlussbildschirm
   * nach dem Absenden. Steckte er darin, müsste „Doch weitermachen" sich merken,
   * wohin es zurückgeht; so bleibt der Zustand darunter einfach stehen.
   */
  const [ausstiegOffen, setAusstiegOffen] = useState(false);
  const [ausstiegGrund, setAusstiegGrund] = useState("");
  const [pauseWahl, setPauseWahl] = useState<PausenWahl | null>(null);
  const [meldetAnServer, setMeldetAnServer] = useState(false);
  const [serverFehler, setServerFehler] = useState("");
  const titelRef = useRef<HTMLHeadingElement>(null);
  const titelId = useId();
  const einwilligungId = useId();
  const ausstiegId = useId();

  // Den Aufruf des Links aus der Mail zählen, statt eines Zählpixels.
  useEffect(() => { meldeLinkAufruf(); }, []);

  // Die Seite gehört nicht in Suchmaschinen.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    if (!token) { setStatus("fehler"); return; }
    let abgebrochen = false;

    void (async () => {
      const { data: rpcData, error } = await supabase.rpc("get_bewerber_formular", { _token: token });
      const daten = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (abgebrochen) return;

      if (error || !daten) { setStatus("fehler"); return; }
      /*
        Nur der erste Namensteil. Im Feld `vorname` kann der ganze Name
        stehen: Der Webhook teilt einen Gesamtnamen nur dann auf, wenn
        eines der beiden Namensfelder leer ist. Hier gekuerzt und nicht
        an jeder Anrede einzeln, dann gilt es auch fuer die
        Abschlusstexte weiter unten.
      */
      setVorname(ersterVorname(daten.vorname || ""));
      if (daten.status === "eingereicht") { setStatus("ausgefuellt"); return; }
      if (daten.status !== "offen" || new Date(daten.expires_at) < new Date()) {
        setStatus("abgelaufen");
        return;
      }
      setAblauf(daten.expires_at);

      const entwurf = ladeFragebogenEntwurf(token);
      if (entwurf) {
        setAntworten(entwurf.antworten as KennenlernenAntworten);
        const gemerkt = (entwurf.frageKey || "").startsWith(ENTWURF_PRAEFIX)
          ? Number(entwurf.frageKey!.slice(ENTWURF_PRAEFIX.length))
          : NaN;
        if (Number.isFinite(gemerkt) && gemerkt >= 1) setNummer(gemerkt);
      } else {
        // Vorauswahl aus der Stellenanzeige (Finanzdienstleister: Weg 2), änderbar.
        const vorbelegt = wegAusAdresse(window.location.search);
        if (vorbelegt) setAntworten({ weg: vorbelegt });
      }
      setStatus("bereit");
    })();

    return () => { abgebrochen = true; };
  }, [token]);

  // Zwischenstand auf dem Gerät. Bewusst bei jeder Änderung, nicht erst am Ende.
  useEffect(() => {
    if (!token || status !== "bereit" || abschluss === "gesendet") return;
    speichereFragebogenEntwurf(token, {
      frageKey: `${ENTWURF_PRAEFIX}${nummer}`,
      antworten: antworten as Record<string, string | string[]>,
      telefon: "",
    });
  }, [token, status, abschluss, nummer, antworten]);

  const ansichten = ansichtenFuer(antworten);
  const ansicht = ansichten.find((a) => a.nummer === nummer) ?? ansichten[0];
  const index = ansichten.findIndex((a) => a.nummer === ansicht.nummer);
  const letzte = ansichten[ansichten.length - 1];

  useEffect(() => {
    titelRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [nummer]);

  const springe = (ziel: number) => {
    const gefunden = ansichten.find((a) => a.nummer === ziel) ?? ansichten[0];
    setNummer(gefunden.nummer);
  };

  const weiter = () => {
    const naechste = ansichten[index + 1];
    if (naechste) setNummer(naechste.nummer);
  };

  const zurueck = () => {
    const vorige = ansichten[index - 1];
    if (vorige) setNummer(vorige.nummer);
  };

  const setzeAntwort = (key: string, wert: string | string[]) =>
    setAntworten((a) => {
      /*
       * Wer den Weg wechselt, bekommt drei andere Fragen unter denselben
       * Schlüsseln. Die alten Antworten müssen deshalb weg: „gelegentlich"
       * hieße sonst auf dem einen Weg „Gelegentlich, nebenbei" und auf dem
       * anderen „Gelegentlich" zu einer ganz anderen Frage.
       */
      if (key === "weg" && a.weg && a.weg !== wert) {
        const { wegAntwort1, wegAntwort2, wegAntwort3, ...rest } = a;
        return { ...rest, weg: wert };
      }
      return { ...a, [key]: wert };
    });

  const toggleMehrfach = (key: string, wert: string) =>
    setAntworten((a) => {
      const bisher = Array.isArray(a[key]) ? (a[key] as string[]) : [];
      return {
        ...a,
        [key]: bisher.includes(wert) ? bisher.filter((v) => v !== wert) : [...bisher, wert],
      };
    });

  const absenden = async () => {
    if (!einwilligung) { setEinwilligungFehlt(true); return; }
    setSendet(true);
    setSendeFehler("");
    try {
      const { data, error } = await supabase.functions.invoke("submit-bewerber-formular", {
        body: {
          token,
          antworten: antwortenZumSenden(antworten),
          telefon: "",
          einwilligung: true,
          einwilligungVersion: `${EINWILLIGUNG_VERSION}+kennenlernen-${KENNENLERNEN_FASSUNG}`,
          hp,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
      if (token) loescheFragebogenEntwurf(token);
      setAbschluss("gesendet");
    } catch (err) {
      console.error("[kennenlernen] Absenden fehlgeschlagen", err);
      setSendeFehler("Bitte versuche es in einem Moment noch einmal. Deine Antworten bleiben auf diesem Gerät gespeichert.");
    } finally {
      setSendet(false);
    }
  };

  /**
   * Pause, Ausstieg und Weitermachen an den Server melden.
   *
   * Der Bildschirm wechselt danach und nicht davor. Ein Wechsel ohne
   * Rückmeldung wäre genau der alte Fehler: Der Bewerber sieht „wir warten",
   * und die Erinnerungskette läuft im Hintergrund weiter.
   */
  const meldeAnServer = async (
    aktion: SeitenAktion,
    zusatz: { text?: string; wahl?: PausenWahl } = {},
  ): Promise<boolean> => {
    if (!token) return false;
    setMeldetAnServer(true);
    setServerFehler("");
    const ok = await meldeBewerberSeitenAktion({ token, aktion, ...zusatz });
    if (!ok) setServerFehler("Das hat leider nicht geklappt. Versuch es bitte gleich noch einmal.");
    setMeldetAnServer(false);
    return ok;
  };

  /** Der Ausstieg: Grund aufnehmen, melden, dann den Bildschirm wechseln. */
  const beendeBewerbung = async () => {
    const ok = await meldeAnServer("ausstieg", { text: ausstiegGrund.trim() });
    if (!ok) return;
    setAusstiegOffen(false);
    setAbschluss("beendet");
  };

  /** Die kleine Zeile unter dem Fuß, auf jeder Ansicht und im Abschluss. */
  const AusstiegZeile = () => (
    <button
      type="button"
      onClick={() => { setAusstiegOffen(true); setServerFehler(""); }}
      className="mt-4 block w-full text-center text-[13px] underline underline-offset-[3px] transition-colors hover:text-[#6E6E73]"
      style={{ color: "#9AA0A8" }}
    >
      {AUSSTIEG_TEXTE.link}
    </button>
  );

  // ── Zustände vor dem Bogen ──

  if (status === "laedt") {
    return (
      <Seite><Karte>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#6E6E73" }} aria-label="Lädt" />
        </div>
      </Karte></Seite>
    );
  }

  if (status === "fehler" || status === "abgelaufen") {
    return (
      <Seite><Karte>
        <div className="text-center space-y-3 py-4">
          <Logo />
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" aria-hidden />
          <h1 className="text-2xl" style={{ color: FARBE_DUNKEL }}>
            {status === "abgelaufen" ? "Dieser Link ist abgelaufen" : "Dieser Link ist uns unbekannt"}
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "#6E6E73" }}>
            Kein Problem. Schreib uns kurz an{" "}
            <a href="mailto:office@more.immo" className="underline underline-offset-[3px]" style={{ color: FARBE_BLAU }}>office@more.immo</a>,
            dann bekommst du einen neuen.
          </p>
        </div>
      </Karte></Seite>
    );
  }

  /*
   * Der Ausstieg, Punkt P11.
   *
   * Steht vor allen anderen Zuständen, weil er von überall erreichbar ist:
   * aus dem Bogen, aus dem Abschluss und aus dem Bildschirm mit dem
   * gebuchten Termin. Was darunter liegt, bleibt liegen; „Doch weitermachen"
   * bringt genau dorthin zurück.
   */
  if (ausstiegOffen && abschluss !== "beendet") {
    return (
      <Seite><Karte>
        <Logo />
        <div className="space-y-3">
          <Eyebrow>Kein Interesse</Eyebrow>
          <h1 className="text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>
            {AUSSTIEG_TEXTE.titel}
          </h1>
          <p className="text-[15.5px] leading-relaxed" style={{ color: "#3A3A3F" }}>
            {AUSSTIEG_TEXTE.text}
          </p>
          <div>
            <label htmlFor={ausstiegId} className="sr-only">Woran liegt es?</label>
            <textarea
              id={ausstiegId}
              value={ausstiegGrund}
              onChange={(e) => setAusstiegGrund(e.target.value)}
              placeholder={AUSSTIEG_TEXTE.platzhalter}
              maxLength={AUSSTIEG_GRUND_MAX}
              rows={4}
              className="w-full rounded-2xl border-2 border-[#E4E6EB] bg-white px-4 py-3.5 text-base leading-normal transition-all placeholder:text-[#9AA0A8] focus:outline-none focus:border-[#0A6EDB] focus:shadow-[0_0_0_4px_rgba(10,110,219,.12)] resize-y min-h-[120px]"
              style={{ color: "#1D1D1F" }}
            />
            <p className="text-right text-[12.5px] mt-1.5" style={{ color: "#8A8F98" }}>
              {ausstiegGrund.length} / {AUSSTIEG_GRUND_MAX}
            </p>
          </div>

          {serverFehler && (
            <p className="text-[14px] rounded-2xl px-4 py-3" style={{ background: "#FDF0EE", color: "#B23A2B" }}>
              {serverFehler}
            </p>
          )}

          <div className="space-y-3 pt-1">
            <Hauptknopf
              onClick={() => { void beendeBewerbung(); }}
              disabled={meldetAnServer}
              ohnePfeil
              breit
            >
              {meldetAnServer ? "Einen Moment …" : AUSSTIEG_TEXTE.beenden}
            </Hauptknopf>
            <button
              type="button"
              onClick={() => { setAusstiegOffen(false); setServerFehler(""); }}
              className="w-full text-[15px] underline underline-offset-[3px]"
              style={{ color: FARBE_BLAU }}
            >
              {AUSSTIEG_TEXTE.weiter}
            </button>
          </div>

          <p className="pt-1 text-center text-[13px] leading-relaxed" style={{ color: "#8A8F98" }}>
            {AUSSTIEG_TEXTE.fuss}
          </p>
        </div>
      </Karte></Seite>
    );
  }

  if (abschluss === "beendet") {
    return (
      <Seite><Karte>
        <Logo />
        <div className="text-center space-y-3 py-2">
          <Check className="h-8 w-8 mx-auto" style={{ color: "#1E9E5A" }} aria-hidden />
          <h1 className="text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>Danke für deine Offenheit</h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "#6E6E73" }}>
            Du hast das Kennenlernen beendet. Von uns kommt keine weitere Nachricht. Wenn du es dir
            anders überlegst, schreib uns gern an{" "}
            <a href="mailto:office@more.immo" className="underline underline-offset-[3px]" style={{ color: FARBE_BLAU }}>office@more.immo</a>.
          </p>
        </div>
      </Karte></Seite>
    );
  }

  /*
   * Nach dem Absenden kommt der Abschluss, auf derselben Seite und unter
   * demselben Link.
   *
   * Bis zum 08.09.2026 stand hier die Terminwahl. Sie ist in die
   * Buchungsstrecke `/kooperationsgespraech/:token` gewandert, die der
   * Bewerber erst über unsere Einladung erreicht. Der Link bleibt trotzdem
   * gültig: Wer ihn wieder öffnet und schon einen Termin hat, sieht ihn hier.
   */
  if (status === "ausgefuellt" || abschluss === "gesendet") {
    return (
      <Seite><Karte>
        <Abschlussbildschirm
          token={token || ""}
          vorname={vorname}
          antworten={antworten}
          bereitsFrueher={status === "ausgefuellt"}
          onKeinInteresse={() => { setAusstiegOffen(true); setServerFehler(""); }}
        />
      </Karte></Seite>
    );
  }

  /*
   * Die selbst gewählte Pause.
   *
   * Vier Möglichkeiten, und keine davon ist eine Absage. Erst die Wahl geht an
   * den Server, dann wechselt der Bildschirm. Vorher steht hier bewusst kein
   * Versprechen, das noch niemand eingelöst hat.
   */
  if (abschluss === "pausiert") {
    if (!pauseWahl) {
      return (
        <Seite><Karte>
          <Logo />
          <div className="space-y-3 py-1">
            <Eyebrow>Abschluss</Eyebrow>
            <h1 className="text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>
              Du willst es dir noch überlegen?
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: "#6E6E73" }}>
              Auch das ist ein sauberer Ausgang. Du entscheidest, ob und wann du wieder von uns hörst.
            </p>
            <div className="space-y-2 pt-1">
              {PAUSEN_WAHLEN.map((w) => (
                <button
                  key={w.wert}
                  type="button"
                  disabled={meldetAnServer}
                  onClick={() => {
                    void (async () => {
                      const ok = w.wert === "beenden"
                        ? await meldeAnServer("ausstieg")
                        : await meldeAnServer("pause", { wahl: w.wert });
                      if (!ok) return;
                      if (w.wert === "beenden") {
                        setAbschluss("beendet");
                        return;
                      }
                      setPauseWahl(w.wert);
                    })();
                  }}
                  className="w-full rounded-2xl border px-4 py-3 text-left text-[15px] disabled:opacity-50"
                  style={{ borderColor: "#E4E6EB", color: FARBE_DUNKEL }}
                >
                  <span className="block font-medium">{w.titel}</span>
                  {w.hinweis && (
                    <span className="block text-[13.5px] mt-0.5" style={{ color: "#8A8F98" }}>{w.hinweis}</span>
                  )}
                </button>
              ))}
            </div>
            {serverFehler && (
              <p className="text-[14px] rounded-2xl px-4 py-3" style={{ background: "#FDF0EE", color: "#B23A2B" }}>
                {serverFehler}
              </p>
            )}
            <p className="rounded-2xl px-4 py-3 text-[14px] leading-relaxed" style={{ background: "#F5F5F7", color: "#5A5F66" }}>
              <span className="font-semibold" style={{ color: FARBE_DUNKEL }}>Was in keinem Fall passiert.</span>{" "}
              Niemand ruft dich an, weil du hier pausiert hast. Eine Pause ist kein fehlendes
              Interesse, und sie wird auch nicht so gespeichert.
            </p>
            <button
              type="button"
              onClick={() => { setAbschluss("offen"); setServerFehler(""); }}
              className="w-full text-[15px] underline underline-offset-[3px]"
              style={{ color: FARBE_BLAU }}
            >
              Zurück zum Kennenlernen
            </button>
          </div>
        </Karte></Seite>
      );
    }

    const erinnerungAm = alsDatum(erinnerungsDatum(pauseWahl));
    return (
      <Seite><Karte>
        <Logo />
        <div className="text-center space-y-3 py-2">
          <Pause className="h-8 w-8 mx-auto" style={{ color: FARBE_BLAU }} aria-hidden />
          <h1 className="text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>Alles gut, wir warten</h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "#6E6E73" }}>
            {erinnerungAm
              ? `Wir erinnern dich am ${erinnerungAm}, weil du es so gewählt hast. Bis dahin kommt nichts von uns.`
              : "Wir melden uns nicht von selbst. Du entscheidest, wann es weitergeht."}{" "}
            Öffne den Link einfach wieder, dann machst du an derselben Stelle weiter. Eine Pause ist
            keine Absage, und ein Anruf kommt deswegen nicht.
          </p>
          <Link
            to={bewerberSeitePfad(token || "")}
            className="block text-[15px] underline underline-offset-[3px]"
            style={{ color: FARBE_BLAU }}
          >
            Deinen Stand ansehen
          </Link>
          <button
            type="button"
            disabled={meldetAnServer}
            onClick={() => {
              void meldeAnServer("weiter").then((ok) => {
                if (!ok) return;
                setPauseWahl(null);
                setAbschluss("offen");
              });
            }}
            className="text-[15px] underline underline-offset-[3px] disabled:opacity-50"
            style={{ color: FARBE_BLAU }}
          >
            Doch weitermachen
          </button>
          {serverFehler && (
            <p className="text-[14px] rounded-2xl px-4 py-3" style={{ background: "#FDF0EE", color: "#B23A2B" }}>
              {serverFehler}
            </p>
          )}
        </div>
      </Karte></Seite>
    );
  }

  // ── Der Bogen ──

  const fragen = fragenDerAnsicht(ansicht, antworten);
  const pflichtOffen = fragen.some((f) => !f.freiwillig && !frageBeantwortet(f, antworten));
  const alleFreiwillig = fragen.length > 0 && fragen.every((f) => f.freiwillig);
  const ablaufText = ablauf ? new Date(ablauf).toLocaleDateString("de-DE") : "";

  return (
    <Seite>
      <MotivStil />
      <Karte>
        <div className="flex items-start justify-between gap-3 mb-4">
          <img src={logo} alt="MOREImmo" className="h-[26px]" />
          <span className="text-right text-[12px] font-medium leading-tight" style={{ color: "#8A8F98" }}>
            {kapitelZeile(ansicht.kapitel)}
            <span className="block">Ansicht {ansicht.nummer} von {letzte.nummer}</span>
          </span>
        </div>

        <Balken index={index} anzahl={ansichten.length} />

        {/*
          Die Überschrift und das Motiv nebeneinander, auf dem Handy
          untereinander. Das Motiv steht dort unter der Überschrift und über
          dem Text: rechts daneben bliebe für beides zu wenig Breite.
        */}
        <div className="mt-6 mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
          <h1
            ref={titelRef}
            id={titelId}
            tabIndex={-1}
            className="text-[26px] sm:text-[31px] leading-[1.12] focus:outline-none"
            style={{ color: FARBE_DUNKEL }}
          >
            {ansicht.nummer === 1 && vorname ? `Hallo ${vorname}, ${ansicht.titel.toLowerCase()}` : ansicht.titel}
          </h1>
          <Motiv id={ansicht.motiv} />
        </div>

        {/*
          Die Absätze samt dem Satz, der je Gruppe wechselt. Wo er steht,
          entscheidet die Ansicht: als Vorsatz oben oder als Anschluss unten.
        */}
        {absaetzeFuer(ansicht, antworten).map((text, i) => (
          <p key={i} className="text-[16px] leading-[1.6] mb-3" style={{ color: "#3A3A3F" }}>{text}</p>
        ))}

        {ansicht.spalten && ansicht.spalten.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ansicht.spalten.map((s, i) => (
              <div key={s.titel} className="rounded-2xl px-4 py-3.5" style={{ background: i === 0 ? "#F0F7FF" : "#F5F5F7" }}>
                <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: i === 0 ? FARBE_BLAU : "#8A8F98" }}>
                  {s.titel}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {s.punkte.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-[15px]" style={{ color: FARBE_DUNKEL }}>
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: i === 0 ? FARBE_BLAU : "#9AA0A8" }} aria-hidden />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {ansicht.punkte && ansicht.punkte.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {ansicht.punkte.map((p) => (
              <li key={p.titel} className="rounded-2xl px-4 py-3" style={{ background: "#F5F5F7" }}>
                <p className="text-[15px] font-semibold" style={{ color: FARBE_DUNKEL }}>{p.titel}</p>
                <p className="text-[14.5px] leading-relaxed mt-0.5" style={{ color: "#5A5F66" }}>{p.text}</p>
              </li>
            ))}
          </ul>
        )}

        {/*
          Der Anschluss, der unter dem Inhalt steht. Mit Titel als eigener
          Kasten, ohne Titel als einzelner Satz. Er steht bewusst hinter den
          Spalten und der Aufzählung: Er ordnet ein, was darüber steht.
        */}
        {(() => {
          const unten = anschlussUnten(ansicht, antworten);
          if (!unten) return null;
          if (!unten.titel) {
            return (
              <p className="mt-4 text-[16px] leading-[1.6]" style={{ color: "#3A3A3F" }}>{unten.text}</p>
            );
          }
          return (
            <div className="mt-4 rounded-2xl px-4 py-3" style={{ background: "#F5F5F7" }}>
              <p className="text-[15px] font-semibold" style={{ color: FARBE_DUNKEL }}>{unten.titel}</p>
              <p className="text-[14.5px] leading-relaxed mt-0.5" style={{ color: "#5A5F66" }}>{unten.text}</p>
            </div>
          );
        })()}

        {ansicht.art === "ueberblick" && (
          <Ueberblick antworten={antworten} aufAnsicht={springe} />
        )}

        {ansicht.art === "abschluss" && <Abschlussvorschau antworten={antworten} />}

        {fragen.map((frage) => (
          <FrageBlock
            key={frage.key}
            frage={frage}
            antworten={antworten}
            onSetze={setzeAntwort}
            onToggle={toggleMehrfach}
            onEnter={weiter}
          />
        ))}

        {/* Erst nach der Antwort, nicht davor. */}
        {rueckmeldungFaellig(ansicht, antworten) && ansicht.rueckmeldung && (
          <EinfahrKasten titel={ansicht.rueckmeldung.titel}>{ansicht.rueckmeldung.text}</EinfahrKasten>
        )}

        {ansicht.fuss && (
          <p className="mt-5 rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed" style={{ background: "#EEF5FD", color: "#0A5BB5" }}>
            {ansicht.fuss}
          </p>
        )}

        {ansicht.art === "abschluss" && (
          <>
            <Einwilligung
              id={einwilligungId}
              wert={einwilligung}
              fehlt={einwilligungFehlt}
              onAendere={(v) => { setEinwilligung(v); if (v) setEinwilligungFehlt(false); }}
            />
            {sendeFehler && (
              <p className="mt-3 text-[14px] rounded-2xl px-4 py-3" style={{ background: "#FDF0EE", color: "#B23A2B" }}>
                {sendeFehler}
              </p>
            )}
          </>
        )}

        {/* Honigtopf gegen einfache Bots. Für Menschen unsichtbar. */}
        <input
          type="text"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />

        {ansicht.nummer === 1 ? (
          <div className="mt-7 pt-5 border-t border-[#EEF0F3] space-y-4">
            {/*
              Der Nebenweg zu den Konditionen ist am 08.09.2026 entfallen.
              Er sparte dem Ungeduldigen vier Ansichten und kostete ihn genau
              das, was den Bogen trägt: wer wir sind, für wen wir arbeiten und
              womit. Wer bei der Provision einsteigt, liest sie ohne diesen
              Zusammenhang. Der Bogen wird deshalb einmal ganz durchgeklickt.
            */}
            <Hauptknopf onClick={weiter} breit>Los geht es</Hauptknopf>
          </div>
        ) : ansicht.art === "abschluss" ? (
          <div className="mt-7 pt-5 border-t border-[#EEF0F3] space-y-4">
            {/* Der wichtigste Knopf des ganzen Bogens, Punkt P6. */}
            <Hauptknopf
              onClick={absenden}
              disabled={sendet}
              ohnePfeil={sendet}
              breit
              gross
              farbe="blau"
            >
              {sendet ? "Wird gesendet …" : ABSCHLUSS_TEXTE.knopf}
            </Hauptknopf>
            <button
              type="button"
              onClick={zurueck}
              className="w-full text-[14.5px] underline underline-offset-[3px]"
              style={{ color: "#6E6E73" }}
            >
              Zurück zum Überblick
            </button>
          </div>
        ) : (
          <SchrittFuss
            onZurueck={zurueck}
            onWeiter={weiter}
            weiterErlaubt={!pflichtOffen || alleFreiwillig}
            onUeberspringen={alleFreiwillig ? weiter : undefined}
            ueberspringenText="Überspringen"
          />
        )}

        <AusstiegZeile />

        {serverFehler && (
          <p className="mt-3 text-[14px] rounded-2xl px-4 py-3" style={{ background: "#FDF0EE", color: "#B23A2B" }}>
            {serverFehler}
          </p>
        )}

        <div className="mt-5 flex flex-col items-center gap-2">
          <Fussnote>
            Zwischenstand auf diesem Gerät gespeichert
            {ablaufText ? `, der Link gilt bis zum ${ablaufText}` : ""}.
          </Fussnote>
          <Link
            to={bewerberSeitePfad(token || "")}
            className="text-[13px] underline underline-offset-[3px]"
            style={{ color: "#8A8F98" }}
          >
            Deinen Stand ansehen
          </Link>
          {ansicht.nummer > 1 && (
            <button
              type="button"
              onClick={() => setAbschluss("pausiert")}
              className="inline-flex items-center gap-1.5 text-[13px] underline underline-offset-[3px]"
              style={{ color: "#8A8F98" }}
            >
              <Pause className="h-3.5 w-3.5" aria-hidden /> Ich mache später weiter
            </button>
          )}
        </div>
      </Karte>
    </Seite>
  );
}

// ───────────────────────────── Bausteine der Seite ────────────────────────

function Seite({ children }: { children: ReactNode }) {
  return (
    <div data-lg="seite" className="lp-theme bewerber-seite min-h-screen relative">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[300px] sm:h-[460px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 70% at 50% -12%, rgba(10,110,219,.16), transparent 66%)" }}
      />
      <div className="relative px-3.5 pt-4 pb-7 sm:px-6 sm:pt-11 sm:pb-16 flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}

function Karte({ children }: { children: ReactNode }) {
  return (
    <div
      className="bewerber-karte relative w-full max-w-[640px] rounded-[20px] sm:rounded-3xl border px-5 py-6 sm:px-10 sm:pt-9 sm:pb-8"
      style={{ background: "#fff", borderColor: "#E4E6EB", boxShadow: "0 24px 70px -34px rgba(15,22,33,.28)" }}
    >
      {children}
    </div>
  );
}

function Logo() {
  return <img src={logo} alt="MOREImmo" className="h-[26px] sm:h-[34px] mx-auto mb-5 sm:mb-6" />;
}

/** Ein Segment je Ansicht. Bewusst schlicht, es sind zwanzig davon. */
function Balken({ index, anzahl }: { index: number; anzahl: number }) {
  return (
    <div
      className="flex gap-[3px]"
      role="progressbar"
      aria-label="Fortschritt im Kennenlernen"
      aria-valuemin={0}
      aria-valuemax={anzahl}
      aria-valuenow={index + 1}
    >
      {Array.from({ length: anzahl }, (_, i) => (
        <span
          key={i}
          data-testid={`segment-${i + 1}`}
          data-zustand={i <= index ? "erledigt" : "offen"}
          className="h-1.5 flex-1 rounded-full transition-all duration-300"
          style={{ background: i <= index ? FARBE_BLAU : "#E4E6EB" }}
        />
      ))}
    </div>
  );
}

function FrageBlock({
  frage,
  antworten,
  onSetze,
  onToggle,
  onEnter,
}: {
  frage: KennenlernenFrage;
  antworten: KennenlernenAntworten;
  onSetze: (key: string, wert: string | string[]) => void;
  onToggle: (key: string, wert: string) => void;
  onEnter: () => void;
}) {
  const labelId = `frage-${frage.key}`;
  const wert = antworten[frage.key];
  const text = typeof wert === "string" ? wert : "";
  const liste = Array.isArray(wert) ? wert : [];
  const hinweis = antwortHinweisFuer(frage, antworten);

  return (
    <div className="mt-6">
      <p id={labelId} className="text-[17px] font-semibold leading-snug" style={{ color: FARBE_DUNKEL }}>
        {frage.frage}
        {frage.freiwillig && (
          <span className="ml-2 align-middle text-[12px] font-medium uppercase tracking-wide" style={{ color: "#8A8F98" }}>
            freiwillig
          </span>
        )}
      </p>
      {frage.hinweis && (
        <p className="text-[14px] leading-relaxed mt-1" style={{ color: "#6E6E73" }}>{frage.hinweis}</p>
      )}

      {frage.typ === "auswahl" && frage.darstellung === "skala" && (
        <Skala frage={frage} wert={text || undefined} onWaehle={(v) => onSetze(frage.key, v)} labelId={labelId} />
      )}
      {frage.typ === "auswahl" && frage.darstellung !== "skala" && (
        <KachelEinzel frage={frage} wert={text || undefined} onWaehle={(v) => onSetze(frage.key, v)} labelId={labelId} />
      )}
      {frage.typ === "mehrfach" && (
        <KachelMehrfach frage={frage} werte={liste} onToggle={(v) => onToggle(frage.key, v)} labelId={labelId} />
      )}
      {frage.typ === "text" && (
        <Kurztext frage={frage} wert={text} onAendere={(v) => onSetze(frage.key, v)} onEnter={onEnter} labelId={labelId} />
      )}
      {frage.typ === "textarea" && (
        <Freitext frage={frage} wert={text} onAendere={(v) => onSetze(frage.key, v)} labelId={labelId} />
      )}

      {/*
        Der Kasten zur Antwort. Bei den beiden Verständnisfragen bernstein und
        ausdrücklich kein Fehler: Die Frage bleibt offen, die Antwort bleibt
        gespeichert, und im Gespräch wird sie geklärt.
      */}
      {hinweis && (
        <EinfahrKasten ton={hinweis.ton === "hinweis" ? "bernstein" : "blau"} titel={hinweis.titel}>
          {hinweis.text}
        </EinfahrKasten>
      )}
    </div>
  );
}

/**
 * Der Überblick: seine eigenen Angaben, geordnet, jede Zeile änderbar.
 *
 * Kein Dank, sondern ein Ertrag. Und keine Punktzahl.
 */
function Ueberblick({
  antworten,
  aufAnsicht,
}: {
  antworten: KennenlernenAntworten;
  aufAnsicht: (nummer: number) => void;
}) {
  const gruppen = kennenlernenUeberblick(antworten);
  if (gruppen.length === 0) {
    return (
      <p className="mt-5 rounded-2xl px-4 py-3 text-[14.5px]" style={{ background: "#F5F5F7", color: "#6E6E73" }}>
        Du hast bisher nichts angegeben. Das ist in Ordnung, wir sprechen ohnehin miteinander.
      </p>
    );
  }
  return (
    <div className="mt-5 space-y-5">
      {gruppen.map((g) => (
        <div key={g.titel}>
          <Eyebrow>{g.titel}</Eyebrow>
          <ul className="mt-2.5 divide-y" style={{ borderColor: "#EEF0F3" }}>
            {g.zeilen.map((z) => (
              <li key={z.label} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px]" style={{ color: "#8A8F98" }}>{z.label}</span>
                  <span className="block text-[15px] leading-snug" style={{ color: FARBE_DUNKEL }}>{z.wert}</span>
                </span>
                <button
                  type="button"
                  onClick={() => aufAnsicht(z.ansicht)}
                  className="inline-flex shrink-0 items-center gap-1 text-[13px] underline underline-offset-[3px]"
                  style={{ color: FARBE_BLAU }}
                >
                  <PencilLine className="h-3.5 w-3.5" aria-hidden /> ändern
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Die letzte Ansicht des Bogens: der passende nächste Schritt, was wir uns
 * notiert haben, und was danach kommt.
 *
 * Eine Terminwahl steht hier seit dem 08.09.2026 nicht mehr in Aussicht. Der
 * Bogen endet mit dem Absenden; eingeladen wird, wen wir nach dem Lesen
 * einladen wollen.
 *
 * Seit dem 08.09.2026 stehen hier auch **keine Dauer und keine Gastgeberin**
 * mehr. Beide Angaben setzten voraus, dass es zu einem Gespräch kommt, und das
 * ist an dieser Stelle noch gar nicht entschieden. Wer sie las, hielt den
 * Termin für gesetzt und die spätere Absage für einen Rückzieher. Die Dauer
 * steht dort, wo sie stimmt: auf der Buchungsseite, nach der Einladung.
 */
function Abschlussvorschau({ antworten }: { antworten: KennenlernenAntworten }) {
  const schritt = naechsterSchritt(antworten);
  const text = SCHRITT_TEXTE[schritt];
  const themen = themenLabels(antworten);
  const eigene = typeof antworten.eigeneFrage === "string" ? antworten.eigeneFrage.trim() : "";

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-2xl px-5 py-4" style={{ background: "#F5F5F7" }}>
        <p className="text-[16px] font-semibold" style={{ color: FARBE_DUNKEL }}>{text.titel}</p>
        <p className="text-[14.5px] leading-relaxed mt-1" style={{ color: "#5A5F66" }}>{text.text}</p>
      </div>

      <p className="text-[15px] leading-relaxed" style={{ color: "#3A3A3F" }}>
        {ABSCHLUSS_TEXTE.vorAbsenden}
      </p>

      {(themen.length > 0 || eigene) && (
        <div>
          <Eyebrow>{ABSCHLUSS_TEXTE.notizenTitel}</Eyebrow>
          <ul className="mt-2 space-y-1.5">
            {themen.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[15px]" style={{ color: "#3A3A3F" }}>
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: FARBE_BLAU }} aria-hidden />
                <span>{t}</span>
              </li>
            ))}
            {eigene && (
              <li className="flex items-start gap-2 text-[15px]" style={{ color: "#3A3A3F" }}>
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: FARBE_BLAU }} aria-hidden />
                <span>{eigene}</span>
              </li>
            )}
          </ul>
        </div>
      )}

      <p className="flex items-start gap-2 text-[14px] leading-relaxed" style={{ color: "#6E6E73" }}>
        <ArrowDown className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
        <span>
          {ABSCHLUSS_TEXTE.nachNotizen}
        </span>
      </p>
    </div>
  );
}

// ─────────────────── Nach dem Absenden: der Abschluss ─────────────────────

/**
 * Was der Bewerber nach dem Absenden sieht, und wohin sein Link ihn später
 * wieder führt.
 *
 * ## Warum hier kein Kalender mehr steht
 *
 * Bis zum 08.09.2026 stand an dieser Stelle die Terminwahl: Wer absendete,
 * suchte sich sofort eine Zeit aus. Damit war der Termin vergeben, bevor
 * irgendjemand seine Antworten gelesen hatte. Gewollt ist das Gegenteil, also
 * nach dem Bewerberscore auszuwählen und die Besten gezielt einzuladen.
 * Eingeladen wird deshalb aus dem Bewerberprofil heraus, und der Knopf in
 * dieser Einladungsmail führt in die Buchungsstrecke
 * `BewerberKooperationsgespraech.tsx`. Dort liegt der Kalender jetzt, mit
 * demselben Token und derselben Datenbanklogik wie vorher.
 *
 * ## Zwei Zustände
 *
 *   1. **Kein Termin.** Der Regelfall. Danke, deine Angaben sind bei uns, wir
 *      melden uns. Der Wortlaut steht in `ABSCHLUSS_TEXTE`, damit ein Test ihn
 *      lesen kann.
 *   2. **Termin steht.** Wer schon gebucht hat, behält seinen Termin. Er sieht
 *      ihn hier mit Datum und Uhrzeit und kommt über einen Link in die
 *      Buchungsstrecke, wo er verschieben und absagen kann. Ohne diesen Fall
 *      liefe jeder alte Link ins Leere, der vor der Umstellung verschickt
 *      wurde.
 *
 * Ist die Migration `20260906120000_bewerber_terminbuchung.sql` nicht gelaufen
 * oder gibt es keinen Wochenplan, liefert `ladeBewerberTerminZugang` `null`.
 * Dann steht hier einfach der Abschlusstext; nichts ist kaputt.
 */
function Abschlussbildschirm({
  token,
  vorname,
  antworten,
  bereitsFrueher,
  onKeinInteresse,
}: {
  token: string;
  vorname: string;
  antworten: KennenlernenAntworten;
  bereitsFrueher: boolean;
  onKeinInteresse: () => void;
}) {
  const [zugang, setZugang] = useState<BewerberTerminZugang | null>(null);
  const [laedt, setLaedt] = useState(true);

  /*
   * Einmal nachsehen, ob schon ein Termin steht. Erst danach zeigen: Wer einen
   * hat, soll nicht zuerst „wir melden uns" lesen und dann seinen Termin.
   */
  useEffect(() => {
    let abgebrochen = false;
    void ladeBewerberTerminZugang(token).then((z) => {
      if (abgebrochen) return;
      setZugang(z);
      setLaedt(false);
    });
    return () => { abgebrochen = true; };
  }, [token]);

  const ausstiegZeile = (
    <button
      type="button"
      onClick={onKeinInteresse}
      className="mt-6 block w-full text-center text-[13px] underline underline-offset-[3px] transition-colors hover:text-[#6E6E73]"
      style={{ color: "#9AA0A8" }}
    >
      {AUSSTIEG_TEXTE.link}
    </button>
  );

  if (laedt) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#6E6E73" }} aria-label="Lädt" />
      </div>
    );
  }

  const buchung = zugang?.buchung;

  // 1) Der Termin steht schon. Bestand aus der Zeit der Selbstbuchung, und
  // seit der Umstellung der Weg für alle, die wir eingeladen haben.
  if (zugang && buchung && hatOffenenTermin(zugang)) {
    return (
      <div>
        <Logo />
        <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: FARBE_DUNKEL }}>
          <Check className="h-8 w-8 text-white" strokeWidth={2.4} aria-hidden />
        </div>
        <h1 className="text-center text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>
          Dein Termin steht
        </h1>

        <div className="mt-5 rounded-2xl px-5 py-4" style={{ background: "#F5F5F7" }}>
          <p className="flex items-start gap-2 text-[16px] font-semibold" style={{ color: FARBE_DUNKEL }}>
            <CalendarClock className="mt-0.5 h-4.5 w-4.5 shrink-0" style={{ color: FARBE_BLAU }} aria-hidden />
            <span>{terminZeile(buchung, zugang.zeitzone)}</span>
          </p>
          <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: "#5A5F66" }}>
            Mit {zugang.gastgeber.name}.
          </p>
        </div>

        {/*
          Kein Link zum Gesprächsraum. Er stand hier einmal, direkt nach dem
          Buchen und Wochen vor dem Termin, und führte in einen leeren Raum.
          Der Weg hinein ist die Mail zur richtigen Zeit.
        */}
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3.5 text-[14.5px] leading-relaxed" style={{ background: "#EEF5FD", color: "#0A5BB5" }}>
          <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Den Link zum Videoraum bekommst du per E-Mail, zusammen mit einer Kalenderdatei.
            Vorbereiten musst du nichts.
          </span>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 border-t border-[#EEF0F3] pt-5">
          <Link
            to={kooperationsPfad(token)}
            className="text-[14.5px] underline underline-offset-[3px]"
            style={{ color: FARBE_BLAU }}
          >
            Termin verschieben oder absagen
          </Link>
        </div>

        {ausstiegZeile}
      </div>
    );
  }

  // 2) Der Regelfall: abgeschickt, und jetzt sind wir am Zug.
  return (
    <div>
      <Logo />
      <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: FARBE_DUNKEL }}>
        <Check className="h-8 w-8 text-white" strokeWidth={2.4} aria-hidden />
      </div>
      <h1 className="text-center text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>
        {bereitsFrueher
          ? ABSCHLUSS_TEXTE.titelSchonFrueher
          : `${ABSCHLUSS_TEXTE.titel}${vorname ? `, ${vorname}` : ""}.`}
      </h1>

      {bereitsFrueher ? (
        <p className="mt-3 text-center text-[15.5px] leading-relaxed" style={{ color: "#6E6E73" }}>
          {ABSCHLUSS_TEXTE.schonFrueher}
        </p>
      ) : (
        <>
          <p className="mt-3 text-center text-[15.5px] leading-relaxed" style={{ color: "#6E6E73" }}>
            {ABSCHLUSS_TEXTE.text}
          </p>
          {/*
            Dauer und Gastgeberin standen hier bis zum 08.09.2026. Sie sind
            weg, aus demselben Grund wie auf der letzten Ansicht des Bogens:
            Zu diesem Zeitpunkt ist nicht entschieden, ob es zu einem Gespräch
            kommt. Der Bewerber erfährt beides mit der Einladung.
          */}
          <p className="mt-3 text-center text-[15px] leading-relaxed" style={{ color: "#6E6E73" }}>
            {ABSCHLUSS_TEXTE.weiter}
          </p>
        </>
      )}

      {/*
        Nach dem Absenden geht die Zusammenfassung per Mail hinaus
        (`submit-bewerber-formular`), später die Einladung zum Gespräch.
        Beide kommen von unserem Absender und sollen nicht im Spam liegen.
      */}
      <SpamHinweis className="mt-5" />

      <p className="mt-4 text-center text-[14px] leading-relaxed" style={{ color: "#8A8F98" }}>
        {ABSCHLUSS_TEXTE.fuss}
      </p>

      {ausstiegZeile}
    </div>
  );
}

function Einwilligung({
  id,
  wert,
  fehlt,
  onAendere,
}: {
  id: string;
  wert: boolean;
  fehlt: boolean;
  onAendere: (wert: boolean) => void;
}) {
  return (
    <div className="mt-6">
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 px-4 py-3.5 transition-colors"
        style={{ borderColor: fehlt ? "#D4483A" : wert ? FARBE_BLAU : "#E4E6EB", background: wert ? "#F0F7FF" : "#fff" }}
      >
        <input
          id={id}
          type="checkbox"
          checked={wert}
          onChange={(e) => onAendere(e.target.checked)}
          className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#0A6EDB]"
        />
        <span className="text-[13.5px] leading-relaxed" style={{ color: "#5A5F66" }}>{EINWILLIGUNG_TEXT}</span>
      </label>
      {fehlt && (
        <p className="mt-2 text-[13.5px]" style={{ color: "#B23A2B" }}>
          Ohne dein Einverständnis dürfen wir die Angaben nicht speichern.
        </p>
      )}
    </div>
  );
}
