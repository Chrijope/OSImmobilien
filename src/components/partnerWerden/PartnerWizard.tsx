/**
 * Der Wizard der Seite „Partner werden“: Weg (Tippgeber, Vertriebspartner,
 * Portfolio-Partner), Bereich, die Fragen dieses Wegs, Kontakt, Dank. Beim
 * Portfolio-Weg gibt es nur den Immobilienvertrieb, der Bereich entfällt. Aufbau und Klassen wie der Konfigurator der Handbuch-Seite
 * (`components/handbuch/Konfigurator.tsx`): eine Frage je Schritt,
 * Fortschritt, Zurück, große Kacheln als echte Knöpfe mit `aria-pressed`,
 * Fokus nach jedem Schritt auf die neue Überschrift.
 *
 * Die Fragen stehen in `_shared/partner-werden.ts`, damit der Server genau
 * dieselben annimmt.
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  Handshake,
  Info,
  Loader2,
  Megaphone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Feld } from "@/components/handbuch/Konfigurator";
import {
  PARTNER_EINWILLIGUNG_FEHLT,
  PARTNER_EINWILLIGUNG_KURZ,
  PARTNER_EINWILLIGUNG_TEXT,
  PARTNER_FRAGEN,
  PARTNER_ROLLEN,
  PARTNER_WEGE,
  TIPPGEBER_ERLAUBNIS_HINWEIS,
  pruefeKontakt,
  rollenFuerWeg,
  type PartnerFrage,
  type PartnerKontakt,
  type PartnerRolle,
  type PartnerWeg,
} from "../../../supabase/functions/_shared/partner-werden.ts";
import { sendePartnerAnfrage } from "@/lib/partnerWerden/absenden";
import { MitPlatzhaltern } from "./MitPlatzhaltern";

const ROLLEN_SYMBOLE: Record<PartnerRolle, LucideIcon> = {
  finanzberater: Briefcase,
  versicherungsmakler: ShieldCheck,
  vertriebler: Megaphone,
  immobilienvertrieb: Building2,
};

const WEG_SYMBOLE: Record<PartnerWeg, LucideIcon> = {
  tippgeber: Handshake,
  vertriebspartner: Briefcase,
  portfolio: Building2,
};

type Schritt = { art: "weg" } | { art: "rolle" } | { art: "frage"; frage: PartnerFrage } | { art: "kontakt" };

/** Die Schritte eines Wegs. Ohne gewählten Weg steht nur die Wegwahl fest. */
export function schritteFuer(weg: PartnerWeg | null): Schritt[] {
  if (!weg) return [{ art: "weg" }];
  const mitBereich = rollenFuerWeg(weg).length > 1;
  return [
    { art: "weg" },
    ...(mitBereich ? [{ art: "rolle" } as const] : []),
    ...PARTNER_FRAGEN[weg].map((frage) => ({ art: "frage", frage }) as const),
    { art: "kontakt" },
  ];
}

const LEER: PartnerKontakt = { vorname: "", nachname: "", email: "", telefon: "", firma: "" };

