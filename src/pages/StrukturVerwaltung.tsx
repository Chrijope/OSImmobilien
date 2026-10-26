import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Pencil } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProvisionssatzBadges } from "@/components/abrechnung/ProvisionssatzBadges";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { supabase } from "@/integrations/supabase/client";
import { cacheGet, cacheRefreshTable } from "@/lib/dataCache";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { strukturUnter, teamleiterVon } from "@/lib/partnerstruktur";
import { formatSatzProzent, getCustomProvisionRate, getCustomProvisionRateEigen, parseProvisionssatz, SATZ_UNGUELTIG_TEXT } from "@/lib/provisionssatz";

/*
 * „Nutzerverwaltung“ für Vertriebspartner und Vertriebsleitung (16.10.2026).
 *
 * Vertriebspartner sehen ihre Struktur über alle Ebenen, laden neue
 * Vertriebspartner ein und setzen deren Satz, höchstens ihren eigenen
 * Eigen-Satz. Die Vertriebsleitung sieht alle Vertriebspartner mit ihrem
 * Teamleiter, ändert aber nichts. Admin und Inhaber nutzen die volle
 * Nutzerverwaltung. Erzwungen wird das in der Datenbank
 * (struktur_satz_setzen, user_settings_provision_schuetzen) und in
 * invite-user, nicht hier.
 */

interface Profil {
  id: string;
  name: string;
  email: string;
}

/** Höchstsatz, den jemand in seiner Struktur vergeben darf: sein Eigen-Satz. */
export function eigeneObergrenze(userId: string | null | undefined): number | null {
  return getCustomProvisionRateEigen(userId) ?? getCustomProvisionRate(userId);
}

/**
 * Erlaubter Bereich für den Satz eines Partners (seit 22.10.2026, wie
 * struktur_satz_grenzen in der Datenbank): höchstens der Satz seines direkten
 * Teamleiters, mindestens der höchste Satz direkt darunter. Sonst bekäme ein
 * Teamleiter eine negative Differenz oder würde übergangen.
 */
export function satzGrenzen(
  partnerId: string,
  settings: { user_id: string; einstellungen?: unknown }[],
  satzVon: (id: string) => number | null = eigeneObergrenze,
): { obergrenze: number | null; untergrenze: number | null } {
  const eintrag = settings.find((s) => s.user_id === partnerId);
  const leiter = teamleiterVon(eintrag?.einstellungen, partnerId);
  const darunter = settings
    .filter((s) => s.user_id !== partnerId && teamleiterVon(s.einstellungen, s.user_id) === partnerId)
    .map((s) => satzVon(s.user_id))
    .filter((x): x is number => x !== null);
  return { obergrenze: leiter ? satzVon(leiter) : null, untergrenze: darunter.length ? Math.max(...darunter) : null };
}

