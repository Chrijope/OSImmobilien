import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Download, FileText, Building2, Save, RotateCcw, ArrowLeft } from "lucide-react";

interface Props {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  asPage?: boolean;
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n || 0);

const todayDE = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

// Personalisierte Rechnungsnummer pro Vertriebspartner:
// Format: RE-{MOREID}-{YYYY}-{laufende Nummer 4-stellig}
// Zähler wird pro VP (moreId) + Jahr in localStorage geführt -> keine Überschneidung zwischen VPs.
const vpCounterKey = (vpId: string, year: number) =>
  `mi_rechnung_counter_${vpId}_${year}`;

const peekVpCounter = (vpId: string, year: number) => {
  try {
    const raw = localStorage.getItem(vpCounterKey(vpId, year));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
};

const reserveNextVpCounter = (vpId: string, year: number) => {
  const next = peekVpCounter(vpId, year) + 1;
  try {
    localStorage.setItem(vpCounterKey(vpId, year), String(next));
  } catch {
    // ignore
  }
  return next;
};

const sanitizeVpId = (raw: string) =>
  (raw || "VP").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16) || "VP";

const buildRechnungsnummer = (vpIdRaw: string, counter: number) => {
  const year = new Date().getFullYear();
  const vp = sanitizeVpId(vpIdRaw);
  return `RE-${vp}-${year}-${String(counter).padStart(4, "0")}`;
};

const previewRechnungsnummer = (vpIdRaw: string) => {
  const year = new Date().getFullYear();
  const vp = sanitizeVpId(vpIdRaw);
  const next = peekVpCounter(vp, year) + 1;
  return buildRechnungsnummer(vp, next);
};

// Länderspezifische IBAN-Längen (häufigste EU-Länder)
const IBAN_LENGTHS: Record<string, number> = {
  DE: 22, AT: 20, CH: 21, LI: 21, LU: 20, BE: 16, NL: 18, FR: 27,
  IT: 27, ES: 24, PT: 25, DK: 18, SE: 24, FI: 18, NO: 15, PL: 28,
  CZ: 24, GB: 22, IE: 22,
};

