import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import "./festtagskarte.css";
import { useUser } from "@/contexts/UserContext";
import { useVideoraumOptional } from "@/contexts/VideoraumContext";
import { supabase } from "@/integrations/supabase/client";
import { isTestAccount } from "@/lib/dbStoreHelper";
import {
  festtagAm,
  gesehenSchluessel,
  kartenTexte,
  tonFuerRolle,
  type Anlass,
  type Empfaenger,
  type Festtag,
  type KartenTexte,
  type Motiv,
} from "@/lib/festtagskarten";
import { spracheAusMeta } from "@/lib/kundenSprache";
import { rollenLabel } from "@/lib/rollenLabel";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import { istVorfuehrmodusAktiv } from "@/lib/vorfuehrmodus";
import { bewegtNicht, Vorderseite } from "./FesttagsMotive";

/**
 * Postkarte zu Weihnachten, Silvester und Geburtstag (siehe `lib/festtagskarten.ts`).
 * Erscheint beim ersten Anmelden am Festtag einmal je Anlass und Jahr.
 */
export function FesttagskarteAnzeige({ f, t, en, onSchliessen }: { f: Festtag; t: KartenTexte; en: boolean; onSchliessen: () => void }) {
  const [gedreht, setGedreht] = useState(false);
  const [rein, setRein] = useState(true);
  const [fertig, setFertig] = useState(bewegtNicht);
  const [pdfLaeuft, setPdfLaeuft] = useState(false);
  const karte = useRef<HTMLDivElement>(null);
  const zu = useRef<HTMLButtonElement>(null);
  const automatik = useRef<number>();
  // Als Ref, damit ein neues Callback des Aufrufers den Umdreh-Zeitgeber nicht neu startet.
  const schliessen = useRef(onSchliessen);
  schliessen.current = onSchliessen;

  useEffect(() => {
    zu.current?.focus();
    // Nach dem ersten Staunen dreht sich die Karte von selbst um.
    const warten = f.anlass === "silvester" ? 7600 : f.motiv === 2 ? 6500 : 5200;
    automatik.current = window.setTimeout(() => setGedreht(true), warten);
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") schliessen.current(); };
    window.addEventListener("keydown", taste);
    return () => { window.clearTimeout(automatik.current); window.removeEventListener("keydown", taste); };
  }, [f]);

  const umdrehen = () => { window.clearTimeout(automatik.current); setGedreht((g) => !g); };

  // Vorder- und Rückseite als zweiseitiges PDF, jeweils im Endzustand der Animation.
  const pdf = async () => {
    const vorne = karte.current?.querySelector<HTMLElement>(".ftk-seite:not(.ftk-rueck)");
    const hinten = karte.current?.querySelector<HTMLElement>(".ftk-rueck");
    if (!vorne || !hinten) return;
    setPdfLaeuft(true);
    setFertig(true);
    try {
      const [{ toJpeg }, { default: JsPdf }] = await Promise.all([import("html-to-image"), import("jspdf")]);
      await new Promise((r) => setTimeout(r, 1500));
      const opt = { pixelRatio: 2, quality: 0.9, style: { transform: "none", backfaceVisibility: "visible", borderRadius: "0", boxShadow: "none" } };
      const bild1 = await toJpeg(vorne, opt);
      const bild2 = await toJpeg(hinten, opt);
      const b = vorne.offsetWidth, h = vorne.offsetHeight;
      const dok = new JsPdf({ orientation: "landscape", unit: "px", format: [b, h], hotfixes: ["px_scaling"] });
      dok.addImage(bild1, "JPEG", 0, 0, b, h);
      dok.addPage([b, h], "landscape");
      dok.addImage(bild2, "JPEG", 0, 0, b, h);
      dok.save(t.dateiname);
    } catch (fehler) {
      console.error("Festtagskarte: PDF fehlgeschlagen", fehler);
      window.alert(t.pdfFehler);
    } finally {
      setPdfLaeuft(false);
    }
  };

  return createPortal(
    <div className="ftk" lang={en ? "en" : "de"}>
      <div className="ftk-schleier" onClick={onSchliessen} aria-hidden="true" />
      <div className="ftk-buehne">
        <div className="ftk-halter">
          <button ref={zu} type="button" className="ftk-zu" aria-label={t.schliessen} onClick={onSchliessen}>×</button>
          <div
            ref={karte}
            className={`ftk-karte${rein ? " rein" : ""}${gedreht ? " dreh" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={t.gruss}
            // Die Einflug-Animation hält sonst ihre Endlage fest und das Umdrehen greift nicht.
            onAnimationEnd={(e) => { if (e.target === e.currentTarget) setRein(false); }}
          >
            <Vorderseite f={f} t={t} en={en} fertig={fertig} />
            <Rueckseite t={t} />
          </div>
        </div>
        <div className="ftk-knoepfe">
          <button type="button" className="ftk-knopf" onClick={umdrehen}>{t.umdrehen}</button>
          <button type="button" className="ftk-knopf zweit" onClick={pdf} disabled={pdfLaeuft}>{pdfLaeuft ? t.pdfLaeuft : t.pdf}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Rueckseite({ t }: { t: KartenTexte }) {
  return (
    <div className="ftk-seite ftk-rueck">
      <div className="botschaft">
        <div className="augenbraue">{t.augenbraue}</div>
        <div className="gruss">{t.gruss}</div>
        <p className="brief"><strong>{t.anrede}</strong> {t.brief}</p>
        <div className="unterschrift">
          <div className="name">{t.unterschrift}</div>
          <div className="team">{t.team}</div>
        </div>
      </div>
      <div className="adresse">
        <div className="briefmarke"><div><span>OS<small>{t.briefmarke}</small></span></div></div>
        <svg className="poststempel" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#12362A" strokeWidth="2" /><circle cx="60" cy="60" r="40" fill="none" stroke="#12362A" strokeWidth="1" />
          <path id="ftk-bogen" d="M18 60 A42 42 0 0 1 102 60" fill="none" />
          <text fontFamily="FTK Outfit" fontSize="10" letterSpacing="3" fill="#12362A"><textPath href="#ftk-bogen" startOffset="50%" textAnchor="middle">MITTENWALDE</textPath></text>
          <text x="60" y="66" textAnchor="middle" fontFamily="FTK Outfit" fontSize="12" fill="#12362A">{t.poststempel}</text>
        </svg>
        <div className="zeilen"><div>{t.an[0]}</div><div className="klein">{t.an[1]}</div><div /></div>
      </div>
    </div>
  );
}

// ─── Wer bekommt welche Karte ────────────────────────────────────────────

type Geladen = Omit<Empfaenger, "ton"> & { geburtstag?: string | null };

function teileName(name: string): { vorname: string; nachname: string } {
  const teile = (name || "").trim().split(/\s+/);
  return { vorname: teile[0] ?? "", nachname: teile.slice(1).join(" ") };
}

async function empfaengerLaden(userId: string, rolle: string, rollenVariante?: string): Promise<Geladen | null> {
  if (rolle === "kunde") {
    // Wie im Kundenportal: der eigene Kontakt, auch als Person 2.
    const { data } = await supabase
      .from("kontakte")
      .select("vorname, nachname, anrede, meta")
      .or(`meta->>authUserId.eq.${userId},meta->person2->>authUserId.eq.${userId}`)
      .limit(1);
    const k = data?.[0] as { vorname: string; nachname: string; anrede: string | null; meta: any } | undefined;
    if (!k) return null;
    const p2 = k.meta?.person2?.authUserId === userId ? k.meta.person2 : null;
    return {
      sprache: spracheAusMeta(k.meta),
      vorname: String((p2 ? p2.vorname : k.vorname) ?? "").trim(),
      nachname: String((p2 ? p2.nachname : k.nachname) ?? "").trim(),
      anrede: p2 ? p2.anrede ?? null : k.anrede,
      geburtstag: p2 ? p2.geburtstag : k.meta?.geburtstag,
    };
  }
  const { data } = await supabase.from("profiles").select("name, geburtstag").eq("id", userId).maybeSingle();
  if (!data) return null;
  return { sprache: "de", ...teileName(data.name), geburtstag: data.geburtstag, rolle: rollenLabel(rolle, rollenVariante) };
}

async function schonGesehen(userId: string, schluessel: string): Promise<boolean> {
  if (isTestAccount()) return !!getUserSetting(schluessel, null);
  const { data } = await supabase.from("user_settings").select("einstellungen").eq("user_id", userId).maybeSingle();
  return !!(data?.einstellungen as Record<string, unknown> | null)?.[schluessel];
}

/**
 * Vorschau für Admin und Inhaber im Live-System, ohne etwas zu merken:
 * `?festtagskarte=weihnachten-2` (oder `silvester`, `geburtstag-1` …),
 * dazu `&als=kunde` oder `&als=kunde-en` für die Kundensicht.
 */
function vorschauAus(rolle: string, suche: string): { f: Festtag; als: string | null } | null {
  if (rolle !== "admin" && rolle !== "inhaber") return null;
  const p = new URLSearchParams(suche);
  const [anlass, nr] = (p.get("festtagskarte") ?? "").split("-");
  if (anlass !== "weihnachten" && anlass !== "silvester" && anlass !== "geburtstag") return null;
  const motiv = (anlass === "silvester" ? 1 : Math.min(3, Math.max(1, Number(nr) || 1))) as Motiv;
  const jetzt = new Date();
  return { f: { anlass: anlass as Anlass, jahr: jetzt.getFullYear(), motiv }, als: p.get("als") };
}

export function Festtagskarte() {
  const { user, authUser, loading, isLoggedIn } = useUser();
  const video = useVideoraumOptional();
  const { search } = useLocation();
  const [karte, setKarte] = useState<{ f: Festtag; t: KartenTexte; en: boolean } | null>(null);
  // Läuft ein Videogespräch oder der Vorführmodus, sieht der Kunde mit: dann später.
  const stoerend = !!video?.aktiv || istVorfuehrmodusAktiv();

  useEffect(() => {
    if (loading || !isLoggedIn || !authUser?.id) return;
    const ton = tonFuerRolle(user.role);
    if (!ton) return;
    const vorschau = vorschauAus(user.role, search);
    if (!vorschau && stoerend) return;
    let abbruch = false;
    void (async () => {
      try {
        let e: Geladen | null;
        let kartenTon = ton;
        if (vorschau?.als?.startsWith("kunde")) {
          kartenTon = "sie";
          e = { sprache: vorschau.als === "kunde-en" ? "en" : "de", vorname: "Max", nachname: "Beispiel", anrede: "Herr" };
        } else {
          e = await empfaengerLaden(authUser.id, user.role, user.rollenVariante);
        }
        if (!e || abbruch) return;
        const f = vorschau?.f ?? festtagAm(new Date(), e.geburtstag);
        if (!f) return;
        if (!vorschau) {
          if (await schonGesehen(authUser.id, gesehenSchluessel(f))) return;
          if (abbruch) return;
          // Gleich beim Zeigen merken, damit ein Neuladen die Karte nicht wiederholt.
          setUserSetting(gesehenSchluessel(f), new Date().toISOString());
        }
        const empfaenger: Empfaenger = { ...e, ton: kartenTon };
        setKarte({ f, t: kartenTexte(f, empfaenger), en: empfaenger.sprache === "en" && kartenTon === "sie" });
      } catch (fehler) {
        // Eine Grußkarte darf nie die Anmeldung stören.
        console.error("Festtagskarte:", fehler);
      }
    })();
    return () => { abbruch = true; };
  }, [loading, isLoggedIn, authUser?.id, user.role, user.rollenVariante, search, stoerend]);

  if (!karte) return null;
  return <FesttagskarteAnzeige f={karte.f} t={karte.t} en={karte.en} onSchliessen={() => setKarte(null)} />;
}
