import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KampagnenWert } from "@/components/kunden/KampagnenZeile";
import { darfKampagneSehen } from "@/lib/kampagnenKennung";
import { BeraterVerlauf } from "@/components/kunden/BeraterVerlauf";
import type { KundeData } from "@/lib/kundenStore";
import { kontaktQuelleAnzeige } from "@/lib/kontaktQuelle";
import { normalizeTelefon, whatsAppLink } from "@/lib/phoneUtils";
import { einverstaendnisBestaetigtAm } from "@/lib/tippgeberEmpfehlung";
import { tarnEmail, tarnTelefon, tarnVerweis } from "@/lib/vorfuehrmodus";
import { formatDatum } from "@/lib/utils";
import { KundenprofilFeld, feldBearbeitung, type FeldBearbeitung } from "./KundenprofilFeld";

type Person2 = NonNullable<KundeData["person2"]>;

/**
 * Der Stand, mit dem bisher der Bearbeitungsmodus im Reiter Stammdaten
 * startete. Ein Stift ändert genau ein Feld darin, gespeichert wird der
 * ganze Stand über denselben Weg wie vorher (`speichereStammdaten`).
 */
export interface StammdatenEntwurf {
  vorname?: string;
  nachname?: string;
  email?: string;
  telefon?: string;
  geburtstag?: string;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
  quelle?: string;
  empfehlungsgeberName?: string;
  empfehlungsgeberBeziehung?: string;
  erstelltVonId?: string;
  erstelltVonName?: string;
  person2?: Person2;
}

export type SpeichereStammdaten = (aenderung: Partial<StammdatenEntwurf>) => Promise<boolean>;
export type SpeichereTeil = (patch: Record<string, string>) => Promise<boolean>;

export const formatKundenId = (osImmoId?: number | null) => {
  if (!osImmoId || osImmoId <= 0) return "–";
  return `OSI-${String(osImmoId).padStart(5, "0")}`;
};

/** Gespeichert wird TT.MM.JJJJ, das Datumsfeld will JJJJ-MM-TT. */
export function geburtstagAlsIso(g?: string | null): string {
  const wert = g || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(wert)) return wert;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(wert)) {
    const [d, m, y] = wert.split(".");
    return `${y}-${m}-${d}`;
  }
  return "";
}
export function geburtstagAusIso(val: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split("-");
    return `${d}.${m}.${y}`;
  }
  return val;
}

/** Tausenderpunkte für Einkommen und Eigenkapital, gespeichert wird ohne. */
export function formatQualNumber(val: string): string {
  const stripped = val.replace(/\./g, "");
  const pureDigits = stripped.replace(/[^\d]/g, "");
  if (pureDigits.length > 0 && stripped === pureDigits) return parseInt(pureDigits, 10).toLocaleString("de-DE");
  return val;
}
export const parseQualNumber = (val: string) => val.replace(/\./g, "");

/** Funnel-Werte kommen klein geschrieben, die Auswahl kennt die Wörter. */
export function beruflicheSituationWert(roh?: string | null): string {
  const raw = (roh || "").trim();
  const map: Record<string, string> = {
    angestellt: "Angestellt",
    selbststaendig: "Selbstständig",
    "selbstständig": "Selbstständig",
    unternehmer: "Selbstständig",
    freiberufler: "Selbstständig",
    beamter: "Beamter",
    beamtin: "Beamter",
    rentner: "Rentner",
    student: "Student",
    arbeitslos: "Arbeitssuchend",
    arbeitssuchend: "Arbeitssuchend",
  };
  return map[raw.toLowerCase()] || raw;
}
const BERUFLICHE_SITUATIONEN = ["Angestellt", "Selbstständig", "Beamter", "Rentner", "Student", "Arbeitssuchend"];

/** „4 von 6 beantwortet“: die vier Qualifizierungsfragen, die es immer gibt. */
export function qualifizierungHinweis(kunde: Pick<KundeData, "qualZiel" | "qualEinkommen" | "qualEigenkapital" | "qualBeruflicheSituation">): string {
  const werte = [kunde.qualZiel, kunde.qualEinkommen, kunde.qualEigenkapital, kunde.qualBeruflicheSituation];
  return `${werte.filter((w) => !!String(w ?? "").trim()).length} von ${werte.length} beantwortet`;
}

const text = (start: () => string, speichern: (w: string) => Promise<boolean>, typ?: string, platzhalter?: string): FeldBearbeitung<string> => ({
  start,
  editor: (w, setze) => <Input className="h-8" type={typ} placeholder={platzhalter} value={w} onChange={(e) => setze(e.target.value)} />,
  speichern,
});

