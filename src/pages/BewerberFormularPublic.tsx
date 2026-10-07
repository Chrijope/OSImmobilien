import { useState, useEffect, useRef, useId, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Check,
  Clock,
  ExternalLink,
  ListChecks,
  Loader2,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  EINWILLIGUNG_TEXT,
  EINWILLIGUNG_VERSION,
  FORMULAR_BLOECKE,
  FORMULAR_TELEFON_LABEL,
  antwortenZumSenden,
  frageBeantwortet,
  sichtbareFragen,
  wunschzeitText,
  type FormularAntworten,
  type FormularFrage,
} from "@/lib/bewerberFormular";
import {
  ladeFragebogenEntwurf,
  loescheFragebogenEntwurf,
  speichereFragebogenEntwurf,
} from "@/lib/bewerberFormularEntwurf";
import { HR_ANSPRECHPARTNERIN } from "@/lib/bewerberKontaktversuch";
import { HR_ROLLENBEZEICHNUNG } from "../../supabase/functions/_shared/hr-ansprechpartner";
import { BEWERBER_BUCHUNGSLINK } from "../../supabase/functions/_shared/bewerber-eingangsmail";
import {
  Eyebrow,
  FARBE_BLAU,
  FARBE_DUNKEL,
  Fortschritt,
  Freitext,
  Fussnote,
  Hauptknopf,
  KachelEinzel,
  KachelMehrfach,
  Kaestchen,
  Kurztext,
  SchrittFuss,
  Skala,
} from "@/components/bewerberformular/FragebogenBausteine";
import logo from "@/assets/moreimmo-logo.png";
import { ersterVorname } from "@/lib/kennenlerntermin";
// Liquid Glass fuer die Bewerberseiten (Huelle `.bewerber-seite`, Karte `.bewerber-karte`).
import "@/styles/lp-theme-liquid.css";

type SeitenStatus = "laedt" | "bereit" | "abgelaufen" | "ausgefuellt" | "fehler";

/** Position -1 ist die Startseite, 0 bis n-1 die Fragen, n der Abschluss mit Telefon und Einwilligung. */
const START = -1;
const ABSCHLUSS_KEY = "abschluss";

/** So lange bleibt die gewählte Kachel sichtbar, bevor es zur nächsten Frage geht. */
const BLAETTER_VERZOEGERUNG_MS = 350;

/**
 * Der Vorab-Fragebogen, den der Bewerber über den Link aus seiner Eingangsmail
 * öffnet, als Wizard: eine Frage je Schritt, Fortschrittsbalken, Zurück und
 * Weiter, Zwischenstand auf dem Gerät, Abschluss mit Anruf und Terminbuchung.
 *
 * Inhalt und Speicherweg sind unverändert: Die Fragen kommen wörtlich aus dem
 * Katalog, das Antwortobjekt hat dieselben Schlüssel und Typen wie zuvor, und
 * gesendet wird an dieselbe Function `submit-bewerber-formular`.
 *
 * Der Kopf der Startseite erklärt den Nutzen aus SEINER Sicht. "Damit unsere
 * HR-Managerin vorbereitet ist" wäre unser Nutzen und interessiert ihn nicht.
 */
