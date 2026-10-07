import { useState, useEffect, useRef } from "react";
import { requestPushPermission, getPushPermission } from "@/lib/pushNotifications";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/webPush";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bereichSlug, einstellungenBereiche } from "@/lib/einstellungenBereiche";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useUser } from "@/contexts/UserContext";
import { rollenLabel } from "@/lib/rollenLabel";
import { berufsbezeichnung } from "@/lib/berufsbezeichnung";
import { eigeneBerufsbezeichnung } from "@/lib/beraterProfil";
import { Save, Upload, Plus, Trash2, CheckCircle, Clock, XCircle, FileText, Mail, Camera, CalendarCheck, ExternalLink, Info, Send, Loader2, Monitor, LogOut, Pencil, RefreshCw, AlertCircle, GraduationCap } from "lucide-react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { guardTestWrite } from "@/lib/testModeGuard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useUserSettings } from "@/hooks/useUserSettings";
import { KalenderKonten } from "@/components/kalender/KalenderKonten";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { compressToFile, compressToSquareAvatar } from "@/lib/imageCompression";
import { EmailStatusPanel } from "@/components/admin/EmailStatusPanel";
import { TutorialTab } from "@/components/einstellungen/TutorialTab";
import { AbwesenheitCard } from "@/components/einstellungen/AbwesenheitCard";
import { isSidebarBlurExempt } from "@/lib/sidebarBlurWhitelist";
import { isPreviewEnv } from "@/lib/previewFlag";
import { PflichtunterlagenCard } from "@/components/einstellungen/PflichtunterlagenCard";
import { istGueltigeMetaPixelId } from "@/lib/metaPixel";
import { pixelVerantwortlicherAus } from "../../supabase/functions/_shared/cookie-einwilligung.ts";
import { entferneMetaPixel, ladeCapiTokenStatus, speichereCapiToken, loescheCapiToken } from "@/lib/vpMarketingStore";
import { META_PIXEL_OHNE_ANLAGE_4_HINWEIS, darfMetaPixelSetzen } from "@/lib/metaPixelFreigabe";
// Nur für ActiveSessionsSection, die auch im Kundenportal
// läuft. Mitarbeiter sehen Deutsch, weil ihre Anzeigesprache Deutsch ist.
import { useTranslation } from "react-i18next";
import { portalSprache } from "@/i18n/portalSprache";
import { datumUhrzeitText } from "@/lib/sprachFormat";
import { friendlyError } from "@/lib/errorMessages";

interface EmailKonto {
  id: string;
  typ: string;
  email: string;
  imapServer: string;
  smtpServer: string;
  benutzername: string;
  passwort: string;
}

interface Signatur {
  aktiv: boolean;
  html: string;
}

/**
 * Die Schalter im Abschnitt "Synchronisation" unter Kalender. Hier stehen nur
 * die, hinter denen wirklich Code liegt: Termine und Follow-ups. Frueher gab
 * es zusaetzlich "Powerdialer-Termine" und "Bidirektionale Sync", beide ohne
 * jede Wirkung. Alte gespeicherte Werte in der Datenbank stoeren nicht, sie
 * werden schlicht nicht mehr gelesen.
 */
interface KalenderSyncOptionen {
  termine: boolean;
  followUp: boolean;
  /** Änderungen aus dem verbundenen Kalender zurück ins CRM übernehmen. */
  rueckrichtung: boolean;
}

interface EinstellungenData {
  profil: { vorname: string; nachname: string; telefon: string; position: string; strasse: string; hausnummer: string; plz: string; ort: string; land: string };
  email: { passwort: string; signatur: Signatur; zusatzKonten: EmailKonto[]; syncOptionen?: { autoSync: boolean; intervall: string; nurUngelesen: boolean; maxAnzahl: number; ordnerSync: string[] } };
  kalender: { syncOptionen: KalenderSyncOptionen };
  gewerbedaten: { rechtsform: string; firmenname: string; strasse: string; hausnummer: string; plz: string; ort: string; land: string };
  benachrichtigungen: { kanaele: { email: boolean; feed: boolean; browser: boolean; popup: boolean }; themen: { leads: boolean; termine: boolean; pipeline: boolean; provisionen: boolean; team: boolean; system: boolean } };
  google_calendar?: { connected?: boolean; email?: string; calendars?: { id: string; name: string; primary?: boolean }[] } | null;
  /** Marketing-Einstellungen der Vertriebspartner-Landingpage (z. B. Meta Pixel). */
  marketing?: { metaPixelId?: string };
}

const defaultSettings: EinstellungenData = {
  profil: { vorname: "", nachname: "", telefon: "", position: "", strasse: "", hausnummer: "", plz: "", ort: "", land: "Deutschland" },
  email: {
    passwort: "",
    signatur: { aktiv: true, html: `<p>Mit freundlichen Grüßen</p>\n<p><strong>Christian Peetz</strong></p>\n<p>Vertriebsberater | OS Immobilien</p>\n<p>📞 +49 170 1234567</p>\n<p>✉ os@os-immobilien.com</p>\n<p>🌐 www.moreimmo.de</p>` },
    zusatzKonten: [],
    syncOptionen: { autoSync: false, intervall: "15", nurUngelesen: false, maxAnzahl: 50, ordnerSync: ["INBOX"] },
  },
  kalender: {
    syncOptionen: { termine: true, followUp: true, rueckrichtung: false },
  },
  gewerbedaten: { rechtsform: "", firmenname: "", strasse: "", hausnummer: "", plz: "", ort: "", land: "Deutschland" },
  benachrichtigungen: {
    kanaele: { email: true, feed: true, browser: false, popup: true },
    themen: { leads: true, termine: true, pipeline: true, provisionen: true, team: true, system: true },
  },
};


