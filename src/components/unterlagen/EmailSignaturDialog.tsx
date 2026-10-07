import { useState, useMemo, useEffect, useRef } from "react";
import { BERUF_IMMOBILIENBERATER } from "@/lib/berufsbezeichnung";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Copy, Download, Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import moreimmoLogo from "@/assets/moreimmo-logo-full.png.asset.json";
import { cacheGet } from "@/lib/dataCache";
import { OEFFENTLICHE_BASIS } from "@/lib/oeffentlicheBasis";

interface Props {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  asPage?: boolean;
  backTo?: string;
  backLabel?: string;
}

const splitName = (full: string): { vorname: string; nachname: string } => {
  const parts = (full || "").trim().split(/\s+/);
  if (parts.length <= 1) return { vorname: parts[0] || "", nachname: "" };
  return { vorname: parts[0], nachname: parts.slice(1).join(" ") };
};

/* Die Adresse, die in der Signatur stehen bleibt, falls das eingebettete Bild
   nicht entsteht. Fest auf die veroeffentlichte Seite statt
   die Herkunft des Browsers: Aus der Lovable-Vorschau heraus stand sonst deren
   Adresse in jeder Mail, und die laedt ohne Anmeldung kein Bild. */
const absoluteLogoUrl = () => new URL(moreimmoLogo.url, OEFFENTLICHE_BASIS).href;

/* Farben der Markenrichtlinie, Abschnitt 3. Bewusst als feste Hexwerte und
   nicht als CSS-Variable: die Signatur landet in fremden Mailprogrammen, dort
   gibt es unsere Tokens nicht. */
const SIG_TINTE = "#131720";
const SIG_LEISE = "#6A7181";
const SIG_BLAU_600 = "#087AC7"; // Balken
const SIG_BLAU_700 = "#0466A9"; // Verweise, 6,04:1 auf Weiß
const SIG_LINIE = "#E3E7EC";
/* Christians Vorgabe vom 03.08.2026: Helvetica in 12. Helvetica steht deshalb
   vorn, nicht die Systemschrift, damit die Signatur in jedem Mailprogramm
   gleich aussieht. */
const SIG_FONT = 'Helvetica, "Helvetica Neue", Arial, sans-serif';

/**
 * Funktionsbezeichnung unter dem Namen.
 *
 * Sie steht bewusst fest und ist kein Eingabefeld, damit in der Signatur nicht
 * jeder eine eigene Bezeichnung erfindet. Einzige Ausnahme ist der Inhaber.
 */
const SIG_SONDERFUNKTIONEN: Record<string, string> = {
  "christian kurz": "Inhaber & Geschäftsführer",
};
const funktionFuer = (fullName: string) =>
  SIG_SONDERFUNKTIONEN[fullName.trim().toLowerCase().replace(/\s+/g, " ")] ?? BERUF_IMMOBILIENBERATER;

/**
 * Baut die Signatur nach Abschnitt 9 der Markenrichtlinie.
 *
 * Aufbau dort: Grußformel, Name fett, Funktion leise, blauer Balken, darunter
 * Logo links und Anschrift rechts, Haarlinie, Fußzeile. Kein Bild außer dem
 * Logo, keine Sinnsprüche, keine bunten Kanalsymbole. Alles in Tabellen und
 * mit Stilangaben direkt am Element, weil Mailprogramme Stilblöcke im Kopf
 * verwerfen und Flexbox nicht kennen.
 *
 * Die Pflichtangaben (Umsatzsteuer-Identifikationsnummer, Datenschutzhinweis)
 * standen schon vorher darunter und bleiben. Die Richtlinie zeigt sie in ihrem
 * Beispiel nicht, sie wegzulassen wäre aber ein rechtlicher Rückschritt.
 */
