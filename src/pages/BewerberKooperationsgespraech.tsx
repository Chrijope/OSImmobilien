import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
} from "lucide-react";
import {
  GESPRAECH_BESCHREIBUNG,
  GESPRAECH_NAME_KLEIN,
  WOCHENTAGE_KURZ_MO,
  monatName,
  monatPlus,
  monatVon,
  monatsRaster,
  tagesZahl,
} from "@/lib/bewerberKennenlernen";
import {
  beschriftungDatumLang,
  beschriftungZeitKnopf,
  gruppiereNachTag,
  tagInZone,
  uhrzeitInZone,
  vorausschauGrenzen,
} from "@/lib/buchungAuswahl";
import {
  deuteBewerberTerminFehler,
  hatOffenenTermin,
  terminZeile,
  type BewerberTerminZugang,
} from "@/lib/bewerberTermin";
import {
  bucheBewerberTermin,
  ladeBewerberFreieZeiten,
  ladeBewerberTerminZugang,
  sageBewerberTerminAb,
  verschiebeBewerberTermin,
} from "@/lib/bewerberTerminStore";
import { confirmDialog } from "@/lib/confirm";
import {
  FARBE_BLAU,
  FARBE_DUNKEL,
  Hauptknopf,
} from "@/components/bewerberformular/FragebogenBausteine";
import { Motiv, MotivStil } from "@/components/bewerberformular/KennenlernenMotive";
import logo from "@/assets/moreimmo-logo.png";
// Liquid Glass fuer die Bewerberseiten (Huelle `.bewerber-seite`, Karte `.bewerber-karte`).
import "@/styles/lp-theme-liquid.css";

/**
 * Die Buchungsstrecke des persönlichen Gesprächs, unter `/kooperationsgespraech/:token`.
 *
 * ## Warum es diese Seite gibt
 *
 * Der Bewerber hat sich seinen Termin bis zum 08.09.2026 am Ende des
 * Kennenlernbogens selbst gebucht. Seither laden wir aus dem Bewerberprofil
 * heraus gezielt ein, und der Knopf in dieser Einladungsmail führt hierher.
 * Der Bogen endet ohne Terminwahl; dies ist die einzige Stelle, an der noch
 * gebucht wird.
 *
 * ## Erst eine Startseite, dann der Kalender
 *
 * Wer aus einer Mail kommt, landet sonst unvermittelt in einem Monatsraster
 * und weiß nicht, worauf er sich einlässt. Deshalb ein einziger ruhiger
 * Bildschirm davor: worum es geht, wie lange es dauert, was ihn erwartet.
 * Genau ein Bildschirm, nicht mehr; die Einladung hat er schon gelesen.
 *
 * ## Kein zweiter Buchungsmechanismus
 *
 * Das Token ist dasselbe wie beim Kennenlernen. Gelesen wird über
 * `bewerber_termin_zugang`, gebucht über `bewerber_termin_buchen`, verschoben
 * und abgesagt über die Geschwister davon, alles über `bewerberTerminStore`.
 * Diese Seite stellt dar und rechnet nichts nach.
 *
 * ## Der zweite Besuch
 *
 * Öffnet er den Link noch einmal und hat schon gebucht, sieht er seinen Termin
 * und kann ihn verschieben oder absagen. Er bucht nicht versehentlich ein
 * zweites Mal, das lehnt die Datenbank ohnehin ab, aber er soll es gar nicht
 * erst versuchen müssen.
 *
 * ## Ohne die Migration
 *
 * Ist `20260906120000_bewerber_terminbuchung.sql` in Supabase nicht gelaufen
 * oder fehlt ein Wochenplan im Buchungskalender, gibt `ladeBewerberTerminZugang`
 * `null` zurück. Die Seite stürzt dann nicht ab, sondern sagt, dass man auf die
 * Mail antworten möge. Dieselbe Entscheidung wie im Kennenlernbogen.
 */

type Ansicht = "start" | "kalender";

