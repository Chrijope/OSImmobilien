import { useEffect, useRef } from "react";
import {
  User, Mail, Phone, MapPin, Check, Loader2, Euro, Ruler, Home, TrendingUp,
  Calculator, ListChecks, Building2, Minus,
} from "lucide-react";
import { Balken, FLAECHE_FELD, FLAECHE_HINWEIS, FLAECHE_KASTEN } from "@/components/videoraum/Buehne";
import { type AgendaPunkt, type GastgeberSnapshot, type VideoraumArt } from "@/lib/videoraumStore";
import { agendaFuer } from "@/lib/videoraumAgenda";
import { nurEchteBezeichnung } from "@/lib/berufsbezeichnung";
import {
  anredeFuer, istPlatzhalterName, mitWerten, texteFuerAnrede, type Anrede,
} from "@/lib/videoraumAnrede";
import { STANDARD_SPRACHE, texteFuer, type Sprache } from "@/lib/seitenSprache";
import { ANSPRECHPARTNER_KARTE_TEXTE } from "./ansprechpartnerKarteTexte";
import { agendaZurAnzeige, videoraumGastTexte, type VideoraumGastTexte } from "@/lib/videoraumGastTexte";

/**
 * Der Warteraum, den der Kunde vor dem Gespraech sieht.
 *
 * Er richtet sich nach dem Anlass, denn die Erwartung ist jedes Mal eine
 * andere. Wer zur Beratung kommt, will wissen, was auf ihn zukommt. Wer zur
 * Objektvorstellung kommt, ist schon einen Schritt weiter und will das Objekt
 * und seine Zahlen sehen. Alles andere bekommt eine ruhige, neutrale Fassung,
 * in der nur steht, mit wem er gleich spricht.
 */

// ── gemeinsame Bausteine ────────────────────────────────────────────────────

