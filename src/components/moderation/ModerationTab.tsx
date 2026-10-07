import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Ban, CheckCircle, Flag, MessageSquare, ShieldAlert, ShieldCheck, Zap } from "lucide-react";
import { getMeldungen, getModerationsAktionen, updateMeldungStatus, createModerationsAktion, getStrikeCount, type Meldung, type ModerationsAktion } from "@/lib/moderationStore";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ProfileInfo {
  id: string;
  name: string;
  email?: string;
}

export default function ModerationTab() {
  const { authUser } = useUser();
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const [aktionen, setAktionen] = useState<ModerationsAktion[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Action dialog
  const [aktionDialog, setAktionDialog] = useState(false);
  const [aktionTarget, setAktionTarget] = useState<string>("");
  const [aktionTargetName, setAktionTargetName] = useState("");
  const [aktionTyp, setAktionTyp] = useState("warnung");
  const [aktionGrund, setAktionGrund] = useState("");
  const [aktionNotizen, setAktionNotizen] = useState("");
  const [aktionMeldungId, setAktionMeldungId] = useState<string | undefined>();
  const [strikeCount, setStrikeCount] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, a, p] = await Promise.all([
        getMeldungen(),
        getModerationsAktionen(),
        supabase.from("profiles").select("id, name, email").then(r => r.data || []),
      ]);
      setMeldungen(m);
      setAktionen(a);
      setProfiles(p as ProfileInfo[]);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const getProfileName = (id: string) => profiles.find(p => p.id === id)?.name || id.slice(0, 8);

  const handleStatusChange = async (mId: string, status: string) => {
    if (!authUser?.id) return;
    try {
      await updateMeldungStatus(mId, status, authUser.id);
      toast.success("Status aktualisiert");
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openAktionDialog = async (benutzerId: string, name: string, meldungId?: string) => {
    setAktionTarget(benutzerId);
    setAktionTargetName(name);
    setAktionMeldungId(meldungId);
    setAktionTyp("warnung");
    setAktionGrund("");
    setAktionNotizen("");
    const sc = await getStrikeCount(benutzerId);
    setStrikeCount(sc);
    setAktionDialog(true);
  };

  const handleAktionSubmit = async () => {
    if (!aktionGrund || !authUser?.id) {
      toast.error("Bitte Grund angeben.");
      return;
    }
    try {
      await createModerationsAktion({
        benutzer_id: aktionTarget,
        aktion: aktionTyp,
        grund: aktionGrund,
        meldung_id: aktionMeldungId,
        notizen: aktionNotizen || undefined,
        erstellt_von: authUser.id,
      });

      // If it's a "nachricht" type, also create a notification
      if (aktionTyp === "nachricht") {
        await supabase.from("benachrichtigungen").insert({
          benutzer_id: aktionTarget,
          titel: "⚠️ Hinweis der Administration",
          nachricht: aktionGrund,
          link: "/einstellungen",
        });
      }

      toast.success(
        aktionTyp === "sperre" ? "Profil wurde gesperrt." :
        aktionTyp === "freischaltung" ? "Profil wurde freigeschaltet." :
        aktionTyp === "strike" ? "Strike wurde vergeben." :
        aktionTyp === "nachricht" ? "Nachricht wurde zugestellt." :
        "Warnung wurde vermerkt."
      );
      setAktionDialog(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const aktionConfig: Record<string, { icon: typeof Flag; color: string; label: string }> = {
    warnung: { icon: AlertTriangle, color: "text-yellow-600", label: "Warnung" },
    strike: { icon: Zap, color: "text-orange-600", label: "Strike" },
    sperre: { icon: Ban, color: "text-red-600", label: "Sperre" },
    freischaltung: { icon: ShieldCheck, color: "text-green-600", label: "Freischaltung" },
    nachricht: { icon: MessageSquare, color: "text-blue-600", label: "Nachricht" },
  };

  const statusConfig: Record<string, { color: string; label: string }> = {
    offen: { color: "bg-red-100 text-red-700", label: "Offen" },
    geprueft: { color: "bg-green-100 text-green-700", label: "Geprüft" },
    abgelehnt: { color: "bg-gray-100 text-gray-600", label: "Abgelehnt" },
  };

  const offenCount = meldungen.filter(m => m.status === "offen").length;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="meldungen">
        <TabsList>
          <TabsTrigger value="meldungen" className="gap-1.5">
            <Flag className="h-4 w-4" /> Meldungen
            {offenCount > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-xs">{offenCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="aktionen" className="gap-1.5">
            <ShieldAlert className="h-4 w-4" /> Moderations-Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="meldungen" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Gemeldet von</TableHead>
                <TableHead>Grund</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meldungen.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Keine Meldungen vorhanden.
                  </TableCell>
                </TableRow>
              )}
              {meldungen.map(m => {
                const sc = statusConfig[m.status] || statusConfig.offen;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{new Date(m.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {m.typ === "chat_nachricht" ? "Chat" : "Profil"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{getProfileName(m.melder_id)}</TableCell>
                    <TableCell className="text-sm font-medium">{m.grund}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{m.beschreibung || "–"}</TableCell>
                    <TableCell>
                      <Badge className={sc.color}>{sc.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1.5 justify-end">
                        {m.status === "offen" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleStatusChange(m.id, "geprueft")}>
                              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Geprüft
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleStatusChange(m.id, "abgelehnt")}>
                              Ablehnen
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                // Try to find the reported user from referenz_id
                                openAktionDialog(m.referenz_id, getProfileName(m.referenz_id), m.id);
                              }}
                            >
                              <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Maßnahme
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="aktionen" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Nutzer</TableHead>
                <TableHead>Aktion</TableHead>
                <TableHead>Grund</TableHead>
                <TableHead>Durchgeführt von</TableHead>
                <TableHead>Notizen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aktionen.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Keine Moderationsaktionen vorhanden.
                  </TableCell>
                </TableRow>
              )}
              {aktionen.map(a => {
                const ac = aktionConfig[a.aktion] || aktionConfig.warnung;
                const AIcon = ac.icon;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{new Date(a.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</TableCell>
                    <TableCell className="text-sm font-medium">{getProfileName(a.benutzer_id)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <AIcon className={`h-4 w-4 ${ac.color}`} />
                        <span className="text-sm">{ac.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[250px] truncate">{a.grund}</TableCell>
                    <TableCell className="text-sm">{getProfileName(a.erstellt_von)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{a.notizen || "–"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={aktionDialog} onOpenChange={setAktionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Moderationsmaßnahme
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Maßnahme für: <strong>{aktionTargetName}</strong>
              {strikeCount > 0 && (
                <Badge variant="destructive" className="ml-2">{strikeCount} Strike{strikeCount > 1 ? "s" : ""}</Badge>
              )}
            </p>

            <div className="space-y-2">
              <Label>Art der Maßnahme *</Label>
              <Select value={aktionTyp} onValueChange={setAktionTyp}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warnung">⚠️ Warnung aussprechen</SelectItem>
                  <SelectItem value="strike">⚡ Strike vergeben</SelectItem>
                  <SelectItem value="sperre">🚫 Profil sperren</SelectItem>
                  <SelectItem value="freischaltung">✅ Profil freischalten</SelectItem>
                  <SelectItem value="nachricht">💬 Nachricht senden</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{aktionTyp === "nachricht" ? "Nachricht *" : "Begründung *"}</Label>
              <Textarea
                placeholder={aktionTyp === "nachricht" ? "Nachricht an den Nutzer..." : "Begründung der Maßnahme..."}
                value={aktionGrund}
                onChange={e => setAktionGrund(e.target.value)}
                rows={3}
              />
            </div>

            {aktionTyp !== "nachricht" && (
              <div className="space-y-2">
                <Label>Interne Notizen (optional)</Label>
                <Textarea
                  placeholder="Nur für Admins sichtbar..."
                  value={aktionNotizen}
                  onChange={e => setAktionNotizen(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            {aktionTyp === "sperre" && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                ⚠️ Das Profil wird sofort gesperrt. Der Nutzer kann sich nicht mehr anmelden, bis das Profil freigeschaltet wird.
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAktionDialog(false)}>Abbrechen</Button>
              <Button
                onClick={handleAktionSubmit}
                variant={aktionTyp === "sperre" ? "destructive" : "default"}
              >
                {aktionTyp === "sperre" ? "Profil sperren" :
                 aktionTyp === "freischaltung" ? "Freischalten" :
                 aktionTyp === "nachricht" ? "Nachricht senden" :
                 aktionTyp === "strike" ? "Strike vergeben" :
                 "Warnung aussprechen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
