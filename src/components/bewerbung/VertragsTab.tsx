import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileCheck, Download, Upload, Send, RefreshCw, PenLine, ExternalLink, FlaskConical, Mail, MousePointerClick, Info, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { LIZENZ_PAKETE, PAKETE_MIT_VERTRAGSSCHALTERN, ZAHLUNGSWEISEN, getLizenzPaket, formatPreis, berechneRaten, type LizenzPaketId, type Zahlungsweise } from "@/lib/lizenzPakete";
import { updateBewerber, sendVertrag, signVertrag, addDokument, type Bewerber } from "@/lib/bewerbungStore";
import { buildVertragPdf, erneuereVertragPdfLink, uploadVertragPdf } from "@/lib/vertragGenerator";
import { getVertragsAnhaenge } from "@/lib/vertragAnhaenge";
import { buildEinzelDokumentPdf, openPdfBlob, type EinzelDokumentKey } from "@/lib/einzelDokumentePdf";
import { notifyByRole } from "@/lib/bellNotifications";
import { VertragAufEinenBlick } from "@/components/bewerbung/VertragAufEinenBlick";
import { vertragsKonditionenStempel } from "@/lib/vertragsZusammenfassung";
import { formatDatumZeitFlexibel } from "@/lib/datumsformate";
import { VERTRAGS_FASSUNG, VERTRAGS_FASSUNG_ALT, fassungDesHinterlegtenVertrags, hatLeadpaketAnlage, hatMetaPixelAnlage, provisionsSaetze, vertragsFassungKennung, vertragsFassungVon } from "@/lib/vertragKlauseln";
import { meldeVertragUnterschriebenAnHr } from "@/lib/hrBewerberMeldung";
import {
  LEAD_PAKET_RECHNUNG_GLOCKE_TITEL,
  leadPaketGlockeZeile,
  leadPaketRechnungDaten,
  meldungNachVertragUpload,
} from "../../../supabase/functions/_shared/lead-paket-rechnung-mail";
import { hatLeadPaket, stufeNachVollstaendigemVertrag } from "../../../supabase/functions/_shared/lead-paket";
import { supabase } from "@/integrations/supabase/client";
import { oeffentlicheAdresse } from "@/lib/oeffentlicheBasis";
import { signaturLinkErinnern } from "@/lib/aftersalesSignatur";
import { useUser } from "@/contexts/UserContext";

interface Props {
  bewerber: Bewerber;
  canEdit: boolean;
  hrName: string;
  onRefresh: () => void;
}