export default function BewerberKooperationsgespraech() {
  const { token = "" } = useParams<{ token: string }>();

  const [zugang, setZugang] = useState<BewerberTerminZugang | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [ansicht, setAnsicht] = useState<Ansicht>("start");
  const [zeiten, setZeiten] = useState<string[]>([]);
  const [laedtZeiten, setLaedtZeiten] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const [umbuchen, setUmbuchen] = useState(false);
  const [fehler, setFehler] = useState("");
  const [frischGebucht, setFrischGebucht] = useState(false);

  const holeZugang = useCallback(async () => {
    const z = await ladeBewerberTerminZugang(token);
    setZugang(z);
    setLaedt(false);
    return z;
  }, [token]);

  useEffect(() => { void holeZugang(); }, [holeZugang]);

  /*
   * Von wann bis wann überhaupt gebucht werden darf.
   *
   * Aus der Vorausschau der Terminart, gerechnet in der Zone der Gastgeberin.
   * Nur einmal je Zugang, sonst holte die Seite bei jedem Tastendruck neu.
   */
  const grenzen = useMemo(() => {
    if (!zugang) return null;
    return vorausschauGrenzen(new Date(), zugang.zeitzone, zugang.vorausschauTage);
  }, [zugang]);

  const holeZeiten = useCallback(async () => {
    if (!grenzen) return;
    setLaedtZeiten(true);
    try {
      const liste = await ladeBewerberFreieZeiten({
        token,
        vonTag: grenzen.ersterTag,
        bisTag: grenzen.letzterTag,
      });
      setZeiten(liste);
    } finally {
      setLaedtZeiten(false);
    }
  }, [token, grenzen]);

  // Die freien Zeiten werden erst geholt, wenn der Kalender wirklich zu sehen
  // ist. Auf der Startseite braucht sie niemand.
  const zeigtKalender = ansicht === "kalender" || umbuchen;
  useEffect(() => { if (zeigtKalender) void holeZeiten(); }, [zeigtKalender, holeZeiten]);

  /** Ein Klick auf eine Zeit: erst die Rückfrage, dann buchen. */
  const waehle = async (startISO: string) => {
    if (arbeitet || !zugang) return;
    const tag = tagInZone(startISO, zugang.zeitzone);
    const ok = await confirmDialog({
      title: "Termin bestätigen?",
      description:
        `Möchtest du am ${beschriftungDatumLang(tag)} um ${uhrzeitInZone(startISO, zugang.zeitzone)} Uhr ` +
        `dein ${GESPRAECH_NAME_KLEIN} als Videocall vereinbaren? Du bekommst danach eine E-Mail mit dem Link ` +
        "zum Videoraum, über den du dem Gespräch beitrittst.",
      confirmText: "Termin buchen",
      cancelText: "Andere Zeit wählen",
    });
    if (!ok) return;

    setArbeitet(true);
    setFehler("");
    try {
      if (umbuchen) {
        await verschiebeBewerberTermin(token, startISO);
      } else {
        await bucheBewerberTermin(token, startISO);
      }
      setUmbuchen(false);
      setFrischGebucht(true);
      await holeZugang();
    } catch (e) {
      const gedeutet = deuteBewerberTerminFehler(e);
      setFehler(gedeutet.text);
      if (gedeutet.neuLaden) {
        const z = await holeZugang();
        if (z) await holeZeiten();
      }
    } finally {
      setArbeitet(false);
    }
  };

  const sageAb = async () => {
    const ok = await confirmDialog({
      title: "Termin absagen?",
      description:
        "Der Termin fällt weg und die Zeit wird wieder frei. Du kannst dir danach jederzeit " +
        "eine neue Zeit aussuchen, über denselben Link.",
      confirmText: "Absagen",
      cancelText: "Termin behalten",
      variant: "destructive",
    });
    if (!ok) return;
    setArbeitet(true);
    setFehler("");
    try {
      await sageBewerberTerminAb(token);
      setFrischGebucht(false);
      setAnsicht("start");
      await holeZugang();
    } catch (e) {
      setFehler(deuteBewerberTerminFehler(e).text);
      await holeZugang();
    } finally {
      setArbeitet(false);
    }
  };

  if (laedt) {
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

  /*
   * Kein Kalender: entweder kennen wir das Token nicht mehr, oder es gibt
   * gerade keine Terminart mit Wochenplan. Beides sieht für den Bewerber gleich
   * aus, und in beiden Fällen ist der Weg derselbe.
   */
  if (!zugang) {
    return (
      <Seite>
        <Karte>
          <Logo />
          <h1 className="text-center text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>
            Gerade geht das hier nicht
          </h1>
          <p className="mt-3 text-center text-[15.5px] leading-relaxed" style={{ color: "#6E6E73" }}>
            Wir können dir im Moment keine Zeiten anbieten. Antworte einfach auf unsere Mail, dann
            melden wir uns mit einem Vorschlag. Oder schreib uns an{" "}
            <a
              href="mailto:os@os-immobilien.com"
              className="underline underline-offset-[3px]"
              style={{ color: FARBE_BLAU }}
            >
              os@os-immobilien.com
            </a>
            .
          </p>
        </Karte>
      </Seite>
    );
  }

  const buchung = zugang.buchung;
  const stehtSchon = !!buchung && hatOffenenTermin(zugang) && !umbuchen;

  return (
    <Seite>
      <Karte>
        <MotivStil />
        <Logo />

        {stehtSchon && buchung ? (
          /* ── Der Termin steht: beim zweiten Öffnen, und direkt nach dem Buchen ── */
          <>
            <div
              className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full"
              style={{ background: FARBE_DUNKEL }}
            >
              <Check className="h-8 w-8 text-white" strokeWidth={2.4} aria-hidden />
            </div>
            <h1 className="text-center text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>
              {frischGebucht ? "Dein Termin steht." : "Dein Termin steht schon"}
            </h1>

            <div className="mt-5 rounded-2xl px-5 py-4" style={{ background: "#F5F5F7" }}>
              <p className="flex items-start gap-2 text-[16px] font-semibold" style={{ color: FARBE_DUNKEL }}>
                <CalendarClock className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ color: FARBE_BLAU }} aria-hidden />
                <span>{terminZeile(buchung, zugang.zeitzone)}</span>
              </p>
              <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: "#5A5F66" }}>
                Mit {zugang.gastgeber.name}.
              </p>
            </div>

            {/*
              Kein Link zum Gesprächsraum. Er führte Wochen vor dem Termin in
              einen leeren Raum. Der Weg hinein ist die Mail zur richtigen Zeit.
            */}
            <div
              className="mt-4 flex items-start gap-2.5 rounded-2xl px-4 py-3.5 text-[14.5px] leading-relaxed"
              style={{ background: "#EEF5FD", color: "#156949" }}
            >
              <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Den Link zum Videoraum bekommst du per E-Mail, zusammen mit einer Kalenderdatei.
                Vorbereiten musst du nichts.
              </span>
            </div>

            {fehler && <Fehler text={fehler} />}

            <div className="mt-6 flex flex-col items-center gap-3 border-t border-[#EEF0F3] pt-5">
              <button
                type="button"
                onClick={() => { setUmbuchen(true); setFehler(""); }}
                disabled={arbeitet}
                className="text-[14.5px] underline underline-offset-[3px] disabled:opacity-50"
                style={{ color: FARBE_BLAU }}
              >
                Termin verschieben
              </button>
              <button
                type="button"
                onClick={sageAb}
                disabled={arbeitet}
                className="text-[14px] underline underline-offset-[3px] disabled:opacity-50"
                style={{ color: "#6E6E73" }}
              >
                Termin absagen
              </button>
            </div>

            <p className="mt-5 text-center text-[13px] leading-relaxed" style={{ color: "#8A8F98" }}>
              Diesen Link kannst du dir aufheben. Er führt dich immer wieder hierher.
            </p>
          </>
        ) : ansicht === "start" && !umbuchen ? (
          /* ── Die Startseite, ein Bildschirm ── */
          <Startansicht
            gastgeber={zugang.gastgeber.name}
            dauerMinuten={zugang.dauerMinuten}
            buchbar={zugang.buchbar}
            onWeiter={() => { setAnsicht("kalender"); setFehler(""); }}
          />
        ) : (
          /* ── Der Kalender ── */
          <>
            <div className="flex flex-col items-center gap-3">
              <h1 className="text-center text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>
                {umbuchen ? "Such dir eine neue Zeit aus" : "Such dir deine Zeit aus"}
              </h1>
              <Motiv id="monat" />
            </div>
            <p className="mt-3 text-center text-[15.5px] leading-relaxed" style={{ color: "#6E6E73" }}>
              {umbuchen
                ? "Sobald du eine neue Zeit wählst, wird die alte frei."
                : `${zugang.dauerMinuten} Minuten mit ${zugang.gastgeber.name}. Alle Zeiten in deutscher Zeit.`}
            </p>

            {!zugang.buchbar ? (
              <p
                className="mt-5 rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed"
                style={{ background: "#F5F5F7", color: "#5A5F66" }}
              >
                Sobald deine Angaben aus dem Kennenlernen bei uns sind, kannst du dir hier eine Zeit
                aussuchen.
              </p>
            ) : grenzen ? (
              <Monatskalender
                zeiten={zeiten}
                zeitzone={zugang.zeitzone}
                ersterTag={grenzen.ersterTag}
                letzterTag={grenzen.letzterTag}
                laedt={laedtZeiten}
                arbeitet={arbeitet}
                onWaehle={waehle}
              />
            ) : (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#8A8F98" }} aria-label="Lädt" />
              </div>
            )}

            {fehler && <Fehler text={fehler} />}

            <button
              type="button"
              onClick={() => { setUmbuchen(false); setAnsicht("start"); setFehler(""); }}
              className="mt-5 w-full text-[14.5px] underline underline-offset-[3px]"
              style={{ color: "#6E6E73" }}
            >
              {umbuchen ? "Doch nicht verschieben" : "Zurück"}
            </button>

            <p className="mt-5 text-center text-[13px] leading-relaxed" style={{ color: "#8A8F98" }}>
              Du musst dich nicht sofort entscheiden. Der Link bleibt gültig, du kannst später
              wiederkommen.
            </p>
          </>
        )}
      </Karte>
    </Seite>
  );
}

