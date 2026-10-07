import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { compressToSquareAvatar } from "@/lib/imageCompression";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LazyImage } from "@/components/ui/lazy-image";
import { Plus, Mail, Phone, MessageCircle, Pencil, Trash2, Upload, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useUser } from "@/contexts/UserContext";
import { getAppConfig, setAppConfig } from "@/lib/appConfigStore";
import { createChat, getChats, type ChatParticipant } from "@/lib/chatStore";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { kennungZuName } from "@/lib/beraterNamensabgleich";
import { useToast } from "@/hooks/use-toast";
import { PhoneInput } from "@/components/ui/phone-input";

interface Kontakt {
  id: string;
  name: string;
  position: string;
  beschreibung: string;
  email: string;
  telefon: string;
  avatarColor: string;
  avatarUrl?: string;
  chatErlaubt: boolean;
}

interface Abteilung {
  id: string;
  name: string;
  kontakte: Kontakt[];
}

/**
 * Startbelegung der Ansprechpartner-Seite.
 *
 * Sie greift nur, solange unter dem Schlüssel "ansprechpartner" nichts in der
 * App-Konfiguration steht. Im Betrieb kommen die Karten von dort, die Seite
 * lässt sich ja bearbeiten.
 *
 * Vorher standen hier fünf Personen aus der Anfangszeit, die es im Haus so
 * nicht mehr gibt, darunter eine mit ausgedachter Firmenadresse und der
 * Berechtigung, angeschrieben zu werden. Jetzt spiegelt die Liste den echten
 * Stand. Telefonnummern stehen bewusst nicht im Quelltext: sie sind
 * personenbezogen, in der App-Konfiguration ohnehin gepflegt, und diese Liste
 * wird im Betrieb nie angezeigt.
 */
const initialAbteilungen: Abteilung[] = [
  {
    id: "1",
    name: "Geschäftsführung",
    kontakte: [
      { id: "k1", name: "Christian Kurz", position: "CEO & Founder", beschreibung: "Geschäftsführung, Strategie, Unternehmensentwicklung", email: "office@more.immo", telefon: "", avatarColor: "bg-blue-500", chatErlaubt: true },
    ],
  },
  {
    id: "2",
    name: "Vertrieb & Partnermanagement",
    kontakte: [
      { id: "k2", name: "Christian Peetz", position: "COO", beschreibung: "Skalierung & Strukturierung, CRM Management, Partnerbetreuung, Vertriebssteuerung, HR", email: "c.peetz@more.immo", telefon: "", avatarColor: "bg-emerald-500", chatErlaubt: true },
    ],
  },
  { id: "3", name: "Finanzierungspartner", kontakte: [] },
  { id: "4", name: "Marketing", kontakte: [] },
  { id: "5", name: "Buchhaltung", kontakte: [] },
];

function getInitials(name: string) {
  const parts = name.split(" ");
  return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : name.substring(0, 2).toUpperCase();
}