export default function BewerberFormularPublic() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<SeitenStatus>("laedt");
  const [vorname, setVorname] = useState("");
  const [ablauf, setAblauf] = useState("");
  const [antworten, setAntworten] = useState<FormularAntworten>({});
  const [telefon, setTelefon] = useState("");
  const [einwilligung, setEinwilligung] = useState(false);
  const [einwilligungFehlt, setEinwilligungFehlt] = useState(false);
  const [hp, setHp] = useState("");
  const [position, setPosition] = useState(START);
  const [sendet, setSendet] = useState(false);
  const [sendeFehler, setSendeFehler] = useState("");
  const [fertig, setFertig] = useState(false);
  const blaetterTimer = useRef<number | null>(null);
  const titelRef = useRef<HTMLHeadingElement>(null);
  const titelId = useId();
  const einwilligungId = useId();

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

    const laden = async () => {
      const { data: rpcData, error } = await supabase.rpc("get_bewerber_formular", { _token: token });
      const daten = Array.isArray(rpcData) ? rpcData[0] : rpcData;

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

      // Die Telefonnummer liefert die Datenbankfunktion erst seit der
      // Migration 20260902120000. Fehlt sie noch, bleibt das Feld leer und der
      // Bewerber tippt seine Nummer wie bisher selbst ein.
      const vorbelegt = (daten as { telefon?: string | null }).telefon;
      if (typeof vorbelegt === "string" && vorbelegt.trim()) setTelefon(vorbelegt.trim());

      const entwurf = ladeFragebogenEntwurf(token);
      if (entwurf) {
        setAntworten(entwurf.antworten);
        if (entwurf.telefon.trim()) setTelefon(entwurf.telefon);
        const fragen = sichtbareFragen(entwurf.antworten);
        if (entwurf.frageKey === ABSCHLUSS_KEY) {
          setPosition(fragen.length);
        } else if (entwurf.frageKey) {
          const index = fragen.findIndex((f) => f.key === entwurf.frageKey);
          setPosition(index >= 0 ? index : START);
        }
      }
      setStatus("bereit");
    };

    laden();
  }, [token]);

  const fragen = sichtbareFragen(antworten);
  // Ändert sich Frage 4, kann die Liste kürzer werden. Die Position bleibt gültig.
  const pos = Math.min(position, fragen.length);
  const aktuelleFrage: FormularFrage | undefined = pos >= 0 && pos < fragen.length ? fragen[pos] : undefined;
  const imAbschluss = pos === fragen.length;

  // Ist die Liste kürzer geworden, den Zustand nachziehen, damit Zurück nicht
  // von einer Position hinter dem Abschluss aus rechnet.
  useEffect(() => {
    if (position > fragen.length) setPosition(fragen.length);
  }, [position, fragen.length]);

  // Zwischenstand sichern, solange nicht abgesendet ist. Ein unberührter
  // Fragebogen auf der Startseite wird nicht gespeichert.
  useEffect(() => {
    if (status !== "bereit" || fertig || !token) return;
    if (pos === START && Object.keys(antworten).length === 0) return;
    speichereFragebogenEntwurf(token, {
      frageKey: imAbschluss ? ABSCHLUSS_KEY : aktuelleFrage?.key ?? null,
      antworten,
      telefon,
    });
  }, [status, fertig, token, pos, imAbschluss, aktuelleFrage?.key, antworten, telefon]);

  // Beim Schrittwechsel nach oben und den Fokus auf die Frage setzen, damit
  // Tastatur und Vorlesehilfe dort weitermachen, wo der Bewerber hinschaut.
  useEffect(() => {
    if (status !== "bereit") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    titelRef.current?.focus({ preventScroll: true });
  }, [status, pos]);

  useEffect(() => () => { if (blaetterTimer.current) window.clearTimeout(blaetterTimer.current); }, []);

  const stoppeBlaettern = () => {
    if (blaetterTimer.current) {
      window.clearTimeout(blaetterTimer.current);
      blaetterTimer.current = null;
    }
  };

  const weiter = () => {
    stoppeBlaettern();
    setPosition(Math.min(pos + 1, fragen.length));
  };

  const zurueck = () => {
    stoppeBlaettern();
    setPosition(Math.max(START, pos - 1));
  };

  const setzeAntwort = (key: string, wert: string | string[]) =>
    setAntworten((a) => ({ ...a, [key]: wert }));

  /** Einzelauswahl: Die Wahl bleibt kurz sichtbar, dann geht es von selbst weiter. */
  const waehleEinzel = (key: string, wert: string) => {
    setzeAntwort(key, wert);
    stoppeBlaettern();
    blaetterTimer.current = window.setTimeout(() => {
      blaetterTimer.current = null;
      setPosition((p) => p + 1);
    }, BLAETTER_VERZOEGERUNG_MS);
  };

  const toggleMehrfach = (key: string, wert: string) =>
    setAntworten((a) => {
      const bisher = Array.isArray(a[key]) ? (a[key] as string[]) : [];
      return {
        ...a,
        [key]: bisher.includes(wert) ? bisher.filter((v) => v !== wert) : [...bisher, wert],
      };
    });

  /** Nur bei den freiwilligen Freitexten: Antwort verwerfen und weiter. */
  const ueberspringen = (key: string) => {
    setAntworten((a) => {
      const rest = { ...a };
      delete rest[key];
      return rest;
    });
    weiter();
  };

  const absenden = async () => {
    if (!einwilligung) {
      setEinwilligungFehlt(true);
      return;
    }
    setSendet(true);
    setSendeFehler("");
    try {
      const { data, error } = await supabase.functions.invoke("submit-bewerber-formular", {
        body: {
          token,
          antworten: antwortenZumSenden(antworten),
          telefon: telefon.trim(),
          einwilligung: true,
          einwilligungVersion: EINWILLIGUNG_VERSION,
          hp,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
      // Erst jetzt darf der Zwischenspeicher weg: Die Antworten sind in der
      // Datenbank und haben auf einem geteilten Gerät nichts mehr verloren.
      if (token) loescheFragebogenEntwurf(token);
      setFertig(true);
    } catch (err) {
      console.error("[bewerberformular] Absenden fehlgeschlagen", err);
      setSendeFehler("Bitte versuche es in einem Moment noch einmal. Deine Antworten bleiben auf diesem Gerät gespeichert.");
    } finally {
      setSendet(false);
    }
  };

  if (status === "laedt") {
    return (
      <Seite>
        <Karte>
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#6E6E73" }} aria-label="Lädt" />
          </div>
        </Karte>
      </Seite>
    );
  }

  if (status === "fehler" || status === "abgelaufen") {
    return (
      <Seite>
        <Karte>
          <div className="text-center space-y-3 py-4">
            <Logo />
            <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" aria-hidden />
            <h1 className="text-2xl" style={{ color: FARBE_DUNKEL }}>
              {status === "abgelaufen" ? "Dieser Link ist abgelaufen" : "Dieser Link ist uns unbekannt"}
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: "#6E6E73" }}>
              Kein Problem. Melde dich kurz unter{" "}
              <a href="mailto:os@os-immobilien.com" className="underline underline-offset-[3px]" style={{ color: FARBE_BLAU }}>os@os-immobilien.com</a>,
              dann schicken wir dir einen neuen. Wir rufen dich ohnehin an, der Fragebogen ist freiwillig.
            </p>
          </div>
        </Karte>
      </Seite>
    );
  }

  if (status === "ausgefuellt" || fertig) {
    return (
      <Seite>
        <Karte>
          <DankeSeite
            vorname={vorname}
            wunschzeit={fertig ? wunschzeitText(antworten) : ""}
            bereitsFrueher={status === "ausgefuellt"}
          />
        </Karte>
      </Seite>
    );
  }

  // ── Startseite ──
  if (pos === START) {
    const ablaufText = ablauf ? new Date(ablauf).toLocaleDateString("de-DE") : "";
    return (
      <Seite>
        <Karte>
          <Logo />
          <Eyebrow>Dein Vorab-Fragebogen</Eyebrow>
          <h1
            ref={titelRef}
            tabIndex={-1}
            className="text-[28px] sm:text-[34px] leading-[1.1] mt-3.5 mb-3 focus:outline-none"
            style={{ color: FARBE_DUNKEL }}
          >
            Hallo{vorname ? ` ${vorname}` : ""}, schön, dass du da bist.
          </h1>
          <p className="text-[16px] sm:text-[17px] leading-[1.55]" style={{ color: "#3A3A3F" }}>
            Bevor wir telefonieren, würden wir dich gerne ein bisschen kennenlernen.
            Kurze Fragen, das meiste zum Antippen, eine Frage pro Seite.
          </p>

          <div className="mt-5 mb-4 rounded-2xl px-5 py-4" style={{ background: "#F5F5F7" }}>
            <p className="text-sm font-semibold mb-2" style={{ color: FARBE_DUNKEL }}>Was du davon hast</p>
            <ul className="space-y-2">
              {[
                "Wir verbringen unser Gespräch nicht damit, deinen Lebenslauf abzufragen, sondern reden über das, was dich wirklich betrifft.",
                "Du bekommst schneller eine ehrliche Einschätzung, ob eine Zusammenarbeit für beide Seiten passt.",
                "Wir rufen dann an, wenn es dir passt, und nicht fünfmal daneben.",
              ].map((satz) => (
                <li key={satz} className="flex gap-2.5 text-[15px] leading-[1.45]" style={{ color: "#3A3A3F" }}>
                  <Check className="w-[18px] h-[18px] shrink-0 mt-0.5" style={{ color: FARBE_BLAU }} strokeWidth={2.2} aria-hidden />
                  <span>{satz}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Chip icon={<ListChecks className="w-3.5 h-3.5" aria-hidden />}>{fragen.length} Fragen</Chip>
            <Chip icon={<Clock className="w-3.5 h-3.5" aria-hidden />}>etwa 3 Minuten</Chip>
            {ablaufText && <Chip icon={<CalendarDays className="w-3.5 h-3.5" aria-hidden />}>Link gilt bis {ablaufText}</Chip>}
          </div>

          <p className="text-[13px] leading-[1.5]" style={{ color: "#6E6E73" }}>
            Alle Angaben sind freiwillig. Es gibt keine falschen Antworten und nichts wird
            automatisch aussortiert. Am Ende schaut ein Mensch drauf.{" "}
            <a href="/datenschutz" target="_blank" rel="noreferrer" className="underline underline-offset-[3px]" style={{ color: FARBE_BLAU }}>
              Datenschutzerklärung
            </a>
          </p>

          <div className="mt-6">
            <Hauptknopf onClick={weiter} breit>Los geht's</Hauptknopf>
          </div>
          <Fussnote icon={<ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#1E9E5A" }} aria-hidden />}>
            Deine Antworten werden auf diesem Gerät zwischengespeichert. Du kannst jederzeit
            unterbrechen und über den Link aus der Mail weitermachen.
          </Fussnote>
        </Karte>
      </Seite>
    );
  }

  // ── Abschluss: Telefonnummer und Einwilligung ──
  if (imAbschluss) {
    const standard = fragen.filter((f) => !f.nurWenn).length;
    const zusatz = fragen.length - standard;
    const beantwortet = fragen.filter((f) => frageBeantwortet(f, antworten)).length;
    const uebersprungen = fragen.length - beantwortet;
    const wunschzeit = wunschzeitText(antworten);

    return (
      <Seite>
        <Karte>
          <SchrittKopf rechts={<span className="font-semibold" style={{ color: FARBE_DUNKEL }}>Fast geschafft</span>} />
          <Fortschritt fragen={fragen} index={fragen.length} fertig />
          <div className="mt-5"><Eyebrow>{FORMULAR_BLOECKE.formales}</Eyebrow></div>
          <h1
            id={titelId}
            ref={titelRef}
            tabIndex={-1}
            className="mt-3.5 mb-2 focus:outline-none"
            style={{ color: FARBE_DUNKEL, fontSize: "clamp(23px, 3vw, 26px)", lineHeight: 1.2 }}
          >
            {FORMULAR_TELEFON_LABEL}
          </h1>
          <p className="text-[14.5px] leading-[1.5]" style={{ color: "#6E6E73" }}>
            Damit wir dich zu deiner Wunschzeit erreichen.
            {wunschzeit ? ` ${wunschzeit.charAt(0).toUpperCase()}${wunschzeit.slice(1)} hast du angegeben.` : ""}
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); absenden(); }}
            noValidate
          >
            <label className="relative block mt-3.5">
              <span className="sr-only">Telefonnummer</span>
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: "#6E6E73" }} aria-hidden />
              <input
                type="tel"
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                placeholder="Deine Telefonnummer"
                maxLength={50}
                autoComplete="tel"
                className="w-full rounded-2xl border-2 border-[#E4E6EB] bg-white pl-11 pr-4 py-3.5 text-base transition-all placeholder:text-[#9AA0A8] focus:outline-none focus:border-[#187F58] focus:shadow-[0_0_0_4px_rgba(24,127,88,.12)]"
                style={{ color: "#1D1D1F" }}
              />
            </label>

            {/* Honigtopf, vor Bots versteckt und für Menschen unsichtbar */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label>
                Website
                <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
              </label>
            </div>

            <div
              className="mt-5 flex w-full gap-3 items-start rounded-2xl px-4 py-3.5 text-[13.5px] leading-[1.5]"
              style={{
                background: "#F5F5F7",
                color: "#4B5057",
                boxShadow: einwilligungFehlt ? "0 0 0 2px #E5484D inset" : undefined,
              }}
            >
              <input
                id={einwilligungId}
                type="checkbox"
                checked={einwilligung}
                onChange={(e) => { setEinwilligung(e.target.checked); setEinwilligungFehlt(false); }}
                className="peer sr-only"
              />
              <label htmlFor={einwilligungId} className="mt-0.5 cursor-pointer rounded-md peer-focus-visible:ring-4 peer-focus-visible:ring-[#187F58]/30">
                <Kaestchen aktiv={einwilligung} />
              </label>
              <span>
                <label htmlFor={einwilligungId} className="cursor-pointer">{EINWILLIGUNG_TEXT}</label>{" "}
                <a
                  href="/datenschutz"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-[3px]"
                  style={{ color: FARBE_BLAU }}
                >
                  Weitere Informationen in der Datenschutzerklärung
                </a>
                .
              </span>
            </div>
            {einwilligungFehlt && (
              <p role="alert" className="mt-2 text-sm" style={{ color: "#C62828" }}>
                Bitte bestätige noch dein Einverständnis, dann können wir deine Antworten speichern.
              </p>
            )}

            {sendeFehler && (
              <div role="alert" className="mt-5 p-4 rounded-2xl flex items-start gap-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#DC2626" }} aria-hidden />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#991B1B" }}>Deine Antworten kamen nicht an</p>
                  <p className="text-sm" style={{ color: "#B91C1C" }}>{sendeFehler}</p>
                </div>
              </div>
            )}

            <SchrittFuss
              onZurueck={zurueck}
              onWeiter={absenden}
              weiterText={sendeFehler ? "Erneut senden" : "Antworten absenden"}
              weiterErlaubt
              sendet={sendet}
            />
          </form>
          <Fussnote>
            Alle {standard} Fragen{zusatz > 0 ? ` plus ${zusatz} ${zusatz === 1 ? "Zusatzfrage" : "Zusatzfragen"}` : ""} durchgesehen,{" "}
            {beantwortet} beantwortet{uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}
          </Fussnote>
        </Karte>
      </Seite>
    );
  }

  // ── Eine Frage je Schritt ──
  const frage = aktuelleFrage as FormularFrage;
  const wert = antworten[frage.key];
  const textWert = typeof wert === "string" ? wert : "";
  const listenWert = Array.isArray(wert) ? wert : [];
  const beantwortet = frageBeantwortet(frage, antworten);
  const weiterErlaubt = !!frage.freiwillig || beantwortet;
  // Bei Mehrfachauswahl: Wie viele Zusatzfragen hängen an dieser Auswahl?
  const zusatzfragen = frage.typ === "mehrfach"
    ? fragen.filter((f) => f.nurWenn?.key === frage.key).length
    : 0;
  const hinweis = frage.typ === "auswahl" && !frage.hinweis
    ? "Eine Antwort antippen, dann geht es weiter."
    : frage.hinweis;

  return (
    <Seite>
      <Karte>
        <SchrittKopf
          rechts={
            <span className="text-[13px] font-medium" style={{ color: "#6E6E73" }}>
              Frage <b className="font-semibold" style={{ color: FARBE_DUNKEL }}>{pos + 1}</b> von {fragen.length}
            </span>
          }
        />
        <Fortschritt fragen={fragen} index={pos} />
        <div className="mt-5"><Eyebrow>{FORMULAR_BLOECKE[frage.block]}</Eyebrow></div>
        <h1
          id={titelId}
          ref={titelRef}
          tabIndex={-1}
          className="mt-3.5 mb-2 focus:outline-none"
          style={{ color: FARBE_DUNKEL, fontSize: "clamp(23px, 3vw, 26px)", lineHeight: 1.2 }}
        >
          {frage.frage}
          {frage.freiwillig && (
            <span
              className="inline-block ml-2 align-middle rounded-full px-2.5 py-0.5 text-[12px] font-medium tracking-normal"
              style={{ color: FARBE_BLAU, background: "#EEF5FD" }}
            >
              freiwillig
            </span>
          )}
        </h1>
        {hinweis && <p className="text-[14.5px] leading-[1.5]" style={{ color: "#6E6E73" }}>{hinweis}</p>}

        {frage.typ === "auswahl" && frage.darstellung === "skala" && (
          <Skala frage={frage} wert={textWert || undefined} onWaehle={(v) => waehleEinzel(frage.key, v)} labelId={titelId} />
        )}
        {frage.typ === "auswahl" && frage.darstellung !== "skala" && (
          <KachelEinzel frage={frage} wert={textWert || undefined} onWaehle={(v) => waehleEinzel(frage.key, v)} labelId={titelId} />
        )}
        {frage.typ === "mehrfach" && (
          <>
            <KachelMehrfach frage={frage} werte={listenWert} onToggle={(v) => toggleMehrfach(frage.key, v)} labelId={titelId} />
            {zusatzfragen > 0 && (
              <p className="mt-3.5 text-[13px] leading-[1.5]" style={{ color: "#6E6E73" }}>
                Zu deiner Auswahl {zusatzfragen === 1 ? "passt eine kurze Zusatzfrage" : `passen ${zusatzfragen} kurze Zusatzfragen`}.
                Der Balken zeigt sie hell an.
              </p>
            )}
          </>
        )}
        {frage.typ === "text" && (
          <Kurztext frage={frage} wert={textWert} onAendere={(v) => setzeAntwort(frage.key, v)} onEnter={weiter} labelId={titelId} />
        )}
        {frage.typ === "textarea" && (
          <Freitext frage={frage} wert={textWert} onAendere={(v) => setzeAntwort(frage.key, v)} labelId={titelId} />
        )}

        <SchrittFuss
          onZurueck={zurueck}
          onWeiter={weiter}
          weiterErlaubt={weiterErlaubt}
          onUeberspringen={frage.freiwillig ? () => ueberspringen(frage.key) : undefined}
        />
        <Fussnote>Zwischenstand auf diesem Gerät gespeichert</Fussnote>
      </Karte>
    </Seite>
  );
}