const buildSignaturHtml = (p: {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  logoUrl: string;
}) => {
  const fullName = `${p.vorname} ${p.nachname}`.trim();
  const telHref = (p.telefon || "").replace(/[^\d+]/g, "");
  return `<div style="font-family: ${SIG_FONT}; font-size: 12px; color: ${SIG_TINTE}; line-height: 1.5;">
  <div>Mit freundlichen Grüßen</div>

  <div style="margin-top: 18px; font-size: 14px; font-weight: 700; color: ${SIG_TINTE};">${fullName}</div>
  <div style="margin-top: 1px; font-size: 12px; color: ${SIG_LEISE};">${funktionFuer(fullName)}</div>

  <div style="margin-top: 10px; width: 44px; height: 3px; background: ${SIG_BLAU_600}; font-size: 0; line-height: 0;">&nbsp;</div>

  <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 14px; border-collapse: collapse;">
    <tr>
      <td valign="top" style="padding-right: 18px;">
        <img src="${p.logoUrl}" alt="MOREImmo" width="${LOGO_BREITE}" style="display:block; border:0; outline:none; max-width:${LOGO_BREITE}px; height:auto;" />
      </td>
      <td valign="top" style="font-family: ${SIG_FONT}; font-size: 12px; color: ${SIG_TINTE}; line-height: 1.5;">
        ${p.telefon ? `Telefon <a href="tel:${telHref}" style="color:${SIG_TINTE}; text-decoration:none;">${p.telefon}</a><br/>` : ""}
        <a href="mailto:${p.email}" style="color:${SIG_BLAU_700}; text-decoration:none;">${p.email}</a><br/>
        <a href="https://www.more.immo" style="color:${SIG_BLAU_700}; text-decoration:none;">more.immo</a>
      </td>
    </tr>
  </table>

  <div style="margin-top: 16px; border-top: 1px solid ${SIG_LINIE}; font-size: 0; line-height: 0;">&nbsp;</div>

  <div style="margin-top: 10px; font-size: 10px; color: ${SIG_LEISE};">
    MOREImmo, Wendelsteinstraße 19, 83075 Bad Feilnbach &middot; USt-IdNr.: DE461593843
  </div>
  <div style="margin-top: 8px; font-size: 10px; color: ${SIG_LEISE}; line-height: 1.45;">
    Datenschutzhinweis: Soweit Sie mit uns per E-Mail kommunizieren, werden dabei Daten erhoben und verarbeitet. Informationen dazu, welche Daten zu welchen Zwecken und auf welcher gesetzlichen Grundlage erhoben werden sowie über Ihre diesbezüglichen Rechte finden Sie auf unserer Webseite in der Datenschutzerklärung unter <a href="https://www.more.immo/datenschutz" style="color:${SIG_BLAU_700}; text-decoration:none;">www.more.immo/datenschutz</a>.
  </div>
</div>`;
};

/** Anzeigebreite des Logos in der Signatur, in Pixeln. */
const LOGO_BREITE = 120;

/**
 * Lädt das Logo und verkleinert es auf exakt die Anzeigegröße.
 *
 * Vorher wurde die Originaldatei eingebettet, 1920 Pixel breit, und nur per
 * width-Angabe auf 120 gestellt. Beim Kopieren und Einfügen in Apple Mail
 * geht diese Angabe verloren, Mail zeigt dann die natürliche Größe des
 * Bildes, und das Logo sprengt die Signatur. Ist die Bilddatei selbst nur
 * 120 Pixel breit, kann kein Mailprogramm sie größer machen, egal was beim
 * Einfügen verloren geht.
 */
async function imageToDataUri(url: string): Promise<string | null> {
  try {
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const hoehe = Math.round((img.naturalHeight / img.naturalWidth) * LOGO_BREITE);
          const canvas = document.createElement("canvas");
          canvas.width = LOGO_BREITE;
          canvas.height = hoehe;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, LOGO_BREITE, hoehe);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
}