/**
 * Die Startseite vor dem Kalender.
 *
 * Drei Angaben, mehr nicht: worum es geht, wie lange es dauert, was ihn
 * erwartet. Danach ein einziger Knopf. Die Einladung hat er schon gelesen, das
 * hier ist die Vergewisserung und keine zweite Werbung.
 *
 * Die Dauer kommt aus `bewerber_termin_zugang` und damit aus seinen eigenen
 * Antworten. Sie steht hier und nicht in der Mail, weil sie nur hier stimmt.
 */
function Startansicht({
  gastgeber,
  dauerMinuten,
  buchbar,
  onWeiter,
}: {
  gastgeber: string;
  dauerMinuten: number;
  buchbar: boolean;
  onWeiter: () => void;
}) {
  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-center text-[26px] leading-tight" style={{ color: FARBE_DUNKEL }}>
          Dein {GESPRAECH_NAME_KLEIN}
        </h1>
        <Motiv id="sprechblasen" />
      </div>

      {/*
        Hier liest der Bewerber zum zweiten Mal, was das Gespräch ist, nach der
        Einladungsmail. Deshalb ausgeschrieben und nicht nur der kurze Name:
        Wer nur „Persönliches Gespräch" liest, weiß noch nicht, worum es geht.
      */}
      <p className="mt-4 text-center text-[15.5px] leading-relaxed" style={{ color: "#6E6E73" }}>
        Ein Videocall mit {gastgeber}, {GESPRAECH_BESCHREIBUNG}.
      </p>

      <div className="mt-5 space-y-2.5">
        <Zeile icon={<Clock className="h-4 w-4" aria-hidden />}>
          <span className="font-semibold" style={{ color: FARBE_DUNKEL }}>
            {dauerMinuten} Minuten.
          </span>{" "}
          So lange ist die Zeit geblockt, länger dauert es nicht.
        </Zeile>
        <Zeile icon={<MessageSquare className="h-4 w-4" aria-hidden />}>
          <span className="font-semibold" style={{ color: FARBE_DUNKEL }}>
            Deine Fragen zuerst.
          </span>{" "}
          Was du im Kennenlernen angekreuzt hast, liegt vor uns. Damit fangen wir an.
        </Zeile>
        <Zeile icon={<CalendarClock className="h-4 w-4" aria-hidden />}>
          <span className="font-semibold" style={{ color: FARBE_DUNKEL }}>
            Nichts entschieden.
          </span>{" "}
          Du sagst danach zu oder ab, beides ist in Ordnung. Verschieben kannst du jederzeit.
        </Zeile>
      </div>

      <div className="mt-7 flex justify-center">
        <Hauptknopf onClick={onWeiter} farbe="blau" gross breit disabled={!buchbar}>
          Zeit aussuchen
        </Hauptknopf>
      </div>

      {!buchbar && (
        <p
          className="mt-4 rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed"
          style={{ background: "#F5F5F7", color: "#5A5F66" }}
        >
          Sobald deine Angaben aus dem Kennenlernen bei uns sind, kannst du dir hier eine Zeit
          aussuchen.
        </p>
      )}

      <p className="mt-5 text-center text-[13px] leading-relaxed" style={{ color: "#8A8F98" }}>
        Kamera an ist schön, muss aber nicht. Vorbereiten musst du nichts.
      </p>
    </>
  );
}

