import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, euro, number } from "@/components/statistiken/ControllerViews";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { LEITUNG_ROLLEN } from "@/lib/bellNotifications";
import { abfrageDialog, confirmDialog } from "@/lib/confirm";
import { cacheGet } from "@/lib/dataCache";
import { getKontaktTyp } from "@/lib/kontaktTypHelper";
import { dbRowToKunde } from "@/lib/kundenStore";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { tarnName } from "@/lib/vorfuehrmodus";
import {
  einsatzfrist,
  ladeLeadPakete,
  leadPaketAendern,
  leadPaketAnlegen,
  leadPaketReklamieren,
  leadPaketZuweisungVermerken,
  paketZaehlung,
  type LeadPaket,
  type LeadPaketDaten,
  type LeadPaketZuweisung,
  type RpcErgebnis,
} from "@/lib/leadPaketStore";
import { datumDe } from "./LeadPaketAuswahl";

type KontaktZeile = Record<string, any>;

/**
 * Leads, die sich für ein Paket nachtragen lassen: beim Partner des Pakets,
 * nicht gelöscht, Lead der Gesellschaft (kein Eigenkontakt), zählen noch
 * für kein Paket und wurden aus diesem Paket nicht schon reklamiert.
 * Dieselben Regeln prüft `lead_paket_zuweisung_vermerken` noch einmal.
 */
export function nachtragKandidaten(
  paket: Pick<LeadPaket, "id" | "partner_id">,
  kontakte: KontaktZeile[],
  zuweisungen: LeadPaketZuweisung[],
  istLead: (k: KontaktZeile) => boolean,
): KontaktZeile[] {
  const belegt = new Set(
    zuweisungen.filter((z) => !z.reklamiert_am || z.paket_id === paket.id).map((z) => z.kontakt_id),
  );
  return kontakte
    .filter((k) => k.zustaendig_id === paket.partner_id && !k.geloescht && !belegt.has(k.id) && istLead(k))
    .sort((a, b) => `${a.nachname || ""} ${a.vorname || ""}`.localeCompare(`${b.nachname || ""} ${b.vorname || ""}`));
}

const istLeadDerGesellschaft = (k: KontaktZeile) => getKontaktTyp(dbRowToKunde(k)) === "lead";

const STATUS_TEXT: Record<LeadPaket["status"], string> = {
  offen: "Offen",
  erfuellt: "Vollständig geliefert",
  beendet: "Beendet",
};

/**
 * Abschnitt „Leadpakete“ im Statistik-Reiter Lead-Zuweisung: je Paket
 * gebucht, Zahlungseingang, Freischaltung, Einsatzfrist und die Zählung
 * geliefert, reklamiert, ersetzt, offen, darunter die Leads. Anlegen und
 * Zahlung/Freischaltung pflegen nur Admin und Inhaber, Reklamationen
 * erfasst die Leitung. Die Datenbank prüft dieselben Rollen noch einmal.
 */