export default function PartnerWizard({ startWeg, onZurueckZurSeite }: { startWeg?: PartnerWeg | null; onZurueckZurSeite: () => void }) {
  const [schritt, setSchritt] = useState(0);
  const [fertig, setFertig] = useState(false);
  const [weg, setWeg] = useState<PartnerWeg | null>(startWeg ?? null);
  const [rolle, setRolle] = useState<PartnerRolle | null>(() => {
    const rollen = startWeg ? rollenFuerWeg(startWeg) : [];
    return rollen.length === 1 ? rollen[0] : null;
  });
  const [antworten, setAntworten] = useState<Record<string, string>>({});
  const [kontakt, setKontakt] = useState<PartnerKontakt>(LEER);
  const [einwilligung, setEinwilligung] = useState(false);
  const [hp, setHp] = useState("");
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const start = useRef<number>(Date.now());
  const ueberschrift = useRef<HTMLHeadingElement>(null);

  // Fokus nach jedem Schritt auf die neue Überschrift, beim ersten Anzeigen nicht.
  const ersterLauf = useRef(true);
  useEffect(() => {
    if (ersterLauf.current) {
      ersterLauf.current = false;
      return;
    }
    const kopf = ueberschrift.current;
    kopf?.focus({ preventScroll: true });
    const karte = kopf?.closest<HTMLElement>(".hb-konfig");
    if (karte && typeof karte.scrollIntoView === "function" && karte.getBoundingClientRect().top < 80) {
      const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      karte.scrollIntoView({ block: "start", behavior: ruhig ? "auto" : "smooth" });
    }
  }, [schritt, fertig]);

  const weiter = (nach: number) => window.setTimeout(() => setSchritt(nach), 180);

  const waehleWeg = (id: PartnerWeg) => {
    // Ein Wechsel des Wegs verwirft Bereich und Antworten, denn die Fragen sind andere.
    if (id !== weg) {
      setAntworten({});
      const rollen = rollenFuerWeg(id);
      setRolle(rollen.length === 1 ? rollen[0] : null);
    }
    setWeg(id);
    weiter(1);
  };

  const waehleRolle = (id: PartnerRolle) => {
    setRolle(id);
    weiter(schritt + 1);
  };

  const waehleAntwort = (schluessel: string, id: string) => {
    setAntworten((a) => ({ ...a, [schluessel]: id }));
    weiter(schritt + 1);
  };

  const setze = (feld: keyof PartnerKontakt, wert: string) => {
    setKontakt((k) => ({ ...k, [feld]: wert }));
    if (fehler[feld]) setFehler((f) => ({ ...f, [feld]: "" }));
  };

  const absenden = async () => {
    const f: Record<string, string> = { ...(pruefeKontakt(kontakt) as Record<string, string>) };
    if (!einwilligung) f.einwilligung = PARTNER_EINWILLIGUNG_FEHLT;
    setFehler(f);
    // Am Handy liegen die Felder beim Absenden über dem Sichtfeld: zum ersten Fehler springen.
    const erstesFeld = (["vorname", "nachname", "email", "telefon", "firma"] as const).find((k) => f[k]);
    if (erstesFeld) document.getElementById(`pw-${erstesFeld}`)?.focus();
    if (Object.keys(f).length > 0 || !rolle || !weg) return;
    setSendet(true);
    setMeldung(null);
    const ergebnis = await sendePartnerAnfrage({ weg, rolle, antworten, kontakt, einwilligung, hp, dauerMs: Date.now() - start.current });
    setSendet(false);
    // `in` statt `!ergebnis.ok`: Ohne strictNullChecks engt TypeScript sonst nicht ein.
    if ("fehler" in ergebnis) {
      setMeldung(ergebnis.fehler);
      return;
    }
    setFertig(true);
  };

  const schritte = schritteFuer(weg);
  const aktuell = schritte[Math.min(schritt, schritte.length - 1)];
  // Ohne gewählten Weg ist die Zahl der Schritte noch offen; der Balken zeigt dann den Anfang.
  const gesamt = weg ? schritte.length : 0;
  const prozent = gesamt ? Math.round(((schritt + 1) / gesamt) * 100) : 12;
  const kopf = (
    <>
      <div className="hb-konfig-kopf">
        <span>
          <b>Schritt {schritt + 1}</b>
          {gesamt ? ` von ${gesamt}` : ""}
        </span>
        <span>Unverbindlich und kostenlos</span>
      </div>
      <div className="hb-balken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prozent} aria-label="Fortschritt">
        <i style={{ width: `${prozent}%` }} />
      </div>
    </>
  );
  const zurueck = (
    <button type="button" className="hb-link-knopf" onClick={() => (schritt === 0 ? onZurueckZurSeite() : setSchritt((s) => s - 1))}>
      <ArrowLeft aria-hidden="true" style={{ width: 16, height: 16, verticalAlign: "-3px", marginRight: 4 }} />
      {schritt === 0 ? "Zur Seite" : "Zurück"}
    </button>
  );

  const fussWeiter = (moeglich: boolean, sonst: string) =>
    moeglich ? (
      <button type="button" className="hb-link-knopf" onClick={() => setSchritt(schritt + 1)}>
        Weiter <ArrowRight aria-hidden="true" style={{ width: 16, height: 16 }} />
      </button>
    ) : (
      <span>{sonst}</span>
    );

  // ─── Weg ─────────────────────────────────────────────────────────────
  if (!fertig && aktuell.art === "weg") {
    return (
      <div className="hb-konfig hb-karte" id="partner-wizard">
        {kopf}
        <h3 ref={ueberschrift} tabIndex={-1}>
          Wie möchtest du mit uns arbeiten?
        </h3>
        <p className="hb-warum">
          <Info aria-hidden="true" />
          <span>Danach richten sich die nächsten Fragen. Den Weg kannst du im Gespräch noch ändern.</span>
        </p>
        <div className="hb-kacheln pw-kacheln-weg" role="group" aria-label="Wie möchtest du mit uns arbeiten?">
          {PARTNER_WEGE.map((w) => {
            const Icon = WEG_SYMBOLE[w.id];
            const gewaehlt = weg === w.id;
            return (
              <button key={w.id} type="button" className="hb-kachel breit" aria-pressed={gewaehlt} onClick={() => waehleWeg(w.id)}>
                <span className="hb-kachel-symbol">{gewaehlt ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
                <span className="pw-kachel-text">
                  {w.text}
                  <small>{w.kurz}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="hb-konfig-fuss">
          {zurueck}
          {fussWeiter(!!weg, "Ein Klick genügt")}
        </div>
      </div>
    );
  }

  // ─── Bereich ─────────────────────────────────────────────────────────
  if (!fertig && aktuell.art === "rolle" && weg) {
    const rollen = PARTNER_ROLLEN.filter((r) => rollenFuerWeg(weg).includes(r.id));
    return (
      <div className="hb-konfig hb-karte" id="partner-wizard">
        {kopf}
        <h3 ref={ueberschrift} tabIndex={-1}>
          Aus welchem Bereich kommst du?
        </h3>
        <p className="hb-warum">
          <Info aria-hidden="true" />
          <span>{weg === "tippgeber" ? TIPPGEBER_ERLAUBNIS_HINWEIS : "So bereiten wir das Gespräch passend vor."}</span>
        </p>
        <div className="hb-kacheln" role="group" aria-label="Aus welchem Bereich kommst du?">
          {rollen.map((r, i) => {
            const Icon = ROLLEN_SYMBOLE[r.id];
            const gewaehlt = rolle === r.id;
            const breit = rollen.length % 2 === 1 && i === rollen.length - 1;
            return (
              <button key={r.id} type="button" className={`hb-kachel${breit ? " breit" : ""}`} aria-pressed={gewaehlt} onClick={() => waehleRolle(r.id)}>
                <span className="hb-kachel-symbol">{gewaehlt ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
                {r.text}
              </button>
            );
          })}
        </div>
        <div className="hb-konfig-fuss">
          {zurueck}
          {fussWeiter(!!rolle, "Ein Klick genügt")}
        </div>
      </div>
    );
  }

  // ─── Fragen ──────────────────────────────────────────────────────────
  if (!fertig && aktuell.art === "frage") {
    const frage = aktuell.frage;
    const gewaehlt = antworten[frage.schluessel];
    return (
      <div className="hb-konfig hb-karte" id="partner-wizard">
        {kopf}
        <h3 ref={ueberschrift} tabIndex={-1}>
          {frage.frage}
        </h3>
        <p className="hb-warum">
          <Info aria-hidden="true" />
          <span>
            <span className="sr-only">Warum wir fragen: </span>
            {frage.warum}
          </span>
        </p>
        <div className="hb-kacheln" role="group" aria-label={frage.frage}>
          {frage.antworten.map((a, i) => {
            const an = gewaehlt === a.id;
            const breit = frage.antworten.length % 2 === 1 && i === frage.antworten.length - 1;
            return (
              <button
                key={a.id}
                type="button"
                className={`hb-kachel${breit ? " breit" : ""}`}
                aria-pressed={an}
                onClick={() => waehleAntwort(frage.schluessel, a.id)}
              >
                <span className="hb-kachel-symbol">{an ? <Check aria-hidden="true" /> : <b aria-hidden="true">{i + 1}</b>}</span>
                {a.text}
              </button>
            );
          })}
        </div>
        <div className="hb-konfig-fuss">
          {zurueck}
          {fussWeiter(!!gewaehlt, "Kontaktdaten erst am Ende")}
        </div>
      </div>
    );
  }

  // ─── Dank ────────────────────────────────────────────────────────────
  if (fertig) {
    return (
      <div className="hb-konfig hb-karte" id="partner-wizard">
        <span className="hb-pill gruen">
          <Check aria-hidden="true" /> Eingetragen
        </span>
        <h3 ref={ueberschrift} tabIndex={-1} style={{ marginTop: 14 }}>
          Danke, {kontakt.vorname.trim()}. Wir melden uns bei dir.
        </h3>
        <p className="hb-warum" style={{ display: "block" }}>
          Deine Angaben sind bei uns angekommen. Jemand aus unserem Team ruft dich an, um das Kennenlernen abzustimmen.
          Bis dahin musst du nichts weiter tun.
        </p>
        <button type="button" className="hb-knopf hb-zweit" style={{ width: "100%" }} onClick={onZurueckZurSeite}>
          Zurück zur Seite
        </button>
      </div>
    );
  }

  // ─── Kontakt ─────────────────────────────────────────────────────────
  return (
    <div className="hb-konfig hb-karte" id="partner-wizard">
      {kopf}
      <h3 ref={ueberschrift} tabIndex={-1} style={{ fontSize: 22 }}>
        Wie erreichen wir dich?
      </h3>
      <p className="hb-warum" style={{ marginBottom: 14 }}>
        <Info aria-hidden="true" />
        <span>Wir rufen dich an, um ein unverbindliches Kennenlernen abzustimmen. Es geht keine automatische Mail hinaus.</span>
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void absenden();
        }}
      >
        <div className="hb-felder">
          <Feld id="pw-vorname" pflicht label="Vorname" wert={kontakt.vorname} fehler={fehler.vorname} autoComplete="given-name" onChange={(v) => setze("vorname", v)} />
          <Feld id="pw-nachname" pflicht label="Nachname" wert={kontakt.nachname} fehler={fehler.nachname} autoComplete="family-name" onChange={(v) => setze("nachname", v)} />
        </div>
        <Feld id="pw-email" pflicht label="E-Mail" typ="email" wert={kontakt.email} fehler={fehler.email} autoComplete="email" onChange={(v) => setze("email", v)} />
        <Feld
          id="pw-telefon"
          pflicht
          label="Handynummer"
          hinweis="Damit wir dich für das Kennenlernen anrufen können."
          typ="tel"
          wert={kontakt.telefon}
          fehler={fehler.telefon}
          autoComplete="tel"
          onChange={(v) => setze("telefon", v)}
        />
        <Feld id="pw-firma" label="Firma" zusatz="(optional)" wert={kontakt.firma} fehler={fehler.firma} autoComplete="organization" onChange={(v) => setze("firma", v)} />
        <p className="hb-klein hb-pflicht-hinweis">Mit * markierte Angaben brauchen wir, um dich zu erreichen.</p>
        {/* Honigtopf: für Menschen unsichtbar und nicht erreichbar. */}
        <div className="hb-honig" aria-hidden="true">
          <label htmlFor="pw-website">Website</label>
          <input id="pw-website" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
        </div>
        <label className={`hb-haken ${fehler.einwilligung ? "fehlt" : ""}`}>
          <input
            type="checkbox"
            checked={einwilligung}
            onChange={(e) => {
              setEinwilligung(e.target.checked);
              if (fehler.einwilligung) setFehler((f) => ({ ...f, einwilligung: "" }));
            }}
            aria-required="true"
            aria-invalid={!!fehler.einwilligung}
          />
          <span>
            {PARTNER_EINWILLIGUNG_KURZ}{" "}
            <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
              Datenschutz
            </a>
            <span className="hb-pflicht" aria-hidden="true">
              {" *"}
            </span>
          </span>
        </label>
        {/* Der volle Wortlaut ist der Text, dem zugestimmt und der gespeichert wird. */}
        <details className="hb-einwilligung-voll">
          <summary>Vollständiger Text</summary>
          <p>
            <MitPlatzhaltern text={PARTNER_EINWILLIGUNG_TEXT} />
          </p>
        </details>
        {fehler.einwilligung && (
          <div className="hb-meldung" role="alert">
            {fehler.einwilligung}
          </div>
        )}
        {meldung && (
          <div className="hb-meldung" role="alert">
            {meldung}
          </div>
        )}
        <button type="submit" className="hb-knopf hb-orange" style={{ width: "100%", marginTop: 8 }} disabled={sendet}>
          {sendet ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" /> Wird gesendet
            </>
          ) : (
            <>
              Jetzt Partner werden <ArrowRight aria-hidden="true" />
            </>
          )}
        </button>
        <div className="hb-konfig-fuss">
          {zurueck}
          <span />
        </div>
      </form>
    </div>
  );
}