export function EmailSignaturDialog({ open = true, onOpenChange, asPage = false, backTo, backLabel }: Props) {
  const { user, authUser } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const storageKey = useMemo(
    () => `mi_email_signatur_${authUser?.id || authUser?.email || "anon"}`,
    [authUser?.id, authUser?.email],
  );
  const stored = useMemo(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as { vorname?: string; nachname?: string; email?: string; telefon?: string }) : null;
    } catch {
      return null;
    }
  }, [storageKey]);
  const initial = useMemo(() => splitName(user?.name || ""), [user?.name]);
  const initialTelefon = useMemo(() => {
    if (!authUser?.id) return "";
    const rows = cacheGet<any>("user_settings") || [];
    const row = rows.find((r: any) => r.user_id === authUser.id);
    return (row?.einstellungen?.profil?.telefon || "").toString();
  }, [authUser?.id]);
  const [vorname, setVorname] = useState(stored?.vorname ?? initial.vorname);
  const [nachname, setNachname] = useState(stored?.nachname ?? initial.nachname);
  const [email, setEmail] = useState(stored?.email ?? authUser?.email ?? "");
  const [telefon, setTelefon] = useState(stored?.telefon ?? initialTelefon);
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Beim Öffnen: lokal gespeicherte Werte bevorzugen, sonst aus Profil vorbefüllen.
  useEffect(() => {
    if (!open) return;
    if (stored) {
      setVorname(stored.vorname ?? "");
      setNachname(stored.nachname ?? "");
      setEmail(stored.email ?? "");
      setTelefon(stored.telefon ?? initialTelefon);
    } else {
      setVorname(initial.vorname);
      setNachname(initial.nachname);
      setEmail(authUser?.email || "");
      setTelefon(initialTelefon);
    }
  }, [open, stored, initial.vorname, initial.nachname, authUser?.email, initialTelefon]);

  // Persistiere Änderungen automatisch lokal.
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ vorname, nachname, email, telefon }),
      );
    } catch {
      /* ignore quota */
    }
  }, [storageKey, vorname, nachname, email, telefon]);

  useEffect(() => {
    // Zum Einbetten die eigene Herkunft lesen, sonst sperrt CORS das Canvas.
    imageToDataUri(moreimmoLogo.url).then(setLogoDataUri);
  }, []);

  const logoUrl = useMemo(
    () => logoDataUri || absoluteLogoUrl(),
    [logoDataUri],
  );

  const html = useMemo(
    () => buildSignaturHtml({ vorname, nachname, email, telefon, logoUrl }),
    [vorname, nachname, email, telefon, logoUrl],
  );

  const copyAsRichText = async () => {
    try {
      let ok = false;
      if (previewRef.current) {
        const range = document.createRange();
        range.selectNodeContents(previewRef.current);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        sel?.removeAllRanges();
      }
      if (!ok && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = new Blob([html], { type: "text/html" });
        const textBlob = new Blob([previewRef.current?.innerText || ""], { type: "text/plain" });
        await navigator.clipboard.write([
          new ClipboardItem({ "text/html": blob, "text/plain": textBlob }),
        ]);
      }
      toast({ title: "Signatur kopiert ✓", description: "Jetzt in Apple Mail → Einstellungen → Signaturen einfügen (⌘V)." });
    } catch (err) {
      console.error(err);
      toast({ title: "Kopieren fehlgeschlagen", variant: "destructive" });
    }
  };

  const copyHtmlSource = async () => {
    try {
      await navigator.clipboard.writeText(html);
      toast({ title: "HTML-Quelltext kopiert ✓" });
    } catch {
      toast({ title: "Kopieren fehlgeschlagen", variant: "destructive" });
    }
  };

  const downloadHtml = () => {
    const blob = new Blob([
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MOREImmo Signatur – ${vorname} ${nachname}</title></head><body>${html}</body></html>`,
    ], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moreimmo-signatur-${vorname || "vp"}-${nachname || ""}.html`.toLowerCase().replace(/\s+/g, "-");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "HTML-Datei heruntergeladen ✓" });
  };

  const body = (
    <>
      <div className={asPage ? "" : "px-6 py-2"}>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Form */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">1. Deine Daten</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="sig-vor">Vorname</Label>
                    <Input id="sig-vor" value={vorname} onChange={(e) => setVorname(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="sig-nach">Nachname</Label>
                    <Input id="sig-nach" value={nachname} onChange={(e) => setNachname(e.target.value)} />
                  </div>
                </div>
                <div className="mt-2">
                  <Label htmlFor="sig-mail">E-Mail-Adresse</Label>
                  <Input id="sig-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vorname.nachname@more.immo" />
                </div>
                <div className="mt-2">
                  <Label htmlFor="sig-tel">Telefon</Label>
                  <Input id="sig-tel" type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="+49 170 1234567" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Name, E-Mail und Telefon werden automatisch aus deinen Einstellungen übernommen. Anpassungen hier wirken nur in der erzeugten Signatur.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">2. Signatur übernehmen</h3>
                <Button onClick={copyAsRichText} className="w-full" size="sm">
                  <Copy className="h-4 w-4 mr-2" /> Signatur kopieren (formatiert)
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={copyHtmlSource} variant="outline" size="sm">
                    <Copy className="h-3.5 w-3.5 mr-1" /> HTML-Quelltext
                  </Button>
                  <Button onClick={downloadHtml} variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5 mr-1" /> .html laden
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Anleitung für Apple Mail
                </h3>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                  <li>Klicke oben auf <strong>„Signatur kopieren (formatiert)"</strong>.</li>
                  <li>Öffne <strong>Mail</strong> auf deinem Mac.</li>
                  <li>Menü <strong>Mail → Einstellungen</strong> (oder <kbd>⌘ ,</kbd>) → Reiter <strong>Signaturen</strong>.</li>
                  <li>Wähle links dein <strong>MOREImmo E-Mail-Konto</strong> aus.</li>
                  <li>Klicke unten auf das <strong>„+"</strong>-Symbol — eine neue Signatur erscheint.</li>
                  <li>Benenne sie z. B. <em>„MOREImmo Standard"</em>.</li>
                  <li>Klicke ins rechte Vorschaufenster und füge mit <kbd>⌘ V</kbd> die Signatur ein.</li>
                  <li>
                    Deaktiviere unten die Option
                    <strong> „Schrift der Standardnachricht verwenden"</strong>,
                    damit Layout & Logo erhalten bleiben.
                  </li>
                  <li>Wähle die neue Signatur als <strong>Standardsignatur</strong> für dieses Konto aus.</li>
                  <li>Schließe die Einstellungen — fertig. Neue Mails enthalten die Signatur automatisch.</li>
                </ol>
                <p className="text-xs text-muted-foreground pt-1">
                  <strong>Tipp:</strong> Falls das Logo beim Empfänger nicht erscheint, lade alternativ die .html-Datei herunter
                  und ziehe sie per Drag & Drop ins Signatur-Vorschaufenster.
                </p>
              </div>
            </div>

            {/* Live-Vorschau */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Live-Vorschau</h3>
              <div className="rounded-lg border bg-white p-5 min-h-[400px]">
                <div ref={previewRef} dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          </div>
        </div>
    </>
  );

  if (asPage) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(backTo || "/unterlagen")} className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" /> {backLabel || "Zurück zu Unterlagen"}
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6" /> MOREImmo E-Mail-Signatur
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Einheitliche Signatur mit deinen persönlichen Daten — direkt in Apple Mail übernehmbar.
          </p>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" /> MOREImmo E-Mail-Signatur
          </DialogTitle>
          <DialogDescription>
            Einheitliche Signatur mit deinen persönlichen Daten — direkt in Apple Mail übernehmbar.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange?.(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