export default function StrukturVerwaltung() {
  const { user, authUser } = useUser();
  const istVertriebsleitung = user.role === "vertriebsleiter";
  const ich = authUser?.id ?? "";
  useLiveVersion(["user_settings"]);

  const [profile, setProfile] = useState<Profil[]>([]);
  const [vpIds, setVpIds] = useState<Set<string>>(new Set());
  const [ladefehler, setLadefehler] = useState<string | null>(null);

  const laden = async () => {
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("id, name, email"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (p.error || r.error) {
      setLadefehler((p.error || r.error)!.message);
      return;
    }
    setLadefehler(null);
    setProfile((p.data ?? []).map((x: any) => ({ id: x.id, name: x.name || "(ohne Name)", email: x.email || "" })));
    setVpIds(new Set((r.data ?? []).filter((x: any) => x.role === "vertriebspartner").map((x: any) => x.user_id)));
  };
  useEffect(() => {
    void laden();
    void cacheRefreshTable("user_settings");
  }, []);

  const name = (id: string | null) => (id ? profile.find((p) => p.id === id)?.name ?? "Unbekannt" : "–");
  const obergrenze = eigeneObergrenze(ich);

  const zeilen = useMemo(() => {
    const settings = cacheGet<any>("user_settings");
    if (istVertriebsleitung) {
      return [...vpIds].map((id) => ({
        userId: id,
        ebene: null as number | null,
        teamleiterId: teamleiterVon(settings.find((s: any) => s.user_id === id)?.einstellungen, id),
      }));
    }
    return strukturUnter(ich, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [istVertriebsleitung, vpIds, ich, profile]);

  // Einladen
  const [einladenOffen, setEinladenOffen] = useState(false);
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [satzText, setSatzText] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const satz = parseProvisionssatz(satzText);
  const ueberGrenze = satz !== null && obergrenze !== null && satz > obergrenze;
  const einladenMoeglich = !!vorname.trim() && !!nachname.trim() && !!email.trim() && satz !== null && !ueberGrenze && !laeuft;

  const einladen = async () => {
    if (!einladenMoeglich) return;
    setLaeuft(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: email.trim(),
          name: `${vorname.trim()} ${nachname.trim()}`,
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          telefon: telefon.trim() || undefined,
          role: "vertriebspartner",
          roles: ["vertriebspartner"],
          // Ein Satz für Lead und Eigen; die Function prüft die Obergrenze.
          customProvisionRateSetter: satz,
          customProvisionRateEigen: satz,
        },
      });
      if (error) throw await edgeFehlerMitGrund(error, { functionName: "invite-user" });
      if (data?.error) throw new Error(data.error);
      toast.success(`Einladung an ${email.trim()} gesendet.`);
      setEinladenOffen(false);
      setVorname(""); setNachname(""); setEmail(""); setTelefon(""); setSatzText("");
      await cacheRefreshTable("user_settings");
      await laden();
    } catch (e) {
      toast.error("Einladung nicht gesendet", { description: (e as Error).message });
    } finally {
      setLaeuft(false);
    }
  };

  // Satz ändern
  const [aendernFuer, setAendernFuer] = useState<string | null>(null);
  const [neuerSatzText, setNeuerSatzText] = useState("");
  const neuerSatz = parseProvisionssatz(neuerSatzText);
  const grenzen = aendernFuer ? satzGrenzen(aendernFuer, cacheGet<any>("user_settings")) : { obergrenze: null, untergrenze: null };
  const hoechstens = [obergrenze, grenzen.obergrenze].filter((x): x is number => x !== null);
  const neuOben = hoechstens.length ? Math.min(...hoechstens) : null;
  const neuUeberGrenze = neuerSatz !== null && neuOben !== null && neuerSatz > neuOben;
  const neuUnterGrenze = neuerSatz !== null && grenzen.untergrenze !== null && neuerSatz < grenzen.untergrenze;
  const speichern = async () => {
    if (!aendernFuer || neuerSatz === null || neuUeberGrenze || neuUnterGrenze) return;
    const { error } = await supabase.rpc("struktur_satz_setzen" as any, { _partner: aendernFuer, _satz: neuerSatz });
    if (error) {
      toast.error("Satz nicht gespeichert", { description: error.message });
      return;
    }
    toast.success("Satz gespeichert");
    setAendernFuer(null);
    await cacheRefreshTable("user_settings");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Nutzerverwaltung"
          subtitle={istVertriebsleitung ? "Alle Vertriebspartner mit ihrem Teamleiter." : "Deine Struktur: alle Vertriebspartner unter dir, über alle Ebenen."}
        >
          {!istVertriebsleitung && (
            <Button onClick={() => setEinladenOffen(true)} disabled={obergrenze === null} className="gap-2">
              <UserPlus className="h-4 w-4" /> Vertriebspartner einladen
            </Button>
          )}
        </PageHeader>

        {!istVertriebsleitung && (
          <Card className="border-l-4 border-l-primary bg-muted/30">
            <CardContent className="p-4 text-sm space-y-1" data-testid="struktur-hinweis">
              {obergrenze === null ? (
                <p className="text-destructive">Für dich ist noch kein Provisionssatz hinterlegt. Bitte wende dich an die Geschäftsleitung.</p>
              ) : (
                <p>
                  Dein Eigen-Satz: <strong>{formatSatzProzent(obergrenze)}</strong>. So viel kannst du deinen Partnern höchstens geben.
                </p>
              )}
              <p className="text-muted-foreground">
                Für jeden Abschluss in deiner Struktur erhältst du die Differenz zwischen deinem Satz und dem Satz darunter. Sie steht in deiner Monatsabrechnung.
              </p>
            </CardContent>
          </Card>
        )}

        {ladefehler && <p className="text-sm text-destructive">Die Liste konnte nicht geladen werden: {ladefehler}</p>}

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  {!istVertriebsleitung && <TableHead>Ebene</TableHead>}
                  <TableHead>Teamleiter</TableHead>
                  <TableHead>Provision</TableHead>
                  {!istVertriebsleitung && <TableHead className="text-right">Aktion</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {zeilen.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground py-8 text-center">
                      {istVertriebsleitung ? "Noch keine Vertriebspartner." : "Noch niemand in deiner Struktur. Lade deinen ersten Vertriebspartner ein."}
                    </TableCell>
                  </TableRow>
                ) : (
                  zeilen.map((z) => (
                    <TableRow key={z.userId}>
                      <TableCell className="font-medium">{name(z.userId)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{profile.find((p) => p.id === z.userId)?.email || "–"}</TableCell>
                      {!istVertriebsleitung && <TableCell><Badge variant="outline" className="text-bildunterschrift">Ebene {z.ebene}</Badge></TableCell>}
                      <TableCell className="text-sm">{z.teamleiterId === ich ? "Du" : name(z.teamleiterId)}</TableCell>
                      <TableCell><ProvisionssatzBadges userId={z.userId} /></TableCell>
                      {!istVertriebsleitung && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAendernFuer(z.userId); setNeuerSatzText(""); }}>
                            <Pencil className="h-3.5 w-3.5" /> Satz ändern
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={einladenOffen} onOpenChange={setEinladenOffen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vertriebspartner einladen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="struktur-vorname">Vorname *</Label><Input id="struktur-vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} /></div>
              <div><Label htmlFor="struktur-nachname">Nachname *</Label><Input id="struktur-nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} /></div>
            </div>
            <div><Label htmlFor="struktur-email">E-Mail-Adresse *</Label><Input id="struktur-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="struktur-telefon">Telefon (optional)</Label><Input id="struktur-telefon" value={telefon} onChange={(e) => setTelefon(e.target.value)} /></div>
            <div>
              <Label htmlFor="struktur-satz">Provisionssatz (%) *</Label>
              <Input id="struktur-satz" inputMode="decimal" placeholder={obergrenze !== null ? `höchstens ${formatSatzProzent(obergrenze)}` : ""} value={satzText} onChange={(e) => setSatzText(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">Gilt für zugewiesene Leads und eigene Kontakte.</p>
              {satzText !== "" && satz === null && <p className="text-[11px] text-destructive mt-1">{SATZ_UNGUELTIG_TEXT}</p>}
              {ueberGrenze && <p className="text-[11px] text-destructive mt-1">Höchstens dein Eigen-Satz ({formatSatzProzent(obergrenze!)}).</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEinladenOffen(false)}>Abbrechen</Button>
            <Button onClick={einladen} disabled={!einladenMoeglich}>{laeuft ? "Wird gesendet…" : "Einladen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aendernFuer !== null} onOpenChange={(o) => !o && setAendernFuer(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Satz ändern: {name(aendernFuer)}</DialogTitle></DialogHeader>
          <div>
            <Label htmlFor="struktur-neuer-satz">Neuer Provisionssatz (%)</Label>
            <Input id="struktur-neuer-satz" inputMode="decimal" placeholder={neuOben !== null ? `höchstens ${formatSatzProzent(neuOben)}` : ""} value={neuerSatzText} onChange={(e) => setNeuerSatzText(e.target.value)} />
            <p className="text-[11px] text-muted-foreground mt-1">
              Gilt für neue Vorgänge. Bereits reservierte Vorgänge behalten ihren Satz.
              {(neuOben !== null || grenzen.untergrenze !== null) && (
                <> Erlaubt: {grenzen.untergrenze !== null ? `ab ${formatSatzProzent(grenzen.untergrenze)} ` : ""}{neuOben !== null ? `bis ${formatSatzProzent(neuOben)}` : ""}. Gleicher Satz wie der Teamleiter heißt: keine Differenz für ihn.</>
              )}
            </p>
            {neuerSatzText !== "" && neuerSatz === null && <p className="text-[11px] text-destructive mt-1">{SATZ_UNGUELTIG_TEXT}</p>}
            {neuUeberGrenze && <p className="text-[11px] text-destructive mt-1">Höchstens {formatSatzProzent(neuOben!)}: nie mehr als der direkte Teamleiter.</p>}
            {neuUnterGrenze && <p className="text-[11px] text-destructive mt-1">Mindestens {formatSatzProzent(grenzen.untergrenze!)}: So viel hat bereits ein Partner direkt darunter.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAendernFuer(null)}>Abbrechen</Button>
            <Button onClick={speichern} disabled={neuerSatz === null || neuUeberGrenze || neuUnterGrenze}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