export function VertragsTab({ bewerber: b, canEdit, hrName, onRefresh }: Props) {
  const [paket, setPaket] = useState<LizenzPaketId | "">((b.paketwahl as LizenzPaketId) || "");
  const [zw, setZw] = useState<Zahlungsweise>((b.zahlungsweise as Zahlungsweise) || "einmal");
  // Rueckfragen laufen als AlertDialog im Projekt-CI, nicht als Browser-Fenster.
  const [umstellenOffen, setUmstellenOffen] = useState(false);
  const [ersetzenOffen, setErsetzenOffen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { user } = useUser();
  const [testOffen, setTestOffen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [tracking, setTracking] = useState<{
    created_at: string | null;
    link_opened_at: string | null;
    status: string | null;
  } | null>(null);

  const loadTracking = async () => {
    try {
      const { data } = await (supabase as any)
        .from("signature_requests")
        .select("created_at, link_opened_at, status")
        .eq("kontakt_id", b.id)
        .eq("person_type", "vertrag")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setTracking(data || null);
    } catch { /* noop */ }
  };

  useEffect(() => {
    void loadTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.id, b.vertragStatus, b.vertragErinnerungenAt?.length]);

  const aktiv = paket ? getLizenzPaket(paket) : null;

  /**
   * Die individuell vereinbarten Provisionssätze aus dem Bewerberprofil.
   *
   * Sie werden im Closing-Tab erfasst und dort beim Erzeugen des Vertrags
   * übergeben. Wurden sie beim späteren Neuerzeugen oder beim Versand nicht
   * mitgegeben, fiel der Vertrag stillschweigend auf die Standardsätze des
   * Pakets zurück. Im Profil stand dann die richtige Fassung, verschickt
   * wurde eine andere. Deshalb liest jede Neuerzeugung die Sätze hier aus
   * denselben gespeicherten Feldern.
   */
  const saetzeAusProfil = () => {
    const paketId = ((b.paketwahl as LizenzPaketId) || paket || "") as string;
    const unterstuetzt = [...PAKETE_MIT_VERTRAGSSCHALTERN, "lead", "team_builder", "enterprise"].includes(paketId);
    if (!unterstuetzt) return undefined;
    const zahl = (v: unknown): number | undefined => {
      const n = parseFloat(String(v ?? "").replace(",", "."));
      return isFinite(n) && n > 0 ? n : undefined;
    };
    const werte = {
      individuell: zahl((b as any).satzIndividuell),
      lead: zahl((b as any).satzLead),
      eigen: zahl((b as any).satzEigen),
      bestand: zahl((b as any).satzBestand),
      neubau: zahl((b as any).satzNeubau),
    };
    return Object.values(werte).some((v) => v !== undefined) ? werte : undefined;
  };
  const raten = aktiv ? berechneRaten(aktiv.preis, zw) : [];
  const vertragVorhanden = !!b.vertragPdfUrl;
  // Textfassung dieses Bewerbers: Bestandspartner mit gesendetem oder
  // unterschriebenem Vertrag bleiben in der langen Altfassung, alle anderen
  // bekommen die kompakte Fassung (vertragsFassungVon).
  const fassung = vertragsFassungVon(b, (b.paketwahl as LizenzPaketId) || paket || undefined);
  const anhaenge = getVertragsAnhaenge(
    (b.paketwahl as LizenzPaketId) || paket || "",
    !!b.individuelleVertragsFassung,
    hatLeadpaketAnlage(b, aktiv?.id),
    fassung,
    // Liegt schon ein PDF vor, zählt seine Kennung; sonst die, mit der es
    // entstehen wird.
    hatMetaPixelAnlage(
      vertragVorhanden ? b : { ...b, vertragFassung: vertragsFassungKennung(b, aktiv?.id) },
      aktiv?.id,
    ),
  );
  // Konfiguration auch anzeigen, wenn zwar ein PDF hinterlegt ist, aber kein Paket
  // gewählt wurde (z.B. Legacy-Individual-Verträge wie bei Rainer Seitz). Ohne Paket
  // kann das System weder Vertrag noch Anlagen sauber neu erzeugen oder verschicken.
  const needsPaketConfig = !b.paketwahl;
  const zeigeKonfig = !vertragVorhanden || needsPaketConfig;

  const openEinzelDokument = async (key: EinzelDokumentKey) => {
    try {
      const paketFuerVorschau = (b.paketwahl as LizenzPaketId) || paket || "";
      const blob = await buildEinzelDokumentPdf(key, {
        // Wie die Anhangliste oben: ohne PDF die Kennung, mit der es entstehen wird.
        bewerber: vertragVorhanden ? b : { ...b, vertragFassung: vertragsFassungKennung(b, paketFuerVorschau || undefined) },
        paketId: paketFuerVorschau,
        zahlungsweise: (b.zahlungsweise as Zahlungsweise) || zw,
      });
      openPdfBlob(blob);
    } catch (e: any) {
      toast({ title: "Dokument konnte nicht erstellt werden", description: e?.message, variant: "destructive" });
    }
  };

  const speichern = (next: { paket?: LizenzPaketId | ""; zw?: Zahlungsweise }) => {
    const p = next.paket ?? paket;
    const z = next.zw ?? zw;
    if (next.paket !== undefined) setPaket(next.paket);
    if (next.zw !== undefined) setZw(next.zw);
    // Beim Paketwechsel muss ein Leadpaket mitgehen, das im neuen Paket nicht
    // vorgesehen ist: Der Lead-Berater bekommt Leads gestellt und kauft keine.
    // Blieb der alte Wert stehen, listete das Anlagenverzeichnis eine Anlage 3,
    // die der Renderer nicht erzeugen konnte, und der Vertrag liess sich gar
    // nicht mehr erstellen. Dasselbe gilt fuer den Einzelkauf.
    const passtNichtMehr = next.paket !== undefined && !hatLeadpaketAnlage({ ...b, paketwahl: p }, p || undefined);
    updateBewerber(b.id, {
      paketwahl: p,
      zahlungsweise: z,
      ...(passtNichtMehr && b.leadPaket ? { leadPaket: undefined } : {}),
      ...(next.paket !== undefined && b.leadEinzelkauf && p !== "junior" ? { leadEinzelkauf: false } : {}),
    });
    onRefresh();
  };

  const generieren = async (ersetzenBestaetigt = false) => {
    if (!aktiv) { toast({ title: "Bitte Paket wählen", variant: "destructive" }); return; }
    if (b.vertragIndividuell && !ersetzenBestaetigt) {
      setErsetzenOffen(true);
      return;
    }
    setBusy(true);
    try {
      const version = (b.vertragVersion || 0) + 1;
      // Die neue Kennung schon beim Erzeugen, sonst baute eine alte
      // gespeicherte Kennung den Text ohne Anlage 4.
      const kennung = vertragsFassungKennung(b, aktiv.id);
      const blob = await buildVertragPdf({
        bewerber: { ...b, vertragFassung: kennung }, paketId: aktiv.id, zahlungsweise: zw, hrName, version,
        saetze: saetzeAusProfil(),
      });
      const url = await uploadVertragPdf(b.id, blob, "draft");
      updateBewerber(b.id, {
        vertragPdfUrl: url, vertragVersion: version, vertragHrName: hrName,
        status: "Vertrag", vertragStatus: "nicht_gesendet",
        vertragIndividuell: false,
        // Merkt sich, mit welchen Konditionen und welcher Textfassung dieses
        // PDF erzeugt wurde.
        vertragKonditionenStand: vertragsKonditionenStempel({ ...b, paketwahl: aktiv.id, zahlungsweise: zw }),
        vertragFassung: kennung,
      });
      onRefresh();
      toast({ title: "Vertrag generiert", description: `Version ${version} erstellt und gespeichert.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "PDF konnte nicht gespeichert werden.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const senden = () => {
    void sendenAsync();
  };

  const sendenAsync = async (testRecipient?: string) => {
    const isTest = !!testRecipient;
    // Wenn bereits ein Vertrags-PDF hinterlegt ist (z.B. individuell hochgeladen),
    // darf auch ohne Paketwahl erneut zur Unterschrift versendet werden.
    const hatBestehendesPdf = !!b.vertragPdfUrl;
    if (!b.paketwahl && !hatBestehendesPdf) {
      toast({
        title: "Kein Paket gewählt",
        description: "Bitte oben ein Paket + Zahlweise wählen, dann erneut senden – der Vertrag wird dann automatisch erzeugt.",
        variant: "destructive",
      });
      return;
    }
    if (!isTest && !b.email) {
      toast({ title: "Keine E-Mail", description: "Beim Bewerber ist keine E-Mail-Adresse hinterlegt.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const buildCurrentVertrag = async () => {
        if (!b.paketwahl) return b.vertragPdfUrl || "";
        const paketObj = getLizenzPaket(b.paketwahl as LizenzPaketId);
        if (!paketObj) throw new Error("Paket konnte nicht aufgelöst werden.");
        const version = (b.vertragVersion || 0) + 1;
        const bewerberForPdf = {
          ...b,
          individuelleVertragsFassung: !!b.individuelleVertragsFassung,
          andereVertriebe: b.individuelleVertragsFassung ? (b.andereVertriebe || "") : "",
          vertragFassung: vertragsFassungKennung(b, paketObj.id),
        };
        const blob = await buildVertragPdf({
          bewerber: bewerberForPdf,
          paketId: paketObj.id,
          zahlungsweise: (b.zahlungsweise as Zahlungsweise) || zw,
          hrName,
          version,
          saetze: saetzeAusProfil(),
        });
        const url = await uploadVertragPdf(b.id, blob, "draft");
        await updateBewerber(b.id, {
          vertragPdfUrl: url,
          vertragVersion: version,
          vertragHrName: hrName,
          vertragIndividuell: false,
          vertragKonditionenStand: vertragsKonditionenStempel(bewerberForPdf),
          vertragFassung: vertragsFassungKennung(bewerberForPdf, paketObj.id),
        });
        return url;
      };
      // Versendet wird genau die Fassung, die im Profil steht. Frueher wurde
      // vor jedem Versand neu erzeugt, damit spaetere Aenderungen am Profil
      // sicher einfliessen. Das hatte aber die unangenehme Nebenwirkung, dass
      // die geprüfte Fassung durch eine frisch gebaute ersetzt wurde, im
      // Zweifel mit anderen Konditionen. Neu gebaut wird deshalb nur noch,
      // wenn gar kein brauchbares PDF hinterlegt ist.
      let pdfUrlEffective = b.vertragPdfUrl || "";
      let versionEffective = b.vertragVersion || 0;
      let pdfOk = false;
      const pdfErreichbar = async (link: string) => {
        try {
          const head = await fetch(link, { method: "HEAD" });
          const ct = head.headers.get("content-type") || "";
          return head.ok && (ct.includes("pdf") || ct.includes("octet-stream"));
        } catch { return false; }
      };
      if (pdfUrlEffective) {
        pdfOk = await pdfErreichbar(pdfUrlEffective);
        // Ein abgelaufener Link wird erneuert, die Datei bleibt dieselbe.
        if (!pdfOk) {
          const erneuert = await erneuereVertragPdfLink(pdfUrlEffective);
          if (erneuert && await pdfErreichbar(erneuert)) {
            pdfUrlEffective = erneuert;
            pdfOk = true;
            if (!isTest) await updateBewerber(b.id, { vertragPdfUrl: erneuert });
          }
        }
        // Liegt ein Vertrag vor, der sich nicht mehr abrufen laesst, wird er
        // nicht still durch einen neuen in der aktuellen Fassung ersetzt
        // (Codex-Pruefung 27.09.2026, A4-06). Hochgestuft wird nur beim
        // ausdruecklichen „Vertrag neu generieren“.
        if (!pdfOk) {
          throw new Error("Das hinterlegte Vertrags-PDF ist nicht erreichbar. Bitte „Vertrag neu generieren“ klicken und danach erneut senden.");
        }
      }
      if (!pdfOk) {
        if (!b.paketwahl) {
          throw new Error("Kein Vertrags-PDF vorhanden. Bitte Paket wählen und neu generieren oder ein PDF hochladen.");
        }
        pdfUrlEffective = await buildCurrentVertrag();
        versionEffective = (b.vertragVersion || 0) + 1;
      }
      if (!pdfUrlEffective) {
        throw new Error("Kein Vertrags-PDF vorhanden. Bitte Paket wählen und neu generieren oder ein PDF hochladen.");
      }
      // Textfassung des Dokuments, das jetzt verschickt wird. Ein bereits
      // hinterlegtes PDF ohne Kennzeichen stammt aus der Zeit vor der
      // Fassungsweiche und ist die lange Altfassung; die Signaturseite muss
      // dieselbe Fassung als Einzeldokumente aufbauen.
      const fassungKennung = !pdfOk
        ? vertragsFassungKennung(b, (b.paketwahl as LizenzPaketId) || undefined)
        : fassungDesHinterlegtenVertrags(b);
      const fassungVersand = fassungKennung === VERTRAGS_FASSUNG_ALT ? "alt" : "neu";
      if (!isTest && pdfOk && !b.vertragFassung) {
        await updateBewerber(b.id, { vertragFassung: fassungKennung });
      }
      const paketTitel = getLizenzPaket(b.paketwahl as LizenzPaketId)?.titel || "Individueller Vertrag";
      const documents: { key: string; name: string; url?: string }[] = [
        { key: "vertrag", name: "Handelsvertretervertrag" },
        ...getVertragsAnhaenge(
          (b.paketwahl as LizenzPaketId) || "",
          !!b.individuelleVertragsFassung,
          hatLeadpaketAnlage(b, aktiv?.id),
          fassungVersand,
          hatMetaPixelAnlage({ ...b, vertragFassung: fassungKennung }, aktiv?.id),
        ).map((n) => {
          const match = n.match(/^Anlage\s+(\d+)/);
          const num = match ? match[1] : "1";
          return { key: `anlage_${num}`, name: n };
        }),
      ];

      // Jedes Dokument bekommt seine eigene Datei. Bis zum 04.09.2026 ging nur
      // eine gemeinsame pdfUrl mit, und die Signaturseite zeigte hinter jedem
      // Anlagennamen denselben Gesamtvertrag. Das Erzeugen laeuft hier im
      // Browser aus derselben Quelle wie das Vertrags-PDF, damit Vorschau und
      // Ablage dasselbe zeigen. Schlaegt es fehl, bleibt die gemeinsame
      // pdfUrl als Rueckfallebene; die Signaturseite baut dann selbst.
      if (aktiv) {
        try {
          const { buildEinzelDokumentPdf } = await import("@/lib/einzelDokumentePdf");
          const bewerberFuerPdf = { ...b, vertragFassung: fassungKennung };
          for (const d of documents) {
            if (d.key === "vertrag") { d.url = pdfUrlEffective; continue; }
            const blob = await buildEinzelDokumentPdf(d.key as EinzelDokumentKey, {
              bewerber: bewerberFuerPdf,
              paketId: aktiv.id,
              zahlungsweise: (b.zahlungsweise as Zahlungsweise) || zw,
            });
            d.url = await uploadVertragPdf(b.id, blob, "draft", d.key);
          }
        } catch (e) {
          console.error("Einzeldokumente konnten nicht erzeugt werden:", e);
        }
      }
      const { error } = await supabase.functions.invoke("send-vertrag-signature", {
        body: {
          bewerberId: b.id,
          email: b.email,
          testRecipient: isTest ? testRecipient : undefined,
          name: `${b.vorname} ${b.nachname}`.trim(),
          documents,
          pdfUrl: pdfUrlEffective,
          paketTitel,
          bewerberData: {
            ...b,
            // Der Signaturseite muss dieselbe Fassung mitgegeben werden, die
            // gerade verschickt wird. Vorher stand hier noch die Version von
            // vor dem Erzeugen, die Seite baute den Vertrag daraus neu auf.
            vertragPdfUrl: pdfUrlEffective,
            vertragVersion: versionEffective,
            vertragHrName: b.vertragHrName || hrName,
            individuelleVertragsFassung: !!b.individuelleVertragsFassung,
            andereVertriebe: b.individuelleVertragsFassung ? (b.andereVertriebe || "") : "",
            vertragFassung: fassungKennung,
          },
          paketId: (b.paketwahl as LizenzPaketId) || "",
          zahlungsweise: (b.zahlungsweise as Zahlungsweise) || zw,
        },
      });
      if (error) throw error;
      if (!isTest) {
        sendVertrag(b.id);
        onRefresh();
        toast({
          title: "Vertrag zur Unterschrift versendet",
          description: `${documents.length} Dokumente wurden an ${b.email} verschickt.`,
        });
      } else {
        toast({
          title: "Test-Mail versendet",
          description: `Version ${versionEffective} wurde an ${testRecipient} gesendet (nicht in Statistik, Bewerber-Status unverändert).`,
        });
      }
    } catch (e: any) {
      toast({ title: "Fehler beim Versand", description: e?.message || "Bitte erneut versuchen.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  /*
   * Der Testversand fragte die Adresse frueher ueber window.prompt ab. Dieses
   * Fenster kommt vom Browser, traegt dessen Schrift und Knoepfe und nennt
   * ueber der Frage die technische Adresse der Vorschau. Es sah aus wie eine
   * Fehlermeldung, nicht wie ein Teil des Systems.
   */
  const sendenTest = () => {
    // Der Knopf heisst "an mich": die eigene Adresse ist der richtige Vorschlag.
    setTestEmail(user?.email || "");
    setTestOffen(true);
  };

  const testBestaetigen = () => {
    const ziel = testEmail.trim();
    if (!ziel) return;
    setTestOffen(false);
    void sendenAsync(ziel);
  };

  const onSignedUpload = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadVertragPdf(b.id, file, "signed");
      // Dieselbe Regel wie beim digitalen Weg in `finalize-vertrag`: Mit
      // Lead-Paket geht es nach "Rechnung", ohne direkt nach "Nutzer anlegen".
      // Nur nach vorn, damit ein erneut hochgeladener Scan einen schon
      // aktiven Partner nicht zurueckholt. Regel und Statusweg stehen in
      // supabase/functions/_shared/lead-paket.ts.
      const mitLeadPaket = hatLeadPaket(b.leadPaket);
      const neueStufe = stufeNachVollstaendigemVertrag(b.leadPaket, b.status);
      const jetzt = new Date().toISOString();
      updateBewerber(b.id, {
        vertragSignedPdfUrl: url,
        vertragSignedAt: jetzt,
        vertragStatus: "unterschrieben",
        // Welche Fassung unterschrieben wurde: die des hinterlegten Entwurfs,
        // nach derselben Regel wie beim Wiederversand. Ohne Kennung die
        // Altfassung, nie die aktuelle (NB-05). Die Freigabe des Meta Pixels
        // (Anlage 4) liest diesen Wert.
        vertragUnterschrieben: {
          fassung: fassungDesHinterlegtenVertrags(b),
          quelle: "upload",
          gegenzeichnungAm: jetzt,
        },
        ...(neueStufe ? { status: neueStufe } : {}),
      });
      signVertrag(b.id);
      // Ein hochgeladenes, unterschriebenes PDF ist EINE Datei und wird nicht
      // zerlegt; eine Signatur ueberlebt das Auseinandernehmen nicht. Bis zum
      // 04.09.2026 wurde hier fuer jede Anlage ein eigener Eintrag mit
      // derselben Adresse angelegt: In der Akte standen vier Namen, hinter
      // denen dieselbe Datei lag. Jetzt gibt es einen Eintrag, und sein Name
      // sagt, was die Datei enthaelt.
      const mitUnterschrieben = getVertragsAnhaenge(
        (b.paketwahl as LizenzPaketId) || "",
        !!b.individuelleVertragsFassung,
        hatLeadpaketAnlage(b, aktiv?.id),
        fassung,
        hatMetaPixelAnlage({ ...b, vertragFassung: fassungDesHinterlegtenVertrags(b) }, aktiv?.id),
      );
      addDokument(b.id, {
        name: mitUnterschrieben.length
          ? `Handelsvertretervertrag samt ${mitUnterschrieben.length} Anlagen (unterschrieben).pdf`
          : `Handelsvertretervertrag (unterschrieben).pdf`,
        typ: "Vertrag",
        url,
      });
      // Die Glocke "Rechnung erstellen" geht an HR, und seit dem 23.09.2026
      // nur beim Lead-Paket; ohne gibt es nichts abzurechnen. Das
      // Bewerbermanagement führt HR, und die Rechnung lässt sich aus derselben
      // Bewerberakte erstellen. Christian Kurz bekommt aus dem Bewerberprozess
      // keine Meldungen; seine einzige bleibt die Gegenzeichnungsanfrage aus
      // finalize-vertrag.
      if (mitLeadPaket) {
        notifyByRole(["hr"], {
          titel: LEAD_PAKET_RECHNUNG_GLOCKE_TITEL,
          nachricht: `${b.vorname} ${b.nachname} hat den Handelsvertretervertrag unterschrieben. ${leadPaketGlockeZeile(b.leadPaket)} Rechnungsadresse: ${b.rechnungsAdresse || "siehe Profil"}`,
          link: `/bewerberprozess?bewerber=${b.id}`,
          category: "system",
        });
      }
      // App-E-Mail an Christian Peetz zur Rechnung über das Lead-Paket. Die
      // Glocke dazu ist entfallen: Sie sagte dasselbe wie die Meldung an HR
      // direkt darüber, landete aber in der Inbox der Geschäftsführung.
      // Seit dem 23.09.2026 geht die Mail nur noch hinaus, wenn der Vertrag
      // ein Lead-Paket enthält. Die Regel steht in _shared/lead-paket.ts, der
      // Wortlaut in _shared/lead-paket-rechnung-mail.ts; finalize-vertrag
      // liest beide für den digitalen Weg.
      try {
        const CHRISTIAN_PEETZ_EMAIL = "os@os-immobilien.com";
        const templateData = leadPaketRechnungDaten({
          bewerberName: `${b.vorname} ${b.nachname}`.trim(),
          bewerberEmail: b.email || "",
          bewerberTelefon: b.telefon || "",
          rechnungsAdresse: b.rechnungsAdresse || "",
          privatAdresse: b.adresse || "",
          ort: b.ort || "",
          leadPaket: b.leadPaket,
          signedAt: new Date().toLocaleString("de-DE"),
          bewerberLink: oeffentlicheAdresse(`/bewerberprozess?bewerber=${b.id}`),
        });
        if (templateData) {
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "vertrag-unterschrieben-rechnung",
              recipientEmail: CHRISTIAN_PEETZ_EMAIL,
              idempotencyKey: `vertrag-unterschrieben-peetz-${b.id}`,
              templateData,
            },
          });
        }
      } catch (mailErr) {
        console.error("vertrag-unterschrieben email/notification failed", mailErr);
      }
      // HR gesondert melden. Die digitale Signaturstrecke tut das in
      // finalize-vertrag; beim Hochladen von Hand war HR bisher der einzige
      // Beteiligte, der nichts erfuhr.
      await meldeVertragUnterschriebenAnHr({
        bewerbungId: b.id,
        bewerberName: `${b.vorname} ${b.nachname}`.trim(),
        bewerberEmail: b.email || "",
        bewerberTelefon: b.telefon || "",
        paketTitel: getLizenzPaket(b.paketwahl as LizenzPaketId)?.titel || "",
      });
      onRefresh();
      toast({ title: "Unterschriebener Vertrag hochgeladen", description: meldungNachVertragUpload(neueStufe) });
    } catch (e: any) {
      toast({ title: "Upload fehlgeschlagen", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const aufKompakteFassungUmstellen = () => {
    updateBewerber(b.id, { vertragFassung: VERTRAGS_FASSUNG });
    onRefresh();
    toast({ title: "Auf kompakte Fassung umgestellt", description: "Bitte den Vertrag neu generieren und erneut zur Unterschrift senden." });
  };

  return (
    <div className="space-y-4">
      {/* Textfassung: Bestandspartner bleiben in der langen Altfassung, bis
          Christian bewusst umstellt. Nur bei den Paketen mit Vertragsschaltern
          gibt es überhaupt zwei Fassungen. */}
      {fassung === "alt" && !!b.paketwahl && (PAKETE_MIT_VERTRAGSSCHALTERN as string[]).includes(b.paketwahl) && (
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertTitle>Vertrag in Altfassung</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Lange Fassung mit AGB und sechs bis acht Anlagen. „Vertrag neu generieren" erzeugt für diesen
              Partner weiterhin den bisherigen Text. Die kompakte Fassung {VERTRAGS_FASSUNG} mit Konditionenblatt
              gilt nur für neu erstellte Verträge.
            </p>
            {canEdit && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => setUmstellenOffen(true)}>
                Auf kompakte Fassung {VERTRAGS_FASSUNG} umstellen
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {/* Ein Entwurf ohne Kennzeichen wurde vor der Fassungsweiche erzeugt und
          trägt noch den langen Text; verschickt würde er als Altfassung. */}
      {vertragVorhanden && fassung === "neu" && !b.vertragFassung && b.vertragStatus === "nicht_gesendet" && !!b.paketwahl && b.paketwahl !== "tippgeber" && (
        <Alert className="border-amber-300/70 bg-amber-50/60 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Entwurf vor der Vertragsfassung {VERTRAGS_FASSUNG} erzeugt</AlertTitle>
          <AlertDescription>
            Bitte unten auf „Vertrag neu generieren" klicken, damit die kompakte Fassung mit Konditionenblatt versendet wird.
            Wird er unverändert versendet, gilt für diesen Partner die Altfassung.
          </AlertDescription>
        </Alert>
      )}
      {/* Veraltete Vertragsfassung? Stempel-Vergleich gegen die Konditionen. */}
      {vertragVorhanden && b.vertragStatus !== "unterschrieben" && (
        b.vertragKonditionenStand
          ? b.vertragKonditionenStand !== vertragsKonditionenStempel(b) && (
              <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 dark:bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <span className="font-semibold">Der hinterlegte Vertrag (Version {b.vertragVersion || 1}) ist veraltet:</span>{" "}
                Seit der Erstellung wurden Konditionen geändert (Paket, Provisionssätze, Gebühren- oder Laufzeit-Schalter,
                Vertragsfassung oder Leadpaket). Bitte unten auf „Vertrag neu generieren" klicken, bevor der Vertrag
                angesehen oder versendet wird.
              </div>
            )
          : (
              <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 dark:bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                Für den hinterlegten Vertrag ist nicht vermerkt, mit welchen Konditionen er erzeugt wurde.
                Wurden seither Provisionssätze oder Schalter geändert, bitte einmal „Vertrag neu generieren" klicken,
                damit das PDF sicher dem aktuellen Stand entspricht.
              </div>
            )
      )}

      {/* Aktuelles Paket – groß sichtbar */}
      {(() => {
        const aktuellesPaket = getLizenzPaket((b.paketwahl as LizenzPaketId) || "");
        if (!aktuellesPaket) return null;
        const zwLabel = ZAHLUNGSWEISEN.find((z) => z.id === (b.zahlungsweise as Zahlungsweise))?.label || "—";
        if (aktuellesPaket.partnerHonorar) {
          return (
            <Card className="p-5 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="text-4xl leading-none">{aktuellesPaket.emoji}</div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      Aktueller Vertragstyp
                    </p>
                    <h2 className="text-2xl font-bold text-foreground">{aktuellesPaket.titel}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Keine einmalige Gebühr · Honorar: <span className="font-medium text-foreground">{aktuellesPaket.provisionssatz} % auf den notariellen Kaufpreis</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Honorar</p>
                  <p className="text-2xl font-bold text-primary">{aktuellesPaket.provisionssatz} %</p>
                  <p className="text-[10px] text-muted-foreground">auf Kaufpreis</p>
                </div>
              </div>
              {b.vertragVersion && b.vertragVersion > 1 && (
                <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-primary/20">
                  Vertrag wurde {b.vertragVersion}× erstellt – Vertrag &amp; Anlagen entsprechen dem Partner-Honorar-Modell.
                </p>
              )}
              <div className="mt-3 pt-3 border-t border-primary/20">
                <VertragAufEinenBlick bewerber={b} eingebettet />
              </div>
            </Card>
          );
        }
        if (aktuellesPaket.istTippgeber) {
          const modell = b.tippgeberProvisionsModell === "prozent" ? "prozent" : "euro";
          const betragRaw = (b.tippgeberProvisionsBetrag || "").toString().replace(",", ".");
          const betragNum = Number(betragRaw);
          const betragLabel = Number.isFinite(betragNum) && betragNum > 0
            ? (modell === "prozent"
                ? `${betragNum.toString().replace(".", ",")} % vom Kaufpreis`
                : `${formatPreis(betragNum)} pro Abschluss`)
            : "noch nicht hinterlegt";
          return (
            <Card className="p-5 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="text-4xl leading-none">{aktuellesPaket.emoji}</div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      Aktueller Vertragstyp
                    </p>
                    <h2 className="text-2xl font-bold text-foreground">{aktuellesPaket.titel}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Vergütung: <span className="font-medium text-foreground">{betragLabel}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Einmalige Investition</p>
                  <p className="text-2xl font-bold text-primary">0 €</p>
                  <p className="text-[10px] text-muted-foreground">individuelle Absprache</p>
                </div>
              </div>
              {b.vertragVersion && b.vertragVersion > 1 && (
                <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-primary/20">
                  Vertrag wurde {b.vertragVersion}× erstellt – Tippgebervereinbarung inkl. Anlagen entspricht dem aktuell hinterlegten Vergütungsmodell.
                </p>
              )}
              <div className="mt-3 pt-3 border-t border-primary/20">
                <VertragAufEinenBlick bewerber={b} eingebettet />
              </div>
            </Card>
          );
        }
        return (
          <Card className="p-5 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="text-4xl leading-none">{aktuellesPaket.emoji}</div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    Aktuelles Paket
                  </p>
                  <h2 className="text-2xl font-bold text-foreground">{aktuellesPaket.titel}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Zahlweise: <span className="font-medium text-foreground">{zwLabel}</span>
                    {" · "}Provision: <span className="font-medium text-foreground">{(() => {
                      // Dieselbe Ableitung wie im Vertrag: individuelle Saetze schlagen den Paketsatz.
                      const { hasOverride, effektiverSatzText } = provisionsSaetze(aktuellesPaket, b);
                      return hasOverride ? effektiverSatzText : `${aktuellesPaket.provisionssatz}%`;
                    })()}</span>
                  </p>
                </div>
              </div>
              {aktuellesPaket.preis > 0 && (
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Einmalige Investition</p>
                  <p className="text-2xl font-bold text-primary">{formatPreis(aktuellesPaket.preis)}</p>
                  <p className="text-[10px] text-muted-foreground">netto</p>
                </div>
              )}
            </div>
            {b.vertragVersion && b.vertragVersion > 1 && (
              <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-primary/20">
                Vertrag wurde {b.vertragVersion}× erstellt – Vertrag &amp; Anlagen entsprechen dem aktuell gewählten Paket.
              </p>
            )}
            <div className="mt-3 pt-3 border-t border-primary/20">
              <VertragAufEinenBlick bewerber={b} eingebettet />
            </div>
          </Card>
        );
      })()}

      {/* Konfiguration – wenn noch kein Vertrag existiert ODER kein Paket gewählt ist */}
      {zeigeKonfig && (
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">
            {needsPaketConfig && vertragVorhanden
              ? "Paket nachträglich zuordnen & Standard-Vertrag erzeugen"
              : "Vertragskonfiguration"}
          </h3>
        </div>
        {needsPaketConfig && vertragVorhanden ? (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-2">
            Für diesen Bewerber ist ein Vertrag hinterlegt, aber <strong>kein Paket</strong> zugeordnet.
            Solange kein Paket gewählt ist, kann der Bewerber das Gesamt-PDF inkl. Anlagen nicht öffnen und der
            Versand zur Unterschrift schlägt fehl. Bitte Paket + Zahlweise wählen und „Standard-Vertrag erzeugen" klicken –
            das bestehende Individual-PDF wird dann durch den Standard-Vertrag (inkl. aller Anlagen) ersetzt.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Hinweis: Im Regelfall wird der Vertrag direkt im Reiter „Closing" über
            „Paket bestätigen &amp; Vertrag erstellen" generiert. Diese manuelle
            Konfiguration ist nur als Fallback gedacht.
          </p>
        )}

        {/* Auf dem Handy untereinander: zwei Auswahlfelder nebeneinander lassen
            von "Vertriebspartner - 4 % Honorar" nichts Lesbares uebrig. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">{aktiv?.partnerHonorar ? "Vertragstyp" : "Paket"}</Label>
            <Select value={paket} onValueChange={(v) => speichern({ paket: v as LizenzPaketId })} disabled={!canEdit}>
              <SelectTrigger><SelectValue placeholder="Vertrag wählen..." /></SelectTrigger>
              <SelectContent>
                {/* Neu zugeordnet werden nur noch wählbare Pakete. Ist beim
                    Bewerber bereits ein Bestandspaket gespeichert, bleibt es
                    als Eintrag sichtbar, damit der Select den Wert anzeigen
                    kann und nichts stillschweigend umgestellt wird. */}
                {LIZENZ_PAKETE.filter((p) => p.waehlbar !== false || p.id === paket).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.emoji} {p.titel}{p.partnerHonorar ? ` – ${p.provisionssatz} % Honorar` : ` – ${formatPreis(p.preis)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        {!aktiv?.partnerHonorar && (
          <div>
            <Label className="text-xs">Zahlungsweise</Label>
            <Select value={zw} onValueChange={(v) => speichern({ zw: v as Zahlungsweise })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ZAHLUNGSWEISEN.map((z) => (
                  <SelectItem key={z.id} value={z.id}>{z.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        </div>

        {aktiv && !aktiv.partnerHonorar && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Einmalige Investition (netto)</p>
            <p className="text-lg font-semibold">{formatPreis(aktiv.preis)}</p>
            <div className="text-xs text-muted-foreground space-y-0.5 mt-2">
              {raten.map((r, i) => (
                <div key={i}>Rate {i + 1}: <span className="font-medium text-foreground">{formatPreis(r)}</span></div>
              ))}
              <div>Provision: <span className="font-medium text-foreground">{aktiv.provisionssatz}%</span>
                {aktiv.juniorOverride ? ` · Junior-Override: ${aktiv.juniorOverride}%` : ""}
              </div>
            </div>
          </div>
        )}
        {aktiv && aktiv.partnerHonorar && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Honorar-Modell (keine einmalige Gebühr)</p>
            <p className="text-lg font-semibold">{aktiv.provisionssatz} % Honorar auf den notariellen Kaufpreis</p>
            <p className="text-xs text-muted-foreground">
              Es wird keine Eintritts-, Aufnahme- oder Setup-Gebühr erhoben. Vergütung ausschließlich erfolgsabhängig pro vermittelter Immobilie.
            </p>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => generieren()} disabled={!paket || busy}>
              {b.vertragPdfUrl ? <RefreshCw className="h-4 w-4 mr-1" /> : <FileCheck className="h-4 w-4 mr-1" />}
              {b.vertragPdfUrl ? "Vertrag neu generieren" : "Vertrag generieren"}
            </Button>
            {b.vertragPdfUrl && b.vertragStatus === "nicht_gesendet" && (
              <Button variant="outline" onClick={senden} disabled={busy}>
                <Send className="h-4 w-4 mr-1" />An Bewerber senden
              </Button>
            )}
            {b.vertragPdfUrl && (
              <Button variant="ghost" size="sm" onClick={sendenTest} disabled={busy} title="Test-Mail an dich selbst – nicht in Statistik">
                <FlaskConical className="h-4 w-4 mr-1" />Test-Mail an mich
              </Button>
            )}
          </div>
        )}
      </Card>
      )}

      {/* Status & Dateien */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Vertragsstatus</p>
            <p className="text-xs text-muted-foreground">
              {b.vertragStatus === "nicht_gesendet" && "Noch nicht versendet"}
              {b.vertragStatus === "gesendet" && (
                <>Erstmals versendet am {formatDatumZeitFlexibel(b.vertragDatum)}
                  {b.vertragErinnerungenAt && b.vertragErinnerungenAt.length > 0 && (
                    <> · {b.vertragErinnerungenAt.length} Erinnerung{b.vertragErinnerungenAt.length === 1 ? "" : "en"} (zuletzt {formatDatumZeitFlexibel(b.vertragErinnerungenAt[b.vertragErinnerungenAt.length - 1])})</>
                  )}
                </>
              )}
              {b.vertragStatus === "wartet_auf_kurz" && (
                <>Bewerber hat unterschrieben – wartet auf Gegenzeichnung durch Christian Kurz (OS Immobilien)</>
              )}
              {b.vertragStatus === "unterschrieben" && "Unterschrieben & in der Akte"}
              {b.vertragStatus === "abgelehnt" && "Vom Bewerber abgelehnt"}
            </p>
          </div>
          {b.vertragStatus === "gesendet" && <Badge className="bg-yellow-500 text-white">Warte auf Unterschrift</Badge>}
          {b.vertragStatus === "wartet_auf_kurz" && (
            <Badge className="bg-blue-500 text-white">Wartet auf Gegenzeichnung OS Immobilien</Badge>
          )}
          {b.vertragStatus === "unterschrieben" && (
            <Badge className="bg-green-500 text-white"><PenLine className="h-3 w-3 mr-1" />Unterschrieben</Badge>
          )}
        </div>

        {b.vertragPdfUrl && (
          <div className="flex items-center justify-between rounded-md border p-3 bg-background">
            <div className="text-sm">
              <p className="font-medium flex items-center gap-2">
                Vertragsentwurf v{b.vertragVersion}
                {b.vertragIndividuell && (
                  <Badge variant="secondary" className="text-[10px]">Individuell</Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.vertragIndividuell
                  ? "Manuell erstellter Individual-Vertrag (kein Standard-Generator)"
                  : (b.vertragHrName ? `Erstellt von ${b.vertragHrName}` : "")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openEinzelDokument("vertrag")}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />Vertragsentwurf öffnen
              </Button>
              <a href={b.vertragPdfUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost">
                  <Download className="h-3.5 w-3.5 mr-1" />Gesamt-PDF
                </Button>
              </a>
            </div>
          </div>
        )}

        {b.vertragPdfUrl && anhaenge.length > 0 && (
          <div className="rounded-md border p-3 bg-muted/20 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Anlagen zum Vertrag
            </p>
            <ul className="space-y-1.5">
              {anhaenge.map((a) => {
                const m = a.match(/^Anlage\s+(\d+)/);
                const num = m ? m[1] : "1";
                return (
                <li key={a} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <FileCheck className="h-3.5 w-3.5 text-primary/70" />
                    {a}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => openEinzelDokument(`anlage_${num}` as EinzelDokumentKey)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />Öffnen
                  </Button>
                </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-muted-foreground">
              Jede Anlage wird als eigenständiges, OS Immobilien-gebrandetes PDF geöffnet. Alle Anlagen sind zusätzlich im Gesamt-PDF des Handelsvertretervertrages enthalten.
            </p>
          </div>
        )}

        {b.vertragPdfUrl && canEdit && b.vertragStatus === "nicht_gesendet" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={senden} disabled={busy}>
              <Send className="h-4 w-4 mr-1" />An Bewerber senden
            </Button>
            <Button variant="ghost" size="sm" onClick={sendenTest} disabled={busy}>
              <FlaskConical className="h-4 w-4 mr-1" />Test-Mail an mich (ohne Tracking)
            </Button>
          </div>
        )}

        {b.vertragStatus === "gesendet" && tracking && (
          <div className="rounded-md border p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">E-Mail-Tracking</p>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={loadTracking}>
                <RefreshCw className="h-3 w-3 mr-1" />Aktualisieren
              </Button>
            </div>
            {/* Kein „E-Mail geöffnet“ mehr: Die Vertragsmail trägt kein Zählpixel
                (§ 25 TDDDG, 26.09.2026). Gezählt wird nur der Aufruf des Links. */}
            <div className="grid gap-2">
              <div className="flex items-start gap-2 rounded border p-2 bg-background">
                <MousePointerClick className={`h-4 w-4 mt-0.5 ${tracking.link_opened_at ? "text-green-600" : "text-muted-foreground"}`} />
                <div className="text-xs">
                  <p className="font-medium">Signatur-Link geöffnet</p>
                  <p className="text-muted-foreground">
                    {tracking.link_opened_at
                      ? new Date(tracking.link_opened_at).toLocaleString("de-DE")
                      : "Noch nicht geöffnet"}
                  </p>
                </div>
                {tracking.link_opened_at && <Badge className="ml-auto bg-green-500 text-white text-[10px] h-5">geöffnet</Badge>}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Hinweis: Gezählt wird, sobald die Signatur-Seite über den Link aufgerufen wird. Ob die Mail gelesen wurde, messen wir nicht.
            </p>
          </div>
        )}

        {b.vertragPdfUrl && canEdit && b.vertragStatus === "gesendet" && (
          /* Auf dem Handy untereinander: Der Knopf "Erneut zur Unterschrift
             senden" bricht nicht um und ist breiter als die halbe Karte. */
          <div className="flex flex-col gap-3 rounded-md border border-dashed p-3 bg-muted/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs text-muted-foreground space-y-1">
              <p className="break-words">
                Noch nicht unterschrieben? Sende die Vertragsunterlagen erneut zur Unterschrift an {b.email || "den Bewerber"}.
              </p>
              {(b.vertragErstVersandAt || b.vertragDatum) && (
                <p>
                  <span className="font-medium">Erstmals versendet:</span>{" "}
                  {formatDatumZeitFlexibel(b.vertragErstVersandAt || b.vertragDatum)}
                </p>
              )}
              {b.vertragErinnerungenAt && b.vertragErinnerungenAt.length > 0 && (
                <div>
                  <p className="font-medium">Erinnerungen ({b.vertragErinnerungenAt.length}):</p>
                  <ul className="list-disc list-inside ml-1">
                    {b.vertragErinnerungenAt.map((ts, i) => (
                      <li key={i}>{formatDatumZeitFlexibel(ts)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0">
              <Button variant="outline" size="sm" onClick={senden} disabled={busy}>
                <RefreshCw className="h-4 w-4 mr-1" />Erneut zur Unterschrift senden
              </Button>
              <Button variant="ghost" size="sm" onClick={sendenTest} disabled={busy}>
                <FlaskConical className="h-4 w-4 mr-1" />Test-Mail an mich
              </Button>
            </div>
          </div>
        )}

        {b.vertragStatus === "wartet_auf_kurz" && canEdit && (
          <KurzReminderBlock bewerberId={b.id} bewerberName={`${b.vorname} ${b.nachname}`.trim()} paketTitel={getLizenzPaket(b.paketwahl as LizenzPaketId)?.titel || "—"} />
        )}

        {b.vertragSignedPdfUrl && (
          <div className="flex items-center justify-between rounded-md border p-3 bg-green-500/5 border-green-500/30">
            <div className="text-sm">
              <p className="font-medium flex items-center gap-1"><PenLine className="h-3.5 w-3.5" /> Unterschriebene Version</p>
              <p className="text-xs text-muted-foreground">
                {formatDatumZeitFlexibel(b.vertragSignedAt)}
              </p>
            </div>
            <a href={b.vertragSignedPdfUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1" />Download</Button>
            </a>
          </div>
        )}

      </Card>

      <Dialog open={testOffen} onOpenChange={setTestOffen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              Test-Mail senden
            </DialogTitle>
            <DialogDescription>
              Der Versand zählt nicht in der E-Mail-Statistik, und der Status des
              Bewerbers bleibt unverändert.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-2"
            onSubmit={(e) => { e.preventDefault(); testBestaetigen(); }}
          >
            <Label htmlFor="test-mail-adresse" className="text-xs font-semibold">
              Empfänger
            </Label>
            <Input
              id="test-mail-adresse"
              type="email"
              autoFocus
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="name@os-immobilien.com"
            />
          </form>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTestOffen(false)}>
              Abbrechen
            </Button>
            <Button onClick={testBestaetigen} disabled={!testEmail.trim() || busy}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Test-Mail senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={umstellenOffen} onOpenChange={setUmstellenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auf kompakte Vertragsfassung {VERTRAGS_FASSUNG} umstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Partner bekommt danach den kompakten Vertrag mit Konditionenblatt. Der Vertrag muss
              anschließend neu erzeugt und erneut unterschrieben werden. Der bisherige Vertrag bleibt als
              Dokument erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={aufKompakteFassungUmstellen}>Umstellen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={ersetzenOffen} onOpenChange={setErsetzenOffen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Individuellen Vertrag ersetzen?</AlertDialogTitle>
            <AlertDialogDescription>
              Für diesen Bewerber liegt ein individuell erstellter Vertrag vor. Wenn du fortfährst, wird er
              durch den Standard-Vertrag aus der Vorlage ersetzt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setErsetzenOffen(false); void generieren(true); }}>Ersetzen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KurzReminderBlock({ bewerberId, bewerberName, paketTitel }: { bewerberId: string; bewerberName: string; paketTitel: string }) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ offen: boolean; created_at: string | null }>({ offen: false, created_at: null });

  // Ohne `token`: Den liest seit Migration 20260929200000 nur noch der Server.
  const ladeOffeneAnfrage = async () => {
    const { data } = await (supabase as any)
      .from("signature_requests")
      .select("id, created_at")
      .eq("kontakt_id", bewerberId)
      .eq("person_type", "vertrag_kurz")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setInfo({ offen: !!data?.id, created_at: data?.created_at || null });
  };

  useEffect(() => {
    void ladeOffeneAnfrage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bewerberId]);

  const remind = async () => {
    setBusy(true);
    // Den Link baut der Server mit dem aktuellen Token der offenen Anfrage.
    const fehler = await signaturLinkErinnern({ art: "vertrag_kurz", bewerberId, bewerberName, paketTitel });
    if (fehler) toast({ title: "Fehler", description: fehler, variant: "destructive" });
    else toast({ title: "Erinnerung gesendet", description: "Christian Kurz wurde per E-Mail erinnert." });
    setBusy(false);
  };

  return (
    // Auf dem Handy untereinander, sonst schiebt der Knopf den Text aus dem Kasten.
    <div className="flex flex-col gap-3 rounded-md border border-dashed p-3 bg-blue-500/5 border-blue-500/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Wartet auf Gegenzeichnung OS Immobilien</p>
        <p>Der Bewerber hat bereits unterschrieben. Christian Kurz wurde per E-Mail an <span className="font-medium">os@os-immobilien.com</span> zur Gegenzeichnung aufgefordert.</p>
        {info.created_at && (
          <p>Anfrage erstellt am {new Date(info.created_at).toLocaleString("de-DE")}</p>
        )}
        <p>Nach der Gegenzeichnung wird die finale PDF (mit beiden Unterschriften) automatisch in der Akte abgelegt und der Bewerber per Mail informiert.</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:shrink-0">
        <Button variant="outline" size="sm" onClick={remind} disabled={busy || !info.offen}>
          <Mail className="h-4 w-4 mr-1" />Erneut an Kurz erinnern
        </Button>
      </div>
    </div>
  );
}