const datumFeld = (start: () => string, speichern: (w: string) => Promise<boolean>): FeldBearbeitung<string> => ({
  start: () => geburtstagAlsIso(start()),
  editor: (w, setze) => <DateInput className="h-8" value={w} onChange={setze} placeholder="TT.MM.JJJJ" />,
  speichern: (w) => speichern(geburtstagAusIso(w)),
});

const telefonFeld = (start: () => string, speichern: (w: string) => Promise<boolean>): FeldBearbeitung<string> => ({
  start,
  editor: (w, setze) => <PhoneInput className="h-8" value={w} onChange={setze} />,
  speichern,
});

const auswahl = (start: () => string, optionen: { wert: string; text: string }[], speichern: (w: string) => Promise<boolean>, leer = "Bitte wählen…"): FeldBearbeitung<string> => ({
  start,
  editor: (w, setze) => (
    <Select value={w || undefined} onValueChange={setze}>
      <SelectTrigger className="h-8"><SelectValue placeholder={leer} /></SelectTrigger>
      <SelectContent className="max-h-72 overflow-y-auto">
        {optionen.map((o) => <SelectItem key={o.wert} value={o.wert}>{o.text}</SelectItem>)}
      </SelectContent>
    </Select>
  ),
  speichern,
});

function TelefonLink({ nummer, onAnrufen, tarnen = true }: { nummer?: string | null; onAnrufen: (n: string) => void; tarnen?: boolean }) {
  if (!nummer) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a
        href={tarnen ? tarnVerweis(`tel:${nummer}`) : `tel:${nummer}`}
        className="text-primary hover:underline"
        onClick={(e) => { e.preventDefault(); onAnrufen(nummer); }}
      >
        {tarnen ? tarnTelefon(normalizeTelefon(nummer)) : normalizeTelefon(nummer)}
      </a>
      {/*
        Nur das Symbol, kein Wort (Christian, 18.10.2026). Derselbe Pfad wie im
        Bewerberprofil (BewerberprofilPerson.tsx), die Fläche im Markengrün.
      */}
      <a
        href={tarnen ? tarnVerweis(whatsAppLink(nummer)) : whatsAppLink(nummer)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Per WhatsApp schreiben"
        title="Per WhatsApp schreiben"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.028-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </span>
  );
}

function EmailLink({ email, tarnen = true }: { email?: string | null; tarnen?: boolean }) {
  if (!email) return null;
  return <a href={tarnen ? tarnVerweis(`mailto:${email}`) : `mailto:${email}`} className="text-primary hover:underline">{tarnen ? tarnEmail(email) : email}</a>;
}

interface Adresse { strasse: string; hausnummer: string; plz: string; ort: string }

interface KontaktProps {
  kunde: KundeData;
  /** Ohne Speicherweg kein Stift: Die Rolle darf nichts ändern. */
  speichere?: SpeichereStammdaten;
  sprache: ReactNode;
  onAnrufen: (telefon: string) => void;
  /** Etwa die Bestätigung der Setterin unter den Kontaktdaten. */
  zusatz?: ReactNode;
}

