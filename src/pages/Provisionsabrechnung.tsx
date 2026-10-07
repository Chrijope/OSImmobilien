import { useMemo, useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { AbrechnungenTabs } from "@/components/AbrechnungenTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, FileText, RefreshCw, CheckCircle2, Wallet, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { hinweisDialog } from "@/lib/confirm";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getKontakte } from "@/lib/kundenStore";
import { excludeStatsKontakte } from "@/lib/statsExclusion";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { istZustaendig } from "@/lib/kontaktOwnership";
import { calculateJuniorOverride, getUserPaket, getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { getLizenzPaket, OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import { festgeschriebenerSatz, getEffectiveRateInfoForKontakt, getKarriereOverrideForUser } from "@/lib/karriereStufeHelper";
import {
  getAbrechnungen, upsertAbrechnung, updateAbrechnungStatus, newId, entferneLeerenBescheid,
  monatLabel, fmtEUR, refreshAbrechnungen, abrechnungenPersistenz, bescheidVeraenderbar,
  type Provisionsabrechnung, type AbrechnungDeal, type AbrechnungOverride, type AbrechnungOverhead, type AbrechnungStatus,
} from "@/lib/provisionsAbrechnungStore";
import { buildProvisionsBescheidPdf } from "@/lib/provisionsBescheidPdf";
import { logAudit } from "@/lib/auditLog";
import { getInvestments, type Investment } from "@/lib/investmentsStore";
import { istAbschluss, istStorniert } from "@/lib/abschlussDefinition";
import { investmentKaufpreis } from "@/lib/objektDatenPflicht";
import {
  abgerechneteGeschaefte, abrechnungsstand, abschlussDatumFuer, investmentsJeKontakt, investmentsOhneKaufpreis, notarDatumFuer,
  kaufpreisMitRueckfall, provisionCent, type GeschaeftZuordnung,
} from "@/lib/abrechnungRechnung";
import { monatBerlinIso } from "@/lib/datumsformate";
import { SatzartBadge, SatzartLegende } from "@/components/abrechnung/SatzartBadge";

/**
 * Wann gilt ein Geschäft als abgeschlossen? Am Notartermin, siehe
 * `abschlussDatumFuer`; dieselbe Regel ordnet Altbescheide zu.
 */
const abschlussDatum = (inv: Investment, k: any): string => abschlussDatumFuer(inv, k);

/** `basis` (JJJJ-MM) minus `i` Monate. */
function monatZurueck(basis: string, i: number): string {
  const [j, m] = basis.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 - i, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Summe in Cent, damit sich keine Rundung über die Posten aufschaukelt. */
const summeCent = (posten: { betrag: number }[]) =>
  posten.reduce((s, d) => s + Math.round(d.betrag * 100), 0);

const STATUS_LABEL: Record<AbrechnungStatus, string> = {
  offen: "Offen", freigegeben: "Freigegeben", ausgezahlt: "Ausgezahlt",
};
const STATUS_VARIANT: Record<AbrechnungStatus, "secondary" | "default" | "outline"> = {
  offen: "secondary", freigegeben: "default", ausgezahlt: "outline",
};

export default function Provisionsabrechnung() {
  useLiveVersion(["kontakte", "user_settings"]);
  const { user, authUser } = useUser();
  const isAdmin = user.role === "admin" || (user as any).role === "inhaber";
  // Schreiben duerfen laut Zugriffsregel Admin, Inhaber und Buchhaltung.
  const darfSchreiben = isAdmin || user.role === "buchhaltung";

  // Der Monat in deutscher Zeit, nicht in der des Geraets oder in UTC.
  const aktuellerMonat = monatBerlinIso();
  const [monat, setMonat] = useState<string>(aktuellerMonat);
  const [rows, setRows] = useState<Provisionsabrechnung[]>(getAbrechnungen());
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => setRows(getAbrechnungen());
    window.addEventListener("mi_provisionsabrechnungen_changed", handler);
    // Die Bescheide liegen in der Datenbank. Beim Öffnen der Seite einmal
    // nachladen, damit ein Partner sieht, was die Buchhaltung erzeugt hat.
    void refreshAbrechnungen().then((fehler) => {
      if (fehler) toast.error("Die Bescheide konnten nicht geladen werden", { description: fehler });
      handler();
    });
    return () => window.removeEventListener("mi_provisionsabrechnungen_changed", handler);
  }, []);

  const users = useMemo(() => loadAllUsers(), []);

  // Investments ab Reservierung ohne Kaufpreis. Sie fehlen in jedem Bescheid
  // und werden deshalb ausdruecklich genannt statt still uebergangen.
  const ohneKaufpreis = useMemo(() => {
    const kontakteById = new Map(getKontakte().map((k) => [k.id, k as any]));
    return investmentsOhneKaufpreis(getInvestments(), kontakteById, investmentKaufpreis);
  }, [rows]);

  /*
   * Abrechnungen für den gewählten Monat erzeugen oder aktualisieren.
   *
   * Seit dem 04.10.2026 je INVESTMENT und mit dem Kaufpreis des Investments,
   * dieselbe Grundlage wie die Übersicht unter /abrechnungen. Vorher je
   * Kontakt mit `kontakt.kaufpreis`: Wo der Preis nur am Investment stand,
   * fiel der Abschluss aus dem Bescheid, und zwei Investments eines Kunden
   * wurden als einer mit dem Kontaktwert gerechnet.
   *
   * Ein Bescheid, der schon freigegeben oder ausgezahlt ist, bleibt, wie er
   * ist. Er ist ein Beleg.
   */
  const generateForMonth = async () => {
    const kontakteById = new Map(
      excludeStatsKontakte(getKontakte())
        .filter((k) => !k.archiviert && !k.geloescht && !istStorniert(k as any))
        .map((k) => [k.id, k]),
    );
    const alleInvestments = getInvestments();
    const jeKontakt = investmentsJeKontakt(alleInvestments);
    const bestand = getAbrechnungen();
    /*
     * Was schon in einem freigegebenen oder ausgezahlten Bescheid eines
     * ANDEREN Monats steht, kommt in keinen weiteren. Ein Investment darf nie
     * in zwei Monaten abgerechnet werden. Bescheide dieses Monats sind
     * entweder gesperrt (werden übersprungen) oder offen (werden neu
     * berechnet).
     */
    const abgerechnet = abgerechneteGeschaefte(
      bestand.filter((b) => b.monat !== monat),
      ["ausgezahlt", "freigegeben"],
    );
    const zuordnungJeKontakt = new Map<string, GeschaeftZuordnung[]>();
    for (const inv of alleInvestments) {
      const k = kontakteById.get(inv.kontaktId);
      // Zuordnung zu Altbescheiden nur über den Notartermin selbst.
      const z = { investmentId: inv.id, kontaktId: inv.kontaktId, notarMonat: monatBerlinIso(notarDatumFuer(inv, k)) };
      zuordnungJeKontakt.set(inv.kontaktId, [...(zuordnungJeKontakt.get(inv.kontaktId) ?? []), z]);
    }
    let schonAbgerechnet = 0;
    const klaeren: string[] = [];
    const geschaefte = alleInvestments.flatMap((inv) => {
      const k = kontakteById.get(inv.kontaktId);
      // Ein storniertes oder verlorenes Geschäft wird nicht abgerechnet, und
      // nur, was auch tatsächlich abgeschlossen ist.
      if (!k || istStorniert(inv) || !istAbschluss(inv.pipelineStufe)) return [];
      // Der Abrechnungsmonat richtet sich nach dem Notartermin, in deutscher
      // Zeit, nicht danach, wann jemand den Datensatz zuletzt angefasst hat.
      if (monatBerlinIso(abschlussDatum(inv, k)) !== monat) return [];
      const notarMonat = monatBerlinIso(notarDatumFuer(inv, k));
      // Der Kontaktwert gilt nur bei genau einem Investment, sonst steht es
      // unter „Kaufpreis fehlt“.
      const kaufpreis = kaufpreisMitRueckfall(investmentKaufpreis(inv.id), k.kaufpreis, jeKontakt.get(inv.kontaktId) ?? 0);
      if (kaufpreis <= 0) return [];
      const stand = abrechnungsstand(
        abgerechnet,
        { investmentId: inv.id, kontaktId: inv.kontaktId, notarMonat },
        zuordnungJeKontakt.get(inv.kontaktId) ?? [],
      );
      if (stand === "ja") { schonAbgerechnet++; return []; }
      if (stand === "klaeren") { klaeren.push(`${k.vorname} ${k.nachname}`.trim()); return []; }
      return [{ inv, k, kaufpreis }];
    });
    if (klaeren.length > 0) {
      void hinweisDialog({
        title: "Bitte klären",
        description: `${klaeren.length === 1 ? "Ein Abschluss steht" : `${klaeren.length} Abschlüsse stehen`} nicht im Bescheid, weil es zum Kunden einen älteren Bescheid ohne Zuordnung zum Investment gibt: ${klaeren.join(", ")}. Bitte prüfe, ob er schon abgerechnet ist.`,
      });
    }
    /*
     * Offene Bescheide dieses Monats, zu denen es keinen Abschluss mehr gibt,
     * fallen weg. Sonst stünde ein veralteter Betrag da, den jemand
     * freigeben oder bezahlen könnte. Freigegebene bleiben immer.
     */
    const mitAbschluss = new Set<string>();
    const leereEntfernen = async (): Promise<number> => {
      let entfernt = 0;
      for (const b of bestand) {
        if (b.monat !== monat || b.status !== "offen" || mitAbschluss.has(b.userId)) continue;
        // Schon geleert, nichts zu tun.
        if (b.eigeneDeals.length === 0 && b.overridesErhalten.length === 0 && b.netto === 0) continue;
        try {
          if ((await entferneLeerenBescheid(b)) !== "unveraendert") entfernt++;
        } catch (e) {
          toast.error(`Veralteter Bescheid von ${b.userName} nicht entfernt`, { description: (e as Error).message });
        }
      }
      return entfernt;
    };

    if (geschaefte.length === 0) {
      const entfernt = await leereEntfernen();
      setRows(getAbrechnungen());
      toast.info(`Keine offenen Abschlüsse im ${monatLabel(monat)} gefunden.`, {
        description: [
          schonAbgerechnet > 0 ? `${schonAbgerechnet} stehen schon in einem anderen Bescheid.` : "",
          entfernt > 0 ? `${entfernt} veraltete offene Bescheide entfernt oder geleert.` : "",
        ].filter(Boolean).join(" ") || undefined,
      });
      return;
    }

    let generated = 0;
    let gesperrt = 0;
    const fehler: string[] = [];
    for (const u of users) {
      // Kennung zuerst. Der Name zaehlt nur fuer Kontakte ohne Kennung und
      // nur, wenn er eindeutig ist.
      const eigene = geschaefte.filter(
        (g) => istZustaendig(g.k, { userId: u.id, userName: u.name }, users),
      );

      const eigeneDeals: AbrechnungDeal[] = eigene.map(({ inv, k, kaufpreis }) => {
        // Der beim Eintritt in die Kaufphase festgeschriebene Satz gilt
        // (Entscheidung Christian vom 29.09.2026), jetzt der dieses
        // Investments und nicht mehr der erste des Kontakts.
        const info = getEffectiveRateInfoForKontakt(u.id, k, festgeschriebenerSatz(inv.meta));
        return {
          investmentId: inv.id,
          kontaktId: k.id,
          kundeName: `${k.vorname} ${k.nachname}`,
          objekt: inv.objektTitel || k.objekt || "—",
          kaufpreis,
          satz: info.rate,
          betrag: provisionCent(kaufpreis, info.rate) / 100,
          satzTyp: info.quelle,
          setterName: info.setterName,
        };
      });

      // Wenn dieser User Junior ist → Override wird abgezogen
      const overheadsAbgezogen: AbrechnungOverhead[] = [];
      if (getUserPaket(u.id) === "junior") {
        for (const { inv, k, kaufpreis } of eigene) {
          const ov = calculateJuniorOverride(u.id, kaufpreis);
          if (!ov) continue;
          overheadsAbgezogen.push({
            anUserId: ov.recruiterUserId,
            anName: ov.recruiterName,
            objekt: inv.objektTitel || k.objekt || "—",
            kaufpreis,
            overheadRate: ov.overridePercent,
            betrag: ov.betrag,
          });
        }
      }

      // Differenzprovision (Overrides), die dieser User als Teamleiter/Recruiter erhält
      const overridesErhalten: AbrechnungOverride[] = [];
      for (const j of getJuniorsForRecruiter(u.id)) {
        const jGeschaefte = geschaefte.filter(
          (g) => istZustaendig(g.k, { userId: j.userId, userName: j.name }, users),
        );
        for (const { k, kaufpreis } of jGeschaefte) {
          const ov = calculateJuniorOverride(j.userId, kaufpreis);
          if (!ov || ov.recruiterUserId !== u.id) continue;
          overridesErhalten.push({
            kontaktId: k.id,
            juniorUserId: j.userId,
            juniorName: j.name,
            kundeName: `${k.vorname} ${k.nachname}`,
            kaufpreis,
            overridePercent: ov.overridePercent,
            betrag: ov.betrag,
          });
        }
      }

      if (eigeneDeals.length === 0 && overridesErhalten.length === 0) continue;
      mitAbschluss.add(u.id);

      const eigenCent = summeCent(eigeneDeals);
      const overridesCent = summeCent(overridesErhalten);
      const overheadCent = summeCent(overheadsAbgezogen);

      const existing = bestand.find((r) => r.userId === u.id && r.monat === monat);
      if (!bescheidVeraenderbar(existing)) {
        gesperrt++;
        continue;
      }
      const karriere = getKarriereOverrideForUser(u.id) || undefined;
      const a: Provisionsabrechnung = {
        id: existing?.id || newId(),
        monat, userId: u.id, userName: u.name,
        karriereStufe: karriere,
        eigeneDeals, overridesErhalten, overheadsAbgezogen,
        summeEigen: eigenCent / 100,
        summeOverridesErhalten: overridesCent / 100,
        summeOverhead: overheadCent / 100,
        netto: (eigenCent + overridesCent - overheadCent) / 100,
        status: existing?.status || "offen",
        freigegebenAm: existing?.freigegebenAm,
        freigegebenVon: existing?.freigegebenVon,
        ausgezahltAm: existing?.ausgezahltAm,
        ausgezahltVon: existing?.ausgezahltVon,
        pdfErstelltAm: existing?.pdfErstelltAm,
        erstelltAm: existing?.erstelltAm || new Date().toISOString(),
      };
      try {
        await upsertAbrechnung(a);
        generated++;
      } catch (e) {
        fehler.push(`${u.name}: ${(e as Error).message}`);
      }
    }
    const entfernt = await leereEntfernen();
    setRows(getAbrechnungen());
    if (fehler.length > 0) {
      toast.error(`${fehler.length} Bescheide wurden nicht gespeichert`, { description: fehler.join(" · ") });
    }
    toast.success(`${generated} Abrechnungen für ${monatLabel(monat)} aktualisiert.`, {
      description: [
        gesperrt > 0 ? `${gesperrt} freigegebene oder ausgezahlte Bescheide bleiben unverändert.` : "",
        schonAbgerechnet > 0 ? `${schonAbgerechnet} Abschlüsse stehen schon in einem anderen Bescheid.` : "",
        entfernt > 0 ? `${entfernt} veraltete offene Bescheide entfernt oder geleert.` : "",
      ].filter(Boolean).join(" ") || undefined,
    });
  };

  const rowsThisMonth = useMemo(
    () => rows.filter((r) => r.monat === monat).sort((a, b) => b.netto - a.netto),
    [rows, monat],
  );

  // Sicht für non-admin: nur eigene
  const visible = useMemo(() => {
    if (isAdmin) return rowsThisMonth;
    // Ueber die Kennung. `user` traegt keine, deshalb kam hier bisher nur der
    // Name zum Zug, und ein Namensvetter sah die fremde Abrechnung.
    const meId = authUser?.id;
    return rowsThisMonth.filter((r) => (r.userId ? r.userId === meId : r.userName === user.name));
  }, [rowsThisMonth, isAdmin, user, authUser?.id]);

  const sumNetto = visible.reduce((s, r) => s + r.netto, 0);

  const downloadPdf = (a: Provisionsabrechnung) => {
    const blob = buildProvisionsBescheidPdf(a);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Provisionsbescheid_${a.monat}_${a.userName.replace(/\s+/g, "_")}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    // Den Vermerk schreibt nur, wer laut Zugriffsregel schreiben darf. Beim
    // Partner scheiterte der Versuch bisher an der Datenbank und schaltete
    // den Store still auf den Browser-Speicher um.
    if (!a.pdfErstelltAm && darfSchreiben) {
      void upsertAbrechnung({ ...a, pdfErstelltAm: new Date().toISOString() })
        .then(() => setRows(getAbrechnungen()))
        .catch((e: Error) => toast.error("PDF-Vermerk nicht gespeichert", { description: e.message }));
    }
  };

  const setStatus = async (a: Provisionsabrechnung, status: AbrechnungStatus) => {
    let updated: Provisionsabrechnung | null = null;
    try {
      updated = await updateAbrechnungStatus(a.id, status, user.name);
    } catch (e) {
      toast.error("Status nicht geändert", { description: (e as Error).message });
      return;
    }
    if (!updated) return;
    setRows(getAbrechnungen());
    await logAudit({
      action: status === "ausgezahlt" ? "provision_ausgezahlt" : "provision_berechnet",
      entity: "provisionsabrechnung",
      entityId: a.id,
      vorher: { status: a.status },
      nachher: { status },
      meta: { monat: a.monat, userId: a.userId, netto: a.netto },
    });
    toast.success(`Status auf ${STATUS_LABEL[status]} gesetzt.`);
  };

  const detail = detailId ? rows.find((r) => r.id === detailId) : null;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        <AbrechnungenTabs />
        <PageHeader
          title="Provisionsabrechnung"
          subtitle={OVERHEAD_AKTIV
            ? "Monatliche Provisionsbescheide: Eigenumsatz, Differenzumsatz aus Junior-Team und Overhead-Abzüge."
            : "Monatliche Provisionsbescheide auf Basis der eigenen Abschlüsse."}
        />

        {abrechnungenPersistenz() === "lokal" && (
          <Card className="border-l-4 border-l-warning bg-warning/5">
            <CardContent className="py-3 text-xs text-muted-foreground">
              Die Bescheide werden gerade nur in diesem Browser gespeichert und sind für
              die Vertriebspartner nicht sichtbar. Die Datenbanktabelle
              <span className="font-medium text-foreground"> provisionsabrechnungen </span>
              fehlt noch, die zugehörige Migration ist noch nicht eingespielt.
            </CardContent>
          </Card>
        )}

        {isAdmin && ohneKaufpreis.length > 0 && (
          <Card className="border-l-4 border-l-warning bg-warning/5">
            <CardContent className="py-3 text-xs text-muted-foreground flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <span>
                <span className="font-medium text-foreground">Kaufpreis fehlt: </span>
                {ohneKaufpreis.length === 1 ? "1 Investment" : `${ohneKaufpreis.length} Investments`} ab
                Reservierung ohne Kaufpreis. Sie stehen in keinem Bescheid, bis der Kaufpreis eingetragen ist.{" "}
                <Link to="/abrechnungen" className="text-primary hover:underline">Liste unter Abrechnungen</Link>
              </span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6 flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Abrechnungsmonat</label>
              <Select value={monat} onValueChange={setMonat}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, i) => {
                    const m = monatZurueck(aktuellerMonat, i);
                    return <SelectItem key={m} value={m}>{monatLabel(m)}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <Button onClick={generateForMonth} variant="default">
                <RefreshCw className="mr-2 h-4 w-4" /> Abrechnungen neu berechnen
              </Button>
            )}
            <div className="ml-auto text-right">
              <div className="text-xs text-muted-foreground">Auszahlungssumme {monatLabel(monat)}</div>
              <div className="text-2xl font-bold text-primary">{fmtEUR(sumNetto)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Bescheide</CardTitle></CardHeader>
          <CardContent>
            {visible.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Keine Abrechnungen vorhanden.{isAdmin ? " Über „Neu berechnen“ erzeugen." : ""}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vertriebspartner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Eigenumsatz</TableHead>
                    {OVERHEAD_AKTIV && <TableHead className="text-right">Differenzumsatz</TableHead>}
                    {OVERHEAD_AKTIV && <TableHead className="text-right">Overhead-Abzug</TableHead>}
                    <TableHead className="text-right">Gesamt Netto</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.userName}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                      <TableCell className="text-right">{fmtEUR(r.summeEigen)}</TableCell>
                      {OVERHEAD_AKTIV && <TableCell className="text-right text-primary">{fmtEUR(r.summeOverridesErhalten)}</TableCell>}
                      {OVERHEAD_AKTIV && <TableCell className="text-right text-destructive">-{fmtEUR(r.summeOverhead)}</TableCell>}
                      <TableCell className="text-right font-bold">{fmtEUR(r.netto)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadPdf(r)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          {isAdmin && r.status === "offen" && (
                            <Button size="sm" variant="outline" onClick={() => setStatus(r, "freigegeben")}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Freigeben
                            </Button>
                          )}
                          {isAdmin && r.status === "freigegeben" && (
                            <Button size="sm" variant="default" onClick={() => setStatus(r, "ausgezahlt")}>
                              <Wallet className="h-4 w-4 mr-1" /> Auszahlen
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail-Dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Bescheid {detail.userName} · {monatLabel(detail.monat)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="font-semibold mb-1">Eigene Abschlüsse</div>
                  {detail.eigeneDeals.length === 0 ? (
                    <div className="text-muted-foreground">Keine.</div>
                  ) : detail.eigeneDeals.map((d, i) => (
                    <div key={i} className="flex justify-between border-b border-border/50 py-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        {d.kundeName} · {d.objekt}
                        {d.satzTyp && <SatzartBadge art={d.satzTyp} satz={d.satz} />}
                        {false && (
                          <Badge variant="outline" className="text-[10px]">Karrierestufe</Badge>
                        )}
                      </span>
                      <span>{d.satz}% von {fmtEUR(d.kaufpreis)} = <b>{fmtEUR(d.betrag)}</b></span>
                    </div>
                  ))}
                </div>
                {OVERHEAD_AKTIV && (
                <div>
                  <div className="font-semibold mb-1">Differenzprovision aus Junior-Team (erhalten)</div>
                  {detail.overridesErhalten.length === 0 ? (
                    <div className="text-muted-foreground">Keine.</div>
                  ) : detail.overridesErhalten.map((o, i) => (
                    <div key={i} className="flex justify-between border-b border-border/50 py-1">
                      <span>{o.juniorName} → {o.kundeName}</span>
                      <span>{o.overridePercent}% = <b className="text-primary">{fmtEUR(o.betrag)}</b></span>
                    </div>
                  ))}
                </div>
                )}
                {OVERHEAD_AKTIV && (
                <div>
                  <div className="font-semibold mb-1">Overhead-Abzüge</div>
                  {detail.overheadsAbgezogen.length === 0 ? (
                    <div className="text-muted-foreground">Keine.</div>
                  ) : detail.overheadsAbgezogen.map((o, i) => (
                    <div key={i} className="flex justify-between border-b border-border/50 py-1">
                      <span>an {o.anName} · {o.objekt}</span>
                      <span className="text-destructive">-{o.overheadRate}% = -{fmtEUR(o.betrag)}</span>
                    </div>
                  ))}
                </div>
                )}
                <div className="flex justify-between pt-2 border-t font-bold text-lg">
                  <span>{OVERHEAD_AKTIV ? "Gesamt Netto (Eigen + Differenz − Overhead)" : "Gesamt Netto"}</span>
                  <span className="text-primary">{fmtEUR(detail.netto)}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => downloadPdf(detail)}>
                  <Download className="h-4 w-4 mr-2" /> PDF herunterladen
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}