const ibanMaxFor = (raw: string) => {
  const cc = (raw || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  return IBAN_LENGTHS[cc] ?? 34;
};

// IBAN: Großbuchstaben, alphanumerisch, länderspezifische Länge, alle 4 Zeichen ein Space
const formatIban = (raw: string) => {
  const clean = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const max = ibanMaxFor(clean);
  return clean.slice(0, max).replace(/(.{4})/g, "$1 ").trim();
};

const ibanRaw = (raw: string) => (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const isIbanValid = (raw: string) => {
  const clean = ibanRaw(raw);
  if (clean.length < 15) return false;
  const cc = clean.slice(0, 2);
  const expected = IBAN_LENGTHS[cc];
  return expected ? clean.length === expected : clean.length >= 15 && clean.length <= 34;
};

// BIC: Großbuchstaben, alphanumerisch, exakt 8 oder 11 Zeichen
const formatBic = (raw: string) =>
  (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);

const isBicValid = (raw: string) => {
  const c = formatBic(raw);
  return c.length === 8 || c.length === 11;
};

const EMPFAENGER = {
  firma: "MOREImmo",
  ansprechpartner: "Geschäftsführer Christian Kurz",
  strasse: "Wendelsteinstraße 19",
  plzOrt: "83075 Bad Feilnbach",
  land: "Deutschland",
  email: "office@more.immo",
  ustId: "USt-IdNr.: DE461593843",
};

export function RechnungsGeneratorDialog({ open = true, onOpenChange, asPage = false }: Props) {
  const { toast } = useToast();
  const { user } = useUser();
  const navigate = useNavigate();

  // Persistente Stammdaten (pro Benutzer im localStorage)
  const storageKey = useMemo(
    () => `mi_rechnung_stammdaten_${user?.name || "default"}`,
    [user?.name],
  );
  const loadSaved = (): Record<string, string> => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };
  const saved = loadSaved();

  // Absender (Partner)
  const [absenderName, setAbsenderName] = useState(saved.name || (user?.name && user.name !== "Laden..." ? user.name : ""));
  const [absenderFirma, setAbsenderFirma] = useState(saved.firma || "");
  const [absenderAdresse, setAbsenderAdresse] = useState(saved.adresse || "");
  const [absenderPlzOrt, setAbsenderPlzOrt] = useState(saved.plzOrt || "");
  const [absenderSteuernr, setAbsenderSteuernr] = useState(saved.steuernr || "");
  const [absenderIban, setAbsenderIban] = useState(saved.iban || "");
  const [absenderBic, setAbsenderBic] = useState(saved.bic || "");
  const [absenderBank, setAbsenderBank] = useState(saved.bank || "");
  const [absenderTelefon, setAbsenderTelefon] = useState(saved.telefon || "");
  const [absenderEmail, setAbsenderEmail] = useState(saved.email || "");

  // VP-Identifier (stabil, eindeutig pro Vertriebspartner)
  const vpId = useMemo(() => {
    const mi = (user?.moreId || "").trim();
    if (mi) return sanitizeVpId(mi);
    const initials = (user?.name || "")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .join("");
    return sanitizeVpId(initials || "VP");
  }, [user?.moreId, user?.name]);

  // Rechnung — personalisiert pro VP, Zähler kollidiert nie zwischen Partnern
  const [rechnungsnummer, setRechnungsnummer] = useState(() => previewRechnungsnummer(vpId));
  const [rechnungsnummerManuell, setRechnungsnummerManuell] = useState(false);
  const datum = todayDE();
  const leistung = "Vermittlungsprovision gemäß Partnervertrag";
  const [brutto, setBrutto] = useState<string>("");
  const [ustSatz, setUstSatz] = useState<"0" | "19">((saved.ustSatz === "19" ? "19" : "0")); // Persistente Wahl

  // Beim Öffnen erneut aus localStorage laden (falls Werte aktualisiert wurden)
  useEffect(() => {
    if (!open) return;
    const s = loadSaved();
    if (Object.keys(s).length === 0) return;
    setAbsenderName(s.name || absenderName);
    setAbsenderFirma(s.firma ?? "");
    setAbsenderAdresse(s.adresse ?? "");
    setAbsenderPlzOrt(s.plzOrt ?? "");
    setAbsenderSteuernr(s.steuernr ?? "");
    setAbsenderIban(s.iban ?? "");
    setAbsenderBic(s.bic ?? "");
    setAbsenderBank(s.bank ?? "");
    setAbsenderTelefon(s.telefon ?? "");
    setAbsenderEmail(s.email ?? "");
    if (s.ustSatz === "0" || s.ustSatz === "19") setUstSatz(s.ustSatz);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storageKey]);

  // Beim Öffnen oder VP-Wechsel: Vorschau der nächsten Rechnungsnummer aktualisieren
  // (sofern der Nutzer sie nicht manuell überschrieben hat).
  useEffect(() => {
    if (!open) return;
    if (rechnungsnummerManuell) return;
    setRechnungsnummer(previewRechnungsnummer(vpId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vpId]);

  const persistStammdaten = () => {
    const payload = {
      name: absenderName,
      firma: absenderFirma,
      adresse: absenderAdresse,
      plzOrt: absenderPlzOrt,
      steuernr: absenderSteuernr,
      iban: absenderIban,
      bic: absenderBic,
      bank: absenderBank,
      telefon: absenderTelefon,
      email: absenderEmail,
      ustSatz,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
      toast({ title: "Stammdaten gespeichert ✓", description: "Werden beim nächsten Öffnen automatisch geladen." });
    } catch {
      toast({ title: "Speichern fehlgeschlagen", variant: "destructive" });
    }
  };

  const resetStammdaten = () => {
    try {
      localStorage.removeItem(storageKey);
      setAbsenderFirma(""); setAbsenderAdresse(""); setAbsenderPlzOrt("");
      setAbsenderSteuernr(""); setAbsenderIban(""); setAbsenderBic("");
      setAbsenderBank(""); setAbsenderTelefon(""); setAbsenderEmail("");
      setUstSatz("0");
      toast({ title: "Stammdaten zurückgesetzt" });
    } catch { /* ignore */ }
  };

  const bruttoNum = parseFloat((brutto || "0").replace(",", ".")) || 0;
  const satz = parseInt(ustSatz, 10) / 100;
  const nettoNum = useMemo(() => (satz > 0 ? bruttoNum / (1 + satz) : bruttoNum), [bruttoNum, satz]);
  const ustNum = useMemo(() => bruttoNum - nettoNum, [bruttoNum, nettoNum]);
  const bruttoTotal = bruttoNum;

  const handleGenerate = async () => {
    if (!absenderName || !absenderAdresse || !absenderPlzOrt) {
      toast({ title: "Bitte Absenderdaten vollständig ausfüllen", variant: "destructive" });
      return;
    }
    if (!absenderSteuernr) {
      toast({ title: "Bitte Steuernummer / USt-IdNr. angeben", variant: "destructive" });
      return;
    }
    if (!absenderBank) {
      toast({ title: "Bitte Bank angeben", variant: "destructive" });
      return;
    }
    if (!isIbanValid(absenderIban)) {
      toast({ title: "Ungültige IBAN", description: "Bitte vollständige IBAN mit korrekter Länge eingeben.", variant: "destructive" });
      return;
    }
    if (!isBicValid(absenderBic)) {
      toast({ title: "Ungültiger BIC", description: "BIC muss exakt 8 oder 11 Zeichen haben.", variant: "destructive" });
      return;
    }
    if (!bruttoNum || bruttoNum <= 0) {
      toast({ title: "Bitte einen gültigen Bruttobetrag eingeben", variant: "destructive" });
      return;
    }

    try {
      // Bei nicht-manueller Nummer: jetzt verbindlich pro VP reservieren,
      // damit die Nummer im PDF garantiert eindeutig ist.
      let finalRechnungsnummer = rechnungsnummer;
      if (!rechnungsnummerManuell) {
        const next = reserveNextVpCounter(vpId, new Date().getFullYear());
        finalRechnungsnummer = buildRechnungsnummer(vpId, next);
        setRechnungsnummer(finalRechnungsnummer);
      }
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = 210;
      const pageH = 297;
      const M = 20;
      const ink = (g = 0) => doc.setTextColor(g, g, g);

      // ── Briefkopf: Absender-Zeile (klein, oben links) ──
      const absenderZeile = [
        absenderFirma || absenderName,
        absenderAdresse,
        absenderPlzOrt,
      ].filter(Boolean).join(" · ");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      ink(120);
      doc.text(absenderZeile, M, 22);

      // ── Empfänger-Block (links) ──
      let y = 38;
      doc.setFontSize(10);
      ink(0);
      doc.text(EMPFAENGER.firma, M, y); y += 5;
      doc.text(EMPFAENGER.ansprechpartner, M, y); y += 5;
      doc.text(EMPFAENGER.strasse, M, y); y += 5;
      doc.text(EMPFAENGER.plzOrt, M, y); y += 5;
      doc.text(EMPFAENGER.land, M, y);

      // ── Meta-Block (rechts) ──
      let yMeta = 38;
      doc.setFontSize(9);
      ink(110);
      doc.text("Rechnungsnummer", pageW - M, yMeta, { align: "right" }); yMeta += 4;
      ink(0);
      doc.setFont("helvetica", "bold");
      doc.text(finalRechnungsnummer, pageW - M, yMeta, { align: "right" }); yMeta += 6;
      doc.setFont("helvetica", "normal");
      ink(110);
      doc.setFontSize(9);
      doc.text("Rechnungsdatum", pageW - M, yMeta, { align: "right" }); yMeta += 4;
      ink(0);
      doc.setFontSize(10);
      doc.text(datum, pageW - M, yMeta, { align: "right" });

      // ── Titel ──
      y = 78;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      ink(0);
      doc.text(`Rechnung ${finalRechnungsnummer}`, M, y);
      doc.setFont("helvetica", "normal");
      y += 8;

      // ── Anrede ──
      doc.setFontSize(10);
      ink(0);
      doc.text("Sehr geehrte Damen und Herren,", M, y); y += 6;
      const anredeLines = doc.splitTextToSize(
        "gemäß unserer vertraglichen Vereinbarung erlaube ich mir, Ihnen die nachfolgende Leistung in Rechnung zu stellen:",
        pageW - 2 * M,
      );
      doc.text(anredeLines, M, y);
      y += anredeLines.length * 5 + 4;

      // ── Positionstabelle ──
      doc.setFontSize(10);
      doc.setFillColor(245, 245, 247);
      doc.rect(M, y, pageW - 2 * M, 9, "F");
      doc.setFont("helvetica", "bold");
      ink(0);
      doc.text("Leistung", M + 2, y + 6);
      doc.text("Betrag", pageW - M - 2, y + 6, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 14;

      const leistungLines = doc.splitTextToSize(leistung, 130);
      doc.text(leistungLines, M + 2, y);
      doc.text(fmtEUR(nettoNum), pageW - M - 2, y, { align: "right" });
      y += leistungLines.length * 5 + 6;

      doc.setDrawColor(220);
      doc.line(M, y, pageW - M, y); y += 7;

      if (ustSatz === "0") {
        doc.text("Zwischensumme (netto)", 130, y);
        doc.text(fmtEUR(nettoNum), pageW - M - 2, y, { align: "right" });
        y += 6;
      } else {
        doc.text("Netto", 130, y);
        doc.text(fmtEUR(nettoNum), pageW - M - 2, y, { align: "right" });
        y += 6;
        doc.text(`zzgl. ${ustSatz}% USt`, 130, y);
        doc.text(fmtEUR(ustNum), pageW - M - 2, y, { align: "right" });
        y += 6;
      }

      // Gesamtbetrag — dunkle Box
      doc.setFillColor(20, 20, 22);
      doc.rect(M, y, pageW - 2 * M, 11, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text("Gesamtbetrag", M + 2, y + 7.5);
      doc.text(fmtEUR(bruttoTotal), pageW - M - 2, y + 7.5, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      ink(0);
      y += 18;

      // ── USt-Hinweis (Kleinunternehmer) ──
      if (ustSatz === "0") {
        doc.setFontSize(9);
        ink(110);
        const hinweis = doc.splitTextToSize(
          "Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen (Kleinunternehmerregelung).",
          pageW - 2 * M,
        );
        doc.text(hinweis, M, y);
        y += hinweis.length * 4 + 4;
        doc.setFontSize(10);
        ink(0);
      }

      // ── Zahlungshinweis ──
      doc.text("Bitte überweisen Sie den Gesamtbetrag innerhalb von 14 Tagen auf folgendes Konto:", M, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.text("Bankverbindung", M, y); y += 5;
      doc.setFont("helvetica", "normal");
      if (absenderBank) { doc.text(`Bank: ${absenderBank}`, M, y); y += 5; }
      doc.text(`Kontoinhaber: ${absenderName}`, M, y); y += 5;
      doc.text(`IBAN: ${formatIban(absenderIban)}`, M, y); y += 5;
      if (absenderBic) { doc.text(`BIC: ${formatBic(absenderBic)}`, M, y); y += 5; }

      // ── Schlussformel ──
      y += 6;
      doc.text("Vielen Dank für die angenehme Zusammenarbeit.", M, y); y += 6;
      doc.text("Mit freundlichen Grüßen", M, y); y += 10;
      doc.setFont("helvetica", "bold");
      doc.text(absenderName, M, y);
      doc.setFont("helvetica", "normal");

      // ── Footer: 3-Spalten mit Absender-Stammdaten ──
      const footerY = pageH - 32;
      doc.setDrawColor(220);
      doc.line(M, footerY, pageW - M, footerY);

      const colW = (pageW - 2 * M) / 3;
      const fY = footerY + 5;
      doc.setFontSize(8);
      ink(90);

      // Spalte 1: Absender
      let cy = fY;
      doc.setFont("helvetica", "bold");
      doc.text("Absender", M, cy); cy += 4;
      doc.setFont("helvetica", "normal");
      if (absenderFirma) { doc.text(absenderFirma, M, cy); cy += 4; }
      doc.text(absenderName, M, cy); cy += 4;
      doc.text(absenderAdresse, M, cy); cy += 4;
      doc.text(absenderPlzOrt, M, cy);

      // Spalte 2: Kontakt / Steuer
      cy = fY;
      const cx2 = M + colW;
      doc.setFont("helvetica", "bold");
      doc.text("Kontakt", cx2, cy); cy += 4;
      doc.setFont("helvetica", "normal");
      if (absenderTelefon) { doc.text(`Tel.: ${absenderTelefon}`, cx2, cy); cy += 4; }
      if (absenderEmail) { doc.text(absenderEmail, cx2, cy); cy += 4; }
      if (absenderSteuernr) {
        const isUstId = /^[A-Z]{2}/i.test(absenderSteuernr.trim());
        const label = isUstId ? "USt-IdNr." : "Steuer-Nr.";
        doc.text(`${label}: ${absenderSteuernr}`, cx2, cy); cy += 4;
      }

      // Spalte 3: Bank
      cy = fY;
      const cx3 = M + 2 * colW;
      doc.setFont("helvetica", "bold");
      doc.text("Bankverbindung", cx3, cy); cy += 4;
      doc.setFont("helvetica", "normal");
      if (absenderBank) { doc.text(absenderBank, cx3, cy); cy += 4; }
      doc.text(`IBAN: ${formatIban(absenderIban)}`, cx3, cy); cy += 4;
      if (absenderBic) { doc.text(`BIC: ${formatBic(absenderBic)}`, cx3, cy); }

      const filename = `Rechnung_${finalRechnungsnummer}_MOREImmo.pdf`;
      doc.save(filename);
      // Stammdaten automatisch persistieren, damit sie beim nächsten Mal vorausgefüllt sind
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          name: absenderName, firma: absenderFirma, adresse: absenderAdresse, plzOrt: absenderPlzOrt,
          steuernr: absenderSteuernr, iban: absenderIban, bic: absenderBic, bank: absenderBank,
          telefon: absenderTelefon, email: absenderEmail, ustSatz,
        }));
      } catch { /* ignore quota errors */ }
      toast({ title: "Rechnung erstellt ✓", description: filename });
    } catch (err) {
      console.error(err);
      toast({ title: "Fehler beim Erstellen der PDF", variant: "destructive" });
    }
  };

  const body = (
    <div className="space-y-6 py-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Deine Stammdaten</h3>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={resetStammdaten}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Zurücksetzen
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={persistStammdaten}>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Stammdaten speichern
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Einmal eintragen, dauerhaft gespeichert — auch die Wahl der Umsatzsteuer.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={absenderName} onChange={(e) => setAbsenderName(e.target.value)} /></div>
              <div><Label>Firma (optional)</Label><Input value={absenderFirma} onChange={(e) => setAbsenderFirma(e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Straße & Hausnummer *</Label><Input value={absenderAdresse} onChange={(e) => setAbsenderAdresse(e.target.value)} /></div>
              <div><Label>PLZ & Ort *</Label><Input value={absenderPlzOrt} onChange={(e) => setAbsenderPlzOrt(e.target.value)} placeholder="80331 München" /></div>
              <div><Label>Steuernummer / USt-IdNr. *</Label><Input value={absenderSteuernr} onChange={(e) => setAbsenderSteuernr(e.target.value)} /></div>
              <div><Label>Bank *</Label><Input value={absenderBank} onChange={(e) => setAbsenderBank(e.target.value)} placeholder="Sparkasse München" /></div>
              <div>
                <Label>IBAN *</Label>
                <Input
                  value={absenderIban}
                  onChange={(e) => setAbsenderIban(formatIban(e.target.value))}
                  placeholder="DE00 0000 0000 0000 0000 00"
                  className="font-mono tracking-wide"
                />
              </div>
              <div>
                <Label>BIC *</Label>
                <Input
                  value={absenderBic}
                  onChange={(e) => setAbsenderBic(formatBic(e.target.value))}
                  placeholder="z. B. SSKMDEMMXXX"
                  className="font-mono uppercase tracking-wide"
                />
              </div>
              <div><Label>Telefon</Label><Input value={absenderTelefon} onChange={(e) => setAbsenderTelefon(e.target.value)} placeholder="+49 89 123456" /></div>
              <div><Label>E-Mail</Label><Input value={absenderEmail} onChange={(e) => setAbsenderEmail(e.target.value)} placeholder="name@example.com" type="email" /></div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Empfänger der Rechnung</h3>
            <div className="rounded-lg border bg-muted/30 p-4 flex gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm leading-relaxed">
                <div className="font-semibold">{EMPFAENGER.firma}</div>
                <div>{EMPFAENGER.ansprechpartner}</div>
                <div>{EMPFAENGER.strasse}</div>
                <div>{EMPFAENGER.plzOrt}</div>
                <div>{EMPFAENGER.land}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {EMPFAENGER.email} · {EMPFAENGER.ustId}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Rechnungsdaten</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Rechnungsnummer</Label>
                <Input
                  value={rechnungsnummer}
                  onChange={(e) => {
                    setRechnungsnummer(e.target.value);
                    setRechnungsnummerManuell(true);
                  }}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Automatisch personalisiert pro Vertriebspartner ({vpId}) – fortlaufend & überschneidungsfrei.
                </p>
              </div>
              <div><Label>Bruttobetrag (EUR) *</Label><Input value={brutto} onChange={(e) => setBrutto(e.target.value)} placeholder="z. B. 4500,00" /></div>
              <div>
                <Label>Umsatzsteuer</Label>
                <Select value={ustSatz} onValueChange={(v) => setUstSatz(v as "0" | "19")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Kleinunternehmer (§ 19 UStG) – 0%</SelectItem>
                    <SelectItem value="19">Regelbesteuerung – 19%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-muted/30 p-4">
            {ustSatz !== "0" && (
              <>
                <div className="flex justify-between text-sm"><span>Netto</span><span>{fmtEUR(nettoNum)}</span></div>
                <div className="flex justify-between text-sm"><span>USt {ustSatz}%</span><span>{fmtEUR(ustNum)}</span></div>
              </>
            )}
            <div className="flex justify-between text-base font-semibold pt-2 border-t mt-2">
              <span>Gesamtbetrag (brutto)</span><span>{fmtEUR(bruttoTotal)}</span>
            </div>
          </section>
    </div>
  );

  if (asPage) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/unterlagen")} className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Zurück zu Unterlagen
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Rechnungs-Generator für Partner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Erstelle eine fertige Rechnung an die MOREImmo. Felder ausfüllen, PDF herunterladen, an die Buchhaltung senden.
          </p>
        </div>
        {body}
        <div className="flex justify-end">
          {/*
            Hauptaktion der Seite Rechnungsvorlage, deshalb Marken-Orange.
            Im Dialog weiter unten bleibt derselbe Knopf normal: dort hebt
            ihn schon die Fussleiste neben "Abbrechen" heraus.
          */}
          <Button onClick={handleGenerate} variant="brand"><Download className="h-4 w-4 mr-2" />Rechnung als PDF erstellen</Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Rechnungs-Generator für Partner
          </DialogTitle>
          <DialogDescription>
            Erstelle eine fertige Rechnung an die MOREImmo. Felder ausfüllen, PDF herunterladen, an die Buchhaltung senden.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Abbrechen</Button>
          <Button onClick={handleGenerate}><Download className="h-4 w-4 mr-2" />Rechnung als PDF erstellen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}