/** Kennung, Geburtstag, E-Mail, Telefon, Adresse und Sprache. */
export function KontaktFelder({ kunde, speichere, sprache, onAnrufen, zusatz }: KontaktProps) {
  const adresse: FeldBearbeitung<Adresse> | undefined = speichere && {
    start: () => ({ strasse: kunde.strasse || "", hausnummer: kunde.hausnummer || "", plz: kunde.plz || "", ort: kunde.ort || "" }),
    editor: (w, setze) => (
      <div className="space-y-2">
        <AddressAutocomplete
          className="h-8"
          value={w.strasse}
          onChange={(val) => setze({ ...w, strasse: val })}
          onSelect={(a) => setze({ strasse: a.strasse, hausnummer: a.hausnummer, plz: a.plz, ort: a.ort })}
          placeholder="Straße"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
          <Input className="h-8" aria-label="Hausnummer" placeholder="Nr." value={w.hausnummer} onChange={(e) => setze({ ...w, hausnummer: e.target.value })} />
          <Input className="h-8" aria-label="Postleitzahl" placeholder="PLZ" value={w.plz} onChange={(e) => setze({ ...w, plz: e.target.value })} />
        </div>
        <Input className="h-8" aria-label="Ort" placeholder="Ort" value={w.ort} onChange={(e) => setze({ ...w, ort: e.target.value })} />
      </div>
    ),
    speichern: (w) => speichere(w),
  };
  const strasse = [kunde.strasse, kunde.hausnummer].filter(Boolean).join(" ");
  const ort = [kunde.plz, kunde.ort].filter(Boolean).join(" ");
  return (
    <>
      <dl className="kundenprofil-felder">
        <KundenprofilFeld label="Kennung" wert={formatKundenId(kunde.osImmoId)} />
        <KundenprofilFeld label="Geburtstag" wert={kunde.geburtstag} bearbeitung={speichere && datumFeld(() => kunde.geburtstag || "", (w) => speichere({ geburtstag: w }))} />
        <KundenprofilFeld label="E-Mail" wert={<EmailLink email={kunde.email} />} bearbeitung={speichere && text(() => kunde.email || "", (w) => speichere({ email: w.trim() }), "email")} />
        <KundenprofilFeld label="Telefon" wert={<TelefonLink nummer={kunde.telefon} onAnrufen={onAnrufen} />} bearbeitung={speichere && telefonFeld(() => kunde.telefon || "", (w) => speichere({ telefon: w }))} />
        <KundenprofilFeld label="Adresse" wert={strasse || ort ? <>{strasse}{strasse && ort && <br />}{ort}</> : null} bearbeitung={adresse} />
        <KundenprofilFeld label="Sprache" wert={sprache} />
      </dl>
      {zusatz}
    </>
  );
}

