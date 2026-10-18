import { useState } from "react";
import { Archive, AlertTriangle, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KundenprofilLayout } from "@/components/kunden/profil/KundenprofilLayout";
import { KundenprofilNavigation } from "@/components/kunden/profil/KundenprofilNavigation";
import { KundenprofilStammdaten, type KundenprofilAbschnittDef } from "@/components/kunden/profil/KundenprofilStammdaten";
import { KundenprofilLeadScore } from "@/components/kunden/profil/KundenprofilLeadScore";
import { KundenprofilAktionsleiste } from "@/components/kunden/profil/KundenprofilAktionsleiste";
import { KundenprofilAktivitaeten } from "@/components/kunden/profil/KundenprofilAktivitaeten";
import { KundenprofilRechnerZeilen, baueRechnerQuellen } from "@/components/kunden/profil/KundenprofilRechnerZeilen";
import { KundenspracheFeld } from "@/components/kunden/profil/KundenspracheFeld";
import { portalAmpel, empfehlungAmpel } from "@/components/kunden/profil/KundenprofilAmpel";
import {
  KontaktFelder,
  LeadFelder,
  Person2Felder,
  QualifizierungFelder,
  qualifizierungHinweis,
  type StammdatenEntwurf,
} from "@/components/kunden/profil/KundenprofilKundendaten";
import { KundenportalZugang } from "@/components/kunde/KundenportalZugang";
import { InactivityAmpel } from "@/components/kunden/InactivityAmpel";
import type { KundeData } from "@/lib/kundenStore";
import type { Sprache } from "@/lib/kundenSprache";
import "@/components/kunden/profil/kundenprofil.css";

/*
 * Lokale Vorschau der linken Spalte des Kundenprofils (18.10.2026), nur im
 * Entwicklungsmodus (siehe vorschauRouten.ts), ohne Anmeldung und ohne
 * Datenbank. Max Mustermann ist erfunden. Gespeichert wird nur in dieser
 * Ansicht; die Bausteine sind dieselben wie im echten Profil.
 */

type Ansicht = "admin" | "vertriebspartner" | "finanzierungspartner";
type Score = "niedrig" | "mittel" | "hoch" | "offen";

const SA: Record<Score, unknown> = {
  offen: null,
  niedrig: { vorname: "Max", nachname: "Mustermann", einkommen: { netto: 2600 }, mieteWarm: 1200, lebenshaltungskosten: 900, kredite: [{ rate: 600 }] },
  mittel: { vorname: "Max", nachname: "Mustermann", geburtsdatum: "12.03.1986", beschaeftigungsart: "Angestellt", einkommen: { netto: 3000 }, mieteWarm: 1300, lebenshaltungskosten: 900, vermoegenswerte: [{ betrag: 12000 }] },
  hoch: {
    vorname: "Max", nachname: "Mustermann", geburtsdatum: "12.03.1986", strasse: "Musterweg", plz: "10115", ort: "Berlin", telefon: "030", email: "max@example.org",
    familienstand: "verheiratet", beschaeftigungsart: "Beamter", anstellung: { angestelltSeit: "2010" },
    einkommen: { netto: 7000 }, mieteWarm: 1500, lebenshaltungskosten: 1000, vermoegenswerte: [{ betrag: 80000 }],
  },
};

const tag = (versatz: number) => new Date(Date.now() + versatz * 86_400_000).toISOString();

const START: KundeData = {
  id: "vorschau-max",
  osImmoId: 1234,
  anrede: "Herr",
  vorname: "Max",
  nachname: "Mustermann",
  email: "max.mustermann@example.org",
  telefon: "+49 170 1234567",
  geburtstag: "12.03.1986",
  strasse: "Musterweg",
  hausnummer: "12",
  plz: "10115",
  ort: "Berlin",
  quelle: "Website",
  berater: "Erika Beispiel",
  erstellt_am: tag(-40),
  setter: "Sina Setter",
  pipelineStufe: "beratungsgespraech",
  qualZiel: "Vermögen für den Ruhestand aufbauen",
  qualEinkommen: "4200",
  qualEigenkapital: "25000",
  qualBeruflicheSituation: "angestellt",
  person2: {
    anrede: "Frau", vorname: "Maria", nachname: "Mustermann", geburtsdatum: "04.07.1988",
    email: "maria.mustermann@example.org", telefon: "+49 170 7654321",
    strasse: "Musterweg", hausnummer: "12", plz: "10115", ort: "Berlin",
  },
  updatedAt: tag(-2),
} as unknown as KundeData;

const META = {
  analyseScore: 72,
  leadQuality: "Hoch",
  analyseNachricht: "Ich möchte gern wissen, ob sich eine Wohnung für mich lohnt.",
  analyseSnapshot: { erfasstAm: tag(-9), monthlyZuzahlung: 180, wealthAfter10Years: 96000 },
  steuerSnapshot: { erfasstAm: tag(-15), jahresbrutto: 68000, steuerklasse: "IV", steuerlastHeute: 14200, ersparnisJahrVon: 2100, ersparnisJahrBis: 3400 },
  empfehlungsgeberName: "Klaus Beispiel",
  empfehlungsgeberBeziehung: "Kollege",
  erstelltVonId: "u1",
  erstelltVonName: "Anna Admin",
};