/** Eine Zeile der Startseite: Symbol links, Satz rechts. */
function Zeile({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed"
      style={{ background: "#F5F5F7", color: "#5A5F66" }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: FARBE_BLAU }}>
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Fehler({ text }: { text: string }) {
  return (
    <p
      className="mt-4 rounded-2xl px-4 py-3 text-[14px]"
      style={{ background: "#FDF0EE", color: "#B23A2B" }}
      role="alert"
    >
      {text}
    </p>
  );
}

/*
 * Rahmen, Karte und Logo.
 *
 * Bewusst hier nachgebaut und nicht aus `BewerberKennenlernen.tsx` geholt: Die
 * drei sind dort private Helfer der Seite, und an dieser Datei arbeitet gerade
 * jemand anderes am Ende des Bogens. Es sind dreißig Zeilen Rahmen, sie tragen
 * keine Logik. Wandert der Bogen später auf einen gemeinsamen Baustein, wandert
 * das hier mit.
 */
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
      className="bewerber-karte relative w-full max-w-[640px] rounded-[20px] sm:rounded-3xl border px-5 py-6 sm:px-10 sm:pt-9 sm:pb-8"
      style={{ background: "#fff", borderColor: "#E4E6EB", boxShadow: "0 24px 70px -34px rgba(15,22,33,.28)" }}
    >
      {children}
    </div>
  );
}

