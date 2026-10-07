import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";

export const SIDEBAR_FAVORITES_MAX = 5;

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
    if (out.length >= SIDEBAR_FAVORITES_MAX) break;
  }
  return out;
}

export function useSidebarFavorites() {
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
        setFavorites(sanitize((data?.einstellungen as any)?.sidebarFavorites));
      } catch {
        /* keep current */
      }
    })();
    const channel = supabase
      .channel(`sidebar-favorites-${authUser.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_settings", filter: `user_id=eq.${authUser.id}` },
        (payload: any) => {
          setFavorites(sanitize(payload.new?.einstellungen?.sidebarFavorites));
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
        _patch: { sidebarFavorites: next } as any,
      });
      if (error) {
        console.error("sidebarFavorites: merge_user_settings fehlgeschlagen:", error);
        toast.error("Favoriten konnten nicht gespeichert werden.");
      }
    },
    [authUser?.id],
  );

  const isFavorite = useCallback((url: string) => favorites.includes(url), [favorites]);

  const toggleFavorite = useCallback(
    (url: string) => {
      if (favorites.includes(url)) {
        void persist(favorites.filter((f) => f !== url));
        return;
      }
      if (favorites.length >= SIDEBAR_FAVORITES_MAX) {
        toast.warning(
          `Maximal ${SIDEBAR_FAVORITES_MAX} Favoriten – bitte zuerst ein Lesezeichen entfernen.`,
        );
        return;
      }
      void persist([...favorites, url]);
    },
    [favorites, persist],
  );

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    canAddMore: favorites.length < SIDEBAR_FAVORITES_MAX,
    max: SIDEBAR_FAVORITES_MAX,
  };
}