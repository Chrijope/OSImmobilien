import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, AlertTriangle, UserCheck, HandCoins, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { updateBewerber, type Bewerber } from "@/lib/bewerbungStore";
import { getLizenzPaket, formatPreis } from "@/lib/lizenzPakete";
import { PAKET_KARRIERE_MAP } from "@/lib/aktivierungsCheckliste";
import { supabase } from "@/integrations/supabase/client";
import { notifyByRole } from "@/lib/bellNotifications";
import { gebuchtesLeadPaket, stufeNachZahlung } from "../../../supabase/functions/_shared/lead-paket";
import { leadPaketBezahltDaten } from "../../../supabase/functions/_shared/lead-paket-rechnung-mail";
import { leadPaketNachBewerbung } from "@/components/leadpakete/leadPaketNachBewerbung";
import { AdminVorschauHinweis } from "./AdminVorschauHinweis";
import { oeffentlicheAdresse } from "@/lib/oeffentlicheBasis";

/**
 * Zahlungsstatus-Tab.
 *
 * Rechnungen entstehen außerhalb des CRM (Lexoffice). Hier wird nur noch der
 * Zahlungsstatus des optionalen Lead-Pakets geführt: Mit Lead-Paket wird der
 * Zahlungseingang bestätigt, ohne Lead-Paket ist keine Zahlung offen. Beides
 * setzt `rechnungBezahltAm`.
 *
 * Statusweg seit dem 23.09.2026 (Christian, Regel in
 * `supabase/functions/_shared/lead-paket.ts`): In die Stufe "Rechnung" kommt
 * nur, wer ein Lead-Paket im Vertrag hat; alle anderen gehen nach dem Vertrag
 * direkt nach "Nutzer anlegen". Wird hier die Zahlung für das Lead-Paket
 * bestätigt, rückt der Bewerber aus "Rechnung" nach "Nutzer anlegen", und nur
 * dann geht die Folgemail "Zahlung eingegangen" an Christian.
 *
 * "Weiter zur Aktivierung" ohne Lead-Paket setzt nur die Freigabemarke. Es
 * schiebt keinen Status und schickt keine Folgemail, denn es ist nichts
 * bezahlt worden. Bis zum 23.09.2026 ging von dort dieselbe Mail hinaus wie
 * nach einer echten Zahlung, damals noch als "Onboardinggebühr eingegangen".
 */

interface Props {
  bewerber: Bewerber;
  canEdit: boolean;
  currentUserName: string;
  onRefresh: () => void;
  /** Admin und Inhaber sehen den Inhalt auch, wenn die Voraussetzungen fehlen. */
  adminVorschau?: boolean;
}