function Logo() {
  return <img src={logo} alt="OS Immobilien" className="h-[26px] sm:h-[34px] mx-auto mb-5 sm:mb-6" />;
}

/**
 * Der Monatskalender der Terminwahl.
 *
 * Buchbar ist ein Tag genau dann, wenn `bewerber_termin_freie_zeiten` für ihn
 * mindestens eine Zeit liefert. Damit sind Vorlauf, Puffer, Wochenplan und
 * bereits vergebene Zeiten schon berücksichtigt; diese Ansicht rechnet nichts
 * nach, sie stellt dar. Alle anderen Tage sind blass und gesperrt.
 *
 * Geblättert wird je Monat, begrenzt durch Vorlauf und Vorausschau: In einen
 * Monat ohne einen einzigen buchbaren Tag führt kein Knopf.
 */
function Monatskalender({
  zeiten,
  zeitzone,
  ersterTag,
  letzterTag,
  laedt,
  arbeitet,
  onWaehle,
}: {
  zeiten: string[];
  zeitzone: string;
  ersterTag: string;
  letzterTag: string;
  laedt: boolean;
  arbeitet: boolean;
  onWaehle: (startISO: string) => void;
}) {
  const [monat, setMonat] = useState(() => monatVon(ersterTag));
  const [gewaehlterTag, setGewaehlterTag] = useState("");

  const nachTag = useMemo(() => {
    const karte = new Map<string, string[]>();
    for (const g of gruppiereNachTag(zeiten, zeitzone)) karte.set(g.tag, g.zeiten);
    return karte;
  }, [zeiten, zeitzone]);

  const raster = useMemo(() => monatsRaster(monat), [monat]);
  const ersterMonat = monatVon(ersterTag);
  const letzterMonat = monatVon(letzterTag);
  const kannZurueck = monat > ersterMonat;
  const kannVor = monat < letzterMonat;

  const zeitenDesTages = gewaehlterTag ? nachTag.get(gewaehlterTag) ?? [] : [];
  const freieImMonat = raster.filter((k) => k.imMonat && nachTag.has(k.tag)).length;

  const blaettere = (schritt: number) => {
    setMonat((m) => {
      const neu = monatPlus(m, schritt);
      if (neu < ersterMonat || neu > letzterMonat) return m;
      return neu;
    });
    setGewaehlterTag("");
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => blaettere(-1)}
          disabled={!kannZurueck || laedt}
          aria-label="Vorheriger Monat"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
          style={{ background: "#F5F5F7", color: FARBE_DUNKEL }}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="text-[16px] font-semibold" style={{ color: FARBE_DUNKEL }} aria-live="polite">
          {monatName(monat)}
        </span>
        <button
          type="button"
          onClick={() => blaettere(1)}
          disabled={!kannVor || laedt}
          aria-label="Nächster Monat"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
          style={{ background: "#F5F5F7", color: FARBE_DUNKEL }}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div
        className="mt-4 grid grid-cols-7 gap-1 text-center text-[12px] font-semibold uppercase tracking-wide"
        style={{ color: "#9AA0A8" }}
      >
        {WOCHENTAGE_KURZ_MO.map((w) => <span key={w}>{w}</span>)}
      </div>

      {laedt ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#8A8F98" }} aria-label="Lädt" />
        </div>
      ) : (
        <div className="mt-1.5 grid grid-cols-7 gap-1">
          {raster.map((k) => {
            const buchbar = k.imMonat && nachTag.has(k.tag);
            const aktiv = k.tag === gewaehlterTag;
            return (
              <button
                key={k.tag}
                type="button"
                disabled={!buchbar}
                aria-pressed={aktiv}
                aria-label={buchbar ? `${beschriftungDatumLang(k.tag)}, Zeiten anzeigen` : undefined}
                onClick={() => setGewaehlterTag(aktiv ? "" : k.tag)}
                className="aspect-square rounded-xl border-2 text-[14px] font-medium transition-all disabled:cursor-default"
                style={
                  aktiv
                    ? { borderColor: FARBE_BLAU, background: FARBE_BLAU, color: "#fff" }
                    : buchbar
                    ? { borderColor: "#96E5C7", background: "#F0F7FF", color: "#156949" }
                    : { borderColor: "transparent", background: "transparent", color: k.imMonat ? "#C9CED6" : "#EAECEF" }
                }
              >
                {tagesZahl(k.tag)}
              </button>
            );
          })}
        </div>
      )}

      {!laedt && freieImMonat === 0 && (
        <p
          className="mt-4 rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed"
          style={{ background: "#F5F5F7", color: "#5A5F66" }}
        >
          In diesem Monat ist nichts frei.{" "}
          {kannVor ? "Sieh im nächsten Monat nach." : "Antworte einfach auf unsere Mail, dann finden wir eine Zeit."}
        </p>
      )}

      {gewaehlterTag && (
        <div className="mt-5">
          <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "#8A8F98" }}>
            {beschriftungDatumLang(gewaehlterTag)}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {zeitenDesTages.map((zeit) => (
              <button
                key={zeit}
                type="button"
                onClick={() => onWaehle(zeit)}
                disabled={arbeitet}
                aria-label={beschriftungZeitKnopf(zeit, zeitzone)}
                className="rounded-xl border-2 px-3.5 py-2 text-[15px] font-medium transition-colors hover:border-[#187F58] hover:bg-[#F0F7FF] disabled:opacity-50"
                style={{ borderColor: "#E4E6EB", color: FARBE_DUNKEL, background: "#fff" }}
              >
                {uhrzeitInZone(zeit, zeitzone)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
