import { useEffect, useId, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, CalendarDays, Check, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BEWERBER_BUCHUNGSLINK } from "../../supabase/functions/_shared/bewerber-eingangsmail";
import {
  ABMELDE_GRUND_MAX,
  ABMELDE_TOKEN_MUSTER,
} from "../../supabase/functions/_shared/bewerber-nachfass";
import { FARBE_BLAU, FARBE_DUNKEL, Hauptknopf } from "@/components/bewerberformular/FragebogenBausteine";
import logo from "@/assets/moreimmo-logo.png";
// Liquid Glass fuer die Bewerberseiten (Huelle `.bewerber-seite`, Karte `.bewerber-karte`).
import "@/styles/lp-theme-liquid.css";

/** "ungueltig": Link unbekannt. "abgelaufen": bekannt, aber ersetzt oder älter als 90 Tage. */
type SeitenStatus = "laedt" | "bereit" | "bestaetigt" | "ungueltig" | "abgelaufen";

/** Der HTTP-Status einer gescheiterten Function-Antwort, falls der Client ihn mitliefert. */
function httpStatus(err: unknown): number | undefined {
  const ctx = (err as { context?: { status?: number } } | null)?.context;
  return typeof ctx?.status === "number" ? ctx.status : undefined;
}

/**
 * Die Seite hinter „Ich habe kein Interesse mehr" aus der Nachfass-Mail.
 *
 * Öffnen ändert nichts. Mail-Scanner rufen Links vorab auf, deshalb liest die
 * Seite beim Laden nur Vorname und Status über `get_bewerber_abmeldung` und
 * schickt das Token erst mit dem Knopf an `bewerber-kein-interesse`. Ein
 * bereits verbrauchtes Token zeigt direkt die Bestätigung, keinen Fehler:
 * Wer zweimal klickt, soll nicht das Gefühl bekommen, etwas sei schiefgegangen.
 *
 * Aufbau und Bausteine wie die öffentliche Fragebogen-Seite (/bewerberfragen).
 */