export function RechnungsTab({ bewerber: b, canEdit, currentUserName, onRefresh, adminVorschau = false }: Props) {
  const [lexBelegNr, setLexBelegNr] = useState(b.rechnungLexBelegNr || "");
  const [zahlDatum, setZahlDatum] = useState(
    b.rechnungZahlungsdatum ? b.rechnungZahlungsdatum.slice(0, 10) : "",
  );
  const paket = getLizenzPaket(b.paketwahl);
  const vorausgesetzt =
    b.vertragStatus === "unterschrieben" && !!b.vertragSignedPdfUrl && !!paket;
  const bestaetigungen = b.rechnungBezahltBestaetigungen || [];
  const istBezahlt = !!b.rechnungBezahltAm;
  const externVersendet = !!b.rechnungExternErstelltVersendet;
  const leadPaket = gebuchtesLeadPaket(b.leadPaket);

  const bereitsBestaetigt = bestaetigungen.some(
    (x) => x.name?.toLowerCase().trim() === currentUserName?.toLowerCase().trim()
  );

  const toggleExternVersendet = (checked: boolean) => {
    updateBewerber(b.id, {
      rechnungExternErstelltVersendet: checked,
      rechnungExternErstelltVersendetAm: checked ? new Date().toISOString() : "",
    });
    onRefresh();
    toast({
      title: checked
        ? "Rechnung als extern versendet markiert"
        : "Markierung entfernt",
      description: checked
        ? "Zahlungseingang kann jetzt bestätigt werden."
        : "Bestätigungsbutton ist wieder deaktiviert.",
    });
  };

  const bestaetigen = () => {
    if (bereitsBestaetigt) return;
    const userId = currentUserName?.toLowerCase().replace(/\s+/g, "-") || "unbekannt";
    const next = [
      ...bestaetigungen,
      { userId, name: currentUserName, datum: new Date().toISOString() },
    ];
    // Aus "Rechnung" geht es mit der bestaetigten Zahlung nach "Nutzer
    // anlegen". Steht der Bewerber woanders, bleibt der Status, und es geht
    // auch keine Folgemail hinaus.
    const neueStufe = stufeNachZahlung(b.leadPaket, b.status);
    const payload: Partial<Bewerber> = {
      rechnungBezahltBestaetigungen: next,
      rechnungBezahltAm: new Date().toISOString(),
      rechnungLexBelegNr: lexBelegNr.trim() || b.rechnungLexBelegNr || "",
      rechnungZahlungsdatum: zahlDatum
        ? new Date(zahlDatum + "T00:00:00").toISOString()
        : new Date().toISOString(),
      // Bewusst `updateBewerber` statt `changeBewerberStatus`: Letzteres
      // haengt die Statusmeldung "Dein Onboarding-Termin steht" an, und die
      // stimmt nach einer Zahlung nicht.
      ...(neueStufe ? { status: neueStufe } : {}),
    };
    const gespeichert = updateBewerber(b.id, payload);
    if (leadPaket) {
      // Erst nach dem Speichern: Die Datenbank liest Zahlung und Konto aus
      // der Bewerbung. Ohne verknuepftes Konto holt die Nutzeranlage es nach.
      void leadPaketNachBewerbung(b.id, gespeichert).catch((e) => console.warn("Leadpaket aus Bewerbung", e));
    }

    if (neueStufe) {
      void notifyPeetzNutzerAnlegen(
        `${b.vorname} ${b.nachname}`.trim() + " hat das Lead-Paket bezahlt.",
      );
    }
    onRefresh();
    toast({
      title: "Zahlungseingang bestätigt",
      description: neueStufe
        ? `${currentUserName} hat „bezahlt" bestätigt. Der Bewerber steht jetzt in Nutzer anlegen.`
        : `${currentUserName} hat „bezahlt" bestätigt. Der Status bleibt unverändert.`,
    });
  };

  /** Ohne Lead-Paket ist keine Zahlung offen: Freigabemarke setzen und weiter. */
  const weiterZurAktivierung = () => {
    const userId = currentUserName?.toLowerCase().replace(/\s+/g, "-") || "unbekannt";
    updateBewerber(b.id, {
      rechnungBezahltAm: new Date().toISOString(),
      rechnungBezahltBestaetigungen: bestaetigungen.length > 0
        ? bestaetigungen
        : [{
            userId,
            name: `${currentUserName || "System"} · Kein Lead-Paket, keine Zahlung offen`,
            datum: new Date().toISOString(),
          }],
      // Kein Statussprung und keine Folgemail: Hier ist nichts bezahlt
      // worden. Ohne Lead-Paket geht es nach dem Vertrag ohnehin direkt nach
      // "Nutzer anlegen" (finalize-vertrag, VertragsTab).
    });
    onRefresh();
    toast({
      title: "Weiter zur Aktivierung",
      description: `Kein Lead-Paket gewählt. Weiter geht es, sobald der Onboarding-Termin steht.`,
    });
  };

  /** Glocke an Admin und Inhaber und Folgemail an Christian, nur nach einer bestätigten Zahlung aus "Rechnung". */
  const notifyPeetzNutzerAnlegen = async (anlass: string) => {
    try {
      const CHRISTIAN_PEETZ_EMAIL = "c.peetz@more.immo";
      const bewerberName = `${b.vorname} ${b.nachname}`.trim();
      const karriereStufe = b.karriereStufe || (paket ? PAKET_KARRIERE_MAP[paket.id] : "") || "";
      const paketTitel = paket?.titel || "Vertrag";

      // Die Glocke geht an Admin und Inhaber. Nutzer legen seit dem
      // 04.10.2026 nur sie an (Christian), HR nicht mehr; invite-user und
      // send-bewerber-zugangsdaten lassen ohnehin nur diese beiden zu. Die
      // Mail an Christian Peetz bleibt daneben bestehen.
      notifyByRole(["admin", "inhaber"], {
        titel: "Lead-Paket bezahlt, Nutzer anlegen",
        nachricht: `${anlass} Bitte als Nutzer anlegen mit Karrierestufe „${karriereStufe || "siehe Profil"}" (Vertragsdokument: ${paketTitel}).`,
        link: `/bewerberprozess?bewerber=${b.id}`,
        category: "system",
      });

      const templateData = leadPaketBezahltDaten({
        bewerberName,
        leadPaket: b.leadPaket,
        karriereStufe,
        bewerberLink: oeffentlicheAdresse(`/bewerberprozess?bewerber=${b.id}`),
      });
      if (!templateData) return;
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "rechnung-bezahlt-nutzer-anlegen",
          recipientEmail: CHRISTIAN_PEETZ_EMAIL,
          idempotencyKey: `rechnung-bezahlt-peetz-${b.id}`,
          templateData,
        },
      });
    } catch (e) {
      console.warn("Peetz-Benachrichtigung fehlgeschlagen", e);
    }
  };

  const saveLexFelder = () => {
    updateBewerber(b.id, {
      rechnungLexBelegNr: lexBelegNr.trim(),
      rechnungZahlungsdatum: zahlDatum
        ? new Date(zahlDatum + "T00:00:00").toISOString()
        : "",
    });
    onRefresh();
    toast({ title: "Lexoffice-Daten gespeichert" });
  };

  // Grund der Sperre, wird im Vorschau-Hinweis für Admins genannt.
  const sperrGrund = !paket
    ? "noch kein Vertragsdokument gewählt ist"
    : "der unterschriebene Vertrag noch nicht vorliegt";

  if (!vorausgesetzt && !adminVorschau) {
    return (
      <Card className="p-6 text-center space-y-2">
        <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500" />
        <h3 className="font-semibold">Zahlungsstatus noch nicht verfügbar</h3>
        <p className="text-sm text-muted-foreground">
          Voraussetzungen: Vertragsdokument gewählt und unterschriebener Vertrag hochgeladen.
        </p>
      </Card>
    );
  }

  const vorschauHinweis = !vorausgesetzt ? <AdminVorschauHinweis grund={sperrGrund} /> : null;

  // ── Ohne Lead-Paket: keine Zahlung offen, direkt zur Aktivierung. ──
  if (!leadPaket) {
    return (
      <div className="space-y-4">
        {vorschauHinweis}
        <Card className="p-6 text-center space-y-3">
          <CheckCircle2 className="h-8 w-8 mx-auto text-primary" />
          <h3 className="font-semibold">Kein Lead-Paket gewählt, keine Zahlung offen.</h3>
          <p className="text-sm text-muted-foreground">
            Rechnungen entstehen außerhalb des CRM. Ohne Lead-Paket gibt es hier nichts zu bestätigen,
            du kannst direkt mit der Aktivierung weitermachen.
          </p>
          {istBezahlt ? (
            <Badge className="bg-green-500 text-white">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Freigegeben am {new Date(b.rechnungBezahltAm!).toLocaleString("de-DE")}
            </Badge>
          ) : (
            canEdit && (
              <Button onClick={weiterZurAktivierung} className="gap-1.5">
                Weiter zur Aktivierung <ArrowRight className="h-4 w-4" />
              </Button>
            )
          )}
        </Card>
      </div>
    );
  }

  // ── Mit Lead-Paket: Zahlungseingang über Lexoffice bestätigen. ──
  return (
    <div className="space-y-4">
      {vorschauHinweis}
      <Card className="p-5 space-y-4">
        {/* `flex-wrap` und ein Abstand: Ohne beides klebte die Ueberschrift auf
            dem Handy am Kennzeichen daneben. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">
              Lead-Paket: {formatPreis(leadPaket.betrag)} / {leadPaket.anzahl} Leads
            </h3>
          </div>
          {istBezahlt && (
            <Badge className="bg-green-500 text-white">
              <CheckCircle2 className="h-3 w-3 mr-1" />Bezahlt
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Die Rechnung über das Lead-Paket wird außerhalb des CRM in Lexoffice erstellt und versendet.
          Trage hier Belegnummer und Zahlungseingang ein und bestätige die Zahlung, sobald das Geld da ist.
        </p>

        {canEdit && (
          <div className="flex items-start gap-3 rounded-md border p-3 bg-muted/30">
            <Checkbox
              id="extern-versendet"
              checked={externVersendet}
              onCheckedChange={(v) => toggleExternVersendet(!!v)}
              className="mt-0.5"
              disabled={istBezahlt}
            />
            <div className="flex-1">
              <Label htmlFor="extern-versendet" className="text-sm font-medium cursor-pointer">
                Rechnung wurde über unser Buchhaltungsprogramm erstellt und versendet
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Erst danach kann der Zahlungseingang von einem Teammitglied bestätigt werden.
                {externVersendet && b.rechnungExternErstelltVersendetAm && (
                  <> · Bestätigt am {new Date(b.rechnungExternErstelltVersendetAm).toLocaleString("de-DE")}</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Lexoffice-Daten */}
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-sm">Lexoffice-Daten</h4>
            {b.rechnungLexBelegNr && (
              <Badge variant="secondary">Beleg: {b.rechnungLexBelegNr}</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="lexBelegNr" className="text-xs">Lexoffice-Belegnummer</Label>
              <Input
                id="lexBelegNr"
                placeholder="z. B. RE-2026-0042"
                value={lexBelegNr}
                maxLength={50}
                disabled={!canEdit}
                onChange={(e) => setLexBelegNr(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="zahlDatum" className="text-xs">Zahlungseingang (laut Bank/Lexoffice)</Label>
              <Input
                id="zahlDatum"
                type="date"
                value={zahlDatum}
                disabled={!canEdit}
                onChange={(e) => setZahlDatum(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={saveLexFelder} className="w-full">
                  Speichern
                </Button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Trage hier die Lexoffice-Belegnummer und das tatsächliche Zahlungseingangsdatum ein.
            Beim Bestätigen werden diese Werte automatisch übernommen.
          </p>
        </div>
      </Card>

      {/* Zahlungseingang bestätigen */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Zahlungseingang bestätigen
            </h3>
            <p className="text-xs text-muted-foreground">
              Ein Teammitglied kann den Zahlungseingang bestätigen – danach springt der Status automatisch auf „Nutzer anlegen".
            </p>
          </div>
        </div>

        {bestaetigungen.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bestätigungen</p>
            {bestaetigungen.map((x) => (
              <div key={x.userId} className="flex items-center gap-2 text-sm rounded-md border p-2 bg-green-500/5 border-green-500/20">
                <UserCheck className="h-4 w-4 text-green-600" />
                <span className="font-medium">{x.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(x.datum).toLocaleString("de-DE")}
                </span>
              </div>
            ))}
          </div>
        )}

        {canEdit && !istBezahlt && (
          <Button
            size="sm"
            className="w-full"
            disabled={!externVersendet || bereitsBestaetigt}
            onClick={bestaetigen}
          >
            {bereitsBestaetigt
              ? "Bereits bestätigt"
              : externVersendet
                ? "Zahlungseingang bestätigen"
                : "Erst Rechnung extern versenden"}
          </Button>
        )}
      </Card>
    </div>
  );
}