// ── Rahmen und kleine Teile ──

function Seite({ children }: { children: ReactNode }) {
  return (
    <div data-lg="seite" className="lp-theme bewerber-seite min-h-screen relative">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[300px] sm:h-[460px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 70% at 50% -12%, rgba(24,127,88,.16), transparent 66%)" }}
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
      className="bewerber-karte w-full max-w-[620px] rounded-[20px] sm:rounded-3xl border px-5 py-6 sm:px-10 sm:pt-9 sm:pb-8"
      style={{ background: "#fff", borderColor: "#E4E6EB", boxShadow: "0 24px 70px -34px rgba(15,22,33,.28)" }}
    >
      {children}
    </div>
  );
}

function Logo() {
  return <img src={logo} alt="OS Immobilien" className="h-[26px] sm:h-[34px] mx-auto mb-5 sm:mb-6" />;
}

function SchrittKopf({ rechts }: { rechts: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <img src={logo} alt="OS Immobilien" className="h-[26px]" />
      {rechts}
    </div>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium" style={{ background: "#EEF5FD", color: "#156949" }}>
      {icon}
      {children}
    </span>
  );
}

/** Die Danke-Seite nach dem Absenden, mit der HR-Managerin, dem Anruf zur Wunschzeit und dem Buchungslink. */
function DankeSeite({
  vorname,
  wunschzeit,
  bereitsFrueher,
}: {
  vorname: string;
  wunschzeit: string;
  bereitsFrueher: boolean;
}) {
  const initialen = HR_ANSPRECHPARTNERIN
    .split(/[\s-]+/)
    .map((t) => t.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hrVorname = HR_ANSPRECHPARTNERIN.split(" ")[0];

  return (
    <div>
      <Logo />
      <div className="w-[78px] h-[78px] rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: FARBE_DUNKEL }}>
        <Check className="w-9 h-9 text-white" strokeWidth={2.6} aria-hidden />
      </div>
      <div className="text-center">
        <h1 className="text-[28px] sm:text-[30px] leading-[1.1] mb-3" style={{ color: FARBE_DUNKEL }}>
          Vielen Dank{vorname ? `, ${vorname}` : ""}.
        </h1>
        <p className="text-[16px] sm:text-[17px] leading-[1.55]" style={{ color: "#3A3A3F" }}>
          {bereitsFrueher
            ? "Deine Antworten sind bereits bei uns angekommen. Wir melden uns zeitnah zurück, um alles Weitere zu besprechen und abzustimmen."
            : "Deine Antworten sind angekommen. Wir melden uns zeitnah zurück, um alles Weitere zu besprechen und abzustimmen."}
        </p>
      </div>

      <div className="mt-6 rounded-2xl border px-5 py-5 text-left" style={{ borderColor: "#E4E6EB" }}>
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] mb-2.5" style={{ color: FARBE_BLAU }}>Was als Nächstes passiert</p>
        <div className="flex items-center gap-3">
          <span
            className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
            style={{ background: `linear-gradient(135deg, ${FARBE_BLAU}, ${FARBE_DUNKEL})` }}
            aria-hidden
          >
            {initialen}
          </span>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: FARBE_DUNKEL }}>{HR_ANSPRECHPARTNERIN}</p>
            <p className="text-[13px]" style={{ color: "#6E6E73" }}>{HR_ROLLENBEZEICHNUNG}</p>
          </div>
        </div>
        <div className="h-px my-4" style={{ background: "#EEF0F3" }} />
        <div className="flex gap-3 items-start text-[15px] leading-[1.5]" style={{ color: "#3A3A3F" }}>
          <Phone className="w-5 h-5 shrink-0 mt-0.5" style={{ color: FARBE_DUNKEL }} aria-hidden />
          <span>
            {hrVorname} ruft dich an
            {wunschzeit ? (
              <>, am liebsten <b className="font-semibold" style={{ color: FARBE_DUNKEL }}>{wunschzeit}</b>, so wie du es angegeben hast.</>
            ) : (
              <>, sobald es passt.</>
            )}
          </span>
        </div>
        <div className="flex gap-3 items-start text-[15px] leading-[1.5] mt-3" style={{ color: "#3A3A3F" }}>
          <CalendarDays className="w-5 h-5 shrink-0 mt-0.5" style={{ color: FARBE_DUNKEL }} aria-hidden />
          <span>
            Du möchtest nicht warten? Dann buch dir direkt deinen{" "}
            <b className="font-semibold" style={{ color: FARBE_DUNKEL }}>Gesprächstermin, 60 Minuten</b>. Du wählst Tag und
            Uhrzeit selbst. Hast du schon gebucht, bleibt dein Termin natürlich bestehen.
          </span>
        </div>
        <a
          href={BEWERBER_BUCHUNGSLINK}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] px-7 py-[15px] text-base font-medium border-[1.5px] transition-colors hover:bg-[#F5F5F7] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#187F58]/20"
          style={{ color: FARBE_DUNKEL, borderColor: "#D9DDE3", background: "#fff" }}
        >
          Gesprächstermin buchen
          <ExternalLink className="w-[18px] h-[18px]" aria-hidden />
        </a>
      </div>

      <p className="mt-5 text-center text-[13px]" style={{ color: "#6E6E73" }}>
        Du kannst diese Seite jetzt schließen.
      </p>
    </div>
  );
}