export default function BewerberKeinInteresse() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<SeitenStatus>("laedt");
  const [vorname, setVorname] = useState("");
  const [grund, setGrund] = useState("");
  const [hp, setHp] = useState("");
  const [sendet, setSendet] = useState(false);
  const [sendeFehler, setSendeFehler] = useState("");
  const grundId = useId();
  const zaehlerId = useId();

  // Die Seite gehört nicht in Suchmaschinen.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    const t = (token || "").trim().toLowerCase();
    // Was nicht wie unser Token aussieht, muss gar nicht erst nachgeschlagen werden.
    if (!ABMELDE_TOKEN_MUSTER.test(t)) { setStatus("ungueltig"); return; }

    const laden = async () => {
      const { data: rpcData, error } = await supabase.rpc("get_bewerber_abmeldung", { _token: t });
      const daten = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (error || !daten) { setStatus("ungueltig"); return; }
      setVorname(daten.vorname || "");
      if (daten.status === "bestaetigt") { setStatus("bestaetigt"); return; }
      // "abgelaufen" rechnet die Datenbankfunktion selbst aus, "ersetzt"
      // heißt: ein neuerer Link ist unterwegs.
      if (daten.status !== "offen") { setStatus("abgelaufen"); return; }
      setStatus("bereit");
    };
    laden();
  }, [token]);

  const bestaetigen = async () => {
    setSendet(true);
    setSendeFehler("");
    try {
      const { data, error } = await supabase.functions.invoke("bewerber-kein-interesse", {
        body: { token: (token || "").trim().toLowerCase(), grund: grund.trim(), hp },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error);
      setStatus("bestaetigt");
    } catch (err) {
      const code = httpStatus(err);
      // Unbekannt (404), ersetzt oder abgelaufen (410): Da hilft kein
      // zweiter Versuch, sondern nur die Hinweisseite mit der Mailadresse.
      if (code === 404) { setStatus("ungueltig"); return; }
      if (code === 410) { setStatus("abgelaufen"); return; }
      console.error("[bewerber-kein-interesse] Abmelden fehlgeschlagen", err);
      setSendeFehler(
        code === 429
          ? "Von deinem Anschluss kamen gerade sehr viele Anfragen. Bitte versuche es in einer Stunde noch einmal."
          : "Das hat gerade nicht geklappt. Bitte versuche es in einem Moment noch einmal.",
      );
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

  if (status === "ungueltig" || status === "abgelaufen") {
    return (
      <Seite>
        <Karte>
          <div className="text-center space-y-3 py-4">
            <Logo />
            <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" aria-hidden />
            <h1 className="text-2xl" style={{ color: FARBE_DUNKEL }}>
              {status === "abgelaufen" ? "Dieser Link ist nicht mehr gültig" : "Dieser Link ist uns unbekannt"}
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: "#6E6E73" }}>
              Kein Problem. Wenn du keine weiteren Nachrichten von uns möchtest, schreib kurz an{" "}
              <a href="mailto:office@more.immo" className="underline underline-offset-[3px]" style={{ color: FARBE_BLAU }}>office@more.immo</a>,
              dann erledigen wir das von Hand.
            </p>
          </div>
        </Karte>
      </Seite>
    );
  }

  if (status === "bestaetigt") {
    return (
      <Seite>
        <Karte>
          <Logo />
          <div className="w-[78px] h-[78px] rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: FARBE_DUNKEL }}>
            <Check className="w-9 h-9 text-white" strokeWidth={2.6} aria-hidden />
          </div>
          <div className="text-center">
            <h1 className="text-[28px] sm:text-[30px] leading-[1.1] mb-3" style={{ color: FARBE_DUNKEL }}>
              Alles klar{vorname ? `, ${vorname}` : ""}.
            </h1>
            <p className="text-[16px] sm:text-[17px] leading-[1.55]" style={{ color: "#3A3A3F" }}>
              Wir melden uns nicht mehr. Danke, dass du dich bei uns gemeldet hast.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border px-5 py-5 text-left" style={{ borderColor: "#E4E6EB" }}>
            <p className="text-[12px] font-medium uppercase tracking-[0.12em] mb-2.5" style={{ color: FARBE_BLAU }}>Falls du es dir anders überlegst</p>
            <div className="flex gap-3 items-start text-[15px] leading-[1.5]" style={{ color: "#3A3A3F" }}>
              <CalendarDays className="w-5 h-5 shrink-0 mt-0.5" style={{ color: FARBE_DUNKEL }} aria-hidden />
              <span>
                Solltest du es dir anders überlegen, hier ist der Buchungslink: Du wählst Tag und Uhrzeit für dein{" "}
                <b className="font-semibold" style={{ color: FARBE_DUNKEL }}>Gespräch, 60 Minuten</b> selbst.
              </span>
            </div>
            <a
              href={BEWERBER_BUCHUNGSLINK}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] px-7 py-[15px] text-base font-medium border-[1.5px] transition-colors hover:bg-[#F5F5F7] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0A6EDB]/20"
              style={{ color: FARBE_DUNKEL, borderColor: "#D9DDE3", background: "#fff" }}
            >
              Gesprächstermin buchen
              <ExternalLink className="w-[18px] h-[18px]" aria-hidden />
            </a>
          </div>

          <p className="mt-5 text-center text-[13px]" style={{ color: "#6E6E73" }}>
            Du kannst diese Seite jetzt schließen.
          </p>
        </Karte>
      </Seite>
    );
  }

  // ── Die Frage ──
  return (
    <Seite>
      <Karte>
        <Logo />
        <p className="text-[12px] font-medium uppercase tracking-[0.12em]" style={{ color: FARBE_BLAU }}>Deine Bewerbung</p>
        <h1
          className="text-[28px] sm:text-[34px] leading-[1.1] mt-3.5 mb-3"
          style={{ color: FARBE_DUNKEL }}
        >
          Hallo{vorname ? ` ${vorname}` : ""}, möchtest du wirklich kein Interesse mehr?
        </h1>
        <p className="text-[16px] sm:text-[17px] leading-[1.55]" style={{ color: "#3A3A3F" }}>
          Dann melden wir uns nicht mehr bei dir. Deine Bewerbung wird bei uns als erledigt vermerkt.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); void bestaetigen(); }} noValidate>
          <label htmlFor={grundId} className="block mt-6 text-[15px] font-semibold" style={{ color: FARBE_DUNKEL }}>
            Magst du uns kurz sagen, warum?
            <span
              className="inline-block ml-2 align-middle rounded-full px-2.5 py-0.5 text-[12px] font-medium tracking-normal"
              style={{ color: FARBE_BLAU, background: "#EEF5FD" }}
            >
              freiwillig
            </span>
          </label>
          <textarea
            id={grundId}
            aria-describedby={zaehlerId}
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            placeholder="Zum Beispiel: Ich habe inzwischen etwas anderes gefunden."
            maxLength={ABMELDE_GRUND_MAX}
            rows={4}
            className="mt-2.5 w-full rounded-2xl border-2 border-[#E4E6EB] bg-white px-4 py-3.5 text-base transition-all placeholder:text-[#9AA0A8] focus:outline-none focus:border-[#0A6EDB] focus:shadow-[0_0_0_4px_rgba(10,110,219,.12)] resize-y min-h-[120px]"
            style={{ color: "#1D1D1F" }}
          />
          <p id={zaehlerId} className="text-right text-[12.5px] mt-1.5" style={{ color: "#8A8F98" }}>
            {grund.length} / {ABMELDE_GRUND_MAX}
          </p>

          {/* Honigtopf, vor Bots versteckt und für Menschen unsichtbar */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              Website
              <input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
            </label>
          </div>

          {sendeFehler && (
            <div role="alert" className="mt-4 p-4 rounded-2xl flex items-start gap-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#DC2626" }} aria-hidden />
              <p className="text-sm" style={{ color: "#B91C1C" }}>{sendeFehler}</p>
            </div>
          )}

          <div className="mt-5">
            <Hauptknopf type="submit" disabled={sendet} ohnePfeil breit>
              {sendet ? "Wird gesendet …" : "Ja, bitte nicht mehr melden"}
            </Hauptknopf>
          </div>
        </form>

        <p className="mt-5 text-center text-[13.5px] leading-[1.5]" style={{ color: "#6E6E73" }}>
          Doch lieber ein Gespräch?{" "}
          <a
            href={BEWERBER_BUCHUNGSLINK}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-[3px]"
            style={{ color: FARBE_BLAU }}
          >
            Termin buchen, 60 Minuten
          </a>
        </p>
      </Karte>
    </Seite>
  );
}

// ── Rahmen und kleine Teile, wie auf der Fragebogen-Seite ──

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
      className="bewerber-karte w-full max-w-[620px] rounded-[20px] sm:rounded-3xl border px-5 py-6 sm:px-10 sm:pt-9 sm:pb-8"
      style={{ background: "#fff", borderColor: "#E4E6EB", boxShadow: "0 24px 70px -34px rgba(15,22,33,.28)" }}
    >
      {children}
    </div>
  );
}

function Logo() {
  return <img src={logo} alt="MOREImmo" className="h-[26px] sm:h-[34px] mx-auto mb-5 sm:mb-6" />;
}