export function LeadPaketeUebersicht({ ids }: { ids: Set<string> | null }) {
  const { user } = useUser();
  const { toast } = useToast();
  const darfPflegen = user.role === "admin" || user.role === "inhaber";
  const darfReklamieren = (LEITUNG_ROLLEN as readonly string[]).includes(user.role);
  const [daten, setDaten] = useState<LeadPaketDaten | null>(null);
  const [offen, setOffen] = useState<string | null>(null);

  const neuLaden = () => ladeLeadPakete().then(setDaten);
  useEffect(() => {
    void neuLaden();
  }, []);

  const nachAktion = async (e: RpcErgebnis, erfolg: string) => {
    if (e.ok) toast({ title: erfolg });
    else toast({ title: "Nicht gespeichert", description: e.meldung, variant: "destructive" });
    await neuLaden();
    return e.ok;
  };

  if (!daten) return null;
  if (daten.migrationFehlt) {
    return (
      <Section title="Leadpakete">
        <p>Die Leadpakete sind noch nicht eingerichtet. Dafür muss die Datenbankänderung für Leadpakete laufen.</p>
      </Section>
    );
  }
  if (daten.fehler) {
    return (
      <Section title="Leadpakete">
        <p role="alert">Die Leadpakete konnten nicht geladen werden: {daten.fehler}</p>
      </Section>
    );
  }

  const nutzer = loadAllUsers();
  const namen = new Map(nutzer.map((u) => [u.id, u.name || "Ohne Namen"]));
  const partnerName = (id: string | null) => (id ? tarnName(namen.get(id) || "Unbekanntes Konto", "partner") : "System");
  const kontaktZeilen = cacheGet<KontaktZeile>("kontakte");
  const kontakte = new Map(kontaktZeilen.map((k) => [k.id, k]));
  const pakete = daten.pakete.filter((p) => ids === null || ids.has(p.partner_id));

  const reklamieren = async (zuweisungId: string) => {
    const grund = await abfrageDialog({
      title: "Reklamation erfassen",
      description: "Warum wird der Lead reklamiert? Zum Beispiel falsche Kontaktdaten, Dublette oder nicht erreichbar. Der Lead zählt dann nicht mehr auf das Paket, der nächste Lead aus dem Paket gilt als Ersatz.",
      placeholder: "Grund",
      confirmText: "Reklamation speichern",
      cancelText: "Zurück",
    });
    if (grund) await nachAktion(await leadPaketReklamieren(zuweisungId, grund), "Reklamation gespeichert");
  };

  return (
    <Section
      title="Leadpakete"
      note="Gezählt werden nur Leads, die beim Zuweisen als Lieferung aus einem Paket vermerkt wurden. Reklamierte Leads zählen nicht, Ersatzleads zählen mit. Die Einsatzfrist läuft einen Monat ab Zahlungseingang, frühestens ab der Freischaltung im CRM."
    >
      {darfPflegen && <PaketAnlegen nutzer={nutzer} onAnlegen={async (a) => nachAktion(await leadPaketAnlegen(a), "Leadpaket angelegt")} />}
      {pakete.length === 0 ? (
        <p>In diesem Datenbereich gibt es noch kein Leadpaket.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Partner</th>
                <th className="py-2 px-2 font-medium">Gebucht</th>
                <th className="py-2 px-2 font-medium">Zahlungseingang</th>
                <th className="py-2 px-2 font-medium">Freischaltung</th>
                <th className="py-2 px-2 font-medium">Einsatzfrist bis</th>
                <th className="py-2 px-2 font-medium text-right">Geliefert</th>
                <th className="py-2 px-2 font-medium text-right">Reklamiert</th>
                <th className="py-2 px-2 font-medium text-right">Ersetzt</th>
                <th className="py-2 px-2 font-medium text-right">Offen</th>
                <th className="py-2 pl-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pakete.map((p) => {
                const z = paketZaehlung(p, daten.zuweisungen);
                const frist = einsatzfrist(p);
                const auf = offen === p.id;
                const lieferungen = daten.zuweisungen.filter((w) => w.paket_id === p.id);
                const ersatzVon = new Map(lieferungen.filter((w) => w.ersatz_fuer).map((w) => [w.ersatz_fuer as string, w]));
                const kontaktName = (id: string) => {
                  const k = kontakte.get(id);
                  return tarnName(`${k?.vorname || ""} ${k?.nachname || ""}`.trim() || "Ohne Namen", "kunde");
                };
                return (
                  <Fragment key={p.id}>
                    <tr className="border-t">
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-left hover:text-primary"
                          aria-expanded={auf}
                          onClick={() => setOffen(auf ? null : p.id)}
                        >
                          {auf ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {partnerName(p.partner_id)}
                        </button>
                      </td>
                      <td className="py-2 px-2">{p.anzahl} Leads, {euro(p.paketpreis)}<span className="block text-muted-foreground">am {datumDe(p.erstellt_am)}</span></td>
                      <td className="py-2 px-2">{datumDe(p.bezahlt_am) || "offen"}</td>
                      <td className="py-2 px-2">{datumDe(p.freigeschaltet_am) || "offen"}</td>
                      <td className="py-2 px-2">{frist ? datumDe(frist.ende) : "noch nicht begonnen"}</td>
                      <td className="py-2 px-2 text-right font-semibold">{number(z.geliefert)}</td>
                      <td className="py-2 px-2 text-right">{number(z.reklamiert)}</td>
                      <td className="py-2 px-2 text-right">{number(z.ersetzt)}</td>
                      <td className="py-2 px-2 text-right">{number(z.offen)}</td>
                      <td className="py-2 pl-2">{STATUS_TEXT[p.status]}</td>
                    </tr>
                    {auf && (
                      <tr>
                        <td colSpan={10} className="pb-4 space-y-3">
                          {darfPflegen && (
                            <PaketBearbeiten
                              paket={p}
                              onSpeichern={async (a) => nachAktion(await leadPaketAendern(a), "Leadpaket gespeichert")}
                            />
                          )}
                          {!darfPflegen && p.bemerkung && <p className="text-muted-foreground">Bemerkung: {p.bemerkung}</p>}
                          {darfReklamieren && p.status !== "beendet" && z.offen > 0 && (
                            <LieferungNachtragen
                              kandidaten={nachtragKandidaten(p, kontaktZeilen, daten.zuweisungen, istLeadDerGesellschaft)}
                              onVermerken={async (kontaktId) =>
                                nachAktion(await leadPaketZuweisungVermerken(p.id, kontaktId), "Lieferung vermerkt")
                              }
                            />
                          )}
                          {lieferungen.length === 0 ? (
                            <p className="text-muted-foreground">Aus diesem Paket ist noch kein Lead geliefert.</p>
                          ) : (
                            <table className="w-full text-sm bg-muted/40 rounded-md">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="p-2 font-medium">Lead</th>
                                  <th className="p-2 font-medium">Zugewiesen am</th>
                                  <th className="p-2 font-medium">Durch</th>
                                  <th className="p-2 font-medium">Reklamation</th>
                                  <th className="p-2 font-medium">Ersatz</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lieferungen.map((w) => {
                                  const ersatz = ersatzVon.get(w.id);
                                  return (
                                    <tr key={w.id} className="border-t align-top">
                                      <td className="p-2">
                                        <Link className="text-primary underline" to={`/kunden/${w.kontakt_id}`}>{kontaktName(w.kontakt_id)}</Link>
                                      </td>
                                      <td className="p-2">{datumDe(w.zugewiesen_am)}</td>
                                      <td className="p-2">{partnerName(w.zugewiesen_von)}</td>
                                      <td className="p-2">
                                        {w.reklamiert_am ? (
                                          <>
                                            Reklamiert am {datumDe(w.reklamiert_am)}
                                            {w.reklamationsgrund && <span className="block text-muted-foreground">Grund: {w.reklamationsgrund}</span>}
                                          </>
                                        ) : darfReklamieren ? (
                                          <Button size="sm" variant="outline" onClick={() => void reklamieren(w.id)}>Reklamation erfassen</Button>
                                        ) : (
                                          "Keine"
                                        )}
                                      </td>
                                      <td className="p-2">
                                        {w.ersatz_fuer && <span className="block">Ersatz für {kontaktName(lieferungen.find((x) => x.id === w.ersatz_fuer)?.kontakt_id || "")}</span>}
                                        {w.reklamiert_am && (ersatz ? `Ersetzt durch ${kontaktName(ersatz.kontakt_id)}` : "Ersatz steht aus")}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/** Einen Lead des Partners nachträglich als Lieferung aus dem Paket vermerken. */
function LieferungNachtragen({
  kandidaten,
  onVermerken,
}: {
  kandidaten: KontaktZeile[];
  onVermerken: (kontaktId: string) => Promise<boolean>;
}) {
  const [kontaktId, setKontaktId] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  if (kandidaten.length === 0) {
    return <p className="text-muted-foreground">Der Partner hat keinen weiteren Lead, der sich für dieses Paket nachtragen lässt.</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
      <label className="text-sm min-w-[16rem] flex-1">
        Lieferung nachtragen
        <Select value={kontaktId} onValueChange={setKontaktId}>
          <SelectTrigger><SelectValue placeholder="Lead des Partners wählen" /></SelectTrigger>
          <SelectContent>
            {kandidaten.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {tarnName(`${k.vorname || ""} ${k.nachname || ""}`.trim() || "Ohne Namen", "kunde")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <Button
        size="sm"
        disabled={!kontaktId || laeuft}
        onClick={async () => {
          setLaeuft(true);
          if (await onVermerken(kontaktId)) setKontaktId("");
          setLaeuft(false);
        }}
      >
        Als Lieferung vermerken
      </Button>
    </div>
  );
}

/** Neues Paket anlegen. Vorbelegt mit der Regel: 20 Leads für 2.500 € netto. */
function PaketAnlegen({
  nutzer,
  onAnlegen,
}: {
  nutzer: { id: string; name?: string; rollen?: string[] }[];
  onAnlegen: (a: Parameters<typeof leadPaketAnlegen>[0]) => Promise<boolean>;
}) {
  const [auf, setAuf] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [anzahl, setAnzahl] = useState("20");
  const [preis, setPreis] = useState("2500");
  const [bezahltAm, setBezahltAm] = useState("");
  const [freigeschaltetAm, setFreigeschaltetAm] = useState("");
  const [bemerkung, setBemerkung] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const partner = nutzer
    .filter((u) => (u.rollen || []).some((r) => r === "vertriebspartner" || r === "vertriebsleiter"))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const gueltig = !!partnerId && Number(anzahl) > 0 && Number(preis) >= 0 && anzahl !== "" && preis !== "";

  if (!auf) {
    return <Button size="sm" variant="outline" onClick={() => setAuf(true)}>Neues Leadpaket</Button>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3 rounded-md border p-3">
      <label className="text-sm sm:col-span-3">
        Partner
        <Select value={partnerId} onValueChange={setPartnerId}>
          <SelectTrigger><SelectValue placeholder="Partner wählen" /></SelectTrigger>
          <SelectContent>
            {partner.map((u) => <SelectItem key={u.id} value={u.id}>{tarnName(u.name || "Ohne Namen", "partner")}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="text-sm">Anzahl Leads<Input type="number" min={1} value={anzahl} onChange={(e) => setAnzahl(e.target.value)} /></label>
      <label className="text-sm">Paketpreis netto in Euro<Input type="number" min={0} value={preis} onChange={(e) => setPreis(e.target.value)} /></label>
      <span />
      <label className="text-sm">Zahlungseingang<Input type="date" value={bezahltAm} onChange={(e) => setBezahltAm(e.target.value)} /></label>
      <label className="text-sm">Freischaltung im CRM<Input type="date" value={freigeschaltetAm} onChange={(e) => setFreigeschaltetAm(e.target.value)} /></label>
      <label className="text-sm">Bemerkung<Input value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} /></label>
      <div className="flex gap-2 sm:col-span-3">
        <Button
          size="sm"
          disabled={!gueltig || laeuft}
          onClick={async () => {
            setLaeuft(true);
            const ok = await onAnlegen({
              partnerId,
              anzahl: Number(anzahl),
              paketpreis: Number(preis),
              bezahltAm: bezahltAm || null,
              freigeschaltetAm: freigeschaltetAm || null,
              bemerkung,
            });
            setLaeuft(false);
            if (ok) setAuf(false);
          }}
        >
          Leadpaket anlegen
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAuf(false)}>Schließen</Button>
      </div>
    </div>
  );
}

/** Zahlungseingang, Freischaltung, Bemerkung und Beenden, nur Admin und Inhaber. */
function PaketBearbeiten({
  paket,
  onSpeichern,
}: {
  paket: LeadPaket;
  onSpeichern: (a: Parameters<typeof leadPaketAendern>[0]) => Promise<boolean>;
}) {
  const [bezahltAm, setBezahltAm] = useState(paket.bezahlt_am || "");
  const [freigeschaltetAm, setFreigeschaltetAm] = useState(paket.freigeschaltet_am || "");
  const [bemerkung, setBemerkung] = useState(paket.bemerkung || "");
  const [laeuft, setLaeuft] = useState(false);
  const beendet = paket.status === "beendet";

  const speichern = async (neuBeendet: boolean) => {
    setLaeuft(true);
    await onSpeichern({ paketId: paket.id, bezahltAm: bezahltAm || null, freigeschaltetAm: freigeschaltetAm || null, beendet: neuBeendet, bemerkung });
    setLaeuft(false);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3 rounded-md border p-3">
      <label className="text-sm">Zahlungseingang<Input type="date" value={bezahltAm} onChange={(e) => setBezahltAm(e.target.value)} /></label>
      <label className="text-sm">Freischaltung im CRM<Input type="date" value={freigeschaltetAm} onChange={(e) => setFreigeschaltetAm(e.target.value)} /></label>
      <label className="text-sm">Bemerkung<Input value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2 sm:col-span-3">
        <Button size="sm" disabled={laeuft} onClick={() => void speichern(beendet)}>Speichern</Button>
        <Button
          size="sm"
          variant="outline"
          disabled={laeuft}
          onClick={async () => {
            const ja = await confirmDialog({
              title: beendet ? "Paket wieder öffnen?" : "Paket beenden?",
              description: beendet
                ? "Aus dem Paket kann dann wieder geliefert werden."
                : "Zum Beispiel bei Vertragsende. Aus dem Paket wird dann nichts mehr geliefert, die bisherigen Lieferungen bleiben als Nachweis stehen.",
              confirmText: beendet ? "Wieder öffnen" : "Beenden",
              cancelText: "Zurück",
            });
            if (ja) await speichern(!beendet);
          }}
        >
          {beendet ? "Wieder öffnen" : "Paket beenden"}
        </Button>
      </div>
    </div>
  );
}
