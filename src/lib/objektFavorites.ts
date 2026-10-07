import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";

function sanitize(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Per-User Favoriten-Objekte (IDs). Persistiert atomar in user_settings.einstellungen.objekteFavorites.
 */
export function useObjektFavorites() {
  const { authUser } = useUser();
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    if (!authUser) {
      setFavorites([]);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_settings")
          .select("einstellungen")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (cancel) return;
        setFavorites(sanitize((data?.einstellungen as any)?.objekteFavorites));
      } catch {
        /* keep current */
      }
    })();
    const channel = supabase
      .channel(`objekt-favorites-${authUser.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_settings", filter: `user_id=eq.${authUser.id}` },
        (payload: any) => {
          setFavorites(sanitize(payload.new?.einstellungen?.objekteFavorites));
        },
      )
      .subscribe();
    return () => {
      cancel = true;
      supabase.removeChannel(channel);
    };
  }, [authUser?.id]);

  const persist = useCallback(
    async (next: string[]) => {
      if (!authUser) return;
      setFavorites(next);
      const { error } = await supabase.rpc("merge_user_settings" as any, {
        _user_id: authUser.id,
        _patch: { objekteFavorites: next } as any,
      });
      if (error) {
        console.error("objektFavorites: merge_user_settings fehlgeschlagen:", error);
        toast.error("Favoriten konnten nicht gespeichert werden.");
      }
    },
    [authUser?.id],
  );

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const toggleFavorite = useCallback(
    (id: string) => {
      if (favorites.includes(id)) {
        void persist(favorites.filter((f) => f !== id));
      } else {
        void persist([...favorites, id]);
      }
    },
    [favorites, persist],
  );

  return { favorites, isFavorite, toggleFavorite };
}