export function Karte({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] border border-white/10 ${FLAECHE_KASTEN} p-6 ${className}`}>{children}</div>
  );
}

export function KartenTitel({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{children}</div>;
}

export function EigenesBild({
  stream,
  klein = false,
  bildAus = false,
  spiegeln = true,
  className = "",
  sprache = STANDARD_SPRACHE,
}: {
  stream: MediaStream | null;
  klein?: boolean;
  bildAus?: boolean;
  /** Sprache des Hinweises „Kamera aus“, Vorgabe Deutsch. */
  sprache?: Sprache;
  /** Nur die eigene Vorschau, die Gegenstellen sehen das Bild ungespiegelt. */
  spiegeln?: boolean;
  /**
   * Zusatzklassen fuer die Hoehe, etwa `max-h-[150px]` auf dem Telefon. Das
   * Seitenverhaeltnis gibt weiterhin die Breite vor, eine Deckelung
   * beschneidet das Bild nur, sie verzerrt es nicht.
   */
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => { /* der Nutzer tippt gleich ohnehin */ });
  }, [stream]);

  return (
    <div className={`relative overflow-hidden rounded-[14px] bg-gradient-to-br from-[#22303f] to-[#16202c] ${klein ? "aspect-[4/3]" : "aspect-[16/10]"} ${className}`}>
      {stream && !bildAus ? (
        <video ref={ref} autoPlay playsInline muted className={`h-full w-full object-cover ${spiegeln ? "-scale-x-100" : ""}`} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <User className="h-10 w-10 text-white/15" />
          {bildAus && <span className="text-[11px] text-white/30">{videoraumGastTexte(sprache).warteraum.kameraAus}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Waehlbare Fassung einer Telefonnummer fuer `tel:`.
 *
 * Leerzeichen, Schraegstriche, Klammern und Bindestriche stoeren beim Waehlen,
 * also fallen sie weg. Ein fuehrendes Plus bleibt. Angezeigt wird weiterhin die
 * Nummer so, wie sie eingetragen wurde, und aus einer fuehrenden 0 wird
 * bewusst kein +49: Wie die Nummer gemeint ist, entscheidet die Eingabe.
 */
function waehlbareNummer(nummer: string): string {
  const roh = nummer.trim();
  return (roh.startsWith("+") ? "+" : "") + roh.replace(/\D/g, "");
}

export function AnsprechpartnerKarte({
  gastgeber,
  gross = false,
  anrede = "du",
  sprache = STANDARD_SPRACHE,
}: {
  gastgeber: GastgeberSnapshot;
  gross?: boolean;
  /**
   * Das ganze Projekt spricht per Du, auch diese Karte, die ausserhalb des
   * Videoraums auf den Buchungsseiten steht und dort einem Kunden gezeigt wird.
   */
  anrede?: Anrede;
  /**
   * Sprache der festen Beschriftungen (Kundensprache, Etappe 3), Vorgabe
   * Deutsch. Der Name des Ansprechpartners bleibt, wie er gepflegt ist.
   */
  sprache?: Sprache;
}) {
  const t = texteFuer(ANSPRECHPARTNER_KARTE_TEXTE, sprache);
  // Deutsch bleibt beim Wortlaut des Videoraums, damit beide Stellen gleich heißen.
  const titel = sprache === "de" ? texteFuerAnrede(anrede).ansprechpartnerTitel : t.titel;
  const bildGroesse = gross ? "h-[104px] w-[104px] rounded-[26px]" : "h-[76px] w-[76px] rounded-[20px]";
  // Der Abzug aelterer Raeume traegt hier noch die technische Rolle, etwa
  // "Admin". Der Kunde soll eine Berufsbezeichnung lesen oder gar nichts.
  const bezeichnung = nurEchteBezeichnung(gastgeber.position);
  return (
    <Karte>
      <KartenTitel>{titel}</KartenTitel>
      <div className={`flex items-center gap-4 ${gross ? "flex-col text-center sm:flex-row sm:text-left" : ""}`}>
        {/*
          Um das Bild laeuft ein Ring nach aussen. Er sagt ohne Worte: Da sitzt
          jemand, der gleich kommt. Deshalb steht er hier und nicht irgendwo
          als Verzierung.
        */}
        <div className="relative shrink-0">
        <span
          aria-hidden
          className={`vr-anwesend pointer-events-none absolute inset-0 ${gross ? "rounded-[26px]" : "rounded-[20px]"} border border-[#88CFFF]/50`}
        />
        <div className={`${bildGroesse} overflow-hidden bg-gradient-to-br from-[#2b3d50] to-[#1a2634]`}>
          {gastgeber.bild ? (
            <img src={gastgeber.bild} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center"><User className={gross ? "h-11 w-11 text-white/25" : "h-8 w-8 text-white/25"} /></div>
          )}
        </div>
        </div>
        <div className="min-w-0">
          <h3 className={`font-bold tracking-[-0.02em] ${gross ? "text-[23px]" : "text-[19px]"}`}>{gastgeber.name}</h3>
          {bezeichnung && <div className="mt-0.5 text-[12.5px] text-[#88CFFF]">{bezeichnung}</div>}
        </div>
      </div>

      {gastgeber.zitat && (
        <p className="mt-5 border-t border-white/10 pt-5 text-[13.5px] leading-relaxed text-white/60">
          „{gastgeber.zitat}"
        </p>
      )}

      {(gastgeber.email || gastgeber.telefon) && (
        <div className="mt-5 flex flex-col gap-2.5 text-[12.5px] text-white/60">
          {gastgeber.email && (
            <a
              href={`mailto:${gastgeber.email}`}
              aria-label={gastgeber.name ? t.mailAn(gastgeber.name) : t.mailOhneName}
              className="flex min-h-[40px] items-center gap-2.5 hover:underline sm:min-h-0"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{gastgeber.email}</span>
            </a>
          )}
          {gastgeber.telefon && (
            <a
              href={`tel:${waehlbareNummer(gastgeber.telefon)}`}
              aria-label={gastgeber.name ? t.anrufen(gastgeber.name) : t.anrufenOhneName}
              className="flex min-h-[40px] items-center gap-2.5 hover:underline sm:min-h-0"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{gastgeber.telefon}</span>
            </a>
          )}
        </div>
      )}
    </Karte>
  );
}

/** Schalterzeile mit Beschriftung, wie in den Entwuerfen. */
export function Schalter({
  an,
  gesperrt = false,
  beschriftung,
  hinweis,
  aufWechsel,
}: {
  an: boolean;
  gesperrt?: boolean;
  beschriftung: string;
  hinweis?: string;
  aufWechsel: () => void;
}) {
  // Auf dem Telefon wird mit dem Daumen getroffen, deshalb die Mindesthoehe.
  return (
    <button
      type="button"
      onClick={aufWechsel}
      disabled={gesperrt}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 py-2.5 text-left disabled:opacity-45 sm:min-h-0 sm:py-2"
      aria-pressed={an}
    >
      <span className="min-w-0">
        <span className="block text-[12.5px] text-white/60">{beschriftung}</span>
        {hinweis && <span className="mt-0.5 block text-[10.5px] leading-snug text-white/30">{hinweis}</span>}
      </span>
      <span
        aria-hidden
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${an && !gesperrt ? "bg-[#087AC7]" : "bg-white/15"}`}
      >
        <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${an && !gesperrt ? "right-[3px]" : "left-[3px]"}`} />
      </span>
    </button>
  );
}

export interface MedienSteuerung {
  tonAn: boolean;
  bildAn: boolean;
  /** Eigenbild spiegeln, nur die eigene Vorschau. */
  spiegeln?: boolean;
  wechsleTon: () => void;
  wechsleBild: () => void;
}

export function TechnikKarte({
  stream,
  medienFehler,
  steuerung,
  erweiterung,
  sprache = STANDARD_SPRACHE,
}: {
  stream: MediaStream | null;
  medienFehler: string | null;
  steuerung?: MedienSteuerung;
  /** Zusaetzliche Bedienelemente, etwa der GeraeteSchnellzugriff. */
  erweiterung?: React.ReactNode;
  /** Sprache der Beschriftungen, Vorgabe Deutsch. */
  sprache?: Sprache;
}) {
  const t = videoraumGastTexte(sprache).warteraum;
  const hatKamera = Boolean(stream?.getVideoTracks().length);
  const hatMikrofon = Boolean(stream?.getAudioTracks().length);
  return (
    <Karte>
      <KartenTitel>{t.technik}</KartenTitel>
      <EigenesBild
        stream={stream}
        klein
        bildAus={steuerung ? !steuerung.bildAn : false}
        spiegeln={steuerung?.spiegeln !== false}
        sprache={sprache}
      />
      <div className="mt-4 flex flex-col gap-3 text-[12.5px] text-white/60">
        <Pruefzeile ok={hatKamera} text={hatKamera ? t.kameraBereit : t.keineKamera} />
        <Pruefzeile ok={hatMikrofon} text={hatMikrofon ? t.mikrofonBereit : t.keinMikrofon} />
      </div>

      {steuerung && (
        <div className="mt-4 border-t border-white/10 pt-2">
          <Schalter
            an={steuerung.tonAn}
            gesperrt={!hatMikrofon}
            beschriftung={t.mikrofonAn}
            hinweis={hatMikrofon ? undefined : t.keinMikrofonGefunden}
            aufWechsel={steuerung.wechsleTon}
          />
          <Schalter
            an={steuerung.bildAn}
            gesperrt={!hatKamera}
            beschriftung={t.kameraAn}
            hinweis={hatKamera ? undefined : t.keineKameraGefunden}
            aufWechsel={steuerung.wechsleBild}
          />
        </div>
      )}

      {erweiterung && <div className="mt-4 border-t border-white/10 pt-4">{erweiterung}</div>}

      {medienFehler && <p className="mt-4 text-[12px] leading-relaxed text-[#FFB4AE]">{medienFehler}</p>}
    </Karte>
  );
}

function Pruefzeile({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full ${ok ? "bg-[#34C759]/15 text-[#7EE29B]" : "bg-white/10 text-white/40"}`}>
        {/* Ohne diese Unterscheidung stand hinter "Keine Kamera" ein Haken. */}
        {ok ? <Check className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
      </span>
      {text}
    </div>
  );
}

export function AgendaListe({
  agenda,
  anrede = "du",
  sprache = STANDARD_SPRACHE,
}: {
  agenda: AgendaPunkt[];
  anrede?: Anrede;
  /** Sprache der festen Texte. Die gepflegte Agenda selbst bleibt, wie sie ist. */
  sprache?: Sprache;
}) {
  if (agenda.length === 0) {
    return (
      <p className="text-[13px] text-white/40">
        {texteFuerAnrede(anrede, sprache).agendaLeer}
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {agenda.map((punkt, i) => (
        <div key={i} className={`flex gap-4 py-4 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#88CFFF]/[0.13] text-xs font-bold text-[#88CFFF]">
            {i + 1}
          </span>
          <div className="min-w-0">
            <h4 className="text-[14.5px] font-semibold">{punkt.titel}</h4>
            {punkt.text && <p className="mt-1 text-[12.5px] leading-snug text-white/40">{punkt.text}</p>}
          </div>
          {punkt.minuten ? (
            <span className="ml-auto whitespace-nowrap pt-1 text-[11.5px] text-white/40">{mitWerten(videoraumGastTexte(sprache).warteraum.minutenKurz, { minuten: punkt.minuten })}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Hinweisblock({ text }: { text: string }) {
  return (
    <div className={`mt-5 rounded-[14px] border border-[#88CFFF]/15 ${FLAECHE_HINWEIS} p-4`}>
      <p className="text-[12.5px] leading-relaxed text-white/60">{text}</p>
    </div>
  );
}

// ── Warteraum je Anlass ─────────────────────────────────────────────────────

export interface WarteraumDaten {
  art: VideoraumArt;
  gastgeber: GastgeberSnapshot;
  agenda: AgendaPunkt[];
  hinweis: string | null;
  dauerMinuten: number;
  objekt: Record<string, unknown>;
  /** Schalter fuer Mikrofon und Kamera. */
  steuerung?: MedienSteuerung;
  /** Geraetewahl und Hintergrund unter der Technikkarte. */
  technikErweiterung?: React.ReactNode;
  /** Eckdaten der Berechnung, frei benannt: Beschriftung zu Wert. */
  berechnung: Array<{ label: string; wert: string }>;
  naechsteSchritte: string[];
  stream: MediaStream | null;
  medienFehler: string | null;
  /**
   * Satz unten im Warteraum. Sagt, ob noch jemand vor einem dran ist, siehe
   * `warteHinweisText`. Der Wartende soll sehen, dass er nicht vergessen
   * wurde, auch wenn drinnen schon gesprochen wird.
   */
  warteHinweis?: string;
}

function textOderNichts(wert: unknown): string | null {
  if (wert === null || wert === undefined) return null;
  const text = String(wert).trim();
  return text.length > 0 ? text : null;
}

function ObjektKarte({
  objekt,
  titel,
  t,
}: {
  objekt: Record<string, unknown>;
  titel: string | null;
  t: VideoraumGastTexte["warteraum"];
}) {
  // Titel, Ort und Eckdaten kommen so aus dem Raum, wie sie gepflegt sind.
  const bild = textOderNichts(objekt.bild);
  const name = textOderNichts(objekt.titel) ?? titel ?? t.deineImmobilie;
  const ort = textOderNichts(objekt.ort);
  const eckdaten: Array<{ icon: React.ReactNode; wert: string; label: string }> = [];
  const kaufpreis = textOderNichts(objekt.kaufpreis);
  const wohnflaeche = textOderNichts(objekt.wohnflaeche);
  const zimmer = textOderNichts(objekt.zimmer);
  const rendite = textOderNichts(objekt.rendite);
  if (kaufpreis) eckdaten.push({ icon: <Euro className="h-3.5 w-3.5 text-[#88CFFF]" />, wert: kaufpreis, label: t.kaufpreis });
  if (wohnflaeche) eckdaten.push({ icon: <Ruler className="h-3.5 w-3.5 text-[#88CFFF]" />, wert: wohnflaeche, label: t.wohnflaeche });
  if (zimmer) eckdaten.push({ icon: <Home className="h-3.5 w-3.5 text-[#88CFFF]" />, wert: zimmer, label: t.zimmer });
  if (rendite) eckdaten.push({ icon: <TrendingUp className="h-3.5 w-3.5 text-[#88CFFF]" />, wert: rendite, label: t.rendite });

  return (
    <Karte>
      <KartenTitel>{t.objekt}</KartenTitel>
      {bild && <img src={bild} alt="" className="mb-5 aspect-[16/9] w-full rounded-[14px] object-cover" />}
      <h3 className="text-[19px] font-bold tracking-[-0.02em]">{name}</h3>
      {ort && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/50">
          <MapPin className="h-3.5 w-3.5" />{ort}
        </div>
      )}
      {eckdaten.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {eckdaten.map((e, i) => (
            <div key={i} className={`rounded-xl border border-white/10 ${FLAECHE_FELD} p-3`}>
              {e.icon}
              <div className="mt-2 text-[15px] font-semibold">{e.wert}</div>
              <div className="text-[11px] text-white/40">{e.label}</div>
            </div>
          ))}
        </div>
      )}
      {eckdaten.length === 0 && !bild && (
        <p className="mt-3 text-[13px] text-white/40">
          {t.unterlagenGleich}
        </p>
      )}
    </Karte>
  );
}

function BerechnungKarte({ posten, t }: { posten: Array<{ label: string; wert: string }>; t: VideoraumGastTexte["warteraum"] }) {
  return (
    <Karte>
      <KartenTitel>
        <span className="inline-flex items-center gap-2"><Calculator className="h-3.5 w-3.5" /> {t.berechnung}</span>
      </KartenTitel>
      {posten.length === 0 ? (
        // Hier stand "Sie bekommen sie danach als PDF". Ein PDF gibt es nicht,
        // also wird es auch nicht versprochen.
        <p className="text-[13px] leading-relaxed text-white/40">
          {t.berechnungLeer}
        </p>
      ) : (
        <div className="flex flex-col">
          {posten.map((p, i) => (
            <div key={i} className={`flex items-baseline justify-between gap-4 py-2.5 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}>
              <span className="text-[13px] text-white/60">{p.label}</span>
              <span className="text-[15px] font-semibold tabular-nums">{p.wert}</span>
            </div>
          ))}
        </div>
      )}
    </Karte>
  );
}

function SchritteKarte({ schritte, t }: { schritte: string[]; t: VideoraumGastTexte["warteraum"] }) {
  return (
    <Karte>
      <KartenTitel>
        <span className="inline-flex items-center gap-2"><ListChecks className="h-3.5 w-3.5" /> {t.naechsteSchritte}</span>
      </KartenTitel>
      <div className="flex flex-col gap-4">
        {schritte.map((schritt, i) => (
          <div key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#88CFFF]/[0.13] text-[11px] font-bold text-[#88CFFF]">
              {i + 1}
            </span>
            <span className="text-[13.5px] leading-snug text-white/60">{schritt}</span>
          </div>
        ))}
      </div>
    </Karte>
  );
}

/**
 * Der Aussenrand des Warteraums auf dem Telefon.
 *
 * Knapper als am Schreibtisch, damit die Karten nicht unnoetig schmal werden,
 * und mit den Aussparungen neuerer Geraete im Blick: `env(safe-area-inset-...)`
 * haelt den Inhalt aus der Kamerainsel oben, dem Balken unten und den
 * abgerundeten Ecken im Querformat heraus. Hat ein Geraet keine Aussparung,
 * greift der Mindestwert davor, dann aendert sich nichts.
 */
const RAND_TELEFON =
  "pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] "
  + "pt-[max(60px,calc(env(safe-area-inset-top)+56px))] pb-[max(32px,calc(env(safe-area-inset-bottom)+16px))]";

export function Warteraum({
  daten,
  name,
  sprache = STANDARD_SPRACHE,
}: {
  daten: WarteraumDaten;
  name: string;
  /**
   * Sprache der festen Texte (Kundensprache, Etappe 3), Vorgabe Deutsch. Was
   * am Raum gepflegt ist (Hinweis, Objekt, Berechnung), bleibt, wie es ist.
   */
  sprache?: Sprache;
}) {
  const { art, gastgeber, hinweis, dauerMinuten, stream, medienFehler } = daten;
  // Ein gebuchter Raum bringt keine eigene Agenda mit. Dann greift die
  // Standardagenda des Anlasses, siehe videoraumAgenda. Englisch wird nur die
  // unveraenderte Standardagenda, siehe `agendaZurAnzeige`.
  const agenda = agendaZurAnzeige(art, agendaFuer(art, daten.agenda), sprache);
  const vorname = name.trim().split(" ")[0] || name;
  // Kunden wie Bewerber werden geduzt, siehe videoraumAnrede.
  const anrede = anredeFuer(art);
  const texte = texteFuerAnrede(anrede, sprache);
  const t = videoraumGastTexte(sprache).warteraum;
  const minuten = dauerMinuten
    ? ` · ${mitWerten(videoraumGastTexte(sprache).seite.minuten, { minuten: dauerMinuten })}`
    : "";
  // Ohne gepflegtes Profil steht am Raum nur der Platzhalter. Der wird nicht
  // zerlegt, sonst begruesst der Warteraum mit "Dein ist gleich fuer dich da".
  const gastgeberName = gastgeber.name?.trim();
  const rufname = istPlatzhalterName(gastgeberName)
    ? texte.ansprechpartnerPlatzhalter
    : (gastgeberName as string).split(" ")[0];

  const kopf = (
    <div className="text-center">
      <span className="inline-flex items-center gap-2.5 rounded-full border border-[#34C759]/30 bg-[#34C759]/10 px-4 py-1.5 text-xs text-[#7EE29B]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#34C759]" />
        {mitWerten(texte.gleichDa, { name: rufname })}
      </span>
      <h1 className="mt-3 text-[28px] font-extrabold tracking-[-0.03em] sm:text-[38px]">
        {mitWerten(t.willkommen, { name: vorname })}
      </h1>
      <Balken className="mx-auto mt-5" />
      <p className="mt-4 text-[15px] text-white/60">
        {art === "objektvorstellung" ? texte.einrichtenObjekt : texte.einrichten}
      </p>
    </div>
  );

  /*
   * Der Wartehinweis steht oben, nicht unten.
   *
   * Er stand als Fusszeile unter allen Karten. Auf einem Bildschirm mit 640
   * Pixel Hoehe ist die Seite 1053 Pixel hoch, der Hinweis lag also unter dem
   * Rand. Ausgerechnet der Satz, der dem Wartenden sagt, dass er nicht
   * vergessen wurde und das Fenster offen lassen soll, war der einzige, den
   * niemand sah.
   *
   * Jetzt sitzt er direkt unter der Begruessung. Alles darunter ist
   * Beiwerk zum Lesen waehrend des Wartens und darf ruhig gescrollt werden.
   */
  const warteHinweis = (
    <div className="mt-6 flex items-start justify-center gap-2.5 px-6 text-center text-[13px] text-white/45">
      {/* Oben ausgerichtet: Auf dem Handy bricht der Satz um, und ein mittig
          gesetzter Kreis stuende dann schief neben dem Block. */}
      <Loader2 className="mt-[3px] h-3.5 w-3.5 shrink-0 animate-spin" />
      {daten.warteHinweis ?? texte.wartenGleich}
    </div>
  );

  // ── Objektvorstellung: Objekt, Agenda, Berechnung, naechste Schritte
  if (art === "objektvorstellung") {
    return (
      <div className={`mx-auto flex min-h-[100dvh] max-w-6xl flex-col ${RAND_TELEFON} sm:px-10 sm:pb-10 sm:pt-24`}>
        {kopf}
        {warteHinweis}
        <div className="mt-8 grid flex-1 items-start gap-6 lg:grid-cols-[360px_1fr]">
          <div className="flex flex-col gap-6">
            <AnsprechpartnerKarte gastgeber={gastgeber} anrede={anrede} sprache={sprache} />
            <TechnikKarte stream={stream} medienFehler={medienFehler} steuerung={daten.steuerung} erweiterung={daten.technikErweiterung} sprache={sprache} />
          </div>
          <div className="flex flex-col gap-6">
            <ObjektKarte objekt={daten.objekt} titel={null} t={t} />
            <div className="grid items-start gap-6 sm:grid-cols-2">
              <Karte>
                <KartenTitel>{t.ablauf}{minuten}</KartenTitel>
                <AgendaListe agenda={agenda} anrede={anrede} sprache={sprache} />
              </Karte>
              <div className="flex flex-col gap-6">
                <BerechnungKarte posten={daten.berechnung} t={t} />
                <SchritteKarte schritte={daten.naechsteSchritte} t={t} />
              </div>
            </div>
            {hinweis && <Hinweisblock text={hinweis} />}
          </div>
        </div>
      </div>
    );
  }

  // ── Erstgespraech, Beratung und Bewerbergespraech: Ansprechpartner,
  //    Agenda, Technik
  //
  // Alle drei erwarten dasselbe: Wer kommt, was besprochen wird, wie lange es
  // dauert. Nur der neutrale Fall ohne Agenda sieht anders aus.
  if (art === "beratung" || art === "erstgespraech" || art === "bewerbergespraech") {
    return (
      <div className={`mx-auto flex min-h-[100dvh] max-w-6xl flex-col ${RAND_TELEFON} sm:px-10 sm:pb-10 sm:pt-24`}>
        {kopf}
        {warteHinweis}
        <div className="mt-8 grid flex-1 items-start gap-6 lg:grid-cols-[320px_1fr_290px]">
          <AnsprechpartnerKarte gastgeber={gastgeber} anrede={anrede} sprache={sprache} />
          <Karte>
            <KartenTitel>{t.agenda}{minuten}</KartenTitel>
            <AgendaListe agenda={agenda} anrede={anrede} sprache={sprache} />
            {hinweis && <Hinweisblock text={hinweis} />}
          </Karte>
          <TechnikKarte stream={stream} medienFehler={medienFehler} steuerung={daten.steuerung} erweiterung={daten.technikErweiterung} sprache={sprache} />
        </div>
      </div>
    );
  }

  // ── Alles andere: ruhig und neutral, im Mittelpunkt der Ansprechpartner
  return (
    <div className={`mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center ${RAND_TELEFON} sm:pb-24 sm:pl-6 sm:pr-6 sm:pt-24`}>
      {kopf}
      {warteHinweis}
      <div className="mt-8 grid items-start gap-6 sm:grid-cols-[1fr_260px]">
        <AnsprechpartnerKarte gastgeber={gastgeber} gross anrede={anrede} sprache={sprache} />
        <TechnikKarte stream={stream} medienFehler={medienFehler} steuerung={daten.steuerung} erweiterung={daten.technikErweiterung} sprache={sprache} />
      </div>

      {agenda.length > 0 && (
        <Karte className="mt-6">
          <KartenTitel>
            <span className="inline-flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> {t.ablauf}</span>
          </KartenTitel>
          <AgendaListe agenda={agenda} anrede={anrede} sprache={sprache} />
        </Karte>
      )}

      {hinweis && (
        <Karte className="mt-6">
          <p className="text-[13px] leading-relaxed text-white/60">{hinweis}</p>
        </Karte>
      )}

    </div>
  );
}