const Einstellungen = () => {
  const { user, authUser, loading: userLoading } = useUser();
  const role = user.role as string;
  // Kunden bekommen ein eigenes, portal-natives Einstellungs-Layout.
  // Wichtig: erst nach Laden des Profils umleiten, sonst flackert kurz die Kunden-Ansicht
  // (DEFAULT_PROFILE.role === "kunde" während des Ladevorgangs).
  if (!userLoading && role === "kunde") {
    return <Navigate to="/kunde/einstellungen" replace />;
  }
  const [deleteEmailId, setDeleteEmailId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    initialTabParam || (role === "kunde" ? "benachrichtigungen" : "profil")
  );

  // React to ?tab=... changes (e.g. when navigating from the 2FA banner)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [geburtstag, setGeburtstag] = useState("");
  const [buchungslink, setBuchungslink] = useState("");
  const [beratungslink, setBeratungslink] = useState("");
  // Seit dem 21.09.2026 gibt es vier Buchungslinks statt zwei. Objekt und
  // Finanzierung kamen dazu, damit ein Partner alle vier Gespraeche ueber
  // seinen eigenen Kalender terminieren kann.
  const [objektlink, setObjektlink] = useState("");
  const [finanzierungslink, setFinanzierungslink] = useState("");
  // Zuletzt in der DB gespeicherte Buchungslinks – dient als Referenz, um
  // den Inline-Speichern-Button (pro Feld) ein-/auszublenden.
  const [savedBuchungslink, setSavedBuchungslink] = useState("");
  const [savedBeratungslink, setSavedBeratungslink] = useState("");
  const [savedObjektlink, setSavedObjektlink] = useState("");
  const [savedFinanzierungslink, setSavedFinanzierungslink] = useState("");
  const [savingBuchungslink, setSavingBuchungslink] = useState(false);
  const [savingBeratungslink, setSavingBeratungslink] = useState(false);
  const [savingObjektlink, setSavingObjektlink] = useState(false);
  const [savingFinanzierungslink, setSavingFinanzierungslink] = useState(false);
  const [profilEmail, setProfilEmail] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  const {
    loaded: dbLoaded,
    settings: dbSettings, saveSettings: dbSaveSettings,
    closerList: dbCloserList,
    appleCalendar, setAppleCalendar,
    onboardingComplete,
    markOnboardingComplete,
  } = useUserSettings();

  // Load avatar from profiles table
  useEffect(() => {
    if (!authUser) return;
    // Sofort aus LocalStorage vorbefüllen (verhindert leeres Feld während DB-Roundtrip
    // und bewahrt das Geburtsdatum, falls die DB es kurzzeitig nicht liefert).
    try {
      const cached = localStorage.getItem(`mi_profile_geburtstag_${authUser.id}`);
      if (cached) setGeburtstag(cached);
    } catch { /* noop */ }
    try {
      const cachedLink = localStorage.getItem(`mi_profile_buchungslink_${authUser.id}`);
      if (cachedLink) setBuchungslink(cachedLink);
    } catch { /* noop */ }
    try {
      const cachedBeratung = localStorage.getItem(`mi_profile_beratungslink_${authUser.id}`);
      if (cachedBeratung) setBeratungslink(cachedBeratung);
    } catch { /* noop */ }
    try {
      const cachedEmail = localStorage.getItem(`mi_profile_email_${authUser.id}`);
      if (cachedEmail) setProfilEmail(cachedEmail);
    } catch { /* noop */ }
    supabase.from("profiles").select("avatar_url, geburtstag, buchungslink, beratungslink, email").eq("id", authUser.id).single()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
        if (data?.geburtstag) {
          setGeburtstag(data.geburtstag);
          try { localStorage.setItem(`mi_profile_geburtstag_${authUser.id}`, data.geburtstag); } catch { /* noop */ }
        }
        if ((data as any)?.buchungslink) {
          setBuchungslink((data as any).buchungslink);
          setSavedBuchungslink((data as any).buchungslink);
          try { localStorage.setItem(`mi_profile_buchungslink_${authUser.id}`, (data as any).buchungslink); } catch { /* noop */ }
        }
        if ((data as any)?.beratungslink) {
          setBeratungslink((data as any).beratungslink);
          setSavedBeratungslink((data as any).beratungslink);
          try { localStorage.setItem(`mi_profile_beratungslink_${authUser.id}`, (data as any).beratungslink); } catch { /* noop */ }
        }
        const emailFromProfile = (data as any)?.email || authUser.email || "";
        setProfilEmail(emailFromProfile);
        try { if (emailFromProfile) localStorage.setItem(`mi_profile_email_${authUser.id}`, emailFromProfile); } catch { /* noop */ }
      });
  }, [authUser]);

  // Use central compression utility
  const compressFile = (file: File, maxWidth = 800, quality = 0.8): Promise<File> => {
    return compressToFile(file, maxWidth, maxWidth, quality);
  };

  const uploadAvatar = async (file: File) => {
    if (!authUser) { toast.error("Bitte zuerst einloggen"); return; }
    if (guardTestWrite("Profilbild ändern")) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Datei zu groß – max. 25 MB erlaubt.");
      return;
    }
    setAvatarUploading(true);
    try {
      // Live-Session-ID holen — verhindert RLS-Fehler, falls der React-State (authUser)
      // veraltet ist (z. B. nach Rollenwechsel, Tab-Sync oder Token-Refresh).
      const { data: sessionData, error: sessionErr } = await supabase.auth.getUser();
      if (sessionErr || !sessionData?.user?.id) {
        throw new Error("Session ungültig – bitte neu einloggen und erneut versuchen.");
      }
      const liveUid = sessionData.user.id;
      if (liveUid !== authUser.id) {
        console.warn("[avatar] authUser.id ≠ live session.id", { stateId: authUser.id, liveId: liveUid });
      }
      // Beliebige Bildgröße/-form → intern quadratisch zentriert beschneiden,
      // EXIF strippen, in WebP konvertieren. Schlägt die Komprimierung fehl
      // (z.B. exotisches Format, Browser kann Datei nicht decodieren), wird
      // als Fallback die Originaldatei direkt hochgeladen, damit der Nutzer
      // nicht komplett blockiert ist.
      let uploadBlob: Blob;
      let uploadName: string;
      let uploadMime: string;
      try {
        const square = await compressToSquareAvatar(file, 512, 0.85);
        uploadBlob = square;
        uploadName = square.name;
        uploadMime = square.type || "image/webp";
      } catch (compressErr: any) {
        console.warn("[avatar] Komprimierung fehlgeschlagen – nutze Originaldatei als Fallback.", compressErr);
        toast.message("Bild konnte nicht zugeschnitten werden – Originaldatei wird hochgeladen.");
        uploadBlob = file;
        const safeName = (file.name || "avatar").replace(/[^a-zA-Z0-9_.-]/g, "_");
        uploadName = safeName.includes(".") ? safeName : `${safeName}.bin`;
        uploadMime = file.type || "application/octet-stream";
      }
      const ext = (uploadName.split(".").pop() || "webp").toLowerCase();
      const thumbPath = `${liveUid}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(thumbPath, uploadBlob, { upsert: true, contentType: uploadMime });
      if (upErr) {
        console.error("[avatar] storage upload failed", { thumbPath, liveUid, uploadMime, size: (uploadBlob as any).size, upErr });
        throw new Error(`Storage-Upload abgelehnt: ${upErr.message || upErr}`);
      }

      // 2) Best-effort: Original (lightly compressed) für volle Ansicht speichern.
      //    Fehler hier sind nicht kritisch — der quadratische Avatar steht bereits.
      try {
        const origCompressed = await compressToFile(file, 1600, 1600, 0.85);
        const origExt = origCompressed.name.split(".").pop() || "jpg";
        const origPath = `${liveUid}/avatar_original.${origExt}`;
        await supabase.storage
          .from("avatars")
          .upload(origPath, origCompressed, { upsert: true, contentType: origCompressed.type });
      } catch (e) {
        console.warn("Original-Avatar Upload übersprungen:", e);
      }

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(thumbPath);
      const url = `${publicUrl}?t=${Date.now()}`;
      const { error: profErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", liveUid);
      if (profErr) {
        console.error("[avatar] profiles update failed", profErr);
        throw profErr;
      }
      setAvatarUrl(url);
      try { localStorage.setItem("mi_profile_avatar_url", url); } catch {}
      toast.success("Profilbild gespeichert");
    } catch (e: any) {
      console.error("Avatar upload error:", e);
      toast.error("Fehler beim Hochladen: " + (e.message || "Unbekannt"));
    } finally {
      setAvatarUploading(false);
    }
  };

  const [settings, setSettings] = useState<EinstellungenData>(defaultSettings);
  // Tracks whether we already hydrated `settings` from a real DB row.
  // Once true, we never overwrite the local state with empty defaults again,
  // so a flickering `dbSettings` (e.g. realtime/auth-state churn) cannot wipe
  // values like the phone number after the user already saw them.
  const hasHydratedFromDb = useRef(false);
  // Erlaubt der GewerbedatenForm, ihren lokalen Tippstand vor handleSave zu flushen.
  const gewerbedatenFlushRef = useRef<(() => { rechtsform: string; firmenname: string; strasse: string; hausnummer: string; plz: string; ort: string; land: string } | null) | null>(null);

  // Sync from DB when loaded
  useEffect(() => {
    if (!dbLoaded) return;
    // LocalStorage-Cache für Profil (Telefon, Vorname, Nachname, Position):
    // verhindert, dass eine kurzzeitig leere DB-Antwort die Eingaben überschreibt
    // und stellt nach Reload sofort die zuletzt eingetippten Werte wieder her.
    const profilLsKey = authUser ? `mi_profile_profil_${authUser.id}` : null;
    const fullLsKey = authUser ? `mi_settings_full_${authUser.id}` : null;
    let cachedProfil: any = null;
    let cachedFull: any = null;
    if (profilLsKey) {
      try {
        const raw = localStorage.getItem(profilLsKey);
        if (raw) cachedProfil = JSON.parse(raw);
      } catch { /* noop */ }
    }
    if (fullLsKey) {
      try {
        const raw = localStorage.getItem(fullLsKey);
        if (raw) cachedFull = JSON.parse(raw);
      } catch { /* noop */ }
    }
    if (dbSettings && Object.keys(dbSettings).length > 0) {
      // Cache zuerst mergen, dann DB drüberlegen – DB gewinnt für nicht-leere Felder,
      // Cache füllt Lücken (z. B. Gewerbedaten, die noch nicht in der DB sind, weil
      // der letzte Save fehlgeschlagen ist oder die Session getrennt war).
      const merged: EinstellungenData = { ...defaultSettings, ...(cachedFull || {}), ...dbSettings } as EinstellungenData;
      // Gewerbedaten/Profil tief mergen, damit nicht ein ganzes Sub-Objekt gewinnt,
      // sondern feldweise aufgefüllt wird.
      if (cachedFull?.gewerbedaten) {
        merged.gewerbedaten = { ...cachedFull.gewerbedaten, ...((dbSettings as any).gewerbedaten || {}) };
        // Leere DB-Felder mit Cache-Werten auffüllen
        (Object.keys(merged.gewerbedaten) as (keyof typeof merged.gewerbedaten)[]).forEach((k) => {
          const v = (merged.gewerbedaten as any)[k];
          if ((!v || !String(v).trim()) && (cachedFull.gewerbedaten as any)[k]) {
            (merged.gewerbedaten as any)[k] = (cachedFull.gewerbedaten as any)[k];
          }
        });
      }
      // Wenn die DB ein Feld leer liefert, aber der LocalStorage einen Wert hat,
      // bevorzugen wir den LocalStorage-Wert (Schutz gegen Datenverlust durch
      // verzögerte Realtime-/Auth-Roundtrips).
      if (cachedProfil && typeof cachedProfil === "object") {
        const safeProfil = { ...merged.profil } as any;
        (["telefon", "vorname", "nachname"] as const).forEach((f) => {
          const dbVal = (safeProfil as any)[f];
          const lsVal = (cachedProfil as any)[f];
          if ((!dbVal || !String(dbVal).trim()) && lsVal && String(lsVal).trim()) {
            (safeProfil as any)[f] = lsVal;
          }
        });
        merged.profil = safeProfil;
      }
      // Die Position haengt an der Rolle und ist nicht von Hand aenderbar.
      // Gezeigt wird die Berufsbezeichnung, nicht die technische Rolle: Der
      // Wert wandert von hier in Mails, Meeting-Einladungen und den
      // Warteraum, und dort hat "Admin" nichts zu suchen. Gibt es fuer die
      // Rolle keine Berufsbezeichnung, bleibt es beim Rollennamen, sonst
      // waere das Pflichtfeld leer und das Onboarding nicht abschliessbar.
      if (user.role) {
        const anzeige =
          eigeneBerufsbezeichnung(merged.profil?.position) ||
          berufsbezeichnung(user.role) ||
          rollenLabel(user.role, user.rollenVariante);
        if (anzeige) merged.profil = { ...merged.profil, position: anzeige };
      }
      // Fallback: fill vorname/nachname from profiles.name if still empty
      if ((!merged.profil?.vorname || !merged.profil?.nachname) && user.name && user.name !== "Laden..." && user.name !== "Nutzer") {
        const parts = user.name.split(" ");
        if (!merged.profil?.vorname) merged.profil = { ...merged.profil, vorname: parts[0] || "" };
        if (!merged.profil?.nachname) merged.profil = { ...merged.profil, nachname: parts.slice(1).join(" ") || "" };
      }
      setSettings(merged);
      hasHydratedFromDb.current = true;
    } else if (!hasHydratedFromDb.current) {
      // Only pre-fill defaults the very first time and only when there really is
      // no saved row yet. Never overwrite an already hydrated state with defaults.
      const newSettings: EinstellungenData = { ...defaultSettings, ...(cachedFull || {}) } as EinstellungenData;
      if (cachedFull?.gewerbedaten) {
        newSettings.gewerbedaten = { ...defaultSettings.gewerbedaten, ...cachedFull.gewerbedaten };
      }
      // LocalStorage-Cache vorrangig wiederherstellen (z. B. nach Reload während
      // des Onboardings – Telefonnummer/Position bleibt erhalten).
      if (cachedProfil && typeof cachedProfil === "object") {
        newSettings.profil = { ...newSettings.profil, ...cachedProfil };
      }
      if (user.name && user.name !== "Laden..." && user.name !== "Nutzer") {
        const parts = user.name.split(" ");
        if (!newSettings.profil.vorname) newSettings.profil = { ...newSettings.profil, vorname: parts[0] || "" };
        if (!newSettings.profil.nachname) newSettings.profil = { ...newSettings.profil, nachname: parts.slice(1).join(" ") || "" };
      }
      if (user.role) {
        const anzeige =
          eigeneBerufsbezeichnung(newSettings.profil?.position) ||
          berufsbezeichnung(user.role) ||
          rollenLabel(user.role, user.rollenVariante);
        if (anzeige) {
          newSettings.profil = { ...newSettings.profil, position: anzeige };
        }
      }
      setSettings(newSettings);
    }
  }, [dbLoaded, dbSettings, user.role, user.rollenVariante, user.name, authUser?.id]);

  const saveSettings = async (newSettings: EinstellungenData): Promise<boolean> => {
    // Defensive: never persist a profile that drops a previously saved phone
    // number (or other key fields) back to empty due to a stale local state.
    const previousProfil = (dbSettings as any)?.profil || {};
    const safeProfil = { ...newSettings.profil };
    (["telefon", "vorname", "nachname"] as const).forEach((field) => {
      const prev = (previousProfil as any)?.[field];
      const next = (safeProfil as any)?.[field];
      if (prev && typeof prev === "string" && prev.trim() && (!next || !String(next).trim())) {
        (safeProfil as any)[field] = prev;
      }
    });
    const safe: EinstellungenData = { ...newSettings, profil: safeProfil };
    setSettings(safe);
    // Vollständigen Snapshot lokal cachen – schützt vor Datenverlust, falls
    // der DB-Save fehlschlägt (Session-Timeout, Netz, RPC-Fehler). Beim
    // nächsten Laden werden Lücken aus diesem Cache wieder aufgefüllt.
    if (authUser) {
      try { localStorage.setItem(`mi_settings_full_${authUser.id}`, JSON.stringify(safe)); } catch { /* noop */ }
    }
    return await dbSaveSettings(safe);
  };


  const updateProfil = (field: string, value: string) => {
    const newProfil = { ...settings.profil, [field]: value };
    // Sofort lokal cachen – bleibt beim Tab-Wechsel/Reload erhalten und
    // schützt vor Datenverlust (z. B. Telefonnummer, Position) durch
    // verzögerte Realtime-Antworten.
    if (authUser) {
      try {
        localStorage.setItem(
          `mi_profile_profil_${authUser.id}`,
          JSON.stringify(newProfil),
        );
      } catch { /* noop */ }
    }
    saveSettings({ ...settings, profil: newProfil });
  };

  const updateSignatur = (field: string, value: any) => {
    saveSettings({ ...settings, email: { ...settings.email, signatur: { ...settings.email.signatur, [field]: value } } });
  };

  /*
   * Zaehler, der hochlaeuft, sobald eine Pflichtunterlage hochgeladen oder
   * die 34c-Angabe geaendert wurde. Andere Teile der Seite koennen daran
   * haengen, etwa ein Hinweis auf noch fehlende Unterlagen.
   */
  const [unterlagenVersion, setUnterlagenVersion] = useState(0);

  const updateGewerbedaten = (field: string, value: string) => {
    saveSettings({ ...settings, gewerbedaten: { ...settings.gewerbedaten, [field]: value } });
  };

  // Email-Konto Dialog
  const [emailDialog, setEmailDialog] = useState(false);
  const [editEmailId, setEditEmailId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState<EmailKonto>({ id: "", typ: "IMAP", email: "", imapServer: "", smtpServer: "", benutzername: "", passwort: "" });
  const [syncing, setSyncing] = useState(false);

  const openEditEmail = (konto: EmailKonto) => {
    setEditEmailId(konto.id);
    setNewEmail({ ...konto });
    setEmailDialog(true);
  };

  const openAddEmail = () => {
    setEditEmailId(null);
    setNewEmail({ id: "", typ: "IMAP", email: "", imapServer: "", smtpServer: "", benutzername: "", passwort: "" });
    setEmailDialog(true);
  };

  const saveEmailKonto = () => {
    if (!newEmail.email) return;
    if (editEmailId) {
      // Update existing
      const updated = settings.email.zusatzKonten.map(k => k.id === editEmailId ? { ...newEmail, id: editEmailId } : k);
      saveSettings({ ...settings, email: { ...settings.email, zusatzKonten: updated } });
      toast.success("E-Mail-Konto aktualisiert");
    } else {
      // Add new
      const konto = { ...newEmail, id: String(Date.now()) };
      saveSettings({ ...settings, email: { ...settings.email, zusatzKonten: [...settings.email.zusatzKonten, konto] } });
      toast.success("E-Mail-Konto hinzugefügt");
    }
    setNewEmail({ id: "", typ: "IMAP", email: "", imapServer: "", smtpServer: "", benutzername: "", passwort: "" });
    setEditEmailId(null);
    setEmailDialog(false);
  };

  const removeEmailKonto = (id: string) => {
    saveSettings({ ...settings, email: { ...settings.email, zusatzKonten: settings.email.zusatzKonten.filter(k => k.id !== id) } });
    toast.success("E-Mail-Konto entfernt");
  };

  const syncEmails = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-emails");
      if (error) throw error;
      if (data?.synced > 0) {
        toast.success(`${data.synced} neue E-Mails synchronisiert`);
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success("Postfach ist aktuell – keine neuen E-Mails");
      }
    } catch (e: any) {
      toast.error("Sync fehlgeschlagen: " + (e.message || "Unbekannt"));
    } finally {
      setSyncing(false);
    }
  };

  const updateEmailSyncOption = (key: string, value: any) => {
    const current = settings.email.syncOptionen || { autoSync: false, intervall: "15", nurUngelesen: false, maxAnzahl: 50, ordnerSync: ["INBOX"] };
    saveSettings({ ...settings, email: { ...settings.email, syncOptionen: { ...current, [key]: value } } });
  };

  // Apple Calendar connection (real CalDAV)
  const [appleConnecting, setAppleConnecting] = useState(false);
  const [appleIdInput, setAppleIdInput] = useState("");
  const [appPasswordInput, setAppPasswordInput] = useState("");
  const [showAppleForm, setShowAppleForm] = useState(false);

  const connectAppleCalendar = async () => {
    if (!appleIdInput || !appPasswordInput) {
      toast.error("Bitte Apple-ID und App-spezifisches Passwort eingeben.");
      return;
    }
    setAppleConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("apple-calendar", {
        body: { action: "test-connection", appleId: appleIdInput, appPassword: appPasswordInput },
      });
      if (error) throw error;
      if (data.connected) {
        setAppleCalendar(data);
        setShowAppleForm(false);
        setAppleIdInput("");
        setAppPasswordInput("");
        toast.success(data.message || "Apple Kalender verbunden!");
      } else {
        toast.error(data.error || "Verbindung fehlgeschlagen");
      }
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setAppleConnecting(false);
    }
  };

  const disconnectAppleCalendar = async () => {
    setAppleConnecting(true);
    try {
      const { error } = await supabase.functions.invoke("apple-calendar", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      setAppleCalendar(null);
      toast.success("Apple Kalender getrennt.");
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setAppleConnecting(false);
    }
  };

  // Google Calendar OAuth popup flow
  const [googleCalConnecting, setGoogleCalConnecting] = useState(false);
  const googleCalData = settings?.google_calendar as { connected?: boolean; email?: string; calendars?: { id: string; name: string; primary?: boolean }[] } | null;

  const connectGoogleCalendar = async () => {
    setGoogleCalConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: { action: "get-auth-url" },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Keine Auth-URL erhalten");

      // Open popup for Google OAuth
      const popup = window.open(data.url, "google-cal-auth", "width=600,height=700,scrollbars=yes");

      // Listen for postMessage from popup
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "google-calendar-success") {
          window.removeEventListener("message", handler);
          setGoogleCalConnecting(false);
          // Reload settings to pick up new google_calendar data
          saveSettings({
            ...settings,
            google_calendar: { connected: true, email: event.data.email, calendars: event.data.calendars },
          });
          toast.success(`Google Calendar verbunden als ${event.data.email}!`);
        } else if (event.data?.type === "google-calendar-error") {
          window.removeEventListener("message", handler);
          setGoogleCalConnecting(false);
          toast.error(event.data.error || "Verbindung fehlgeschlagen");
        }
      };
      window.addEventListener("message", handler);

      // Fallback: if popup closed without message
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handler);
          setGoogleCalConnecting(false);
        }
      }, 1000);
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
      setGoogleCalConnecting(false);
    }
  };

  const disconnectGoogleCalendar = async () => {
    setGoogleCalConnecting(true);
    try {
      const { error } = await supabase.functions.invoke("google-calendar", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      saveSettings({ ...settings, google_calendar: null });
      toast.success("Google Calendar getrennt.");
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setGoogleCalConnecting(false);
    }
  };

  // Der gespeicherte Kalender-Block kommt beim Laden unveraendert aus der
  // Datenbank. Aeltere Zeilen haben dort kein `syncOptionen`, deshalb hier die
  // Standardwerte unterlegen, sonst laeuft der Abschnitt ins Leere.
  const kalenderSyncOptionen: KalenderSyncOptionen = {
    ...defaultSettings.kalender.syncOptionen,
    ...(settings.kalender?.syncOptionen || {}),
  };

  const updateSyncOption = (key: keyof KalenderSyncOptionen, value: boolean) => {
    saveSettings({ ...settings, kalender: { ...settings.kalender, syncOptionen: { ...kalenderSyncOptionen, [key]: value } } });
  };

  // Pflichtfeld-Validierung für Profil-Tab (live)
  const profilEmailTrim = profilEmail.trim();
  const profilEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profilEmailTrim);
  const profilFehler: { feld: string; label: string; selector: string }[] = [];
  if (!avatarUrl) profilFehler.push({ feld: "avatar", label: "Profilbild", selector: "[data-pflicht='avatar']" });
  if (!settings.profil?.vorname?.trim()) profilFehler.push({ feld: "vorname", label: "Vorname", selector: "[data-pflicht='vorname']" });
  if (!settings.profil?.nachname?.trim()) profilFehler.push({ feld: "nachname", label: "Nachname", selector: "[data-pflicht='nachname']" });
  if (!settings.profil?.telefon?.trim()) profilFehler.push({ feld: "telefon", label: "Telefon", selector: "[data-pflicht='telefon']" });
  if (!settings.profil?.position?.trim()) profilFehler.push({ feld: "position", label: "Position", selector: "[data-pflicht='position']" });
  if (!profilEmailTrim || !profilEmailValid) profilFehler.push({ feld: "email", label: "E-Mail", selector: "[data-pflicht='email']" });
  if (!geburtstag?.trim()) profilFehler.push({ feld: "geburtstag", label: "Geburtsdatum", selector: "[data-pflicht='geburtstag']" });
  // Gewerbedaten sind Teil des Profils (für alle Rollen, inkl. Setter:innen)
  const gw = settings.gewerbedaten;
  if (!gw?.rechtsform?.trim()) profilFehler.push({ feld: "rechtsform", label: "Rechtsform", selector: "[data-pflicht='rechtsform']" });
  if (!gw?.firmenname?.trim()) profilFehler.push({ feld: "firmenname", label: "Firmenname", selector: "[data-pflicht='firmenname']" });
  if (!gw?.strasse?.trim()) profilFehler.push({ feld: "gw_strasse", label: "Straße (Firmenadresse)", selector: "[data-pflicht='gw_strasse']" });
  if (!gw?.hausnummer?.trim()) profilFehler.push({ feld: "gw_hausnummer", label: "Hausnummer (Firmenadresse)", selector: "[data-pflicht='gw_hausnummer']" });
  if (!gw?.plz?.trim()) profilFehler.push({ feld: "gw_plz", label: "PLZ (Firmenadresse)", selector: "[data-pflicht='gw_plz']" });
  if (!gw?.ort?.trim()) profilFehler.push({ feld: "gw_ort", label: "Ort (Firmenadresse)", selector: "[data-pflicht='gw_ort']" });
  const profilUnvollstaendig = profilFehler.length > 0;

  const scrollToFirstError = () => {
    if (profilFehler.length === 0) return;
    const sel = profilFehler[0].selector;
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = el.querySelector<HTMLElement>("input, button");
        input?.focus();
      }
    }, 50);
  };

  // Onboarding: Sobald alle Pflichtfelder im Profil-Tab ausgefüllt sind,
  // Speichern-Button hervorheben und in den Viewport scrollen, damit der
  // Nutzer den finalen Klick nicht übersieht.
  const saveButtonRef = useRef<HTMLDivElement | null>(null);
  const [highlightSave, setHighlightSave] = useState(false);
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const buchungslinkSectionRef = useRef<HTMLDivElement | null>(null);
  const wasUnvollstaendigRef = useRef(profilUnvollstaendig);
  // Merkt sich, dass der User das Onboarding-Popup mit "Buchungslink noch
  // hinterlegen" geschlossen hat. Sobald er den Link dann tatsächlich
  // hinterlegt, öffnen wir das Popup erneut und fragen, ob jetzt gespeichert
  // werden soll.
  const [dismissedForBuchungslink, setDismissedForBuchungslink] = useState(false);
  const [dialogVariant, setDialogVariant] = useState<"choice" | "confirm" | "simple">("simple");
  useEffect(() => {
    const justCompleted = wasUnvollstaendigRef.current && !profilUnvollstaendig;
    wasUnvollstaendigRef.current = profilUnvollstaendig;
    if (!profilUnvollstaendig && !onboardingComplete && activeTab === "profil") {
      setHighlightSave(true);
      if (justCompleted) {
        setTimeout(() => {
          saveButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
      }
    } else {
      setHighlightSave(false);
    }
  }, [profilUnvollstaendig, onboardingComplete, activeTab]);

  // LocalStorage-Backup für Profil + Gewerbedaten: schützt vor Datenverlust,
  // falls der Speichern-Button nicht oder verzögert geklickt wird.
  useEffect(() => {
    if (!authUser) return;
    try {
      if (settings?.profil) {
        localStorage.setItem(
          `mi_profile_profil_${authUser.id}`,
          JSON.stringify(settings.profil),
        );
      }
      if (settings?.gewerbedaten) {
        localStorage.setItem(
          `mi_profile_gewerbedaten_${authUser.id}`,
          JSON.stringify(settings.gewerbedaten),
        );
      }
    } catch { /* noop */ }
  }, [authUser, settings?.profil, settings?.gewerbedaten]);

  // Speichern-Button: zeigt Popup, wenn alle Pflichtfelder ausgefüllt sind,
  // Onboarding noch offen ist und der optionale Buchungslink noch fehlt.
  const handleSaveClick = () => {
    // Onboarding-Bestätigungs-Popup für ALLE Rollen anzeigen, sobald die
    // Pflichtfelder erstmals erfüllt sind und das Onboarding noch nicht
    // abgeschlossen ist. Rollen mit Buchungslink-Feld (VP/Admin/Inhaber)
    // bekommen die "choice"-Variante (Buchungslink optional nachtragen),
    // alle anderen die kompakte "simple"-Variante (nur bestätigen).
    if (
      activeTab === "profil" &&
      !profilUnvollstaendig &&
      !onboardingComplete
    ) {
      const buchungslinkRollen = ["vertriebspartner", "admin", "inhaber"].includes(user.role);
      if (buchungslinkRollen && !buchungslink.trim()) {
        setDialogVariant("choice");
      } else {
        setDialogVariant("simple");
      }
      setShowOnboardingDialog(true);
      return;
    }
    void handleSave();
  };

  // Wenn der User das Popup mit "Buchungslink noch hinterlegen" geschlossen
  // hat und dann den Link tatsächlich einträgt → Popup erneut öffnen und
  // fragen, ob nun gespeichert werden soll.
  useEffect(() => {
    if (!dismissedForBuchungslink) return;
    if (onboardingComplete) return;
    if (profilUnvollstaendig) return;
    if (!buchungslink.trim()) return;
    setDialogVariant("confirm");
    setShowOnboardingDialog(true);
    setDismissedForBuchungslink(false);
  }, [dismissedForBuchungslink, buchungslink, profilUnvollstaendig, onboardingComplete]);

  const handleSave = async () => {
    // Stelle sicher, dass im Gewerbedaten-Tab gerade getippte (noch nicht ge-blurr-te)
    // Werte vor dem Speichern in den parent-State propagiert werden.
    let settingsToSave = settings;
    if (gewerbedatenFlushRef.current) {
      try {
        const flushed = gewerbedatenFlushRef.current();
        if (flushed) {
          settingsToSave = { ...settings, gewerbedaten: flushed };
        }
      } catch { /* noop */ }
    }
    // Validierung nach dem Flush erneut auf settingsToSave berechnen, sonst
    // schlägt das Speichern fehl, wenn der User Gewerbedaten getippt hat
    // ohne das Feld vorher zu blurren (lokaler State der GewerbedatenForm).
    if (activeTab === "profil") {
      const pX: any = settingsToSave.profil || {};
      const gX: any = settingsToSave.gewerbedaten || {};
      const emailValidX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profilEmail.trim());
      const fehlerLive: string[] = [];
      if (!avatarUrl) fehlerLive.push("Profilbild");
      if (!pX.vorname?.trim()) fehlerLive.push("Vorname");
      if (!pX.nachname?.trim()) fehlerLive.push("Nachname");
      if (!pX.telefon?.trim()) fehlerLive.push("Telefon");
      if (!pX.position?.trim()) fehlerLive.push("Position");
      if (!emailValidX) fehlerLive.push("E-Mail");
      if (!isTippgeber) {
        if (!geburtstag?.trim()) fehlerLive.push("Geburtsdatum");
        if (!gX?.rechtsform?.trim()) fehlerLive.push("Rechtsform");
        if (!gX?.firmenname?.trim()) fehlerLive.push("Firmenname");
        if (!gX?.strasse?.trim()) fehlerLive.push("Straße (Firmenadresse)");
        if (!gX?.hausnummer?.trim()) fehlerLive.push("Hausnummer (Firmenadresse)");
        if (!gX?.plz?.trim()) fehlerLive.push("PLZ (Firmenadresse)");
        if (!gX?.ort?.trim()) fehlerLive.push("Ort (Firmenadresse)");
      }
      if (fehlerLive.length > 0) {
        toast.error(`Bitte fülle alle Pflichtfelder aus: ${fehlerLive.join(", ")}`);
        scrollToFirstError();
        return;
      }
    }

    if (authUser) {
      const updates: any = {};
      if (geburtstag) updates.geburtstag = geburtstag;
      /*
       * Die Telefonnummer lag bisher nur im Nutzerprofil. Alles, was
       * serverseitig laeuft, liest sie aber aus `profiles`: die Buchungsseite,
       * der Warteraum eines gebuchten Termins und die Erinnerungsmails. Dort
       * stand deshalb nie eine Nummer, obwohl hier eine eingetragen war.
       */
      if (settings.profil?.telefon?.trim()) updates.telefon = settings.profil.telefon.trim();
      if (showBuchungslink) updates.buchungslink = buchungslink || null;
      if (showBuchungslink) updates.beratungslink = beratungslink || null;
      /*
        Objekt- und Finanzierungslink stehen bewusst NICHT in diesem Update.

        Ihre Spalten gibt es erst, wenn die Migration 20260921170000 gelaufen
        ist. Wuerden sie hier mitgeschickt, scheiterte ohne sie das ganze
        Update, und niemand koennte mehr sein Profil speichern, auch Name und
        Telefon nicht. Gespeichert werden sie ueber ihren eigenen Knopf am
        Feld, der den Fehler einzeln abfaengt.
      */
      if (profilEmail.trim()) updates.email = profilEmail.trim();
      if (Object.keys(updates).length > 0) {
        const { error: profileError } = await supabase.from("profiles").update(updates).eq("id", authUser.id);
        if (profileError) {
          console.error("Profil-Stammdaten konnten nicht gespeichert werden:", profileError);
          toast.error("Profil konnte nicht gespeichert werden: " + profileError.message);
          return;
        }
      }
      // Geburtsdatum zusätzlich lokal cachen – bleibt erhalten, falls die DB-Antwort
      // beim nächsten Laden verzögert ist.
      if (geburtstag) {
        try { localStorage.setItem(`mi_profile_geburtstag_${authUser.id}`, geburtstag); } catch { /* noop */ }
      }
      if (showBuchungslink) {
        try {
          if (buchungslink) localStorage.setItem(`mi_profile_buchungslink_${authUser.id}`, buchungslink);
          else localStorage.removeItem(`mi_profile_buchungslink_${authUser.id}`);
        } catch { /* noop */ }
        try {
          if (beratungslink) localStorage.setItem(`mi_profile_beratungslink_${authUser.id}`, beratungslink);
          else localStorage.removeItem(`mi_profile_beratungslink_${authUser.id}`);
        } catch { /* noop */ }
        setSavedBuchungslink(buchungslink);
        setSavedBeratungslink(beratungslink);
      }
      if (profilEmail.trim()) {
        try { localStorage.setItem(`mi_profile_email_${authUser.id}`, profilEmail.trim()); } catch { /* noop */ }
      }
    }

    // Force persist settings to DB immediately
    const settingsSaved = await saveSettings(settingsToSave);
    if (!settingsSaved) return;

    toast.success("Einstellungen gespeichert");

    // Always check onboarding completion (don't rely on potentially stale onboardingComplete state)
    {
      const isSetterin = user.role === "setterin";
      const isObjektpartner = user.role === "objektpartner";
      const p = settingsToSave.profil;
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profilEmail.trim());
      const profilComplete = p.vorname?.trim() && p.nachname?.trim() && p.telefon?.trim() && p.position?.trim() && geburtstag && emailValid && !!avatarUrl;

      // Check actual DB state for onboarding
      let dbOnboardingDone = onboardingComplete;
      if (authUser) {
        try {
          const { data: checkRow } = await supabase
            .from("user_settings" as any)
            .select("onboarding_complete")
            .eq("user_id", authUser.id)
            .maybeSingle();
          dbOnboardingDone = Boolean((checkRow as any)?.onboarding_complete);
        } catch { /* use hook state as fallback */ }
      }

      if (!dbOnboardingDone) {
        // Profil enthält jetzt auch Gewerbedaten (außer für Setter:innen).
        // profilComplete bedeutet alle Pflichtfelder inkl. Firmenname/Rechtsform sind ausgefüllt.
        const g = settingsToSave.gewerbedaten;
        const gewerbeComplete =
          !!g?.rechtsform?.trim() &&
          !!g?.firmenname?.trim() &&
          !!g?.strasse?.trim() &&
          !!g?.hausnummer?.trim() &&
          !!g?.plz?.trim() &&
          !!g?.ort?.trim();

        if (activeTab === "profil" && profilComplete && gewerbeComplete) {
          await markOnboardingComplete();
          window.dispatchEvent(new CustomEvent("onboarding-complete"));
          toast.success("🎉 Willkommen! Wir wünschen dir viel Freude bei der Nutzung des CRM von OS Immobilien!", { duration: 5000 });
          navigate("/", { replace: true });
          return;
        }
      }
    }
  };

  /*
    Die zwei neuen Buchungslinks getrennt geladen.

    Sie liegen in eigenen Spalten, die es erst gibt, wenn die Migration
    20260921170000 in Supabase gelaufen ist. Die Hauptabfrage darueber bleibt
    deshalb unveraendert: Wuerde sie die Spalten mitverlangen, faende sie ohne
    Migration gar nichts mehr, und der ganze Profilbereich bliebe leer. So
    bleiben im schlimmsten Fall nur die zwei neuen Felder leer.
  */
  useEffect(() => {
    if (!authUser) return;
    let abgebrochen = false;
    void (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("objektlink, finanzierungslink")
        .eq("id", authUser.id)
        .maybeSingle();
      if (abgebrochen || error || !data) return;
      const d = data as { objektlink?: string | null; finanzierungslink?: string | null };
      if (d.objektlink) { setObjektlink(d.objektlink); setSavedObjektlink(d.objektlink); }
      if (d.finanzierungslink) { setFinanzierungslink(d.finanzierungslink); setSavedFinanzierungslink(d.finanzierungslink); }
    })();
    return () => { abgebrochen = true; };
  }, [authUser]);

  /*
    Wer seine Buchungslinks hinterlegen darf.

    Bis zum 21.09.2026 stand hier eine Liste aus drei Rollen, und die
    Vertriebsleitung war nicht dabei. Ein Vertriebsleiter konnte seine Links
    also gar nicht eintragen, und im Kundenprofil blieben alle vier Knoepfe
    bei ihm leer. Das sieht aus wie ein Fehler in den Knoepfen und ist einer in
    dieser Zeile.

    Die Bedingung ist jetzt umgedreht: Ausgeschlossen wird, wer nachweislich
    keinen eigenen Kalender fuehrt. Alles andere darf. Eine neue Rolle bekommt
    die Felder damit von selbst, statt in einer Liste vergessen zu werden.
  */
  const OHNE_BUCHUNGSKALENDER = ["kunde", "tippgeber", "bewerber", "hausverwaltung"];
  const showBuchungslink = !OHNE_BUCHUNGSKALENDER.includes(user.role);

  const isKunde = role === "kunde";
  const isSetterin = user.role === "setterin";
  const isBuchhaltung = user.role === "buchhaltung";
  const isObjektpartner = user.role === "objektpartner";
  const isAdmin = user.role === "admin" || user.role === "inhaber";
  const isTippgeber = user.role === "tippgeber";
  /*
   * Welche Bereiche es gibt, sagt seit dem 14.09.2026 `einstellungenBereiche`.
   *
   * Die Liste stand vorher hier, und seit das Zahnrad in der Kopfleiste ein
   * Menue oeffnet, brauchen zwei Stellen dieselbe Auskunft. Zwei Kopien waeren
   * bei der ersten Aenderung auseinandergelaufen, und im Menue staende dann
   * ein Bereich, den diese Seite nicht kennt.
   *
   * Dort steckt auch die Entwurf-Regel, die dieselbe ist wie in der
   * Seitenleiste: Der Kalender ist fuer Admin und Inhaber klickbar und traegt
   * "Entwurf", fuer alle anderen ist er gesperrt und traegt "Bald verfuegbar".
   */
  const bereiche = einstellungenBereiche(user.role);
  const tabSlug = bereichSlug;
  const tabs = bereiche.map((b) => b.titel);
  const bereichZu = (slug: string) => bereiche.find((b) => b.slug === slug);
  // Ob ein Inhalt gerendert wird, haengt an derselben Liste wie sein Reiter.
  // Sonst gaebe es einen Reiter ohne Inhalt oder einen Inhalt ohne Reiter.
  const hatBereich = (slug: string) => !!bereichZu(slug);
  const activeTabLabel = bereichZu(activeTab)?.titel || "Bereich wählen";

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <PageHeader title={isKunde ? "Passwort ändern" : "Einstellungen"} subtitle={isKunde ? "Hier kannst du dein Passwort ändern." : "Diese Einstellungen gelten nur für dich."} />

        {!isKunde && !isTippgeber && !onboardingComplete && !isSidebarBlurExempt(authUser?.email) && (
          <div className="mb-4 rounded-lg border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/30 p-4 flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-orange-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Einstellungen vervollständigen</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Bitte fülle alle Pflichtschritte unten aus und speichere deine Daten. Erst danach wird dein Zugang zum Backoffice freigeschaltet.
                Jeder abgeschlossene Schritt wird grün markiert und als <strong>✅ Erledigt</strong> angezeigt.
              </p>
            </div>
          </div>
        )}

        {!isKunde && !isTippgeber && !isPreviewEnv() && !isSidebarBlurExempt(authUser?.email) && (
          <OnboardingBanner
            onNavigateTab={(tab) => setActiveTab(tab)}
            liveSettings={settings}
            liveAvatarUrl={avatarUrl}
            liveGeburtstag={geburtstag || null}
            liveProfileEmail={profilEmail || null}
          />
        )}

        <Tabs value={activeTab} onValueChange={(v) => {
          // Ein gesperrter Bereich laesst sich auch ueber die Adresse nicht
          // oeffnen. Ein ausgegrauter Reiter allein waere keine Sperre.
          if (bereichZu(v)?.offen === false) return;
          setActiveTab(v);
        }} className="w-full">
          {/* Mobile Dropdown */}
          <div className="md:hidden mb-6">
            <Select value={activeTab} onValueChange={(v) => {
              if (bereichZu(v)?.offen === false) return;
              setActiveTab(v);
            }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Bereich wählen">{activeTabLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {bereiche.map((bereich) => (
                  <SelectItem key={bereich.slug} value={bereich.slug} disabled={!bereich.offen}>
                    {bereich.titel}
                    {bereich.abzeichen && <Badge variant="outline" className="ml-2 text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300 py-0 px-1">{bereich.abzeichen}</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/*
            Die waagerechte Reiterleiste ist am 14.09.2026 entfallen.

            Seit das Zahnrad ein Menue oeffnet, stand dieselbe Navigation
            zweimal auf dem Schirm, einmal oben rechts und einmal quer ueber
            die Seite. An ihrer Stelle steht jetzt nur noch der Name des
            offenen Bereichs: Man soll sehen, wo man ist, ohne dass die Liste
            aller Moeglichkeiten den Platz wegnimmt.

            Auf schmalen Schirmen bleibt die Auswahlliste darueber bestehen.
            Dort ist das Zahnrad kleiner und schwerer zu treffen, und eine
            Navigation ganz wegzunehmen, ohne dass die andere gut erreichbar
            ist, waere ein Rueckschritt.
          */}
          <div className="hidden md:flex items-center gap-2 border-b border-border pb-2 mb-6">
            <h2 className="text-base font-semibold text-foreground">{activeTabLabel}</h2>
            {bereichZu(activeTab)?.abzeichen && (
              <Badge variant="outline" className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300 py-0 px-1">
                {bereichZu(activeTab)?.abzeichen}
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              Bereich wechseln über das Zahnrad oben rechts
            </span>
          </div>

          {/* Profil */}
          <TabsContent value="profil" className="space-y-6">
            <Section title="Profilbild *" desc={isTippgeber ? "Lade ein Foto von dir hoch. Empfohlen: quadratisches Foto, gut ausgeleuchtet." : "Lade ein Foto von dir hoch. Es erscheint auf deiner Vertriebspartner-Microseite, im Online-Exposé und in der Investment-Analyse. Empfohlen: quadratisches Foto, gut ausgeleuchtet."}>
              <div className="flex items-center gap-5">
                <div className="relative" data-pflicht="avatar">
                  <Avatar className={`h-24 w-24 ring-2 ring-offset-2 ring-offset-background ${avatarUrl ? "ring-primary/40" : "ring-destructive/60"}`}>
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt="Profilbild" className="object-cover" />
                    ) : (
                      <AvatarFallback className="bg-muted text-xl">
                        {(settings.profil.vorname?.[0] || "?") + (settings.profil.nachname?.[0] || "")}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {avatarUploading && (
                    <div className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    id="avatar-upload-input"
                    type="file"
                    accept="image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.svg,.gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={avatarUploading}
                      onClick={() => document.getElementById("avatar-upload-input")?.click()}
                    >
                      <Camera className="h-4 w-4 mr-1.5" />
                      {avatarUrl ? "Foto ändern" : "Foto hochladen"}
                    </Button>
                    {avatarUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={avatarUploading}
                        onClick={async () => {
                          if (!authUser) return;
                          if (guardTestWrite("Profilbild entfernen")) return;
                          await supabase.from("profiles").update({ avatar_url: null }).eq("id", authUser.id);
                          setAvatarUrl(null);
                          try { localStorage.removeItem("mi_profile_avatar_url"); } catch { /* noop */ }
                          toast.success("Profilbild entfernt");
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1.5" /> Entfernen
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Beliebiges Format (JPG, PNG, WEBP, HEIC …) und beliebige Größe – das Bild wird
                    automatisch quadratisch zugeschnitten, optimiert und in WEBP konvertiert. Max. 25 MB.
                  </p>
                  {!avatarUrl && (
                    <p className="text-xs text-destructive font-medium">Pflichtfeld – bitte ein Profilbild hochladen.</p>
                  )}
                </div>
              </div>
            </Section>
            <Separator />
            <Section
              title="Persönliche Daten *"
              desc="Deine grundlegenden Informationen. Alle Felder sind Pflichtfelder."
            >
              <div className="grid grid-cols-2 gap-4">
                <Field label="Vorname *" value={settings.profil.vorname} onChange={v => updateProfil("vorname", v)} required dataPflicht="vorname" />
                <Field label="Nachname *" value={settings.profil.nachname} onChange={v => updateProfil("nachname", v)} required dataPflicht="nachname" />
                <Field
                  label="Telefon *"
                  value={settings.profil.telefon}
                  onChange={v => updateProfil("telefon", v.replace(/[^0-9+\s]/g, ""))}
                  required
                  type="tel"
                  inputMode="tel"
                  pattern="[0-9+\s]*"
                  placeholder="z. B. +49 170 1234567"
                  dataPflicht="telefon"
                />
                <Field label="Position *" value={settings.profil.position} disabled required dataPflicht="position" />
                <Field
                  label="E-Mail *"
                  value={profilEmail}
                  onChange={v => setProfilEmail(v)}
                  required
                  type="email"
                  inputMode="email"
                  placeholder="name@firma.de"
                  className="col-span-2"
                  dataPflicht="email"
                />
                {!isTippgeber && (
                <div className="space-y-1.5" data-pflicht="geburtstag">
                  <label className="text-sm font-semibold text-foreground block mb-1.5">Geburtsdatum *</label>
                  <DateInput
                    value={geburtstag}
                    onChange={v => {
                      // Einmal gesetztes Geburtsdatum darf nicht versehentlich geleert werden.
                      // Korrekturen bleiben möglich, solange ein gültiger Wert übergeben wird.
                      if (!v && geburtstag) {
                        toast.info("Geburtsdatum kann nicht entfernt werden – bitte ein gültiges Datum eingeben.");
                        return;
                      }
                      setGeburtstag(v);
                      // Sofort lokal cachen – bleibt beim Tab-Wechsel/Reload erhalten.
                      if (authUser && v) {
                        try { localStorage.setItem(`mi_profile_geburtstag_${authUser.id}`, v); } catch { /* noop */ }
                      }
                    }}
                    className={`max-w-[200px] ${!geburtstag ? "border-destructive/50" : ""}`}
                  />
                  {!geburtstag && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
                </div>
                )}
              </div>
              {!isSetterin && !isTippgeber && (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/60" />
                    <span>
                      Deine Daten (Telefon, E-Mail) werden auf der <a href="/berater-microseite" className="text-primary hover:underline font-medium">Vertriebspartner-Landingpage</a>, der <strong>Investment-Analyse</strong> und dem <strong>Online-Exposé</strong> angezeigt, wenn du den Link teilst.
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/60" />
                    <span>
                      <strong>Mobilnummer</strong> und <strong>E-Mail</strong> erscheinen auf dem Online-Exposé als direkte Kontaktmöglichkeiten für Interessenten.
                    </span>
                  </div>
                </div>
              )}
            </Section>

            {/* Ausweisdokument gehoert zu den persoenlichen Daten. */}
            {authUser?.id && (
              <>
                <Separator />
                <Section
                  title="Ausweisdokument *"
                  desc="Dein Personalausweis oder Reisepass. Pflicht fuer die Zusammenarbeit."
                >
                  <PflichtunterlagenCard
                    userId={authUser.id}
                    nurArt="ausweis"
                    onGeaendert={() => setUnterlagenVersion((n) => n + 1)}
                  />
                </Section>
              </>
            )}

            <Separator />
            {!isTippgeber && (
            <Section title="Gewerbedaten *" desc="Informationen zu deinem Unternehmen bzw. zu dir als Einzelunternehmer / Freiberufler. Diese Angaben sind Pflicht.">
              <GewerbedatenForm
                value={settings.gewerbedaten}
                onSave={async (g) => { await saveSettings({ ...settings, gewerbedaten: g }); }}
                flushRef={gewerbedatenFlushRef}
                userId={authUser?.id}
                vorname={settings.profil?.vorname}
                nachname={settings.profil?.nachname}
              />

              {/* Die Erlaubnis nach § 34c gehoert zu den Gewerbedaten. */}
              {authUser?.id && (
                <div className="mt-6">
                  <PflichtunterlagenCard
                    userId={authUser.id}
                    nurArt="gewerbe"
                    onGeaendert={() => setUnterlagenVersion((n) => n + 1)}
                  />
                </div>
              )}
            </Section>
            )}
            <SaveButton
              onClick={handleSaveClick}
              disabled={profilUnvollstaendig}
              disabledReason={profilUnvollstaendig ? `Bitte fülle alle Pflichtfelder aus: ${profilFehler.map(f => f.label).join(", ")}` : undefined}
              highlight={highlightSave}
              containerRef={saveButtonRef}
            />
            {showBuchungslink && (
              <>
                <Separator />
                <div ref={buchungslinkSectionRef} className="scroll-mt-24">
                <Section title="Buchungskalender-Links" desc="Hinterlege deine Buchungskalender (z. B. Calendly, Fantastical, Cal.com). Jeder Link wird an der Stelle verwendet, die unter ihm steht. Was du nicht ausfüllst, taucht nirgends auf.">
                  <div className="flex justify-end -mt-2 mb-3">
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => navigate("/einstellungen/buchungskalender-anleitung")}>
                      <Info className="h-4 w-4" /> Mehr Details &amp; Einrichtungs-Anleitung
                    </Button>
                  </div>

                  {/*
                    Der Hinweis steht einmal ueber allen vier Feldern und nicht
                    viermal darunter. Er gilt fuer jeden der Kalender gleich,
                    und viermal derselbe Satz liest sich niemand durch.
                  */}
                  <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                    Alle hier hinterlegten Kalender stehen dem Kunden auch auf deiner eigenen Terminseite zur
                    Auswahl. Die erzeugst du im Kundenprofil unter „Meeting erstellen“, bei „Kunde wählt selbst“.
                    Der Kunde bucht dort in deinem Kalender und bestätigt danach Datum und Uhrzeit, damit der
                    Termin sofort in seiner Akte steht.
                  </div>

                  <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <CalendarCheck className="h-5 w-5 text-primary mt-1 shrink-0" />
                      <div className="flex-1">
                        <Field
                          label="Erstgespräch · 15 bis 20 Minuten, Telefon · Buchungslink"
                          value={buchungslink}
                          onChange={v => {
                            setBuchungslink(v);
                            if (authUser) {
                              try {
                                if (v) localStorage.setItem(`mi_profile_buchungslink_${authUser.id}`, v);
                                else localStorage.removeItem(`mi_profile_buchungslink_${authUser.id}`);
                              } catch { /* noop */ }
                            }
                          }}
                          placeholder="https://calendly.com/dein-name/erstgespraech-15min"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          {savedBuchungslink && savedBuchungslink === buchungslink.trim() ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
                              <CheckCircle className="h-3 w-3" /> Link hinterlegt
                            </span>
                          ) : <span />}
                          {buchungslink.trim() !== savedBuchungslink && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingBuchungslink || !authUser}
                              onClick={async () => {
                                if (!authUser) return;
                                setSavingBuchungslink(true);
                                const v = buchungslink.trim();
                                const { error } = await supabase.from("profiles").update({ buchungslink: v || null }).eq("id", authUser.id);
                                setSavingBuchungslink(false);
                                if (error) { toast.error("Speichern fehlgeschlagen: " + error.message); return; }
                                setSavedBuchungslink(v);
                                try {
                                  if (v) localStorage.setItem(`mi_profile_buchungslink_${authUser.id}`, v);
                                  else localStorage.removeItem(`mi_profile_buchungslink_${authUser.id}`);
                                } catch { /* noop */ }
                                toast.success("Erstgesprächs-Link gespeichert");
                              }}
                            >
                              <Save className="h-3.5 w-3.5 mr-1" /> {savingBuchungslink ? "Speichere…" : (savedBuchungslink ? "Aktualisieren" : "Speichern")}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>
                            Dieser Link wird auf deiner persönlichen Landingpage angezeigt. Interessenten buchen sich darüber selbst in dein Erstgespräch ein (Telefon, 15 bis 20 Minuten). Auch die Setterin nutzt diesen Link, wenn sie ein Erstgespräch für dich einbucht.
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-2 mt-3">
                    <div className="flex items-start gap-2">
                      <CalendarCheck className="h-5 w-5 text-primary mt-1 shrink-0" />
                      <div className="flex-1">
                        <Field
                          label="Beratungsgespräch · 45 Minuten · Buchungslink"
                          value={beratungslink}
                          onChange={v => {
                            setBeratungslink(v);
                            if (authUser) {
                              try {
                                if (v) localStorage.setItem(`mi_profile_beratungslink_${authUser.id}`, v);
                                else localStorage.removeItem(`mi_profile_beratungslink_${authUser.id}`);
                              } catch { /* noop */ }
                            }
                          }}
                          placeholder="https://calendly.com/dein-name/beratungsgespraech-60min"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          {savedBeratungslink && savedBeratungslink === beratungslink.trim() ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
                              <CheckCircle className="h-3 w-3" /> Link hinterlegt
                            </span>
                          ) : <span />}
                          {beratungslink.trim() !== savedBeratungslink && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingBeratungslink || !authUser}
                              onClick={async () => {
                                if (!authUser) return;
                                setSavingBeratungslink(true);
                                const v = beratungslink.trim();
                                const { error } = await supabase.from("profiles").update({ beratungslink: v || null }).eq("id", authUser.id);
                                setSavingBeratungslink(false);
                                if (error) { toast.error("Speichern fehlgeschlagen: " + error.message); return; }
                                setSavedBeratungslink(v);
                                try {
                                  if (v) localStorage.setItem(`mi_profile_beratungslink_${authUser.id}`, v);
                                  else localStorage.removeItem(`mi_profile_beratungslink_${authUser.id}`);
                                } catch { /* noop */ }
                                toast.success("Beratungsgesprächs-Link gespeichert");
                              }}
                            >
                              <Save className="h-3.5 w-3.5 mr-1" /> {savingBeratungslink ? "Speichere…" : (savedBeratungslink ? "Aktualisieren" : "Speichern")}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>
                            Dieser Link wird im Kundenprofil im Erstgesprächs-Skript (Punkt 18 „Terminvereinbarung") angezeigt. So kannst du direkt am Ende deines Erstgesprächs gemeinsam mit dem Kunden den 45&#8209;minütigen Beratungstermin einbuchen.
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-2 mt-3">
                    <div className="flex items-start gap-2">
                      <CalendarCheck className="h-5 w-5 text-primary mt-1 shrink-0" />
                      <div className="flex-1">
                        <Field
                          label="Objektgespräch – 60 Min · Buchungslink"
                          value={objektlink}
                          onChange={setObjektlink}
                          placeholder="https://calendly.com/dein-name/objektgespraech-60min"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          {savedObjektlink && savedObjektlink === objektlink.trim() ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
                              <CheckCircle className="h-3 w-3" /> Link hinterlegt
                            </span>
                          ) : <span />}
                          {objektlink.trim() !== savedObjektlink && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingObjektlink || !authUser}
                              onClick={async () => {
                                if (!authUser) return;
                                setSavingObjektlink(true);
                                const v = objektlink.trim();
                                const { error } = await supabase.from("profiles").update({ objektlink: v || null } as never).eq("id", authUser.id);
                                setSavingObjektlink(false);
                                if (error) {
                                  // Fehlt die Spalte, ist die Migration 20260921170000 noch
                                  // nicht gelaufen. Das sagen wir klar, statt eine technische
                                  // Meldung durchzureichen.
                                  const fehlt = /does not exist|schema cache/i.test(error.message || "");
                                  toast.error(fehlt
                                    ? "Dieses Feld ist in der Datenbank noch nicht angelegt. Bitte kurz bei der Technik melden."
                                    : "Speichern fehlgeschlagen: " + error.message);
                                  return;
                                }
                                setSavedObjektlink(v);
                                toast.success("Objektgespräch, Link gespeichert");
                              }}
                            >
                              <Save className="h-3.5 w-3.5 mr-1" /> {savingObjektlink ? "Speichere…" : (savedObjektlink ? "Aktualisieren" : "Speichern")}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>Dieser Link steht im Kundenprofil unter „Meeting erstellen“. Damit buchst du gemeinsam mit dem Kunden den Termin, in dem ihr die konkreten Objekte durchgeht.</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-2 mt-3">
                    <div className="flex items-start gap-2">
                      <CalendarCheck className="h-5 w-5 text-primary mt-1 shrink-0" />
                      <div className="flex-1">
                        <Field
                          label="Finanzierungsgespräch – 60 Min · Buchungslink"
                          value={finanzierungslink}
                          onChange={setFinanzierungslink}
                          placeholder="https://calendly.com/dein-name/finanzierungsgespraech-60min"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          {savedFinanzierungslink && savedFinanzierungslink === finanzierungslink.trim() ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
                              <CheckCircle className="h-3 w-3" /> Link hinterlegt
                            </span>
                          ) : <span />}
                          {finanzierungslink.trim() !== savedFinanzierungslink && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingFinanzierungslink || !authUser}
                              onClick={async () => {
                                if (!authUser) return;
                                setSavingFinanzierungslink(true);
                                const v = finanzierungslink.trim();
                                const { error } = await supabase.from("profiles").update({ finanzierungslink: v || null } as never).eq("id", authUser.id);
                                setSavingFinanzierungslink(false);
                                if (error) {
                                  // Fehlt die Spalte, ist die Migration 20260921170000 noch
                                  // nicht gelaufen. Das sagen wir klar, statt eine technische
                                  // Meldung durchzureichen.
                                  const fehlt = /does not exist|schema cache/i.test(error.message || "");
                                  toast.error(fehlt
                                    ? "Dieses Feld ist in der Datenbank noch nicht angelegt. Bitte kurz bei der Technik melden."
                                    : "Speichern fehlgeschlagen: " + error.message);
                                  return;
                                }
                                setSavedFinanzierungslink(v);
                                toast.success("Finanzierungsgespräch, Link gespeichert");
                              }}
                            >
                              <Save className="h-3.5 w-3.5 mr-1" /> {savingFinanzierungslink ? "Speichere…" : (savedFinanzierungslink ? "Aktualisieren" : "Speichern")}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>Dieser Link steht im Kundenprofil unter „Meeting erstellen“. Damit buchst du den Termin, in dem ihr Unterlagen, Konditionen und die Rate besprecht.</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </Section>
                </div>
                <Separator />
                <MetaPixelSection
                  dbLoaded={dbLoaded}
                  dbSettings={dbSettings}
                  settings={settings}
                  saveSettings={saveSettings}
                  kannSpeichern={!!authUser}
                  userId={authUser?.id}
                  istAdmin={isAdmin}
                />
              </>
            )}
            <Dialog open={showOnboardingDialog} onOpenChange={setShowOnboardingDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {dialogVariant === "confirm" && "Buchungslink hinterlegt – jetzt speichern?"}
                    {dialogVariant === "choice" && "Profil vollständig – noch ein optionaler Schritt?"}
                    {dialogVariant === "simple" && "Profil vollständig – jetzt speichern?"}
                  </DialogTitle>
                  <DialogDescription>
                    {dialogVariant === "confirm" &&
                      "Dein Buchungskalender-Link ist eingetragen. Möchtest du jetzt speichern und loslegen? Du kannst den Link später jederzeit unter Einstellungen anpassen."}
                    {dialogVariant === "choice" &&
                      "Alle Pflichtfelder sind ausgefüllt. Möchtest du jetzt direkt ins CRM, oder vorher noch deinen Buchungskalender-Link hinterlegen? Den Link kannst du später jederzeit unter Einstellungen nachtragen."}
                    {dialogVariant === "simple" &&
                      "Alle Pflichtfelder sind ausgefüllt. Möchtest du jetzt speichern und loslegen?"}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  {dialogVariant === "choice" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowOnboardingDialog(false);
                        setDismissedForBuchungslink(true);
                        setTimeout(() => {
                          buchungslinkSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                          buchungslinkSectionRef.current?.querySelector<HTMLInputElement>("input")?.focus();
                        }, 80);
                      }}
                    >
                      <CalendarCheck className="h-4 w-4 mr-2" />
                      Buchungslink noch hinterlegen
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      setShowOnboardingDialog(false);
                      setDismissedForBuchungslink(false);
                      void handleSave();
                    }}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Speichern & loslegen
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="e-mail" className="space-y-6">
            <Section title="E-Mail-Signatur" desc="Wird automatisch an jede ausgehende E-Mail angehängt. Du kannst sie per HTML frei gestalten.">
              <div className="flex items-center gap-2 mb-3">
                <Switch checked={settings.email.signatur.aktiv} onCheckedChange={v => updateSignatur("aktiv", v)} />
                <span className="text-sm">Signatur aktiv</span>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1.5">HTML-Signatur</label>
                <textarea
                  value={settings.email.signatur.html}
                  onChange={e => updateSignatur("html", e.target.value)}
                  rows={10}
                  className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shadow-sm transition-shadow focus-visible:shadow-md"
                  placeholder="<p>Mit freundlichen Grüßen</p>&#10;<p><strong>Max Mustermann</strong></p>"
                />
              </div>
              <Card className="p-4 bg-muted/30 mt-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Vorschau</p>
                <div className="text-sm" dangerouslySetInnerHTML={{ __html: settings.email.signatur.html }} />
              </Card>
            </Section>
            <Separator />
            <Section title="E-Mail-Konten" desc="Verbinde deine E-Mail-Konten für die IMAP-Synchronisierung. E-Mails werden automatisch in der Sidebar unter E-Mail angezeigt.">
              {settings.email.zusatzKonten.map(konto => (
                <Card key={konto.id} className="p-4 flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4" /> {konto.email}</p>
                    <p className="text-xs text-muted-foreground">{konto.typ} · {konto.imapServer}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Bearbeiten" onClick={() => openEditEmail(konto)}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Löschen" onClick={() => setDeleteEmailId(konto.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </Card>
              ))}

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={openAddEmail}><Plus className="h-4 w-4 mr-1" /> E-Mail-Konto hinzufügen</Button>
                {settings.email.zusatzKonten.length > 0 && (
                  <Button variant="outline" size="sm" onClick={syncEmails} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Synchronisiere…" : "Jetzt synchronisieren"}
                  </Button>
                )}
              </div>

              <Dialog open={emailDialog} onOpenChange={(open) => { setEmailDialog(open); if (!open) setEditEmailId(null); }}>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editEmailId ? "E-Mail-Konto bearbeiten" : "E-Mail-Konto hinzufügen"}</DialogTitle></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <Field label="E-Mail-Adresse" value={newEmail.email} onChange={v => setNewEmail({ ...newEmail, email: v })} placeholder="max@example.com" />
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="IMAP Server" value={newEmail.imapServer} onChange={v => setNewEmail({ ...newEmail, imapServer: v })} placeholder="imap.example.com" />
                      <Field label="SMTP Server" value={newEmail.smtpServer} onChange={v => setNewEmail({ ...newEmail, smtpServer: v })} placeholder="smtp.example.com" />
                    </div>
                    <Field label="Benutzername" value={newEmail.benutzername} onChange={v => setNewEmail({ ...newEmail, benutzername: v })} placeholder="Benutzername oder E-Mail" />
                    <Field label="Passwort" value={newEmail.passwort} onChange={v => setNewEmail({ ...newEmail, passwort: v })} type="password" placeholder="Passwort / App-Passwort" />
                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setEmailDialog(false)}>Abbrechen</Button>
                      <Button onClick={saveEmailKonto} disabled={!newEmail.email}>{editEmailId ? "Speichern" : "Hinzufügen"}</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </Section>
            <Separator />
            <Section title="Synchronisierung" desc="Lege fest, wie deine E-Mails synchronisiert werden sollen.">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Automatische Synchronisierung</p>
                    <p className="text-xs text-muted-foreground">E-Mails werden im Hintergrund abgerufen</p>
                  </div>
                  <Switch checked={settings.email.syncOptionen?.autoSync || false} onCheckedChange={v => updateEmailSyncOption("autoSync", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Nur ungelesene E-Mails</p>
                    <p className="text-xs text-muted-foreground">Synchronisiert nur neue, ungelesene Nachrichten</p>
                  </div>
                  <Switch checked={settings.email.syncOptionen?.nurUngelesen || false} onCheckedChange={v => updateEmailSyncOption("nurUngelesen", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Benachrichtigung bei neuen E-Mails</p>
                    <p className="text-xs text-muted-foreground">Zeige eine Benachrichtigung bei neuen Nachrichten</p>
                  </div>
                  <Switch checked={settings.benachrichtigungen.kanaele.email} onCheckedChange={v => saveSettings({ ...settings, benachrichtigungen: { ...settings.benachrichtigungen, kanaele: { ...settings.benachrichtigungen.kanaele, email: v } } })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">E-Mail-Signatur anhängen</p>
                    <p className="text-xs text-muted-foreground">Fügt deine Signatur automatisch an ausgehende E-Mails an</p>
                  </div>
                  <Switch checked={settings.email.signatur.aktiv} onCheckedChange={v => updateSignatur("aktiv", v)} />
                </div>
              </div>
            </Section>
            <SaveButton onClick={handleSave} />
          </TabsContent>

          {/* Kalender */}
          <TabsContent value="kalender" className="space-y-6">
            <Section
              title="Eigenen Kalender verbinden"
              desc="Google oder Apple. Danach siehst du deine Termine im CRM-Kalender, und Termine aus dem CRM werden dort eingetragen."
            >
              <KalenderKonten />
            </Section>
            <Separator />
            <Section title="Synchronisation" desc="Lege fest, was aus dem CRM in deinen Kalender geschrieben wird.">
              {([
                { key: "termine", t: "Termine automatisch eintragen", d: "Ein im CRM angelegtes Meeting wird in deinen verbundenen Kalender geschrieben" },
                { key: "followUp", t: "Follow-up Erinnerungen", d: "Ein geplantes Follow-up wird als halbstündige Erinnerung in deinen verbundenen Kalender geschrieben" },
                { key: "rueckrichtung", t: "Änderungen aus dem Kalender übernehmen", d: "Verschiebst du einen CRM-Termin in deinem Kalender, zieht das CRM beim nächsten Öffnen des Kalenders nach. Nur Termine, die das CRM selbst angelegt hat. Gelöscht wird im CRM nichts, du bekommst nur einen Hinweis" },
              ] as { key: keyof KalenderSyncOptionen; t: string; d: string }[]).map((item) => (
                <div key={item.key} className="flex items-start gap-3 py-3">
                  <Checkbox
                    checked={kalenderSyncOptionen[item.key]}
                    onCheckedChange={(v) => updateSyncOption(item.key, !!v)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">{item.t}</p>
                    <p className="text-xs text-muted-foreground">{item.d}</p>
                  </div>
                </div>
              ))}
            </Section>
            <SaveButton onClick={handleSave} />
          </TabsContent>

          {/* Abwesenheit */}
          <TabsContent value="abwesenheit" className="space-y-6">
            <Section
              title="Abwesenheit und Vertretung"
              desc="Trage ein, wann du nicht da bist und wer dich vertritt. Deine Vertretung sieht in dieser Zeit deine Leads und bekommt deren Benachrichtigungen. Die Zuständigkeit bleibt bei dir, an der Provision ändert sich nichts."
            >
              {authUser?.id ? (
                <AbwesenheitCard userId={authUser.id} />
              ) : (
                <p className="text-sm text-muted-foreground">Anmeldung wird geladen...</p>
              )}
            </Section>
          </TabsContent>

          {/* Benachrichtigungen */}
          <TabsContent value="benachrichtigungen" className="space-y-6">
            {/*
              Die Karte "KI-Tageslimit" ist am 14.09.2026 auf Christians
              Wunsch entfallen.

              Sie zeigte jedem immer "0 / 50", auch dem Admin, weil sie unter
              einem anderen Schluessel suchte als `ki-assistant` schreibt und
              weil die Tabelle nur Admins lesen liess. Beides war repariert,
              Christian wollte die Anzeige danach trotzdem nicht.

              Die Begrenzung selbst bleibt bestehen: `ki-assistant` zaehlt
              weiter mit und weist ab 50 Anfragen am Tag zurueck. Entfallen
              ist nur die Anzeige.
            */}
            <Section title="Wie du benachrichtigt wirst" desc="Wähle aus, wo du deine Benachrichtigungen sehen möchtest.">
              {[
                { key: "email", t: "E-Mails", d: "Wird an deine E-Mail-Adresse gesendet.", on: settings.benachrichtigungen.kanaele.email },
                { key: "feed", t: "Feed (Glockensymbol)", d: "Werden in der Navigationsleiste als Glockensymbol angezeigt.", on: settings.benachrichtigungen.kanaele.feed },
                { key: "browser", t: "Browser", d: "Erscheinen auf deinem Bildschirm, wenn du nicht im CRM aktiv bist.", on: settings.benachrichtigungen.kanaele.browser },
                { key: "popup", t: "Pop-up", d: "Erscheinen für wenige Sekunden auf deinem Bildschirm, wenn du im CRM aktiv bist.", on: settings.benachrichtigungen.kanaele.popup },
              ].map((n) => (
                <div key={n.key} className="flex items-start gap-3 py-3">
                  <Switch checked={n.on} onCheckedChange={(v) => {
                    saveSettings({ ...settings, benachrichtigungen: { ...settings.benachrichtigungen, kanaele: { ...settings.benachrichtigungen.kanaele, [n.key]: v } } });
                    if (n.key === "browser" && v) {
                      subscribeToPush().then(sub => {
                        if (!sub) toast.error("Browser-Benachrichtigungen wurden blockiert. Bitte erlaube sie in den Browser-Einstellungen.");
                        else toast.success("Push-Benachrichtigungen aktiviert – auch wenn das CRM zu ist.");
                      });
                    }
                    if (n.key === "browser" && !v) {
                      unsubscribeFromPush().catch(() => {});
                    }
                  }} />
                  <div>
                    <p className="text-sm font-medium">{n.t}</p>
                    <p className="text-xs text-muted-foreground">{n.d}</p>
                  </div>
                </div>
              ))}
            </Section>
            {!isKunde && (
              <>
                <Separator />
                <Section title="Worüber du benachrichtigt wirst" desc="Wähle aus, welche Themen dir wichtig sind.">
                  {[
                    { key: "leads", t: "Neue Leads", d: "Wenn dir ein neuer Lead zugewiesen wird." },
                    { key: "termine", t: "Termine & Follow-ups", d: "Erinnerungen an bevorstehende Termine." },
                    { key: "pipeline", t: "Pipeline-Änderungen", d: "Wenn ein Lead die Pipeline-Stufe wechselt." },
                    { key: "provisionen", t: "Provisionen & Abrechnungen", d: "Neue Abrechnungen oder Provisionsbenachrichtigungen." },
                    { key: "team", t: "Team-Aktivitäten", d: "Wenn Teampartner Aktionen durchführen." },
                    { key: "system", t: "System-Updates", d: "Wartungsarbeiten, neue Features und Ankündigungen." },
                  ].map((n) => (
                    <div key={n.key} className="flex items-start gap-3 py-3">
                      <Checkbox checked={(settings.benachrichtigungen.themen as any)[n.key]} onCheckedChange={(v) => {
                        saveSettings({ ...settings, benachrichtigungen: { ...settings.benachrichtigungen, themen: { ...settings.benachrichtigungen.themen, [n.key]: !!v } } });
                      }} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">{n.t}</p>
                        <p className="text-xs text-muted-foreground">{n.d}</p>
                      </div>
                    </div>
                  ))}
                </Section>
              </>
            )}
            <p className="text-xs text-muted-foreground italic">
              Änderungen werden automatisch gespeichert.
            </p>
          </TabsContent>

          {/* Protokoll */}
          <TabsContent value="protokoll" className="space-y-6">
            <Section title="Protokoll" desc="Zeige Benutzeraktionen an, die in deinem Account durchgeführt wurden.">
              <Tabs defaultValue="anmeldeverlauf" className="w-full">
                <TabsList className="bg-transparent border-b border-border rounded-none p-0 h-auto mb-4">
                  {["Alle Protokolle", "Anmeldeverlauf", "Sicherheitsaktivitäten"].map((t) => (
                    <TabsTrigger
                      key={t}
                      value={t.toLowerCase().replace(/ /g, "")}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2 text-sm"
                    >
                      {t}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="anmeldeverlauf">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] uppercase tracking-wider">Aktion</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">Datum der Änderung</TableHead>
                        <TableHead className="text-[10px] uppercase tracking-wider">Quelle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { a: "Anmeldung erfolgreich", d: "20. Feb. 2026 09:12 CET", q: "192.168.1.42" },
                        { a: "Anmeldung erfolgreich", d: "19. Feb. 2026 08:45 CET", q: "10.0.0.15" },
                        { a: "Anmeldung erfolgreich", d: "18. Feb. 2026 08:30 CET", q: "192.168.1.42" },
                        { a: "Anmeldung fehlgeschlagen", d: "16. Feb. 2026 23:15 CET", q: "85.214.132.7" },
                      ].map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{row.a}</TableCell>
                          <TableCell className="text-sm">{row.d}</TableCell>
                          <TableCell className="text-sm">{row.q}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </Section>
          </TabsContent>

          {/* Sicherheit. Keine Zwei-Faktor-Einrichtung mehr: Interne melden sich
              seit dem 05.10.2026 nur mit Passwort an (Entscheidung Christian),
              ein Code wuerde nie abgefragt. Kunden richten sie unter
              /kunde/einstellungen ein. */}
          <TabsContent value="sicherheit" className="space-y-6">
            <ActiveSessionsSection />
          </TabsContent>

          {/* Tutorial (CRM-Tour) */}
          {hatBereich("tutorial") && (
            <TabsContent value="tutorial" className="space-y-6">
              <TutorialTab />
            </TabsContent>
          )}

          {/* E-Mail-Status (nur Admin/Inhaber) */}
          {hatBereich("e-mail-status") && (
            <TabsContent value="e-mail-status" className="space-y-6">
              <EmailStatusPanel />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <AlertDialog open={!!deleteEmailId} onOpenChange={(open) => { if (!open) setDeleteEmailId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>E-Mail-Konto löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du dieses E-Mail-Konto wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteEmailId) removeEmailKonto(deleteEmailId);
                setDeleteEmailId(null);
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

function Section({ title, desc, children, action }: { title: string; desc: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mb-4">{desc}</p>
        </div>
        {action && <div className="flex-shrink-0 pt-0.5">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Gewerbedaten-Formular mit lokalem State + onBlur-Save.
 * Verhindert, dass jeder Tastendruck einen DB-Roundtrip auslöst.
 * Beim Unmount (z. B. Tab-Wechsel oder Navigation aus den Einstellungen) wird
 * automatisch geflusht, falls der User zwischenzeitlich getippt hat.
 */
type Gewerbedaten = {
  rechtsform: string;
  firmenname: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  land: string;
};

const RECHTSFORMEN = [
  "Einzelunternehmen",
  "Freiberufler",
  "e.K. (eingetragener Kaufmann)",
  "GbR",
  "OHG",
  "KG",
  "GmbH & Co. KG",
  "UG (haftungsbeschränkt)",
  "GmbH",
  "AG",
  "Sonstige",
];

function GewerbedatenForm({
  value,
  onSave,
  flushRef,
  userId,
  vorname,
  nachname,
}: {
  value: Gewerbedaten;
  onSave: (g: Gewerbedaten) => void | Promise<void>;
  flushRef?: React.MutableRefObject<(() => Gewerbedaten | null) | null>;
  userId?: string;
  vorname?: string;
  nachname?: string;
}) {
  const storageKey = userId ? `mi_profile_gewerbedaten_${userId}` : null;
  const [local, setLocal] = useState<Gewerbedaten>(() => {
    if (!storageKey) return value;
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Partial<Gewerbedaten>;
        return { ...value, ...parsed };
      }
    } catch { /* noop */ }
    return value;
  });
  const dirtyRef = useRef(false);
  const latestRef = useRef(local);
  latestRef.current = local;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Externe Änderungen (z. B. Realtime-Sync) übernehmen, solange wir nicht gerade getippt haben.
  useEffect(() => {
    if (dirtyRef.current) return;
    setLocal(value);
  }, [value]);

  const flush = (): Gewerbedaten | null => {
    if (!dirtyRef.current) return null;
    dirtyRef.current = false;
    const snap = latestRef.current;
    try { void onSaveRef.current(snap); } catch { /* noop */ }
    return snap;
  };

  // Imperative Flush-Handle für den parent (handleSave).
  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flush;
    return () => {
      if (flushRef.current === flush) flushRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushRef]);

  // Beim Unmount flushen, falls noch ungespeicherte Änderungen vorhanden sind.
  useEffect(() => {
    return () => { flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (field: keyof Gewerbedaten) => (v: string) => {
    dirtyRef.current = true;
    setLocal((prev) => {
      const next = { ...prev, [field]: v };
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* noop */ }
      }
      return next;
    });
  };

  const isEinzel = local.rechtsform === "Einzelunternehmen" || local.rechtsform === "Freiberufler";
  const fullName = `${(vorname || "").trim()} ${(nachname || "").trim()}`.trim();

  // Bei Einzelunternehmen / Freiberufler automatisch den vollen Namen als Firmenname setzen.
  useEffect(() => {
    if (!isEinzel) return;
    if (!fullName) return;
    if (local.firmenname === fullName) return;
    dirtyRef.current = true;
    setLocal((prev) => {
      const next = { ...prev, firmenname: fullName };
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* noop */ }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEinzel, fullName]);

  const setRechtsform = (v: string) => {
    dirtyRef.current = true;
    setLocal((prev) => {
      const willBeEinzel = v === "Einzelunternehmen" || v === "Freiberufler";
      const nextFirma = willBeEinzel ? fullName : (prev.rechtsform === "Einzelunternehmen" || prev.rechtsform === "Freiberufler" ? "" : prev.firmenname);
      const next = { ...prev, rechtsform: v, firmenname: nextFirma };
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* noop */ }
      }
      return next;
    });
    // Direkt persistieren, damit die Folgefelder (Firmenname/Adresse-Label) sofort korrekt sind.
    setTimeout(() => flush(), 0);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div data-pflicht="rechtsform">
          <label className="text-sm font-semibold text-foreground block mb-1.5">Rechtsform *</label>
          <Select value={local.rechtsform || ""} onValueChange={setRechtsform}>
            <SelectTrigger className={!local.rechtsform?.trim() ? "border-destructive/50" : ""}>
              <SelectValue placeholder="Rechtsform wählen" />
            </SelectTrigger>
            <SelectContent>
              {RECHTSFORMEN.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!local.rechtsform?.trim() && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
        </div>
        <div data-pflicht="firmenname">
          <label className="text-sm font-semibold text-foreground block mb-1.5">Firmenname *</label>
          <Input
            value={local.firmenname || ""}
            onChange={(e) => setField("firmenname")(e.target.value)}
            onBlur={flush}
            placeholder={isEinzel ? "Wird automatisch aus Vor- und Nachname übernommen" : "Firmenname eingeben"}
            disabled={isEinzel}
            className={!local.firmenname?.trim() ? "border-destructive/50" : ""}
          />
          {isEinzel && (
            <p className="text-xs text-muted-foreground mt-1">
              Bei Einzelunternehmen / Freiberufler wird automatisch dein Vor- und Nachname verwendet.
            </p>
          )}
          {!local.firmenname?.trim() && !isEinzel && (
            <p className="text-xs text-destructive mt-1">Pflichtfeld</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground mb-2">
          {isEinzel ? "Sitz des Einzelunternehmens *" : "Firmenadresse *"}
        </p>
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <FieldBlur label="Straße *" value={local.strasse} onChange={setField("strasse")} onBlur={flush} placeholder="z.B. Hauptstraße" required dataPflicht="gw_strasse" />
          <FieldBlur label="Hausnummer *" value={local.hausnummer} onChange={setField("hausnummer")} onBlur={flush} placeholder="z.B. 12a" required dataPflicht="gw_hausnummer" />
        </div>
        <div className="grid grid-cols-[140px_1fr] gap-4 mt-4">
          <FieldBlur label="PLZ *" value={local.plz} onChange={setField("plz")} onBlur={flush} placeholder="z.B. 80331" required dataPflicht="gw_plz" />
          <FieldBlur label="Ort *" value={local.ort} onChange={setField("ort")} onBlur={flush} placeholder="z.B. München" required dataPflicht="gw_ort" />
        </div>
        <div className="mt-4">
          <FieldBlur label="Land *" value={local.land || "Deutschland"} onChange={setField("land")} onBlur={flush} placeholder="z.B. Deutschland" required />
        </div>
      </div>
    </div>
  );
}

function FieldBlur({
  label, value, onChange, onBlur, placeholder, required, dataPflicht,
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur: () => void;
  placeholder?: string; required?: boolean; dataPflicht?: string;
}) {
  const trimmed = value?.trim() ?? "";
  const isEmpty = required && !trimmed;
  return (
    <div data-pflicht={dataPflicht}>
      <label className="text-sm font-semibold text-foreground block mb-1.5">{label}</label>
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={isEmpty ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}
      />
      {isEmpty && <p className="text-xs text-destructive mt-1">Pflichtfeld</p>}
    </div>
  );
}

/**
 * Meta Pixel fuer die eigene Landingpage.
 *
 * Der Vertriebspartner traegt hier seine eigene Pixel-ID ein. Seit dem
 * 27.09.2026 nur mit Anlage 4 zum Vertrag, mit Bestandsschutz oder als Admin
 * (darfMetaPixelSetzen); Entfernen geht immer. Die Sperre hier ist nur
 * Anzeige, der Server entscheidet selbst. Gespeichert wird im user_settings-JSON unter
 * marketing.metaPixelId, mit Inline-Speichern-Knopf wie beim Buchungslink.
 * Akzeptiert wird nur eine reine Zahlenfolge, damit weder Skripte noch
 * sonstiger Unsinn in den Einstellungen landen.
 */
function MetaPixelSection({
  dbLoaded,
  dbSettings,
  settings,
  saveSettings,
  kannSpeichern,
  userId,
  istAdmin,
}: {
  dbLoaded: boolean;
  dbSettings: EinstellungenData | null;
  settings: EinstellungenData;
  saveSettings: (s: EinstellungenData) => Promise<boolean>;
  kannSpeichern: boolean;
  userId?: string;
  istAdmin: boolean;
}) {
  const [metaPixelId, setMetaPixelId] = useState("");
  const [savedMetaPixelId, setSavedMetaPixelId] = useState("");
  const [saving, setSaving] = useState(false);

  // Conversion-API-Token: Es wird nur gemerkt, OB eines hinterlegt ist. Der
  // gespeicherte Wert selbst wird nach dem Speichern nie wieder angezeigt.
  const [tokenStatus, setTokenStatus] = useState<"laden" | "fehlt_tabelle" | "vorhanden" | "leer">("laden");
  const [tokenEingabe, setTokenEingabe] = useState("");
  const [tokenEingabeOffen, setTokenEingabeOffen] = useState(false);
  const [tokenSpeichert, setTokenSpeichert] = useState(false);
  const [serverErlaubt, setServerErlaubt] = useState<boolean | null>(null);
  const [statusFehler, setStatusFehler] = useState("");
  const [statusStand, setStatusStand] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const status = await ladeCapiTokenStatus(userId);
      if (cancelled) return;
      setServerErlaubt(status.pixelErlaubt);
      setStatusFehler(status.fehler || "");
      if (status.tabelleFehlt) setTokenStatus("fehlt_tabelle");
      else setTokenStatus(status.hinterlegt ? "vorhanden" : "leer");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, statusStand]);

  const darfSetzen = darfMetaPixelSetzen({
    istAdmin,
    serverErlaubt,
    gespeichertePixelId: savedMetaPixelId,
    tokenHinterlegt: tokenStatus === "vorhanden",
  });

  const tokenSpeichern = async () => {
    if (!userId) return;
    const wert = tokenEingabe.trim();
    if (!wert) {
      toast.error("Bitte zuerst das Token aus dem Meta Events Manager einfügen.");
      return;
    }
    setTokenSpeichert(true);
    const ergebnis = await speichereCapiToken(userId, wert);
    setTokenSpeichert(false);
    if (ergebnis.tabelleFehlt) {
      setTokenStatus("fehlt_tabelle");
      toast.error("Diese Funktion ist noch nicht freigeschaltet.");
      return;
    }
    if (!ergebnis.ok) {
      toast.error("Speichern fehlgeschlagen: " + (ergebnis.fehler || "unbekannter Fehler"));
      return;
    }
    setTokenEingabe("");
    setTokenEingabeOffen(false);
    setTokenStatus("vorhanden");
    toast.success("Conversion-API-Token hinterlegt");
  };

  const tokenLoeschen = async () => {
    if (!userId) return;
    setTokenSpeichert(true);
    const ergebnis = await loescheCapiToken(userId);
    setTokenSpeichert(false);
    if (!ergebnis.ok) {
      toast.error("Löschen fehlgeschlagen: " + (ergebnis.fehler || "unbekannter Fehler"));
      return;
    }
    setTokenStatus("leer");
    setTokenEingabeOffen(false);
    setTokenEingabe("");
    toast.success("Conversion-API-Token entfernt");
  };

  // Gespeicherte Pixel-ID aus den geladenen Einstellungen uebernehmen.
  useEffect(() => {
    if (!dbLoaded) return;
    const wert = dbSettings?.marketing?.metaPixelId;
    if (typeof wert === "string") {
      setMetaPixelId(wert);
      setSavedMetaPixelId(wert);
    }
  }, [dbLoaded, dbSettings]);

  const speichern = async (wertVorgabe?: string) => {
    const wert = (wertVorgabe ?? metaPixelId).trim();
    if (wert && !darfSetzen) {
      toast.error(META_PIXEL_OHNE_ANLAGE_4_HINWEIS);
      return;
    }
    if (wert && !istGueltigeMetaPixelId(wert)) {
      toast.error("Die Pixel-ID ist eine reine Zahlenfolge (etwa 15 Stellen) aus dem Meta Events Manager.");
      return;
    }
    setSaving(true);
    // Entfernen laeuft ueber den Server: Pixel-ID, Token und Bestandsschutz
    // in einem Schritt (Codex-Pruefung 27.09.2026, A4-07). Danach wird der
    // leere Wert auch hier gespeichert, damit ein spaeteres Speichern anderer
    // Einstellungen die alte ID nicht zurueckschreibt.
    if (!wert && userId) {
      const entfernt = await entferneMetaPixel(userId);
      if (!entfernt.ok) {
        setSaving(false);
        toast.error("Entfernen fehlgeschlagen: " + (entfernt.fehler || "unbekannter Fehler"));
        return;
      }
    }
    const ok = await saveSettings({
      ...settings,
      marketing: { ...(settings.marketing || {}), metaPixelId: wert },
    });
    setSaving(false);
    if (!ok) return;
    setMetaPixelId(wert);
    setSavedMetaPixelId(wert);
    toast.success(wert ? "Meta Pixel-ID gespeichert" : "Meta Pixel-ID entfernt");
    // Mit der Pixel-ID loescht der Server auch das Token und beendet einen
    // Bestandsschutz. Den neuen Stand deshalb frisch holen.
    if (!wert) setStatusStand((n) => n + 1);
  };

  return (
    <Section
      title="Meta Pixel für Deine Landingpage"
      desc="Optional: Wenn Du eigene Werbeanzeigen auf Facebook oder Instagram schaltest, kannst Du hier Dein Meta Pixel mit Deiner persönlichen Landingpage verbinden."
    >
      <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-2">
        <Field
          label="Meta Pixel-ID"
          value={metaPixelId}
          onChange={(v) => setMetaPixelId(v.replace(/\D/g, "").slice(0, 20))}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="z. B. 123456789012345"
          disabled={!darfSetzen}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {savedMetaPixelId && savedMetaPixelId === metaPixelId.trim() ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
              <CheckCircle className="h-3 w-3" /> Pixel-ID hinterlegt
            </span>
          ) : <span />}
          {darfSetzen && metaPixelId.trim() !== savedMetaPixelId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving || !kannSpeichern}
              onClick={() => speichern()}
            >
              <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Speichere…" : (savedMetaPixelId ? "Aktualisieren" : "Speichern")}
            </Button>
          )}
          {!darfSetzen && !!savedMetaPixelId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving || !kannSpeichern}
              onClick={() => speichern("")}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Entfernen
            </Button>
          )}
        </div>
        {!darfSetzen && (
          <p className="text-xs text-foreground mt-1 flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{META_PIXEL_OHNE_ANLAGE_4_HINWEIS}</span>
          </p>
        )}
        {statusFehler && (
          <p className="text-xs text-destructive mt-1 flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{statusFehler}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            Trage hier ausschließlich Deine eigene Pixel-ID aus Deinem Meta Events Manager ein. Die ID ist eine reine Zahlenfolge. Besucher Deiner Landingpage werden dann an Deinen Meta-Account gemeldet, allerdings erst, nachdem sie auf der Landingpage eingewilligt haben. Zum Entfernen das Feld leeren und speichern.
            {" "}Dein Firmenname und Deine Firmenadresse aus dem Profil (Gewerbedaten) stehen dann auf Deiner Partnerseite im Datenschutzhinweis, denn für das Pixel sind Du und OS Immobilien gemeinsam verantwortlich.
          </span>
        </p>
        {savedMetaPixelId && !pixelVerantwortlicherAus(settings.gewerbedaten, `${settings.profil?.vorname ?? ""} ${settings.profil?.nachname ?? ""}`) && (
          <p role="alert" className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>Hinterlege deine Geschäftsanschrift (Profil, Gewerbedaten: Straße, PLZ und Ort), sonst kann dein Pixel nicht geladen werden.</span>
          </p>
        )}
      </div>

      <div data-ui="card" className="rounded-lg border bg-card p-4 space-y-2 mt-3">
        <label className="text-sm font-semibold text-foreground block">Conversion-API-Token (empfohlen)</label>
        {tokenStatus === "fehlt_tabelle" && (
          <p className="text-xs text-muted-foreground">
            Die serverseitige Meldung an Meta ist vorbereitet, aber noch nicht freigeschaltet. Bitte melde Dich beim Administrator.
          </p>
        )}
        {tokenStatus === "laden" && (
          <p className="text-xs text-muted-foreground">Wird geladen…</p>
        )}
        {tokenStatus !== "fehlt_tabelle" && tokenStatus !== "laden" && (
          <>
            {tokenStatus === "vorhanden" && !tokenEingabeOffen ? (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
                  <CheckCircle className="h-3 w-3" /> Token hinterlegt
                </span>
                <div className="flex items-center gap-2">
                  {darfSetzen && (
                    <Button type="button" size="sm" variant="outline" disabled={tokenSpeichert} onClick={() => setTokenEingabeOffen(true)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Ersetzen
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" disabled={tokenSpeichert} onClick={tokenLoeschen}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Löschen
                  </Button>
                </div>
              </div>
            ) : !darfSetzen ? (
              <p className="text-xs text-muted-foreground">Kein Token hinterlegt.</p>
            ) : (
              <div className="space-y-2">
                <Input
                  type="password"
                  value={tokenEingabe}
                  onChange={(e) => setTokenEingabe(e.target.value)}
                  placeholder="Token aus dem Meta Events Manager einfügen"
                  autoComplete="off"
                />
                <div className="flex items-center justify-end gap-2">
                  {tokenEingabeOffen && (
                    <Button type="button" size="sm" variant="ghost" disabled={tokenSpeichert} onClick={() => { setTokenEingabeOffen(false); setTokenEingabe(""); }}>
                      Abbrechen
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" disabled={tokenSpeichert || !kannSpeichern || !tokenEingabe.trim()} onClick={tokenSpeichern}>
                    <Save className="h-3.5 w-3.5 mr-1" /> {tokenSpeichert ? "Speichere…" : "Token speichern"}
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Erstelle das Token in Deinem Meta Events Manager direkt unter Deinem eigenen Pixel (Einstellungen, Bereich Conversions API, „Zugriffsschlüssel generieren"). Damit melden wir Deine Leads zusätzlich vom Server an Meta, das macht Deine Kampagnen-Auswertung deutlich zuverlässiger. Aus Sicherheitsgründen wird das Token nach dem Speichern nie wieder angezeigt.
              </span>
            </p>
          </>
        )}
      </div>
    </Section>
  );
}

function Field({ label, value, placeholder, type, className, onChange, required, inputMode, pattern, dataPflicht, disabled }: {
  label: string; value: string; placeholder?: string; type?: string; className?: string;
  onChange?: (v: string) => void; required?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "search" | "url" | "none";
  pattern?: string;
  dataPflicht?: string;
  disabled?: boolean;
}) {
  const trimmed = value?.trim() ?? "";
  const isEmpty = required && onChange && !trimmed;
  const isEmail = type === "email";
  const emailInvalid = isEmail && !!trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const showError = isEmpty || emailInvalid;
  const errorMsg = isEmpty ? "Pflichtfeld" : emailInvalid ? "Bitte gültige E-Mail-Adresse eingeben" : "";
  return (
    <div className={className} data-pflicht={dataPflicht}>
      <label className="text-sm font-semibold text-foreground block mb-1.5">{label}</label>
      <Input
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        defaultValue={!onChange ? value : undefined}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        pattern={pattern}
        disabled={disabled}
        className={`${showError ? "border-destructive/50 focus-visible:ring-destructive/30" : ""} ${disabled ? "bg-muted/50 cursor-not-allowed opacity-70" : ""}`}
      />
      {showError && <p className="text-xs text-destructive mt-1">{errorMsg}</p>}
    </div>
  );
}

export function ActiveSessionsSection() {
  const { authUser, logout } = useUser();
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadSessions = async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-sessions", {
        body: { action: "list" },
      });
      if (!error && data?.sessions) {
        setSessions(data.sessions);
      }
    } catch (e) {
      console.error("Load sessions error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSessions(); }, [authUser]);

  const handleLogoutAll = async () => {
    setLoggingOut(true);
    try {
      await supabase.functions.invoke("manage-sessions", {
        body: { action: "logout-all" },
      });
      // Das eigentliche Beenden: "global" löscht serverseitig alle Sitzungen
      // dieses Kontos. Scheitert es, soll keine Erfolgsmeldung erscheinen.
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      await logout();
      toast.success(t("portal.security.sessions_ended"));
    } catch (e: any) {
      toast.error(t("portal.settings.error_prefix") + friendlyError(e, undefined, portalSprache()));
    } finally {
      setLoggingOut(false);
    }
  };

  const formatDate = (dateStr: string) => datumUhrzeitText(dateStr, portalSprache()) || dateStr;

  // Die Edge Function speichert „Unbekannt“ als Wert. Übersetzt wird nur die Anzeige.
  const anzeige = (wert: string | null | undefined) =>
    !wert || wert === "Unbekannt" ? t("portal.security.unknown") : wert;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground">{t("portal.security.sessions_title")}</h3>
          <p className="text-sm text-muted-foreground">{t("portal.security.sessions_sub")}</p>
        </div>
        {sessions.length > 1 && (
          <Button variant="outline" size="sm" onClick={handleLogoutAll} disabled={loggingOut} className="text-destructive border-destructive/30 hover:bg-destructive/10">
            <LogOut className="h-4 w-4 mr-1" />
            {loggingOut ? t("portal.security.signing_out") : t("portal.security.sign_out_all")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("portal.security.loading")}
        </div>
      ) : sessions.length === 0 ? (
        <Card className="p-4 border-dashed">
          <p className="text-sm text-muted-foreground text-center">{t("portal.security.no_sessions")}</p>
        </Card>
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 rounded-md border border-border/40 p-2 bg-muted/20">
          <p className="text-xs text-muted-foreground px-1 pb-1">{t("portal.security.sessions_total", { count: sessions.length })}</p>
          {sessions.map((s, i) => (
            <Card key={s.id} className={`p-4 flex items-center justify-between ${i === 0 ? "border-primary/30 bg-primary/5" : ""}`}>
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {anzeige(s.browser)} · {anzeige(s.os)}
                    {/* Echtes Leerzeichen: Mit reinem Außenabstand stand beim
                        Umbruch und beim Vorlesen „macOSAktuelle Sitzung“. */}
                    {i === 0 && <>{" "}<Badge variant="outline" className="ml-1 text-[10px] border-primary/50 text-primary">{t("portal.security.current_session")}</Badge></>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(s.logged_in_at)} · {t("portal.security.ip", { ip: anzeige(s.ip_address) })}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SaveButton({ onClick, disabled, disabledReason, highlight, containerRef }: { onClick?: () => void; disabled?: boolean; disabledReason?: string; highlight?: boolean; containerRef?: React.RefObject<HTMLDivElement> }) {
  return (
    <div ref={containerRef} className="flex flex-col items-end pt-4 gap-2 scroll-mt-24">
      {disabled && disabledReason && (
        <p className="text-xs text-destructive font-medium">{disabledReason}</p>
      )}
      {highlight && !disabled && (
        <p className="text-sm font-semibold text-primary animate-fade-in">
          ✓ Alle Pflichtfelder ausgefüllt – jetzt speichern und loslegen!
        </p>
      )}
      <Button
        className={`bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
          highlight && !disabled
            ? "animate-pulse ring-4 ring-primary/40 ring-offset-2 scale-110 shadow-lg shadow-primary/50"
            : ""
        }`}
        onClick={onClick}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        <Save className="h-4 w-4 mr-2" />
        Speichern
      </Button>
    </div>
  );
}

export default Einstellungen;