const KI = [
  { investmentId: "i1", nummer: 1, text: "Max möchte für den Ruhestand vorsorgen. Er hat 25.000 Euro Eigenkapital und ein sicheres Einkommen als Angestellter. Wunsch: Neubau in Berlin, Rate höchstens 200 Euro im Monat.", stand: tag(-3) },
];

const NUTZER = [{ id: "u1", name: "Anna Admin" }, { id: "u2", name: "Erika Beispiel" }];

export default function VorschauKundenprofilLinks() {
  const [ansicht, setAnsicht] = useState<Ansicht>("admin");
  const [score, setScore] = useState<Score>("mittel");
  const [kunde, setKunde] = useState<KundeData>(START);
  const [meta, setMeta] = useState<Record<string, unknown>>(META);
  const [sprache, setSprache] = useState<Sprache | null>("de");
  const [aktivitaetenOffen, setAktivitaetenOffen] = useState(true);
  const [vpDialog, setVpDialog] = useState(false);
  const [empfehlungAktiv, setEmpfehlungAktiv] = useState(false);

  const finanzierer = ansicht === "finanzierungspartner";
  const admin = ansicht === "admin";
  // Wie im Profil: ohne Recht kein Speicherweg, ohne Speicherweg kein Stift.
  const speichere = finanzierer ? undefined : async (aenderung: Partial<StammdatenEntwurf>) => {
    const { empfehlungsgeberName, empfehlungsgeberBeziehung, erstelltVonId, erstelltVonName, ...rest } = aenderung;
    const p2 = rest.person2;
    if (p2 && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((p2.email || "").trim())) return false;
    setKunde((k) => ({ ...k, ...rest }) as KundeData);
    setMeta((m) => ({
      ...m,
      ...(empfehlungsgeberName !== undefined ? { empfehlungsgeberName, empfehlungsgeberBeziehung } : {}),
      ...(erstelltVonId !== undefined ? { erstelltVonId, erstelltVonName } : {}),
    }));
    return true;
  };
  const speichereTeil = finanzierer ? undefined : async (patch: Record<string, string>) => {
    setKunde((k) => ({ ...k, ...patch }) as KundeData);
    return true;
  };
  const speichereMeta = finanzierer ? undefined : async (patch: Record<string, string>) => {
    setMeta((m) => ({ ...m, ...patch }));
    return true;
  };

  const abschnitte: KundenprofilAbschnittDef[] = [
    { schluessel: "person2", titel: "Person 2", hinweis: `${kunde.person2?.vorname} ${kunde.person2?.nachname}`, inhalt: <Person2Felder person2={kunde.person2!} speichere={speichere} onAnrufen={() => {}} /> },
    {
      schluessel: "lead", titel: "Lead- und Verwaltungsdaten", hinweis: kunde.berater,
      inhalt: <LeadFelder kunde={kunde} meta={meta} rolle={ansicht} speichere={speichere} ersteller={admin ? { nutzer: NUTZER } : undefined} vertriebspartnerName={kunde.berater} onVertriebspartnerAendern={admin ? () => setVpDialog(true) : undefined} onKontaktOeffnen={() => {}} />,
    },
    {
      schluessel: "portal", titel: "Kundenportal", ampel: portalAmpel("eingeladen"),
      inhalt: <KundenportalZugang status="eingeladen" freigeschaltetAm={tag(-3)} darfVerwalten={!finanzierer} darfZweiFaktorZuruecksetzen={admin} einladungGesendet={false} zweiFaktorLaeuft={false} onPerson2Einladen={() => {}} onEinladungErneut={() => {}} onZweiFaktorZuruecksetzen={() => {}} onSperren={() => {}} onEntsperren={() => {}} darstellung="profil" />,
    },
    ...(finanzierer ? [] : [{
      schluessel: "empfehlung", titel: "Empfehlungsprogramm", ampel: empfehlungAmpel(empfehlungAktiv),
      inhalt: <Button size="sm" variant={empfehlungAktiv ? "secondary" : "default"} onClick={() => setEmpfehlungAktiv((a) => !a)}>{empfehlungAktiv ? "Deaktivieren" : "Empfehlungsprogramm aktivieren"}</Button>,
    }]),
    {
      schluessel: "rechner", titel: "Angaben aus Rechnern und Gesprächen", hinweis: `${baueRechnerQuellen({ meta, erstelltAm: kunde.erstellt_am, ki: KI }).length} Quellen`,
      inhalt: <KundenprofilRechnerZeilen meta={meta} erstelltAm={kunde.erstellt_am} kontakt={{ vorname: kunde.vorname, nachname: kunde.nachname }} ki={KI} />,
    },
    { schluessel: "qualifizierung", titel: "Qualifizierungsfragen", hinweis: qualifizierungHinweis(kunde), inhalt: <QualifizierungFelder kunde={kunde} meta={meta} speichereKontakt={speichereTeil} speichereMeta={speichereMeta} /> },
    {
      schluessel: "verwaltung", titel: "Kunde verwalten",
      inhalt: (
        <div className={`kundenprofil-verwaltung ${finanzierer ? "finanzierer-readonly" : ""}`}>
          <div className="flex justify-center gap-4 pt-4 flex-wrap">
            {!finanzierer && <Button variant="outline"><Archive className="h-4 w-4 mr-1" /> Kunde archivieren</Button>}
            {!finanzierer && <Button variant="destructive"><XCircle className="h-4 w-4 mr-1" /> Kunde verloren</Button>}
            <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4 mr-1" /> Löschung beantragen</Button>
            {admin && <Button variant="destructive"><AlertTriangle className="h-4 w-4 mr-1" /> DSGVO-Sofortlöschung</Button>}
          </div>
        </div>
      ),
    },
  ];

  const umschalter = <T extends string,>(titel: string, werte: readonly T[], wert: T, setze: (w: T) => void) => (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={titel}>
      <span className="text-xs text-muted-foreground mr-1">{titel}</span>
      {werte.map((w) => (
        <Button key={w} size="sm" variant={w === wert ? "default" : "outline"} aria-pressed={w === wert} onClick={() => setze(w)}>{w}</Button>
      ))}
    </div>
  );

  return (
    <div data-lg="seite" className="min-h-screen bg-background text-foreground">
      <main className="kundenprofil mx-auto w-full max-w-[1500px] p-3 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-xs text-muted-foreground">Vorschau Kundenprofil, linke Spalte. Erfundene Daten.</p>
          {umschalter<Score>("Lead-Score", ["niedrig", "mittel", "hoch", "offen"], score, setScore)}
          {umschalter<Ansicht>("Ansicht", ["admin", "vertriebspartner", "finanzierungspartner"], ansicht, setAnsicht)}
        </div>
        <KundenprofilLayout
          stammdaten={
            <KundenprofilStammdaten
              key={ansicht}
              name={`${kunde.vorname} ${kunde.nachname}`}
              anrede={kunde.anrede}
              namenBearbeitung={speichere && { start: () => ({ vorname: kunde.vorname, nachname: kunde.nachname }), speichern: (w) => speichere(w) }}
              ampel={<InactivityAmpel kunde={kunde} size="md" showLabel />}
              leadScore={<KundenprofilLeadScore key={score} saData={SA[score]} />}
              aktionen={<KundenprofilAktionsleiste onAktion={() => {}} />}
              kontakt={<KontaktFelder kunde={kunde} speichere={speichere} onAnrufen={() => {}} sprache={<KundenspracheFeld wert={sprache} onWahl={finanzierer ? undefined : setSprache} />} />}
              abschnitte={abschnitte}
            />
          }
          hinweise={finanzierer ? [<p key="nl" role="status" className="rounded-os-sm border border-primary/40 bg-primary/5 px-3 py-2 text-xs">Nur-Lese-Modus: Du kannst dieses Kundenprofil einsehen.</p>] : undefined}
          navigation={<KundenprofilNavigation tabs={[{ key: "investments", label: "Investments", anzahl: 2 }, { key: "dokumente", label: "📁 Dokumente" }, { key: "kommunikation", label: "💬 Kommunikation" }, { key: "empfehlungen", label: "Empfehlungen" }]} activeTab="investments" rolle={ansicht} portalFreigeschalten onWechsel={() => {}} />}
          aktivitaetenOffen={aktivitaetenOffen}
          aktivitaeten={<KundenprofilAktivitaeten offen={aktivitaetenOffen} anzahl={3} onUmschalten={() => setAktivitaetenOffen((o) => !o)} onNotiz={() => {}}><p className="text-sm text-muted-foreground">Drei erfundene Einträge.</p></KundenprofilAktivitaeten>}
        >
          <div className="kundenprofil-investmentliste overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>Nr.</th><th>Objekt</th><th>Stufe</th><th>Unterlagen</th><th>Nächster Schritt</th><th></th></tr></thead>
              <tbody>
                <tr className="border-t"><td className="py-2">Investment 1</td><td>Musterstraße 5, WE 3</td><td><Badge variant="outline">Beratungsgespräch</Badge></td><td>4 von 10</td><td>Selbstauskunft senden</td><td></td></tr>
                <tr className="border-t"><td className="py-2">Investment 2</td><td>Noch kein Objekt</td><td><Badge variant="outline">Erstgespräch</Badge></td><td>0 von 10</td><td>Objektauswahl</td><td></td></tr>
              </tbody>
            </table>
          </div>
        </KundenprofilLayout>
      </main>
      <Dialog open={vpDialog} onOpenChange={setVpDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vertriebspartner ändern</DialogTitle>
            <DialogDescription>Im echten Profil öffnet sich hier derselbe Ablauf wie bisher: Auswahl, Grund der Übergabe, Speichern.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
