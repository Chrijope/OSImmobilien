import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertTriangle, Trash2, Pen, FileText, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
// Signaturanfragen aus der Zeit vor der Fassungsweiche tragen kein Kennzeichen;
// sie gehören zur langen Altfassung, sonst bekäme der Unterzeichner andere
// Einzeldokumente als das verschickte Gesamt-PDF.
import { bewerberMitFassungAusAnfrage, vertragsFassungVon, anlagenAkzeptanzParagraph } from "@/lib/vertragKonditionen";
import {
  WIDERRUF_WAHL_TITEL,
  WIDERRUF_WAHL_EINLEITUNG,
  fassungsVermerk,
  reservierungTexte,
  unterschriftBestaetigung,
  vertragsAufbau,
  vertragsOptionenAus,
  vertragsSpracheAus,
} from "@/lib/reservierungErklaerung";
import { normalisiereSprache, type Sprache } from "../../supabase/functions/_shared/kunden-sprache.ts";
import {
  SIGNATUR_SEITE_TEXTE,
  dokumentTitel,
  einwilligungText,
  einwilligungsProtokoll,
  seitenZeit,
  type SignaturDokument,
  type SignaturSeitenTexte,
} from "@/lib/signaturSeiteTexte";
import { ZWEISPRACHIG_EINLEITUNG } from "@/lib/zweisprachig";
import { NOTAR_SPRACHHINWEIS } from "@/lib/notarSprache";
import { SA_RECHTSTEXT_FASSUNG_EN } from "@/lib/selbstauskunftSprache";
import { sendeSaPdfZurAblage, unterschriftenFuerPdf } from "@/lib/selbstauskunftPdfAblage";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
// Nur der Typ: jsPDF selbst wird weiter erst beim Unterschreiben nachgeladen.
import type { ReservierungUnterschrift } from "@/lib/reservierungPdf";
import type { ReservierungData } from "@/components/reservierung/ReservierungsForm";
import { Input } from "@/components/ui/input";
import logoLight from "@/assets/moreimmo-logo.png";
import logoDarkAsset from "@/assets/moreimmo-logo-dark.png.asset.json";
const logoDark = logoDarkAsset.url;
import { Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { SelbstauskunftForm, loescheLokalenSaEntwurf } from "@/components/selbstauskunft/SelbstauskunftForm";
import { Smartphone, Check } from "lucide-react";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

type Status = "loading" | "ready" | "expired" | "ueberholt" | "rv_aufgehoben" | "signed" | "already_signed" | "error" | "submitting" | "finalizing";

export default function SignaturSeite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const signatureType = searchParams.get("type") || "selbstauskunft";
  const isMobileMode = searchParams.get("mobile") === "1";
  const isReservierung = signatureType === "reservierung";
  const isVertrag = signatureType === "vertrag";
  const isVertragKurz = signatureType === "vertrag_kurz";
  const isAftersalesKunde = signatureType === "aftersales_kunde";
  const isAftersalesVp = signatureType === "aftersales_vp";
  // Nur die Selbstauskunft ist vor der Unterschrift durch den Kunden korrigierbar.
  const istSaKorrigierbar = !isReservierung && !isVertrag && !isVertragKurz && !isAftersalesKunde && !isAftersalesVp && !isMobileMode;
  const docLabel = isReservierung
    ? "Reservierungsvereinbarung"
    : isAftersalesKunde || isAftersalesVp
    ? "Beratungsdokument"
    : isVertrag || isVertragKurz
    ? "Vertrag"
    : "Selbstauskunft";
  const [status, setStatus] = useState<Status>("loading");
  const [request, setRequest] = useState<any>(null);
  const [consent, setConsent] = useState(false);
  /**
   * Der Ort der Unterschrift, nur bei der Reservierungsvereinbarung und
   * freiwillig. Bei einer Unterschrift im Browser kennt MOREImmo den Ort
   * nicht; wer ihn angibt, sieht ihn im PDF neben dem Datum.
   */
  const [ort, setOrt] = useState("");
  /**
   * Die Pflichtwahl aus Abschnitt 7, nur bei der Reservierungsvereinbarung.
   * Sie steht auf der Unterschriftsseite, weil allein der Kunde sie trifft,
   * und ist auf „sofort" voreingestellt (ohne Widerrufsfrist direkt
   * reservieren). Der Kunde kann vor der Unterschrift auf „abwarten"
   * wechseln; ohne Wahl wird nicht unterschrieben.
   */
  const [widerrufWahl, setWiderrufWahl] = useState<"sofort" | "abwarten">("sofort");
  /**
   * Steht in dieser Reservierung überhaupt eine Widerrufsbelehrung?
   *
   * Seit dem 22.09.2026 kann die interne Vorbereitung eine Reservierung ohne
   * Reservierungsgebühr anlegen. Dann entfällt die Widerrufsthematik, und
   * damit auch die Wahl zum Beginn auf dieser Seite. Ein fehlendes
   * `gebuehrEntfaellt`, wie es jede ältere Reservierung hat, heißt „mit
   * Gebühr" und ändert nichts.
   */
  /*
   * Seit dem 23.09.2026 auch beim ganzen Haus (Globalobjekt): Kauft dort eine
   * Gesellschaft, gibt es ebenfalls keine Widerrufsbelehrung und keine Wahl.
   * Die Optionen kommen aus dem Datensatz selbst, siehe `vertragsOptionenAus`.
   */
  const rvOptionen = vertragsOptionenAus(request?.sa_data);
  const rvAufbau = vertragsAufbau(rvOptionen);
  const rvMitWiderruf = isReservierung && rvAufbau.mitWiderruf;
  // Beim ganzen Haus sagt die Erläuterung „das Objekt“ statt „die Wohnung“.
  const rvWahlen = rvAufbau.widerrufWahlen;
  /*
   * Die Sprache der Seite (Plan Kundensprache, Etappe 4, S9).
   *
   * Nur die Wege der Kunden werden übersetzt; die Verträge der
   * Vertriebspartner bleiben deutsch. Bei der Reservierung entscheidet die
   * Sprache, in der die Vereinbarung hinausging (`rvData.vertragssprache`),
   * damit der Kunde genau das Dokument sieht, das er unterschreibt. Sonst
   * liefert `get_signature_request` die Sprache aus dem Kundenprofil in
   * `meta.sprache` (Migration 20260925180000). Ohne Migration fehlt sie, dann
   * gilt `?lang=` aus dem Link und zuletzt Deutsch.
   */
  const langParam = normalisiereSprache(searchParams.get("lang"));
  const istKundenseite = !isVertrag && !isVertragKurz && !isAftersalesVp;
  const rpcSprache = normalisiereSprache((request?.meta as { sprache?: unknown } | null | undefined)?.sprache);
  const sprache: Sprache = !istKundenseite
    ? "de"
    : isReservierung && request?.sa_data
    ? vertragsSpracheAus(request.sa_data)
    : rpcSprache ?? langParam ?? "de";
  const t: SignaturSeitenTexte = SIGNATUR_SEITE_TEXTE[sprache];
  const englisch = sprache === "en";
  const dok: SignaturDokument = isReservierung ? "reservierung" : isAftersalesKunde ? "aftersales" : "selbstauskunft";
  const anzeigeTitel = istKundenseite ? dokumentTitel(dok, sprache) : docLabel;
  // Die englische Fassung der Wahl zum Beginn, mit denselben Nummern wie die deutsche.
  const rvAufbauEn = isReservierung && englisch ? vertragsAufbau(rvOptionen, "en") : null;
  const rvTexteEn = reservierungTexte("en");

  useEffect(() => {
    const vorher = document.documentElement.lang;
    document.documentElement.lang = sprache;
    return () => { document.documentElement.lang = vorher || "de"; };
  }, [sprache]);

  const [errorMsg, setErrorMsg] = useState("");
  const [allSignedInfo, setAllSignedInfo] = useState<{ allSigned: boolean; totalRequests: number; signedCount: number } | null>(null);

  // PDF preview
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);

  // Korrekturmodus: Kunde bearbeitet die Selbstauskunft vor der Unterschrift
  const [korrekturOffen, setKorrekturOffen] = useState(false);
  const [korrekturHinweis, setKorrekturHinweis] = useState<string | null>(null);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mobileSignatureReceived, setMobileSignatureReceived] = useState(false);

  // Mobile-mode signature URL for QR code.
  // Wird auf jeden Render neu berechnet, damit der QR auch dann erscheint,
  // wenn die URL erst nach Mount stabil ist (Preview-Iframes, lazy routes …).
  const mobileSignatureUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("mobile", "1");
      // sicherstellen, dass Token & Type erhalten bleiben (falls Hash-Router o. ä.)
      if (token && !url.searchParams.get("token")) url.searchParams.set("token", token);
      if (signatureType && !url.searchParams.get("type")) url.searchParams.set("type", signatureType);
      return url.toString();
    } catch {
      return "";
    }
  }, [token, signatureType]);

  // Draw an image data URL onto the canvas, centered + scaled to fit
  const drawImageOnCanvas = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const padding = 16;
      const maxW = canvas.width - padding * 2;
      const maxH = canvas.height - padding * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      setHasDrawn(true);
      setMobileSignatureReceived(true);
    };
    img.src = dataUrl;
  }, []);

  // Realtime subscription: desktop listens for mobile signatures
  useEffect(() => {
    if (!token || isMobileMode || isVertrag) return;
    if (isVertragKurz) return;
    if (status !== "ready" && status !== "submitting") return;
    const channel = supabase
      .channel(`sig-${token}`)
      .on("broadcast", { event: "signature" }, (payload) => {
        const dataUrl = (payload as any)?.payload?.dataUrl;
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
          drawImageOnCanvas(dataUrl);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [token, isMobileMode, isVertrag, isVertragKurz, status, drawImageOnCanvas]);

  // Load signature request
  useEffect(() => {
    // Vor dem Laden kennt die Seite nur `?lang=` aus dem Link.
    const vorab = SIGNATUR_SEITE_TEXTE[langParam ?? "de"];
    if (!token) { setStatus("error"); setErrorMsg(vorab.keinToken); return; }

    // VP-Mobile-Modus: kein DB-Lookup nötig – Mobile rendert nur das Signatur-Pad
    // und überträgt die Unterschrift per Realtime-Broadcast an den Dialog.
    if (isAftersalesVp && isMobileMode) {
      setRequest({ name: "Vertriebspartner" });
      setStatus("ready");
      return;
    }

    const load = async () => {
      const { data: rpcData, error } = await (supabase as any).rpc("get_signature_request", { _token: token });
      const data = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      if (error || !data || !data.id) {
        // Seit dem 16.09.2026 gibt die Datenbank zu einem abgelaufenen Link
        // nichts mehr heraus (Audit-Befund F10). Damit sieht die Seite hier
        // dasselbe wie bei einem unbekannten Token. Die zweite Abfrage liefert
        // keine Daten, sondern nur ja oder nein, und sie sagt zu einem
        // unbekannten Token dasselbe wie zu einem gültigen: nein. Fehlt die
        // Funktion, weil die Migration noch nicht gelaufen ist, bleibt es bei
        // der allgemeinen Fehlermeldung.
        let abgelaufen = false;
        try {
          const { data: abgelaufenData } = await (supabase as any).rpc("signature_request_abgelaufen", { _token: token });
          abgelaufen = abgelaufenData === true;
        } catch { /* noop */ }

        if (abgelaufen) {
          setStatus("expired");
          return;
        }

        setStatus("error");
        setErrorMsg(vorab.unbekannt);
        return;
      }

      if (data.status === "signed") {
        setRequest(data);
        setStatus("already_signed");
        return;
      }

      // Eine neuere Fassung der Selbstauskunft hat diese Anfrage abgelöst
      // (Befund HB-004). Unterschreiben lehnt die Datenbank ohnehin ab.
      if (data.status === "ueberholt") {
        // Reservierung aufgehoben (05.10.2026): eigener Hinweis statt „überholt“.
        setStatus(data.meta?.rvAufgehoben === true ? "rv_aufgehoben" : "ueberholt");
        return;
      }

      // Zweiter Riegel im Browser: greift nur, solange die Ablaufprüfung in
      // der Datenbank noch nicht gelaufen ist.
      if (new Date(data.expires_at) < new Date()) {
        setStatus("expired");
        return;
      }

      setRequest(data);
      setStatus("ready");
      // Tracking: Link wurde geöffnet (best-effort, Fehler ignorieren)
      try {
        await (supabase as any).rpc("mark_signature_link_opened", { _token: token });
      } catch { /* noop */ }
    };

    load();
  }, [token, isAftersalesVp, isMobileMode, langParam]);

  const reloadRequest = useCallback(async () => {
    const { data: rpcData } = await (supabase as any).rpc("get_signature_request", { _token: token });
    const fresh = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (fresh?.id) setRequest(fresh);
  }, [token]);

  // Korrigierte Angaben speichern: aktualisiert alle offenen Unterschriften
  // dieses Vorgangs und setzt bereits geleistete Unterschriften zurueck.
  const handleKorrekturSave = useCallback(async (neueDaten: any) => {
    setPdfBlobUrl(null);
    setPdfError(false);
    const { data, error } = await supabase.functions.invoke("update-sa-signature-data", {
      body: { token, saData: neueDaten },
    });
    if (error || !data?.success) {
      console.error("Korrektur fehlgeschlagen", error, data);
      setKorrekturHinweis(t.korrekturFehler);
      return;
    }
    await reloadRequest();
    setKorrekturOffen(false);
    setKorrekturHinweis(
      data.zurueckgesetzt > 0 ? t.korrekturUebernommenZurueckgesetzt : t.korrekturUebernommen,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [token, reloadRequest, t]);

  // Generate PDF preview from sa_data when request is loaded.
  // Für Verträge: keine Sammelvorschau – jede Anlage wird in
  // <VertragSignaturen> einzeln gerendert.
  useEffect(() => {
    if (!request?.sa_data) return;
    if (isVertrag) return;
    if (isVertragKurz) return;
    if (isAftersalesVp) return;

    const generatePreview = async () => {
      try {
        const saData = request.sa_data;
        let doc;
        if (isReservierung) {
          const { generateReservierungPDF } = await import("@/lib/reservierungPdf");
          // Die Vorschau zeigt die auf dieser Seite getroffene Widerrufs-Wahl,
          // sofern es in dieser Reservierung eine gibt.
          doc = await generateReservierungPDF(
            vertragsAufbau(vertragsOptionenAus(saData)).mitWiderruf
              ? { ...saData, widerrufWahl }
              : saData,
          );
        } else if (isAftersalesKunde) {
          const { generateAftersalesBeratungPDF } = await import("@/lib/aftersalesBeratungPdf");
          doc = await generateAftersalesBeratungPDF(saData, {
            vp: saData.vpSignature ? {
              name: saData.vpName || "Vertriebspartner",
              signatureData: saData.vpSignature,
              signedAt: saData.vpSignedAt || new Date().toISOString(),
            } : undefined,
          });
        } else {
          const { generateSelbstauskunftPDF } = await import("@/lib/selbstauskunftPdf");
          doc = await generateSelbstauskunftPDF(
            saData,
            { vorname: saData.vorname || "", nachname: saData.nachname || "", moreId: "" },
            undefined,
            { sprache },
          );
        }
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
      } catch (err) {
        console.error("PDF preview generation failed:", err);
        setPdfError(true);
      }
    };

    generatePreview();

    return () => {
      setPdfBlobUrl((prev) => {
        // nur lokal generierte Blob-URLs revoken (Vertrag nutzt direkte URL)
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [request, isReservierung, isVertrag, isVertragKurz, isAftersalesKunde, isAftersalesVp, widerrufWahl, sprache]);

  // Canvas drawing
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "hsl(222, 47%, 11%)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  }, [isDrawing, getPos]);

  const stopDraw = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setMobileSignatureReceived(false);
  }, []);

  const handleSubmit = async () => {
    if (!consent || !hasDrawn || !canvasRef.current) return;
    setStatus("submitting");

    const signatureData = canvasRef.current.toDataURL("image/png");

    /*
     * Das Protokoll der Einwilligung. Deutsch genau wie bisher. Bei Englisch
     * steht dabei, in welcher Sprache und Fassung zugestimmt wurde, dazu der
     * englische Wortlaut, den der Kunde gesehen hat, und der deutsche,
     * maßgebliche (siehe `einwilligungsProtokoll`).
     *
     * Bei der Reservierung gehört der Satz zur Widerrufsbelehrung und zur
     * Kopie dazu (Rechtsentwurf Abschnitt 8), und die auf dieser Seite
     * getroffene Wahl zum Beginn wird mitprotokolliert. Ohne Widerrufsteil
     * gibt es keine Wahl, dann bleibt der Satz weg.
     */
    const rvOpt = vertragsOptionenAus(request.sa_data);
    const wahlIndex = rvWahlen.findIndex((w) => w.wert === widerrufWahl);
    const consentText = einwilligungsProtokoll({
      dok,
      sprache,
      name: request.name,
      bestaetigung: isReservierung
        ? { de: unterschriftBestaetigung(rvOpt), en: unterschriftBestaetigung(rvOpt, "en") }
        : undefined,
      wahl: rvMitWiderruf
        ? {
          de: rvWahlen[wahlIndex]?.satz || widerrufWahl,
          en: vertragsAufbau(rvOpt, "en").widerrufWahlen[wahlIndex]?.satz || widerrufWahl,
        }
        : undefined,
      ort: isReservierung ? ort : "",
      fassung: isReservierung
        ? fassungsVermerk(request.sa_data)
        : englisch ? `Erklärungen ${SA_RECHTSTEXT_FASSUNG_EN}` : undefined,
    });

    const { error } = await (supabase as any).rpc("sign_signature_request", {
      _token: token,
      _signature_data: signatureData,
      _consent_text: consentText,
      _user_agent: navigator.userAgent || null,
    });

    if (error) {
      // Während die Seite offen war, kann eine neuere Fassung die Anfrage
      // abgelöst haben. Dann den passenden Hinweis statt eines Fehlers.
      try {
        const { data: nachher } = await (supabase as any).rpc("get_signature_request", { _token: token });
        const zeile = Array.isArray(nachher) ? nachher[0] : nachher;
        if (zeile?.status === "ueberholt") {
          setStatus(zeile.meta?.rvAufgehoben === true ? "rv_aufgehoben" : "ueberholt");
          return;
        }
      } catch { /* bleibt beim allgemeinen Fehler */ }
      setStatus("error");
      setErrorMsg(t.speicherFehler);
      return;
    }

    setStatus("finalizing");
    /*
     * Was `finalize-reservierung` zurückgibt, wenn alle unterschrieben haben:
     * die Unterschriften aller Käufer und den Datensatz. Daraus entsteht
     * unten das vollständige PDF, das als Kopie an die Käufer geht.
     */
    let rvAbschluss: { rvData: ReservierungData; signatures: Record<string, ReservierungUnterschrift> } | null = null;
    /*
     * Dasselbe für die Selbstauskunft: Mit der letzten Unterschrift liefert
     * `finalize-selbstauskunft` alle Unterschriften und die Angaben. Daraus
     * entsteht unten das vollständige PDF, das am Investment abgelegt wird.
     */
    let saAbschluss: { saData: Record<string, unknown>; signatures: Record<string, { signatureData?: string; signedAt?: string }> } | null = null;
    try {
      const fnName = isReservierung
        ? "finalize-reservierung"
        : isAftersalesKunde
        ? "finalize-aftersales-beratung"
        : "finalize-selbstauskunft";
      const { data: finalizeResult, error: finalizeError } = await supabase.functions.invoke(fnName, {
        body: {
          investmentId: request.investment_id,
          kontaktId: request.kontakt_id,
          signatureToken: token,
          // Der Ort wird an der Unterschriftsanfrage vermerkt, freiwillig.
          ...(isReservierung && ort.trim() ? { ort: ort.trim() } : {}),
          // Die Pflichtwahl aus dem Widerrufsabschnitt trifft der Kunde auf
          // dieser Seite. Gibt es den Abschnitt nicht, wird auch nichts
          // mitgeschickt, und `finalize-reservierung` nimmt die gespeicherte
          // Wahl, ohne sie seit dem 05.10.2026 „abwarten".
          ...(rvMitWiderruf ? { widerrufWahl } : {}),
          // Ohne `phase` lehnt finalize-aftersales-beratung mit 400 ab, dann
          // wurde die Beratung nie abgeschlossen, kein PDF abgelegt und keine
          // Glocke ausgeloest (Gegenpruefung vom 29.09.2026).
          ...(isAftersalesKunde ? { phase: "kunde", signature: signatureData, signerName: request.name } : {}),
        },
      });

      // Reservierung inzwischen aufgehoben (05.10.2026): die Function lehnt mit 410 ab.
      if (isReservierung && finalizeError && (finalizeError as { context?: { status?: number } }).context?.status === 410) {
        setStatus("rv_aufgehoben");
        return;
      }

      if (!finalizeError && finalizeResult) {
        // Unterschrieben: einen lokalen Entwurf dieser Selbstauskunft auf
        // diesem Geraet entfernen (Datenschutz, 29.09.2026).
        if (fnName === "finalize-selbstauskunft" && !isVertrag && !isVertragKurz && !isAftersalesVp) {
          loescheLokalenSaEntwurf(request.kontakt_id, request.investment_id);
        }
        setAllSignedInfo({
          allSigned: finalizeResult.allSigned,
          totalRequests: finalizeResult.totalRequests,
          signedCount: finalizeResult.signedCount,
        });
        if (isReservierung && finalizeResult.allSigned && finalizeResult.signatures) {
          rvAbschluss = { rvData: finalizeResult.rvData || request.sa_data, signatures: finalizeResult.signatures };
        }
        if (
          fnName === "finalize-selbstauskunft" && !isVertrag && !isVertragKurz && !isAftersalesVp
          && finalizeResult.allSigned && finalizeResult.signatures
        ) {
          saAbschluss = { saData: finalizeResult.saData || request.sa_data || {}, signatures: finalizeResult.signatures };
        }
      }
    } catch (err) {
      console.error("Finalize check failed:", err);
    }

    // Lokale Vorschau-PDF mit der gerade gezeichneten Unterschrift neu generieren,
    // damit der „Herunterladen"-Button die unterschriebene Version liefert.
    try {
      const saData = request.sa_data || {};
      const signedAtIso = new Date().toISOString();
      let doc: any = null;
      if (isReservierung) {
        const { generateReservierungPDF } = await import("@/lib/reservierungPdf");
        /*
         * Mit der letzten Unterschrift liegen alle vor, dann entsteht hier das
         * vollständige Dokument. Vorher nur die eigene: Die des anderen
         * Käufers kennt diese Seite nicht.
         */
        const sigs: Record<string, ReservierungUnterschrift> = rvAbschluss?.signatures || {
          [request.person_type || "person1"]: {
            signatureData,
            signedAt: signedAtIso,
            name: request.name,
            ort: ort.trim() || undefined,
          },
        };
        const rvFuerPdf = rvAbschluss?.rvData || saData;
        doc = await generateReservierungPDF(
          rvMitWiderruf ? { ...rvFuerPdf, widerrufWahl } : rvFuerPdf,
          sigs,
        );
        /*
         * Die Kopie für die Käufer, § 312f Abs. 2 BGB: Das PDF entsteht nur
         * hier im Browser (Hausschrift, Logo), die Function kann es nicht
         * selbst bauen. Deshalb wird es ihr base64 nachgereicht, sie legt es
         * ab und verschickt es an jeden Käufer, genau einmal. Scheitert das,
         * bleibt die Unterschrift trotzdem gültig, nur die Kopie fehlt; im
         * Investment steht dann kein `rvKopieVersandtAm`.
         */
        if (rvAbschluss && doc) {
          try {
            const pdfBase64 = doc.output("datauristring").split(",")[1] || "";
            if (pdfBase64) {
              await supabase.functions.invoke("finalize-reservierung", {
                body: {
                  investmentId: request.investment_id,
                  kontaktId: request.kontakt_id,
                  signatureToken: token,
                  pdfBase64,
                },
              });
            }
          } catch (err) {
            console.error("Kopie der Reservierungsvereinbarung konnte nicht nachgereicht werden:", err);
          }
        }
      } else if (isAftersalesKunde) {
        const { generateAftersalesBeratungPDF } = await import("@/lib/aftersalesBeratungPdf");
        doc = await generateAftersalesBeratungPDF(saData, {
          vp: saData.vpSignature ? {
            name: saData.vpName || "Vertriebspartner",
            signatureData: saData.vpSignature,
            signedAt: saData.vpSignedAt || signedAtIso,
          } : undefined,
          kunde: {
            name: request.name,
            signatureData,
            signedAt: signedAtIso,
          },
        });
      } else if (!isVertrag && !isVertragKurz && !isAftersalesVp) {
        const { generateSelbstauskunftPDF } = await import("@/lib/selbstauskunftPdf");
        const personKey = request.person_type === "person2" ? "person2" : "person1";
        // Mit der letzten Unterschrift alle Unterschriften, vorher nur die eigene.
        const saFuerPdf = (saAbschluss?.saData || saData) as typeof saData;
        doc = await generateSelbstauskunftPDF(
          saFuerPdf,
          { vorname: saFuerPdf.vorname || "", nachname: saFuerPdf.nachname || "", moreId: "" },
          saAbschluss
            ? unterschriftenFuerPdf(saAbschluss.signatures)
            : { [personKey]: { signatureData, signedAt: signedAtIso } } as any,
          { sprache },
        );
        /*
         * Das vollständige PDF gehört ans Investment, nicht nur in den
         * Download dieses Fensters. `finalize-selbstauskunft` legt es ab und
         * vermerkt es. Scheitert das, bleibt die Unterschrift gültig, und das
         * Kundenprofil holt die Datei beim nächsten Öffnen nach.
         */
        if (saAbschluss && doc && request.investment_id) {
          const pdfBase64 = doc.output("datauristring").split(",")[1] || "";
          const ablage = await sendeSaPdfZurAblage({
            investmentId: request.investment_id,
            kontaktId: request.kontakt_id,
            pdfBase64,
            signatureToken: token,
          });
          if (!ablage.abgelegt) console.error("Selbstauskunft-PDF nicht abgelegt:", ablage.grund);
        }
      }
      if (doc) {
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return url;
        });
      }
    } catch (err) {
      console.error("Signed PDF preview regeneration failed:", err);
    }

    setStatus("signed");
  };

  // ─── SA Data Summary (text fallback when PDF fails) ───
  const saDataSummary = useMemo(() => {
    if (!request?.sa_data) return null;
    const d = request.sa_data;
    const hasP2 = isReservierung ? !!(d.hatPerson2 && d.p2Vorname) : !!(d.person2 && d.person2Data?.vorname);
    return { data: d, hasP2, p2: hasP2 ? (isReservierung ? { vorname: d.p2Vorname, nachname: d.p2Nachname, geburtsdatum: d.p2Geburtsdatum } : d.person2Data) : null };
  }, [request, isReservierung]);

  // ─── Render ────────────────────────────────────────────
  return (
    <div data-lg="seite" className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col items-center p-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Logo – Original (schwarze Schrift) im Light Mode, weiße Variante im Dark Mode */}
        <div className="flex justify-center mb-6">
          <img src={logoLight} alt="MOREImmo" className="h-14 object-contain block dark:hidden" />
          <img src={logoDark} alt="MOREImmo" className="h-14 object-contain hidden dark:block" />
        </div>

        {status === "loading" && (
          <Card className="p-8 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t.linkPruefen}</p>
          </Card>
        )}

        {status === "finalizing" && (
          <Card className="p-8 flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t.verarbeiten}</p>
          </Card>
        )}

        {status === "expired" && (
          <Card className="p-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <h2 className="text-lg font-bold">{t.abgelaufenTitel}</h2>
            <p className="text-sm text-muted-foreground">{t.abgelaufenText}</p>
          </Card>
        )}

        {status === "ueberholt" && (
          <Card className="p-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <h2 className="text-lg font-bold">{t.ueberholtTitel}</h2>
            <p className="text-sm text-muted-foreground">{t.ueberholtText}</p>
          </Card>
        )}

        {status === "rv_aufgehoben" && (
          <Card className="p-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <h2 className="text-lg font-bold">{t.rvAufgehobenTitel}</h2>
            <p className="text-sm text-muted-foreground">{t.rvAufgehobenText}</p>
          </Card>
        )}

        {status === "error" && (
          <Card className="p-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <h2 className="text-lg font-bold">{t.fehlerTitel}</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </Card>
        )}

        {status === "already_signed" && (
          <Card className="p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-[hsl(var(--success,142_76%_36%))]" />
            <h2 className="text-lg font-bold">{t.bereitsTitel}</h2>
            <p className="text-sm text-muted-foreground">{t.bereitsText(dok)}</p>
            {pdfBlobUrl && (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={pdfBlobUrl} download={`${docLabel}.pdf`}>
                  <Download className="h-4 w-4" /> {t.herunterladen(anzeigeTitel)}
                </a>
              </Button>
            )}
            <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground w-full text-left space-y-1">
              <p>📋 <strong>{t.audit}</strong></p>
              <p>{t.auditName}: {request?.name}</p>
              <p>{t.auditZeit}: {request?.signed_at ? seitenZeit(request.signed_at, sprache) : "–"}</p>
              <p>{t.auditMethode}: {t.auditMethodeWert}</p>
            </div>
          </Card>
        )}

        {status === "signed" && (
          <Card className="p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-[hsl(var(--success,142_76%_36%))]" />
            <h2 className="text-lg font-bold">{t.dankeTitel}</h2>
            <p className="text-sm text-muted-foreground">{t.dankeText}</p>

            {allSignedInfo && (
              <div className="bg-muted rounded-lg p-3 text-sm w-full text-left space-y-2">
                {allSignedInfo.allSigned ? (
                  <div className="flex items-center gap-2 text-[hsl(var(--success,142_76%_36%))]">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-medium">{t.alleEingegangen}</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    <p>{t.unterschriftenStand(allSignedInfo.signedCount, allSignedInfo.totalRequests)}</p>
                    <p className="text-xs mt-1">{t.sobaldAlle}</p>
                  </div>
                )}
              </div>
            )}

            {pdfBlobUrl && (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={pdfBlobUrl} download={`${docLabel}.pdf`}>
                  <Download className="h-4 w-4" /> {t.herunterladen(anzeigeTitel)}
                </a>
              </Button>
            )}

            <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground w-full text-left space-y-1">
              <p>📋 <strong>{t.audit}</strong></p>
              <p>{t.auditName}: {request?.name}</p>
              <p>{t.auditZeit}: {seitenZeit(new Date(), sprache)}</p>
              <p>{t.auditMethode}: {t.auditMethodeWert}</p>
            </div>

            <p className="text-xs text-muted-foreground">{t.schliessen}</p>
          </Card>
        )}

        {(status === "ready" || status === "submitting") && request && (
          <div className="space-y-4">
            {isMobileMode ? (
              <MobileSignatureCapture
                token={token}
                name={request.name}
                texte={t}
                docLabel={istKundenseite ? anzeigeTitel : 
                  isReservierung
                    ? "Reservierungsvereinbarung"
                    : isVertrag
                    ? "Handelsvertretervertrag"
                    : isAftersalesKunde
                    ? "Aftersales-Beratungsdokument"
                    : isAftersalesVp
                    ? "Aftersales-Beratungsdokument (VP)"
                    : "Selbstauskunft"
                }
              />
            ) : (
            <>
            {/* PDF Preview Section – Verträge zeigen die Anlagen einzeln in <VertragSignaturen/> */}
            {korrekturHinweis && (
              <Card className="p-4 flex items-start gap-2 border-primary/40 bg-primary/5">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs">{korrekturHinweis}</p>
              </Card>
            )}

            {istSaKorrigierbar && korrekturOffen && (
              <Card className="p-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-5 py-4 border-b">
                  <div>
                    <h2 className="text-sm font-semibold">{t.korrekturTitel}</h2>
                    <p className="text-xs text-muted-foreground">
                      {t.korrekturText}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => setKorrekturOffen(false)}>
                    <X className="h-4 w-4" /> {t.abbrechen}
                  </Button>
                </div>
                <SelbstauskunftForm
                  kundeId={request.kontakt_id}
                  investmentId={request.investment_id || undefined}
                  prefillSaData={request.sa_data}
                  korrekturMode
                  onKorrekturSave={handleKorrekturSave}
                  sprache={sprache}
                />
              </Card>
            )}

            {!korrekturOffen && !isVertrag && (pdfBlobUrl || pdfError || saDataSummary) && (
              <Card className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">
                    {isVertrag
                      ? "Dein Handelsvertretervertrag inkl. aller Anlagen"
                      : t.vorschauTitel(dok)}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isVertrag
                    ? "Bitte lies den Vertrag und alle Anlagen sorgfältig durch. Anschließend unterschreibst du jedes Dokument einzeln unten."
                    : englisch
                    ? t.vorschauHinweis(dok)
                    : isAftersalesKunde
                    ? t.vorschauHinweis("aftersales")
                    : t.vorschauHinweis("selbstauskunft")}
                </p>

                {pdfBlobUrl ? (
                  <div className="border rounded-lg overflow-hidden bg-white">
                    {/* Desktop: iframe works fine */}
                    <iframe
                      src={pdfBlobUrl}
                      className="w-full hidden sm:block"
                      style={{ height: "500px", minHeight: "400px" }}
                      title={t.vorschauTitelIframe(dok)}
                    />
                    {/* Mobile: scrollable embed with touch support */}
                    <div
                      className="sm:hidden overflow-auto overscroll-contain"
                      style={{
                        height: "500px",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      <object
                        data={pdfBlobUrl}
                        type="application/pdf"
                        className="w-full"
                        style={{ height: "1200px", minHeight: "800px" }}
                      >
                        <div className="p-4 text-center space-y-3">
                          <p className="text-sm text-muted-foreground">{t.vorschauNichtUnterstuetzt}</p>
                          <Button variant="outline" size="sm" className="gap-2" asChild>
                            <a href={pdfBlobUrl} download="Selbstauskunft.pdf" target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" /> {t.pdfHerunterladenAnsehen}
                            </a>
                          </Button>
                        </div>
                      </object>
                    </div>
                    <div className="flex justify-end p-2 border-t bg-muted/20">
                      {/* Notausgang, falls die eingebettete Vorschau im Browser
                          des Kunden blockiert wird. */}
                      <Button variant="ghost" size="sm" className="gap-2" asChild>
                        <a href={pdfBlobUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" /> {t.pdfNeuerTab}
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : pdfError && saDataSummary ? (
                  /* Text fallback if PDF generation fails */
                  <div className="border rounded-lg p-4 bg-muted/30 text-xs space-y-2 max-h-[400px] overflow-y-auto">
                    <p className="font-medium text-sm">{t.zusammenfassung}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">{t.feldName}</span>
                      <span className="font-medium">{saDataSummary.data.vorname} {saDataSummary.data.nachname}</span>
                      <span className="text-muted-foreground">{t.feldGeburtsdatum}</span>
                      <span className="font-medium">{saDataSummary.data.geburtsdatum || "–"}</span>
                      <span className="text-muted-foreground">{t.feldAdresse}</span>
                      <span className="font-medium">{saDataSummary.data.strasse} {saDataSummary.data.hausnummer}, {saDataSummary.data.plz} {saDataSummary.data.ort}</span>
                      <span className="text-muted-foreground">{t.feldEmail}</span>
                      <span className="font-medium">{saDataSummary.data.email || "–"}</span>
                      <span className="text-muted-foreground">{t.feldTelefon}</span>
                      <span className="font-medium">{saDataSummary.data.telefon || "–"}</span>
                    </div>
                    {saDataSummary.hasP2 && saDataSummary.p2 && (
                      <>
                        <p className="font-medium text-sm mt-3">{t.person2}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <span className="text-muted-foreground">{t.feldName}</span>
                          <span className="font-medium">{saDataSummary.p2.vorname} {saDataSummary.p2.nachname}</span>
                          <span className="text-muted-foreground">{t.feldGeburtsdatum}</span>
                          <span className="font-medium">{saDataSummary.p2.geburtsdatum || "–"}</span>
                        </div>
                      </>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">{t.vorschauFehlt}</p>
                  </div>
                ) : null}

              </Card>
            )}

            {/* Hervorgehobener Korrekturhinweis: immer sichtbar, auch ohne PDF-Vorschau */}
            {istSaKorrigierbar && !korrekturOffen && (
              <Card className="p-4 border-primary/40 bg-primary/5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <div>
                    <p className="text-sm font-semibold">{t.stimmtEtwasNicht}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.stimmtEtwasNichtText}</p>
                  </div>
                  <Button size="sm" className="gap-1.5 shrink-0" onClick={() => { setKorrekturHinweis(null); setKorrekturOffen(true); }}>
                    <Pencil className="h-4 w-4" /> {t.saBearbeiten}
                  </Button>
                </div>
              </Card>
            )}

            {/* Signature Card – Vertrag (mehrere Dokumente) ODER Standard (eines) */}
            {korrekturOffen ? null : isVertrag ? (
              <VertragSignaturen
                request={request}
                token={token}
                mobileSignatureUrl={mobileSignatureUrl}
                onDone={(info) => { setAllSignedInfo(info); setStatus("signed"); }}
                onError={(msg) => { setErrorMsg(msg); setStatus("error"); }}
                setSubmitting={(v) => setStatus(v ? "submitting" : "ready")}
                setFinalizing={(v) => setStatus(v ? "finalizing" : "ready")}
                submitting={status === "submitting"}
              />
            ) : isVertragKurz ? (
              <VertragKurzSignatur
                request={request}
                token={token}
                onDone={(info) => { setAllSignedInfo(info); setStatus("signed"); }}
                onError={(msg) => { setErrorMsg(msg); setStatus("error"); }}
                setSubmitting={(v) => setStatus(v ? "submitting" : "ready")}
                setFinalizing={(v) => setStatus(v ? "finalizing" : "ready")}
                submitting={status === "submitting"}
              />
            ) : (
            <Card className="p-6 space-y-5">
              <div className="text-center">
                <h1 className="text-lg font-bold">{t.unterschreibenTitel(dok)}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {isReservierung
                    ? <>{t.rolleKaeufer}: <strong>{request.name}</strong></>
                    : isAftersalesKunde
                    ? <>{t.rolleKunde}: <strong>{request.name}</strong></>
                    : <>{t.rollePerson(request.person_type === "person1" ? 1 : 2)}: <strong>{request.name}</strong></>}
                </p>
              </div>

              {/* Info */}
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p>📧 {t.gesendetAn}: {request.email}</p>
                <p>⏱ {t.gueltigBis}: {seitenZeit(request.expires_at, sprache)}</p>
              </div>

              {/*
                Bei Englisch: Die Vorrangklausel in beiden Sprachen, und bei der
                Reservierung der Hinweis, dass die Notarurkunde deutsch ist und
                gegebenenfalls ein Dolmetscher gebraucht wird (Plan 4.3). Der
                Hinweis steht außerhalb des Vertrags, dessen Wortlaut bleibt
                unverändert.
              */}
              {englisch && (isReservierung || !isAftersalesKunde) && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
                  <p lang="en" className="font-medium">{ZWEISPRACHIG_EINLEITUNG.en}</p>
                  <p lang="de" className="text-muted-foreground">{ZWEISPRACHIG_EINLEITUNG.de}</p>
                </div>
              )}
              {englisch && isReservierung && (
                <div className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-3 text-xs space-y-1">
                  <p className="font-semibold">{NOTAR_SPRACHHINWEIS.en.titel}</p>
                  <p className="text-muted-foreground">{NOTAR_SPRACHHINWEIS.en.text}</p>
                </div>
              )}

              {/* Pflichtwahl aus dem Widerrufsabschnitt, nur bei der
                   Reservierung. Steht bewusst als Erstes unter der Vorschau,
                   damit der Kunde den Beginn der Reservierung vor der
                   Unterschrift waehlt. Voreingestellt auf „sofort", der Kunde
                   kann wechseln. Ohne Reservierungsgebuehr gibt es keine
                   Widerrufsfrist und damit auch keine Wahl. */}
              {rvMitWiderruf && (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {englisch ? rvTexteEn.widerrufWahlTitel : WIDERRUF_WAHL_TITEL} <span className="text-destructive">*</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{englisch ? rvTexteEn.widerrufWahlEinleitung : WIDERRUF_WAHL_EINLEITUNG}</p>
                    {englisch && (
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">{t.deutschesOriginal}</summary>
                        <p lang="de" className="mt-1">{WIDERRUF_WAHL_TITEL}. {WIDERRUF_WAHL_EINLEITUNG}</p>
                      </details>
                    )}
                  </div>
                  <RadioGroup
                    value={widerrufWahl}
                    onValueChange={(v) => setWiderrufWahl(v as "sofort" | "abwarten")}
                    className="space-y-3"
                  >
                    {rvWahlen.map((wahl, i) => {
                      // Bei Englisch führt die Übersetzung, der deutsche Wortlaut ist aufklappbar.
                      const en = rvAufbauEn?.widerrufWahlen[i];
                      return (
                        <div key={wahl.wert} className="flex items-start gap-3">
                          <RadioGroupItem value={wahl.wert} id={`signatur-widerruf-${wahl.wert}`} className="mt-0.5" />
                          <div className="text-sm leading-relaxed">
                            <label htmlFor={`signatur-widerruf-${wahl.wert}`} className="cursor-pointer">
                              <span className="font-medium block">{en ? en.satz : wahl.satz}</span>
                              <span className="text-xs text-muted-foreground block mt-1">{en ? en.erlaeuterung : wahl.erlaeuterung}</span>
                            </label>
                            {en && (
                              <details className="mt-1 text-xs text-muted-foreground">
                                <summary className="cursor-pointer">{t.deutschesOriginal}</summary>
                                <p lang="de" className="mt-1"><span className="font-medium">{wahl.satz}</span> {wahl.erlaeuterung}</p>
                              </details>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </div>
              )}

              {/* Signature Canvas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Pen className="h-3.5 w-3.5" /> {t.unterschrift}
                  </label>
                  {hasDrawn && (
                    <Button variant="ghost" size="sm" onClick={clearCanvas} className="h-7 text-xs gap-1">
                      <Trash2 className="h-3 w-3" /> {t.loeschen}
                    </Button>
                  )}
                </div>
                <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-white touch-none">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={180}
                    className="w-full cursor-crosshair"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                </div>
                {!hasDrawn && (
                  <p className="text-xs text-muted-foreground mt-1.5 text-center">{t.bitteUnterschreiben}</p>
                )}
                {mobileSignatureReceived && (
                  <p className="text-xs text-[hsl(var(--success,142_76%_36%))] mt-1.5 text-center flex items-center justify-center gap-1">
                    <Check className="h-3 w-3" /> {t.vomHandy}
                  </p>
                )}
              </div>

              {/* QR Code für mobile Unterschrift – immer sichtbar (auch in der Preview/Iframes
                   und auf schmalen Containern). Wird nur in der Mobile-Signatur-Ansicht selbst
                   ausgeblendet. Gilt identisch für Person 1 und Person 2, da jede Person ihren
                   eigenen Signatur-Link mit eigenem Token hat. */}
              {!isMobileMode && (
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/30 rounded-lg p-4 border border-dashed border-border">
                  <div className="bg-white p-2 rounded-md shrink-0">
                    <QRCodeSVG value={mobileSignatureUrl || window.location.href} size={104} level="M" />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 text-center sm:text-left">
                    <p className="font-medium text-foreground flex items-center justify-center sm:justify-start gap-1.5">
                      <Smartphone className="h-3.5 w-3.5" /> {t.handyTitel}
                    </p>
                    <p>{t.handyText}</p>
                  </div>
                </div>
              )}

              {/* Ort der Unterschrift, freiwillig, nur bei der Reservierung. */}
              {isReservierung && (
                <div>
                  <label htmlFor="unterschrift-ort" className="text-sm font-medium block mb-1">
                    {t.ort} <span className="text-xs font-normal text-muted-foreground">{t.freiwillig}</span>
                  </label>
                  <Input
                    id="unterschrift-ort"
                    value={ort}
                    onChange={(e) => setOrt(e.target.value)}
                    placeholder={t.ortBeispiel}
                    maxLength={80}
                    autoComplete="off"
                  />
                </div>
              )}

              {/* Consent Checkbox */}
              <div className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
                <Checkbox
                  id="consent"
                  checked={consent}
                  onCheckedChange={(c) => setConsent(c === true)}
                  className="mt-0.5"
                />
                <div className="text-xs text-muted-foreground leading-relaxed">
                  <label htmlFor="consent" className="cursor-pointer">
                    {einwilligungText(dok, sprache, isReservierung ? unterschriftBestaetigung(rvOptionen, sprache) : "")}
                  </label>
                  {/* Bei Englisch der deutsche, maßgebliche Wortlaut zum Aufklappen. */}
                  {englisch && (
                    <details className="mt-1">
                      <summary className="cursor-pointer">{t.deutschesOriginal}</summary>
                      <p lang="de" className="mt-1">
                        {einwilligungText(dok, "de", isReservierung ? unterschriftBestaetigung(rvOptionen) : "")}
                      </p>
                    </details>
                  )}
                </div>
              </div>

              {/* Submit */}
              <Button
                className="w-full"
                disabled={!consent || !hasDrawn || status === "submitting"}
                onClick={handleSubmit}
              >
                {status === "submitting" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t.wirdGespeichert}</>
                ) : (
                  t.bestaetigen
                )}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">{t.datenschutzFuss}</p>
            </Card>
            )}
            </>
            )}
          </div>
        )}

        {/* Impressum und Datenschutz in der Sprache der Seite (Plan Kundensprache, D8 und D9). */}
        {istKundenseite && (
          <p className="mt-8 flex justify-center gap-4 text-xs text-muted-foreground">
            <a href={englisch ? "/impressum?lang=en" : "/impressum"} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {englisch ? "Legal notice" : "Impressum"}
            </a>
            <a href={englisch ? "/datenschutz?lang=en" : "/datenschutz"} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {englisch ? "Privacy policy" : "Datenschutz"}
            </a>
            <CookieEinstellungenLink sprache={englisch ? "en" : "de"} className="hover:underline" />
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Mehrere Unterschriften für Handelsvertretervertrag + Anlagen.
 * Jedes Dokument bekommt ein eigenes Unterschriftsfeld.
 */
function VertragSignaturen({
  request,
  token,
  mobileSignatureUrl,
  onDone,
  onError,
  setSubmitting,
  setFinalizing,
  submitting,
}: {
  request: any;
  token: string;
  mobileSignatureUrl: string;
  onDone: (info: { allSigned: boolean; totalRequests: number; signedCount: number }) => void;
  onError: (msg: string) => void;
  setSubmitting: (v: boolean) => void;
  setFinalizing: (v: boolean) => void;
  submitting: boolean;
}) {
  const documents: { key?: string; name: string; url?: string }[] = Array.isArray(request?.sa_data?.documents)
    ? request.sa_data.documents
    : [];
  const bewerberData = request?.sa_data?.bewerberData || null;
  const paketId = request?.sa_data?.paketId || "";
  const zahlungsweise = request?.sa_data?.zahlungsweise || "einmal";
  // Der Paragraph, der die Anlagen mit der Unterschrift annimmt, hängt an der
  // Fassung: § 14 kompakt, § 18 alt. Vorher stand hier fest "§ 18"; bei einem
  // kompakten Vertrag verwies die Einwilligung damit auf einen Paragraphen,
  // den das Dokument gar nicht hat.
  const akzeptanzParagraph = anlagenAkzeptanzParagraph(
    vertragsFassungVon(bewerberMitFassungAusAnfrage(bewerberData || {}), paketId),
  );

  const [consent, setConsent] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mobileSignatureReceived, setMobileSignatureReceived] = useState(false);
  const [docPdfUrls, setDocPdfUrls] = useState<(string | null)[]>([]);
  const [pdfBuildError, setPdfBuildError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  // Einzel-PDFs pro Dokument erzeugen (Vertrag + Anlagen) – wie in der App-Vorschau.
  useEffect(() => {
    let cancelled = false;
    const urls: (string | null)[] = [];
    (async () => {
      const validateFallback = async (url: string | null): Promise<string | null> => {
        if (!url) return null;
        try {
          const head = await fetch(url, { method: "HEAD" });
          const ct = head.headers.get("content-type") || "";
          if (!head.ok) return null;
          if (!ct.includes("pdf") && !ct.includes("octet-stream")) return null;
          return url;
        } catch {
          return null;
        }
      };
      // Die im Bewerberprofil erstellte Fassung ist die Gesamtdatei und enthält
      // nur den Handelsvertretervertrag. Früher wurde sie für jedes Dokument
      // gesetzt, dadurch lag hinter jeder Anlage derselbe Vertrag. Sie dient
      // deshalb nur noch als Rückfallebene, wenn sich die Einzeldokumente hier
      // nicht aufbauen lassen.
      const erstellteFassung = await validateFallback(request?.sa_data?.pdfUrl || null);
      if (cancelled) return;
      // Seit dem 04.09.2026 schickt das Bewerberprofil zu jedem Eintrag seine
      // eigene Adresse mit. Dann ist nichts mehr zu bauen: Der Bewerber sieht
      // genau die Datei, die auch abgelegt wurde.
      if (documents.length && documents.every((d) => typeof (d as { url?: string }).url === "string" && (d as { url?: string }).url)) {
        const geprueft: (string | null)[] = [];
        for (const d of documents) geprueft.push(await validateFallback((d as { url?: string }).url || null));
        if (cancelled) return;
        if (geprueft.every(Boolean)) {
          setDocPdfUrls(geprueft);
          return;
        }
        // Sonst weiter unten selbst bauen.
      }
      if (!bewerberData || !documents.length || !paketId) {
        if (erstellteFassung) {
          setDocPdfUrls(documents.map(() => erstellteFassung));
          return;
        }
        setDocPdfUrls(documents.map(() => null));
        setPdfBuildError(true);
        return;
      }
      try {
        const { buildEinzelDokumentPdf } = await import("@/lib/einzelDokumentePdf");
        for (const d of documents) {
          const key = (d.key || "vertrag") as any;
          const blob = await buildEinzelDokumentPdf(key, {
            bewerber: bewerberMitFassungAusAnfrage(bewerberData),
            paketId,
            zahlungsweise,
          });
          urls.push(URL.createObjectURL(blob));
        }
        if (!cancelled) setDocPdfUrls(urls);
      } catch (err) {
        console.error("Einzel-PDFs konnten nicht erzeugt werden:", err);
        if (!cancelled) {
          const fallback = await validateFallback(request?.sa_data?.pdfUrl || null);
          if (cancelled) return;
          if (!fallback) {
            setDocPdfUrls(documents.map(() => null));
            setPdfBuildError(true);
            return;
          }
          setDocPdfUrls(documents.map(() => fallback));
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const u of urls) if (u && u.startsWith("blob:")) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  // Bild-DataURL aufs Hauptvertrags-Canvas zeichnen (für Mobile-Broadcast)
  const drawImageOnCanvas = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const padding = 16;
      const maxW = canvas.width - padding * 2;
      const maxH = canvas.height - padding * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      setHasDrawn(true);
      setMobileSignatureReceived(true);
    };
    img.src = dataUrl;
  }, []);

  // Realtime: Mobile-Unterschrift empfangen
  useEffect(() => {
    if (!token) return;
    const channel = supabase
      .channel(`sig-${token}`)
      .on("broadcast", { event: "signature" }, (payload) => {
        const dataUrl = (payload as any)?.payload?.dataUrl;
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
          drawImageOnCanvas(dataUrl);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [token, drawImageOnCanvas]);

  const getPos = (canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const p = getPos(c, e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawingRef.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const p = getPos(c, e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "hsl(222, 47%, 11%)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  };
  const stopDraw = () => { drawingRef.current = false; };
  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
    setMobileSignatureReceived(false);
  };

  const handleSubmit = async () => {
    if (!consent || !hasDrawn || !canvasRef.current) return;
    setSubmitting(true);
    try {
      const signatureData = canvasRef.current.toDataURL("image/png");
      // Eine einzige Unterschrift auf dem Hauptvertrag – die Annahme aller
      // Anlagen ergibt sich aus den Schlussbestimmungen des Hauptvertrags. Für die bestehende
      // Finalisierungs-Logik wird die Unterschrift jedoch jedem Dokument
      // mitgegeben, damit jede Anlage signiert in der Akte landet.
      const signedAt = new Date().toISOString();
      const signatures = documents.map((d, i) => ({
        key: d.key || (i === 0 ? "vertrag" : `anlage_${i}`),
        name: d.name,
        signatureData,
        signedAt,
      }));
      const anzahlAnlagen = Math.max(0, documents.length - 1);
      const consentText = `Ich, ${request.name}, habe den Handelsvertretervertrag samt ${anzahlAnlagen} Anlagen gelesen, verstanden und akzeptiert. Mit meiner Unterschrift auf dem Hauptvertrag erkenne ich gemäß ${akzeptanzParagraph} die Anlagen als verbindliche Vertragsbestandteile an (Einfache elektronische Signatur gemäß eIDAS). Datum: ${new Date().toLocaleString("de-DE")}`;

      const { error } = await (supabase as any).rpc("sign_signature_request", {
        _token: token,
        _signature_data: JSON.stringify({ kind: "vertrag", signatures }),
        _consent_text: consentText,
        _user_agent: navigator.userAgent || null,
      });
      if (error) {
        onError("Fehler beim Speichern der Unterschrift. Bitte versuche es erneut.");
        return;
      }

      setFinalizing(true);
      try {
        const { data: finalizeResult } = await supabase.functions.invoke("finalize-vertrag", {
          // Der Token weist nach, dass der Aufruf zu diesem Vorgang gehört.
          // Ohne ihn lehnt die Function seit dem 16.09.2026 ab, siehe
          // Audit-Befund F03C.
          body: {
            bewerberId: request.sa_data?.bewerberId || request.kontakt_id,
            signatureToken: token,
          },
        });
        onDone({
          allSigned: !!finalizeResult?.allSigned,
          totalRequests: documents.length,
          signedCount: documents.length,
        });
      } catch (err) {
        console.error("Finalize vertrag failed:", err);
        onDone({ allSigned: true, totalRequests: documents.length, signedCount: documents.length });
      }
    } catch (err: any) {
      onError(err?.message || "Unbekannter Fehler");
    }
  };

  const renderDocPreview = (url: string | null, title: string) => {
    if (!url) {
      return (
        <div className="border rounded-lg p-4 bg-muted/30 text-xs text-muted-foreground text-center">
          Vorschau für „{title}" konnte nicht geladen werden.
        </div>
      );
    }
    return (
      <div className="border rounded-lg overflow-hidden bg-white">
        <iframe
          src={url}
          className="w-full hidden sm:block"
          style={{ height: "480px" }}
          title={`${title} Vorschau`}
        />
        <div className="sm:hidden overflow-auto overscroll-contain" style={{ height: "420px", WebkitOverflowScrolling: "touch" }}>
          <object data={url} type="application/pdf" className="w-full" style={{ height: "1000px" }}>
            <div className="p-4 text-center">
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4" /> PDF öffnen
                </a>
              </Button>
            </div>
          </object>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="text-center">
        <h1 className="text-lg font-bold">Handelsvertretervertrag &amp; Anlagen unterschreiben</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bewerber: <strong>{request.name}</strong>
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
        <p>📧 Gesendet an: {request.email}</p>
        <p>⏱ Gültig bis: {new Date(request.expires_at).toLocaleString("de-DE")}</p>
        <p>📄 Dokumente: <strong>{documents.length}</strong> · Unterschrift einmalig auf dem Hauptvertrag (deckt alle Anlagen gemäß {akzeptanzParagraph} ab)</p>
      </div>

      {pdfBuildError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
          <p className="font-semibold">Vertragsvorschau aktuell nicht verfügbar</p>
          <p>
            Das Vertrags-PDF konnte nicht geladen werden (vermutlich fehlt im Bewerberprofil
            die Paketauswahl oder der Vertrag wurde noch nicht final generiert).
            Bitte wende dich kurz an deinen Ansprechpartner – sobald der Vertrag neu
            erzeugt und versendet wurde, funktioniert der Link wieder.
          </p>
        </div>
      )}

      <div className="space-y-5">
        {documents.map((d, i) => {
          const isHaupt = i === 0;
          const url = docPdfUrls[i] ?? null;
          return (
            <div data-ui="card" key={i} className="border rounded-lg p-4 space-y-3 bg-background">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium truncate">{d.name}</span>
                  {isHaupt ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase tracking-wide">
                      Unterschrift
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">
                      Anlage
                    </span>
                  )}
                </div>
                {url && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3 w-3" /> Öffnen
                    </a>
                  </Button>
                )}
              </div>

              {url === null && docPdfUrls.length === 0 ? (
                <div className="border rounded-lg p-6 bg-muted/30 text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vorschau wird erzeugt…
                </div>
              ) : (
                renderDocPreview(url, d.name)
              )}

              {isHaupt ? (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Pen className="h-3.5 w-3.5" /> Unterschrift Handelsvertretervertrag
                    </label>
                    {hasDrawn && (
                      <Button variant="ghost" size="sm" onClick={clearCanvas} className="h-7 text-xs gap-1">
                        <Trash2 className="h-3 w-3" /> Löschen
                      </Button>
                    )}
                  </div>
                  <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-white touch-none">
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={180}
                      className="w-full cursor-crosshair"
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={stopDraw}
                    />
                  </div>
                  {!hasDrawn && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      Bitte hier unterschreiben (Maus oder Finger)
                    </p>
                  )}
                  {mobileSignatureReceived && (
                    <p className="text-xs text-[hsl(var(--success,142_76%_36%))] text-center flex items-center justify-center gap-1">
                      <Check className="h-3 w-3" /> Unterschrift vom Handy übernommen
                    </p>
                  )}

                  {/* QR-Code für mobile Unterschrift */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/30 rounded-lg p-4 border border-dashed border-border">
                    <div className="bg-white p-2 rounded-md shrink-0">
                      <QRCodeSVG value={mobileSignatureUrl || (typeof window !== "undefined" ? window.location.href : "")} size={104} level="M" />
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 text-center sm:text-left">
                      <p className="font-medium text-foreground flex items-center justify-center sm:justify-start gap-1.5">
                        <Smartphone className="h-3.5 w-3.5" /> Lieber per Handy unterschreiben?
                      </p>
                      <p>Scannen Sie diesen QR-Code mit Ihrer Handy-Kamera. Sie unterschreiben dann mit dem Finger – die Unterschrift erscheint hier automatisch.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/40 border border-dashed border-border p-3 text-[11px] text-muted-foreground text-center">
                  Diese Anlage wird gemäß {akzeptanzParagraph} des Hauptvertrags mit der Unterschrift oben automatisch akzeptiert – keine separate Unterschrift erforderlich.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
        <Checkbox id="consent-vertrag" checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
        <label htmlFor="consent-vertrag" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
          Ich habe den Handelsvertretervertrag und alle Anlagen gelesen, verstanden und akzeptiere
          deren Inhalt. Mit meiner Unterschrift auf dem Hauptvertrag erkenne ich gemäß {akzeptanzParagraph} sämtliche
          Anlagen als verbindliche Vertragsbestandteile an. Ich willige in eine einfache elektronische
          Signatur (EES) gemäß eIDAS-Verordnung ein; die elektronische Erfassung, Speicherung und
          Verarbeitung meiner Unterschrift zur Vertragsdokumentation ist DSGVO-konform.
        </label>
      </div>

      <Button
        className="w-full"
        disabled={!consent || !hasDrawn || submitting}
        onClick={handleSubmit}
      >
        {submitting ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird gespeichert…</>
        ) : (
          <>✍️ Vertrag &amp; Anlagen unterschreiben</>
        )}
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">
        Ihre Unterschrift wird verschlüsselt übertragen und DSGVO-konform gespeichert.
        IP-Adresse und Zeitstempel werden als Nachweis protokolliert.
      </p>
    </Card>
  );
}

/**
 * Mobile-only Signaturerfassung: einfache, MOREImmo-gebrandete Ansicht.
 * Sendet die Unterschrift per Realtime-Broadcast an den Desktop-Tab,
 * der den QR-Code geöffnet hat.
 */
function MobileSignatureCapture({
  token,
  name,
  docLabel,
  texte = SIGNATUR_SEITE_TEXTE.de,
}: {
  token: string;
  name: string;
  docLabel: string;
  /** Die Texte in der Sprache der Seite. Ohne Angabe deutsch. */
  texte?: SignaturSeitenTexte;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const sx = c.width / rect.width;
    const sy = c.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "hsl(222, 47%, 11%)";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  };
  const stop = () => setDrawing(false);
  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  };

  const send = async () => {
    if (!hasDrawn || !canvasRef.current) return;
    setSending(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const channel = supabase.channel(`sig-${token}`);
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
        setTimeout(() => resolve(), 1500);
      });
      await channel.send({
        type: "broadcast",
        event: "signature",
        payload: { dataUrl },
      });
      // small delay to allow delivery
      await new Promise((r) => setTimeout(r, 400));
      await supabase.removeChannel(channel);
      setSent(true);
    } catch (err) {
      console.error("Broadcast signature failed:", err);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Card className="p-8 flex flex-col items-center gap-4 text-center">
        <CheckCircle2 className="h-14 w-14 text-[hsl(var(--success,142_76%_36%))]" />
        <h2 className="text-xl font-bold">{texte.mobilGesendetTitel}</h2>
        <p className="text-sm text-muted-foreground">{texte.mobilGesendetText}</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-5">
      <div className="text-center space-y-1">
        <p className="text-[11px] uppercase tracking-widest text-primary font-semibold">{texte.mobilKopf}</p>
        <h1 className="text-lg font-bold">{texte.mobilUnterschreiben(docLabel)}</h1>
        <p className="text-sm text-muted-foreground">{texte.mobilFuer}: <strong>{name}</strong></p>
      </div>

      <div className="bg-primary/5 border border-primary/15 rounded-lg p-3 text-xs text-muted-foreground">
        {texte.mobilHinweis}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Pen className="h-3.5 w-3.5" /> {texte.unterschrift}
          </label>
          {hasDrawn && (
            <Button variant="ghost" size="sm" onClick={clear} className="h-7 text-xs gap-1">
              <Trash2 className="h-3 w-3" /> {texte.loeschen}
            </Button>
          )}
        </div>
        <div className="border-2 border-dashed border-primary/30 rounded-lg overflow-hidden bg-white touch-none">
          <canvas
            ref={canvasRef}
            width={600}
            height={260}
            className="w-full cursor-crosshair"
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={stop}
          />
        </div>
        {!hasDrawn && (
          <p className="text-xs text-muted-foreground mt-1.5 text-center">{texte.mobilFinger}</p>
        )}
      </div>

      <Button className="w-full" disabled={!hasDrawn || sending} onClick={send}>
        {sending ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {texte.mobilWirdUebertragen}</>
        ) : (
          <>{texte.mobilSenden}</>
        )}
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">{texte.mobilFuss}</p>
    </Card>
  );
}

/**
 * Kurz-Gegenzeichnung: zeigt jede Anlage mit bereits eingebetteter Bewerber-
 * Unterschrift, Kurz unterschreibt einmal auf dem Hauptvertrag. Beim Submit
 * werden finale PDFs (mit beiden Unterschriften) gebaut und base64 an
 * finalize-vertrag (stage="kurz") geschickt.
 */
function VertragKurzSignatur({
  request,
  token,
  onDone,
  onError,
  setSubmitting,
  setFinalizing,
  submitting,
}: {
  request: any;
  /** Der Token aus dem Unterschriftslink. Er ist der Nachweis gegenüber
   *  finalize-vertrag, siehe Audit-Befund F03C. */
  token: string;
  onDone: (info: { allSigned: boolean; totalRequests: number; signedCount: number }) => void;
  onError: (msg: string) => void;
  setSubmitting: (v: boolean) => void;
  setFinalizing: (v: boolean) => void;
  submitting: boolean;
}) {
  const sa = request?.sa_data || {};
  const documents: { key?: string; name: string }[] = Array.isArray(sa.documents) ? sa.documents : [];
  const bewerberData = sa.bewerberData || null;
  const paketId = sa.paketId || "";
  const zahlungsweise = sa.zahlungsweise || "einmal";
  const akzeptanzParagraph = anlagenAkzeptanzParagraph(
    vertragsFassungVon(bewerberMitFassungAusAnfrage(bewerberData || {}), paketId),
  );
  const bewerberSignatureDataUrl: string = sa.bewerberSignatureDataUrl || "";
  const bewerberSignedAt: string = sa.bewerberSignedAt || "";
  const bewerberSignedOrt: string = sa.bewerberSignedOrt || "";
  const bewerberName: string = sa.bewerberName || "Vertriebspartner";

  const [consent, setConsent] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [docPdfUrls, setDocPdfUrls] = useState<(string | null)[]>([]);
  const [pdfBuildError, setPdfBuildError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  // Preview-PDFs mit bereits eingebetteter Bewerber-Unterschrift
  useEffect(() => {
    let cancelled = false;
    const urls: (string | null)[] = [];
    (async () => {
      if (!bewerberData || !documents.length) { setPdfBuildError(true); return; }
      try {
        const { buildEinzelDokumentPdf } = await import("@/lib/einzelDokumentePdf");
        for (const d of documents) {
          const key = (d.key || "vertrag") as any;
          const blob = await buildEinzelDokumentPdf(key, {
            bewerber: bewerberMitFassungAusAnfrage(bewerberData),
            paketId,
            zahlungsweise,
            bewerberSignatureDataUrl,
            bewerberSignedAt,
            bewerberSignedOrt,
          });
          urls.push(URL.createObjectURL(blob));
        }
        if (!cancelled) setDocPdfUrls(urls);
      } catch (err) {
        console.error("Kurz-Preview PDFs failed:", err);
        if (!cancelled) setPdfBuildError(true);
      }
    })();
    return () => {
      cancelled = true;
      for (const u of urls) if (u && u.startsWith("blob:")) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

  const getPos = (canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    drawingRef.current = true;
    const p = getPos(c, e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawingRef.current) return;
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const p = getPos(c, e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "hsl(222, 47%, 11%)";
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawn(true);
  };
  const stopDraw = () => { drawingRef.current = false; };
  const clearCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = r.result as string;
      resolve(res.includes(",") ? res.split(",")[1] : res);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  const handleSubmit = async () => {
    if (!consent || !hasDrawn || !canvasRef.current) return;
    setSubmitting(true);
    try {
      const kurzSignatureDataUrl = canvasRef.current.toDataURL("image/png");
      const kurzSignedAt = new Date().toISOString();
      const kurzSignedOrt = "Bad Feilnbach";

      // Finale PDFs mit BEIDEN Unterschriften bauen
      const { buildEinzelDokumentPdf } = await import("@/lib/einzelDokumentePdf");
      const finalDocuments: Array<{ key: string; name: string; base64: string }> = [];
      for (const d of documents) {
        const key = (d.key || "vertrag") as any;
        const blob = await buildEinzelDokumentPdf(key, {
          bewerber: bewerberMitFassungAusAnfrage(bewerberData),
          paketId,
          zahlungsweise,
          bewerberSignatureDataUrl,
          bewerberSignedAt,
          bewerberSignedOrt,
          kurzSignatureDataUrl,
          kurzSignedAt,
          kurzSignedOrt,
        });
        const base64 = await blobToBase64(blob);
        finalDocuments.push({ key, name: d.name, base64 });
      }

      setFinalizing(true);
      const { data: result, error } = await supabase.functions.invoke("finalize-vertrag", {
        body: {
          bewerberId: sa.bewerberId || request.kontakt_id,
          stage: "kurz",
          // Ohne diesen Nachweis lehnt die Function ab, siehe Audit-Befund F03C.
          signatureToken: token,
          finalDocuments,
          kurzSignatureDataUrl,
          kurzSignedOrt,
        },
      });
      if (error) {
        onError(error?.message || "Finalisierung fehlgeschlagen.");
        return;
      }
      onDone({
        allSigned: !!result?.allSigned,
        totalRequests: documents.length,
        signedCount: documents.length,
      });
    } catch (err: any) {
      onError(err?.message || "Unbekannter Fehler bei der Gegenzeichnung.");
    }
  };

  const renderPreview = (url: string | null, title: string) => {
    if (!url) {
      return (
        <div className="border rounded-lg p-4 bg-muted/30 text-xs text-muted-foreground text-center">
          Vorschau für „{title}" konnte nicht geladen werden.
        </div>
      );
    }
    return (
      <div className="border rounded-lg overflow-hidden bg-white">
        <iframe src={url} className="w-full hidden sm:block" style={{ height: "480px" }} title={`${title} Vorschau`} />
        <div className="sm:hidden overflow-auto overscroll-contain" style={{ height: "420px", WebkitOverflowScrolling: "touch" }}>
          <object data={url} type="application/pdf" className="w-full" style={{ height: "1000px" }}>
            <div className="p-4 text-center">
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /> PDF öffnen</a>
              </Button>
            </div>
          </object>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-widest text-primary font-semibold">MOREImmo · Gegenzeichnung</p>
        <h1 className="text-lg font-bold">Handelsvertretervertrag gegenzeichnen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vertriebspartner: <strong>{bewerberName}</strong>
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
        <p>📄 Dokumente: <strong>{documents.length}</strong> · Bewerber-Unterschrift bereits eingebettet</p>
        <p>✍️ Bitte unterschreibe einmalig auf dem Hauptvertrag – die Anlagen sind gemäß {akzeptanzParagraph} abgedeckt.</p>
      </div>

      {pdfBuildError && (
        <div className="text-xs text-destructive">
          Vorschauen konnten nicht erzeugt werden – bitte den Vertrag aus der E-Mail öffnen.
        </div>
      )}

      <div className="space-y-5">
        {documents.map((d, i) => {
          const isHaupt = i === 0;
          const url = docPdfUrls[i] ?? null;
          return (
            <div data-ui="card" key={i} className="border rounded-lg p-4 space-y-3 bg-background">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm font-medium truncate">{d.name}</span>
                {isHaupt ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase tracking-wide">
                    Unterschrift
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">
                    Anlage
                  </span>
                )}
              </div>
              {url === null && docPdfUrls.length === 0 ? (
                <div className="border rounded-lg p-6 bg-muted/30 text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vorschau wird erzeugt…
                </div>
              ) : (
                renderPreview(url, d.name)
              )}

              {isHaupt && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Pen className="h-3.5 w-3.5" /> Deine Unterschrift (Christian Kurz)
                    </label>
                    {hasDrawn && (
                      <Button variant="ghost" size="sm" onClick={clearCanvas} className="h-7 text-xs gap-1">
                        <Trash2 className="h-3 w-3" /> Löschen
                      </Button>
                    )}
                  </div>
                  <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-white touch-none">
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={180}
                      className="w-full cursor-crosshair"
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={stopDraw}
                    />
                  </div>
                  {!hasDrawn && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      Bitte hier unterschreiben (Maus oder Finger)
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-3 bg-muted/30 rounded-lg p-3">
        <Checkbox id="consent-kurz" checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
        <label htmlFor="consent-kurz" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
          Ich, Christian Kurz, gegenzeichne hiermit den Handelsvertretervertrag mit {bewerberName} samt
          allen Anlagen rechtsverbindlich für MOREImmo. Mit meiner Unterschrift wird der Vertrag beidseitig
          rechtswirksam, die finalen PDFs werden im System abgelegt und dem Vertriebspartner per E-Mail zugestellt.
        </label>
      </div>

      <Button
        className="w-full"
        disabled={!consent || !hasDrawn || submitting}
        onClick={handleSubmit}
      >
        {submitting ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird gegengezeichnet…</>
        ) : (
          <>✍️ Vertrag gegenzeichnen &amp; abschließen</>
        )}
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">
        Die Unterschrift wird verschlüsselt übertragen und DSGVO-konform gespeichert.
      </p>
    </Card>
  );
}