/** Person 2: genau die Felder, die bisher für sie bearbeitbar waren. */
export function Person2Felder({ person2, speichere, onAnrufen }: { person2: Person2; speichere?: SpeichereStammdaten; onAnrufen: (telefon: string) => void }) {
  const aendern = (feld: keyof Person2) => (w: string) => speichere!({ person2: { ...person2, [feld]: w } });
  return (
    <dl className="kundenprofil-felder">
      <KundenprofilFeld label="Vorname" wert={person2.vorname} bearbeitung={speichere && text(() => person2.vorname || "", aendern("vorname"))} />
      <KundenprofilFeld label="Nachname" wert={person2.nachname} bearbeitung={speichere && text(() => person2.nachname || "", aendern("nachname"))} />
      <KundenprofilFeld label="Geburtstag" wert={person2.geburtsdatum} bearbeitung={speichere && datumFeld(() => person2.geburtsdatum || "", aendern("geburtsdatum"))} />
      <KundenprofilFeld
        label="E-Mail"
        wert={<EmailLink email={person2.email} tarnen={false} />}
        bearbeitung={speichere && feldBearbeitung({
          start: () => person2.email || "",
          editor: (w, setze) => (
            <div className="space-y-1">
              <Input className="h-8" type="email" required aria-required="true" placeholder="email@beispiel.de" value={w} onChange={(e) => setze(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Pflicht: Damit kann auch Person 2 die Selbstauskunft digital unterschreiben.</p>
            </div>
          ),
          speichern: (w) => aendern("email")(w.trim()),
        })}
      />
      <KundenprofilFeld label="Telefon" wert={<TelefonLink nummer={person2.telefon} onAnrufen={onAnrufen} tarnen={false} />} bearbeitung={speichere && telefonFeld(() => person2.telefon || "", aendern("telefon"))} />
    </dl>
  );
}

interface LeadProps {
  kunde: KundeData;
  meta: Record<string, unknown>;
  rolle: string;
  speichere?: SpeichereStammdaten;
  /** Nur Admin und Inhaber: Sie sehen „Erstellt von“ und dürfen es ändern. */
  ersteller?: { nutzer: { id: string; name: string }[] };
  vertriebspartnerName: string;
  /** Der vorhandene Ablauf „Vertriebspartner ändern“; ohne ihn kein Stift. */
  onVertriebspartnerAendern?: () => void;
  onKontaktOeffnen: (kontaktId: string) => void;
  /** Wer Einblick in den Kunden hat, steht direkt unter dem Vertriebspartner. */
  einblick?: ReactNode;
  zusatz?: ReactNode;
}

/** Lead- und Verwaltungsdaten samt zuständigem Vertriebspartner. */
export function LeadFelder({ kunde, meta, rolle, speichere, ersteller, vertriebspartnerName, onVertriebspartnerAendern, onKontaktOeffnen, einblick, zusatz }: LeadProps) {
  const empfName = (meta.empfehlungsgeberName as string | undefined) || "";
  const empfBez = (meta.empfehlungsgeberBeziehung as string | undefined) || "";
  const empfId = meta.empfehlungsgeberKontaktId as string | undefined;
  const erstellerName = (meta.erstelltVonName as string | undefined) || "";
  const OHNE = "__none__";
  return (
    <>
      <dl className="kundenprofil-felder">
        <KundenprofilFeld label="Angelegt am" wert={formatDatum(kunde.erstellt_am)} />
        {ersteller && (
          <KundenprofilFeld
            label="Erstellt von"
            wert={erstellerName}
            bearbeitung={speichere && auswahl(
              () => (meta.erstelltVonId as string | undefined) || OHNE,
              [{ wert: OHNE, text: "Kein Ersteller" }, ...[...ersteller.nutzer].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((u) => ({ wert: u.id, text: u.name }))],
              (w) => w === OHNE
                ? speichere({ erstelltVonId: "", erstelltVonName: "" })
                : speichere({ erstelltVonId: w, erstelltVonName: ersteller.nutzer.find((u) => u.id === w)?.name || "" }),
            )}
          />
        )}
        <KundenprofilFeld label="Quelle" wert={kontaktQuelleAnzeige(kunde)} />
        {/* Kampagne direkt unter der Quelle (Christian, 21.10.2026), nur lesbar. */}
        {darfKampagneSehen(rolle) && <KundenprofilFeld label="Kampagne" wert={<KampagnenWert kontaktId={kunde.id} />} />}
        <KundenprofilFeld
          label="Empfehlungsgeber"
          wert={empfName ? (
            <>
              {empfId ? <button type="button" className="text-primary hover:underline text-left" onClick={() => onKontaktOeffnen(empfId)}>{empfName}</button> : empfName}
              {empfBez && <span className="text-muted-foreground text-xs ml-1">({empfBez})</span>}
            </>
          ) : null}
          bearbeitung={speichere && feldBearbeitung({
            start: () => ({ name: empfName, beziehung: empfBez }),
            editor: (w, setze) => (
              <div className="space-y-2">
                <Input className="h-8" aria-label="Name des Empfehlungsgebers" placeholder="Name (optional)" value={w.name} onChange={(e) => setze({ ...w, name: e.target.value })} />
                <Input className="h-8" aria-label="Beziehung" placeholder="Beziehung (optional)" value={w.beziehung} onChange={(e) => setze({ ...w, beziehung: e.target.value })} />
              </div>
            ),
            speichern: (w) => speichere({ empfehlungsgeberName: w.name, empfehlungsgeberBeziehung: w.beziehung }),
          })}
        />
        {/* Die Setter-Zeile bleibt reine Anzeige (Umbau Kundenprofil, 18.10.2026). */}
        <KundenprofilFeld label="Setter" wert={kunde.setter} />
        <KundenprofilFeld label="Vertriebspartner" wert={vertriebspartnerName} onStift={onVertriebspartnerAendern} />
      </dl>
      {einblick}
      {/* Liefert Paare aus Beschriftung und Wert, hier untereinander gesetzt. */}
      <div className="kundenprofil-paare">
        <BeraterVerlauf kunde={kunde} />
      </div>
      {zusatz}
    </>
  );
}

interface QualProps {
  kunde: KundeData;
  meta: Record<string, unknown>;
  /** Speichert Felder am Kontakt (`updateKontakt`). */
  speichereKontakt?: SpeichereTeil;
  /** Speichert Schlüssel im `meta` (`mergeKontaktMeta`), für die Tippgeber-Fragen. */
  speichereMeta?: SpeichereTeil;
}

/** Qualifizierungsfragen, Tippgeber-Angaben und Funnel-Felder, jedes mit eigenem Stift. */
export function QualifizierungFelder({ kunde, meta, speichereKontakt, speichereMeta }: QualProps) {
  const name = kunde.vorname || "der Kunde";
  const k = speichereKontakt;
  const tippgeber = !!(meta.tippgeberId || meta.tippgeberSchufaSauber || meta.tippgeberInvestitionsZeitpunkt);
  const funnel = !!(kunde.funnelImmobilienbesitz || kunde.funnelInvestitionsvolumen || kunde.funnelZeitrahmen || kunde.funnelKontaktzeit);
  const zahl = (feld: "qualEinkommen" | "qualEigenkapital", platzhalter: string): FeldBearbeitung<string> | undefined => k && {
    start: () => formatQualNumber(kunde[feld] || ""),
    editor: (w, setze) => <Input className="h-8" inputMode="numeric" placeholder={platzhalter} value={w} onChange={(e) => setze(formatQualNumber(e.target.value))} />,
    speichern: (w) => k({ [feld]: parseQualNumber(w) }),
  };
  const bestaetigt = einverstaendnisBestaetigtAm(meta);
  const einverstaendnis = meta.tippgeberEinverstaendnis as { wortlaut?: unknown } | undefined;
  return (
    <dl className="kundenprofil-felder">
      <KundenprofilFeld label={`Ziel von ${name}`} wert={kunde.qualZiel} bearbeitung={k && text(() => kunde.qualZiel || "", (w) => k({ qualZiel: w }), undefined, "z.B. Eigenheim für die Familie")} />
      <KundenprofilFeld label="Einkommen im Monat" wert={kunde.qualEinkommen ? formatQualNumber(kunde.qualEinkommen) : null} bearbeitung={zahl("qualEinkommen", "z.B. 3.000")} />
      <KundenprofilFeld label="Eigenkapital" wert={kunde.qualEigenkapital ? formatQualNumber(kunde.qualEigenkapital) : null} bearbeitung={zahl("qualEigenkapital", "z.B. 20.000")} />
      <KundenprofilFeld
        label="Berufliche Situation"
        wert={beruflicheSituationWert(kunde.qualBeruflicheSituation)}
        bearbeitung={k && auswahl(() => beruflicheSituationWert(kunde.qualBeruflicheSituation), BERUFLICHE_SITUATIONEN.map((w) => ({ wert: w, text: w })), (w) => k({ qualBeruflicheSituation: w }))}
      />
      {tippgeber && (
        <>
          <KundenprofilFeld
            label="Saubere SCHUFA?"
            wert={meta.tippgeberSchufaSauber === "Unbekannt" ? "Weiß nicht" : (meta.tippgeberSchufaSauber as string)}
            bearbeitung={speichereMeta && auswahl(() => (meta.tippgeberSchufaSauber as string) || "", [{ wert: "Ja", text: "Ja" }, { wert: "Nein", text: "Nein" }, { wert: "Unbekannt", text: "Weiß nicht" }], (w) => speichereMeta({ tippgeberSchufaSauber: w }))}
          />
          <KundenprofilFeld
            label="Investitions-Zeitpunkt"
            wert={meta.tippgeberInvestitionsZeitpunkt as string}
            bearbeitung={speichereMeta && auswahl(() => (meta.tippgeberInvestitionsZeitpunkt as string) || "", [
              { wert: "Sofort", text: "Sofort" },
              { wert: "1-3 Monate", text: "In 1 bis 3 Monaten" },
              { wert: "3-6 Monate", text: "In 3 bis 6 Monaten" },
              { wert: "6+ Monate", text: "In mehr als 6 Monaten" },
            ], (w) => speichereMeta({ tippgeberInvestitionsZeitpunkt: w }))}
          />
          {bestaetigt && (
            <KundenprofilFeld
              label="Einverständnis"
              wert={<span title={typeof einverstaendnis?.wortlaut === "string" ? einverstaendnis.wortlaut : undefined}>Bestätigt am {bestaetigt} Uhr</span>}
            />
          )}
          {!!meta.tippgeberAnliegen && <KundenprofilFeld label="Anliegen (vom Tippgeber)" wert={String(meta.tippgeberAnliegen)} />}
        </>
      )}
      {funnel && (
        <>
          <KundenprofilFeld label="Immobilienbesitz" wert={kunde.funnelImmobilienbesitz} bearbeitung={k && text(() => kunde.funnelImmobilienbesitz || "", (w) => k({ funnelImmobilienbesitz: w }), undefined, "z.B. Keine / 1 / 2–3 / 4+")} />
          <KundenprofilFeld label="Investitionsvolumen" wert={kunde.funnelInvestitionsvolumen} bearbeitung={k && text(() => kunde.funnelInvestitionsvolumen || "", (w) => k({ funnelInvestitionsvolumen: w }))} />
          <KundenprofilFeld label="Zeitrahmen" wert={kunde.funnelZeitrahmen} bearbeitung={k && text(() => kunde.funnelZeitrahmen || "", (w) => k({ funnelZeitrahmen: w }))} />
          <KundenprofilFeld label="Bevorzugte Kontaktzeit" wert={kunde.funnelKontaktzeit} bearbeitung={k && text(() => kunde.funnelKontaktzeit || "", (w) => k({ funnelKontaktzeit: w }))} />
        </>
      )}
    </dl>
  );
}
