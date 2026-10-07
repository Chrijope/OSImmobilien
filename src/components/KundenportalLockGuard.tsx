import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useTranslation } from "react-i18next";
import { istMeinPortalGesperrt } from "@/lib/kundenportalGesperrt";

/**
 * Blockiert das Kundenportal, wenn das Portal des Kunden gesperrt ist, und
 * zeigt statt des Inhalts einen ruhigen Hinweis.
 *
 * Seit dem 23.09.2026 ist das nicht mehr die einzige Sperre, sondern nur
 * noch die Anzeige dazu: Die Anmeldung ist gesperrt, und die Datenbank gibt
 * einem gesperrten Kunden keine Daten mehr heraus. Deshalb kann er auch
 * seinen eigenen Kontakt nicht mehr lesen, gefragt wird über
 * `kundenportal_gesperrt_fuer_mich`. Solange die Migration dazu fehlt, gilt
 * wie bisher `kontakte.meta.portalGesperrt`.
 */
export function KundenportalLockGuard({ children }: { children: React.ReactNode }) {
  const { user, authUser, logout } = useUser();
  const { t } = useTranslation();
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    if (user.role !== "kunde" || !authUser?.id) {
      setLocked(false);
      return;
    }

    let cancelled = false;
    const check = async () => {
      const antwort = await istMeinPortalGesperrt();
      if (cancelled) return;
      if (antwort === true) {
        setLocked(true);
        return;
      }

      // Sonst der Anzeigewert am eigenen Kontakt: solange die Migration fehlt,
      // und für Konten mit weiterer Rolle (etwa Tippgeber). Die sperrt die
      // Datenbank seit dem 04.10.2026 nicht mehr aus, nur diese Portalseite.
      const { data, error } = await supabase
        .from("kontakte")
        .select("meta")
        .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) console.warn("Portalsperre nicht lesbar:", error);
      const meta = (data?.meta as Record<string, unknown> | null) || {};
      setLocked(meta.portalGesperrt === true);
    };

    check();
    // Realtime listener: re-check on kontakte updates
    const channel = supabase
      .channel(`portal-lock-${authUser.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "kontakte" }, () => {
        check();
      })
      .subscribe();

    // Re-check every 30s as fallback
    const intv = setInterval(check, 30000);

    return () => {
      cancelled = true;
      clearInterval(intv);
      supabase.removeChannel(channel);
    };
  }, [user.role, authUser?.id]);

  if (user.role !== "kunde") return <>{children}</>;
  if (locked === null) return <>{children}</>;
  if (!locked) return <>{children}</>;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {/* Ruhig statt rot: Der Kunde hat nichts falsch gemacht, er soll nur wissen, an wen er sich wendet. */}
        <div className="w-14 h-14 rounded-full bg-muted text-muted-foreground mx-auto flex items-center justify-center">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">{t("portal.lock.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("portal.lock.text")}</p>
        <Button variant="outline" onClick={() => logout()} className="w-full">
          {t("portal.lock.sign_out")}
        </Button>
      </Card>
    </div>
  );
}