export default function Ansprechpartner() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const canEdit = ["admin", "inhaber", "vertriebsleiter"].includes(user.role);

  const handleStartChat = async (kontakt: Kontakt) => {
    // Get current auth user id
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const currentUserId = authUser?.id || "current";

    // Die Karte kennt nur den Namen. Ein Nutzer wird nur zugeordnet, wenn
    // genau einer so heisst; zwei Gleichnamige waeren geraten.
    const allUsers = loadAllUsers();
    const zielKennung = kennungZuName(kontakt.name, allUsers);
    const targetUser = zielKennung ? allUsers.find(u => u.id === zielKennung) : undefined;

    // Gibt es den Chat schon? Ueber die Kennungen, der Name nur ohne Treffer.
    const existingChats = getChats();
    const existingChat = existingChats.find(c =>
      c.typ === "intern" &&
      c.teilnehmer.some(t => (targetUser ? t.id === targetUser.id : t.name === kontakt.name)) &&
      c.teilnehmer.some(t => t.id === currentUserId)
    );

    if (existingChat) {
      navigate(`/chat?id=${existingChat.id}`);
      return;
    }

    // Build participants: current user + target contact
    const getInitials = (name: string) => name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);

    const creatorParticipant: ChatParticipant = {
      id: currentUserId,
      name: user.name,
      initials: getInitials(user.name),
      role: user.role,
    };

    const targetParticipant: ChatParticipant = {
      id: targetUser?.id || kontakt.id,
      name: kontakt.name,
      initials: getInitials(kontakt.name),
      role: kontakt.position || "Ansprechpartner",
    };

    const teilnehmer = [creatorParticipant, targetParticipant];

    // Auto-add admins if creator is not admin
    if (!["admin", "inhaber"].includes(user.role)) {
      const admins = allUsers.filter(u =>
        u.rolle && ["admin", "inhaber"].includes(u.rolle.toLowerCase())
      );
      for (const admin of admins) {
        if (!teilnehmer.some(t => t.id === admin.id)) {
          teilnehmer.push({
            id: admin.id,
            name: admin.name,
            initials: getInitials(admin.name),
            role: "Admin",
          });
        }
      }
    }

    const newChat = await createChat(
      kontakt.id,
      `Chat mit ${kontakt.name}`,
      "intern",
      user.name,
      "intern",
      teilnehmer,
      currentUserId,
    );

    toast({ title: "Chat eröffnet", description: `Direktchat mit ${kontakt.name}` });
    navigate(`/chat?id=${newChat.id}`);
  };

  const [abteilungen, setAbteilungen] = useState<Abteilung[]>(() => {
    return getAppConfig<Abteilung[]>("ansprechpartner", initialAbteilungen);
  });

  const updateAbteilungen = (updater: (prev: Abteilung[]) => Abteilung[]) => {
    setAbteilungen(prev => {
      const next = updater(prev);
      // Vom Nutzer ausgeloest: Ein Fehlschlag meldet sich selbst sichtbar.
      void setAppConfig("ansprechpartner", next);
      return next;
    });
  };

  // Drag state for sections
  const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null);
  const [dragOverSectionIdx, setDragOverSectionIdx] = useState<number | null>(null);

  // Drag state for contacts
  const [dragContact, setDragContact] = useState<{ abtId: string; kontaktIdx: number } | null>(null);
  const [dragOverContact, setDragOverContact] = useState<{ abtId: string; kontaktIdx: number } | null>(null);

  // Section drag handlers
  const handleSectionDragStart = (idx: number) => {
    setDragSectionIdx(idx);
    setDragContact(null);
  };

  const handleSectionDragOver = (e: React.DragEvent, idx: number) => {
    if (dragSectionIdx === null) return;
    e.preventDefault();
    setDragOverSectionIdx(idx);
  };

  const handleSectionDrop = (idx: number) => {
    if (dragSectionIdx === null || dragSectionIdx === idx) {
      setDragSectionIdx(null);
      setDragOverSectionIdx(null);
      return;
    }
    updateAbteilungen(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragSectionIdx, 1);
      arr.splice(idx, 0, moved);
      return arr;
    });
    setDragSectionIdx(null);
    setDragOverSectionIdx(null);
  };

  // Contact drag handlers
  const handleContactDragStart = (e: React.DragEvent, abtId: string, kontaktIdx: number) => {
    e.stopPropagation();
    setDragContact({ abtId, kontaktIdx });
    setDragSectionIdx(null);
  };

  const handleContactDragOver = (e: React.DragEvent, abtId: string, kontaktIdx: number) => {
    if (!dragContact) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverContact({ abtId, kontaktIdx });
  };

  const handleContactDrop = (targetAbtId: string, targetIdx: number) => {
    if (!dragContact) return;
    const { abtId: srcAbtId, kontaktIdx: srcIdx } = dragContact;

    updateAbteilungen(prev => {
      const arr = prev.map(a => ({ ...a, kontakte: [...a.kontakte] }));
      const srcAbt = arr.find(a => a.id === srcAbtId);
      const tgtAbt = arr.find(a => a.id === targetAbtId);
      if (!srcAbt || !tgtAbt) return prev;

      const [moved] = srcAbt.kontakte.splice(srcIdx, 1);
      tgtAbt.kontakte.splice(targetIdx, 0, moved);
      return arr;
    });
    setDragContact(null);
    setDragOverContact(null);
  };

  // Move section up/down helpers
  const moveSectionUp = (idx: number) => {
    if (idx === 0) return;
    updateAbteilungen(prev => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  };

  const moveSectionDown = (idx: number) => {
    updateAbteilungen(prev => {
      if (idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
  };

  // Move contact up/down within section
  const moveContactUp = (abtId: string, kIdx: number) => {
    if (kIdx === 0) return;
    updateAbteilungen(prev => prev.map(a => {
      if (a.id !== abtId) return a;
      const k = [...a.kontakte];
      [k[kIdx - 1], k[kIdx]] = [k[kIdx], k[kIdx - 1]];
      return { ...a, kontakte: k };
    }));
  };

  const moveContactDown = (abtId: string, kIdx: number) => {
    updateAbteilungen(prev => prev.map(a => {
      if (a.id !== abtId) return a;
      if (kIdx >= a.kontakte.length - 1) return a;
      const k = [...a.kontakte];
      [k[kIdx], k[kIdx + 1]] = [k[kIdx + 1], k[kIdx]];
      return { ...a, kontakte: k };
    }));
  };

  // Section dialog
  const [sectionDialog, setSectionDialog] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [editSectionId, setEditSectionId] = useState<string | null>(null);

  // Contact dialog
  const [kontaktDialog, setKontaktDialog] = useState(false);
  const [kontaktAbtId, setKontaktAbtId] = useState("");
  const [editKontaktId, setEditKontaktId] = useState<string | null>(null);
  const [kName, setKName] = useState("");
  const [kPosition, setKPosition] = useState("");
  const [kBeschreibung, setKBeschreibung] = useState("");
  const [kEmail, setKEmail] = useState("");
  const [kTelefon, setKTelefon] = useState("");
  const [kChatErlaubt, setKChatErlaubt] = useState(true);
  const [kAvatarUrl, setKAvatarUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openAddSection = () => { setSectionName(""); setEditSectionId(null); setSectionDialog(true); };
  const openEditSection = (abt: Abteilung) => { setSectionName(abt.name); setEditSectionId(abt.id); setSectionDialog(true); };

  const saveSection = () => {
    if (!sectionName.trim()) return;
    if (editSectionId) {
      updateAbteilungen(prev => prev.map(a => a.id === editSectionId ? { ...a, name: sectionName } : a));
    } else {
      updateAbteilungen(prev => [...prev, { id: Date.now().toString(), name: sectionName, kontakte: [] }]);
    }
    setSectionDialog(false);
  };

  const deleteSection = (id: string) => { updateAbteilungen(prev => prev.filter(a => a.id !== id)); };

  const openAddKontakt = (abtId: string) => {
    setKontaktAbtId(abtId); setEditKontaktId(null);
    setKName(""); setKPosition(""); setKBeschreibung(""); setKEmail(""); setKTelefon("");
    setKChatErlaubt(true); setKAvatarUrl("");
    setKontaktDialog(true);
  };

  const openEditKontakt = (abtId: string, kontakt: Kontakt) => {
    setKontaktAbtId(abtId); setEditKontaktId(kontakt.id);
    setKName(kontakt.name); setKPosition(kontakt.position); setKBeschreibung(kontakt.beschreibung);
    setKEmail(kontakt.email); setKTelefon(kontakt.telefon); setKChatErlaubt(kontakt.chatErlaubt);
    setKAvatarUrl(kontakt.avatarUrl || "");
    setKontaktDialog(true);
  };

  const saveKontakt = () => {
    if (!kName.trim()) return;
    const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500", "bg-emerald-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500", "bg-amber-500"];
    const kontakt: Kontakt = {
      id: editKontaktId || Date.now().toString(),
      name: kName, position: kPosition, beschreibung: kBeschreibung,
      email: kEmail, telefon: kTelefon,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
      avatarUrl: kAvatarUrl, chatErlaubt: kChatErlaubt,
    };
    updateAbteilungen(prev => prev.map(a => {
      if (a.id !== kontaktAbtId) return a;
      if (editKontaktId) return { ...a, kontakte: a.kontakte.map(k => k.id === editKontaktId ? { ...k, ...kontakt } : k) };
      return { ...a, kontakte: [...a.kontakte, kontakt] };
    }));
    setKontaktDialog(false);
  };

  const deleteKontakt = (abtId: string, kontaktId: string) => {
    updateAbteilungen(prev => prev.map(a => a.id === abtId ? { ...a, kontakte: a.kontakte.filter(k => k.id !== kontaktId) } : a));
  };

  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset, damit dieselbe Datei erneut gewählt werden kann
    e.target.value = "";
    if (!file) return;

    // Alle Bildformate & Größen erlauben – HEIC/HEIF werden anhand der Endung erkannt.
    const nameLower = file.name.toLowerCase();
    const isImageMime = file.type.startsWith("image/");
    const isImageExt = /\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff|heic|heif|avif|svg)$/i.test(nameLower);
    if (!isImageMime && !isImageExt) {
      toast({ title: "Falsches Format", description: "Bitte lade eine Bilddatei hoch.", variant: "destructive" });
      return;
    }
    // Schutz vor extrem großen Dateien (Browser-Speicher) – 50 MB reicht für volle iPhone-Auflösung.
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Datei zu groß", description: "Maximale Dateigröße ist 50 MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // Quadratischer Center-Crop + Re-Encode zu WebP/JPEG → garantiert browser-darstellbar
      const avatar = await compressToSquareAvatar(file, 512, 0.85);
      const ext = avatar.name.split(".").pop() || "webp";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("ansprechpartner")
        .upload(fileName, avatar, { upsert: true, contentType: avatar.type, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("ansprechpartner").getPublicUrl(fileName);
      if (!urlData?.publicUrl) throw new Error("Konnte öffentliche URL nicht erzeugen.");
      setKAvatarUrl(urlData.publicUrl);
      toast({ title: "Profilbild hochgeladen", description: "Vergiss nicht zu speichern." });
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({
        title: "Upload fehlgeschlagen",
        description: err?.message || "Bitte erneut versuchen oder anderes Bild wählen.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <PageHeader title="Ansprechpartner" />
          {canEdit && (
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={openAddSection}>
              <Plus className="h-4 w-4 mr-2" /> Abschnitt hinzufügen
            </Button>
          )}
        </div>

        {abteilungen.map((abt, abtIdx) => (
          <div
            key={abt.id}
            className={`space-y-4 transition-all ${canEdit ? "relative" : ""} ${dragOverSectionIdx === abtIdx && dragSectionIdx !== null ? "ring-2 ring-primary/40 rounded-lg" : ""}`}
            draggable={canEdit && dragContact === null}
            onDragStart={() => canEdit && handleSectionDragStart(abtIdx)}
            onDragOver={(e) => canEdit && handleSectionDragOver(e, abtIdx)}
            onDrop={() => canEdit && handleSectionDrop(abtIdx)}
            onDragEnd={() => { setDragSectionIdx(null); setDragOverSectionIdx(null); }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {canEdit && (
                  <div className="flex flex-col mr-1">
                    <button
                      onClick={() => moveSectionUp(abtIdx)}
                      disabled={abtIdx === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                      title="Nach oben"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveSectionDown(abtIdx)}
                      disabled={abtIdx === abteilungen.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                      title="Nach unten"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {canEdit && (
                  <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing" />
                )}
                <div className="w-1 h-6 bg-foreground rounded" />
                <h2 className="text-xl font-bold">{abt.name}</h2>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openAddKontakt(abt.id)}>
                    <Plus className="h-3 w-3 mr-1" /> Kontakt
                  </Button>
                  <button className="text-muted-foreground hover:text-foreground" onClick={() => openEditSection(abt)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="text-destructive hover:text-destructive/80" onClick={() => deleteSection(abt.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {abt.kontakte.map((k, kIdx) => (
                <div
                  key={k.id}
                  draggable={canEdit}
                  onDragStart={(e) => canEdit && handleContactDragStart(e, abt.id, kIdx)}
                  onDragOver={(e) => canEdit && handleContactDragOver(e, abt.id, kIdx)}
                  onDrop={(e) => { e.stopPropagation(); canEdit && handleContactDrop(abt.id, kIdx); }}
                  onDragEnd={() => { setDragContact(null); setDragOverContact(null); }}
                  className={`transition-all ${dragOverContact?.abtId === abt.id && dragOverContact?.kontaktIdx === kIdx && dragContact !== null ? "ring-2 ring-primary/40 rounded-lg" : ""}`}
                >
                  <Card className="hover:shadow-md transition-shadow overflow-hidden">
                    <CardContent className="p-0 flex">
                      {canEdit && (
                        <div className="flex flex-col items-center justify-center px-1.5 bg-muted/30 gap-1">
                          <button onClick={() => moveContactUp(abt.id, kIdx)} disabled={kIdx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                          <button onClick={() => moveContactDown(abt.id, kIdx)} disabled={kIdx === abt.kontakte.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      <div className="flex-1 space-y-2 p-4">
                        <h4 className="font-semibold">{k.name}</h4>
                        <p className="text-sm font-medium text-muted-foreground">{k.position}</p>
                        {k.beschreibung && <p className="text-xs text-muted-foreground">{k.beschreibung}</p>}
                        <div className="space-y-1">
                          {k.email && (
                            <a href={`mailto:${k.email}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {k.email}
                            </a>
                          )}
                          {k.telefon && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {k.telefon}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          {k.chatErlaubt && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleStartChat(k); }}>
                              <MessageCircle className="h-3 w-3 mr-1" /> Chat eröffnen
                            </Button>
                          )}
                          {canEdit && (
                            <>
                              <button className="text-muted-foreground hover:text-foreground" onClick={() => openEditKontakt(abt.id, k)}>
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button className="text-destructive hover:text-destructive/80" onClick={() => deleteKontakt(abt.id, k.id)}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="w-32 self-stretch flex-shrink-0 relative bg-muted/30 overflow-hidden">
                        {k.avatarUrl ? (
                          <LazyImage
                            src={k.avatarUrl}
                            alt={k.name}
                            className="absolute inset-0 h-full w-full object-cover"
                            wrapperClassName="absolute inset-0 h-full w-full"
                          />
                        ) : (
                          <div className={`absolute inset-0 ${k.avatarColor} flex items-center justify-center`}>
                            <span className="text-white text-2xl font-semibold">{getInitials(k.name)}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Section Dialog */}
        <Dialog open={sectionDialog} onOpenChange={setSectionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editSectionId ? "Abschnitt bearbeiten" : "Neuer Abschnitt"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label>Abschnittsname *</Label>
                <Input placeholder="z.B. Technik" value={sectionName} onChange={e => setSectionName(e.target.value)} />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setSectionDialog(false)}>Abbrechen</Button>
                <Button onClick={saveSection}>{editSectionId ? "Speichern" : "Hinzufügen"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Kontakt Dialog */}
        <Dialog open={kontaktDialog} onOpenChange={setKontaktDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editKontaktId ? "Kontakt bearbeiten" : "Neuer Kontakt"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 rounded-lg">
                  {kAvatarUrl ? <AvatarImage src={kAvatarUrl} className="rounded-lg object-cover" /> : null}
                  <AvatarFallback className="bg-muted text-muted-foreground text-lg rounded-lg">
                    {kName ? getInitials(kName) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="h-3 w-3 mr-1" /> {uploading ? "Lädt hoch…" : "Profilbild hochladen"}
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif,.avif" className="hidden" onChange={handleFileUpload} />
                  {kAvatarUrl && (
                    <button className="text-xs text-destructive ml-2" onClick={() => setKAvatarUrl("")}>Entfernen</button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Name *</Label><Input placeholder="Max Mustermann" value={kName} onChange={e => setKName(e.target.value)} /></div>
                <div><Label>Position</Label><Input placeholder="z.B. CEO" value={kPosition} onChange={e => setKPosition(e.target.value)} /></div>
              </div>
              <div><Label>Beschreibung</Label><Input placeholder="Zuständigkeiten..." value={kBeschreibung} onChange={e => setKBeschreibung(e.target.value)} /></div>
              <div><Label>E-Mail</Label><Input type="email" placeholder="email@beispiel.de" value={kEmail} onChange={e => setKEmail(e.target.value)} /></div>
              <div><Label>Telefon</Label><PhoneInput value={kTelefon} onChange={v => setKTelefon(v)} /></div>
              <div className="flex items-center gap-2">
                <Checkbox id="chatErlaubt" checked={kChatErlaubt} onCheckedChange={(v) => setKChatErlaubt(v === true)} />
                <Label htmlFor="chatErlaubt" className="text-sm cursor-pointer">Chat eröffnen erlauben</Label>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setKontaktDialog(false)}>Abbrechen</Button>
                <Button onClick={saveKontakt}>{editKontaktId ? "Speichern" : "Hinzufügen"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
