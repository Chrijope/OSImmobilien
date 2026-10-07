import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SidebarCounts {
  emails: number;
  followUps: number;
  empfehlungen: number;
  hvTickets: number;
  benachrichtigungen: number;
  objektEinreichungen: number;
  supportTickets: number;
}

const EMPTY: SidebarCounts = {
  emails: 0,
  followUps: 0,
  empfehlungen: 0,
  hvTickets: 0,
  benachrichtigungen: 0,
  objektEinreichungen: 0,
  supportTickets: 0,
};

export function useSidebarCounts(userId: string | undefined) {
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY);

  const fetchCounts = useCallback(async () => {
    if (!userId) return;

    const [
      emailRes,
      followUpRes,
      empfRes,
      hvRes,
      benachRes,
      einreichRes,
      supportRes,
    ] = await Promise.all([
      supabase
        .from("emails")
        .select("id", { count: "exact", head: true })
        .eq("benutzer_id", userId)
        .eq("gelesen", false),
      supabase
        .from("follow_ups")
        .select("id", { count: "exact", head: true })
        .eq("status", "offen"),
      supabase
        .from("empfehlungen")
        .select("id", { count: "exact", head: true })
        .eq("status", "neu"),
      supabase
        .from("hv_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "offen"),
      supabase
        .from("benachrichtigungen")
        .select("id", { count: "exact", head: true })
        .eq("benutzer_id", userId)
        .eq("gelesen", false),
      supabase
        .from("objekt_einreichungen")
        .select("id", { count: "exact", head: true })
        .eq("status", "eingereicht"),
      supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["neu", "offen", "in_bearbeitung"]),
    ]);

    setCounts({
      emails: emailRes.count || 0,
      followUps: followUpRes.count || 0,
      empfehlungen: empfRes.count || 0,
      hvTickets: hvRes.count || 0,
      benachrichtigungen: benachRes.count || 0,
      objektEinreichungen: einreichRes.count || 0,
      supportTickets: supportRes.count || 0,
    });
  }, [userId]);

  useEffect(() => {
    // Ohne Anmeldung kein Zaehler und kein Kanal. Sonst liefen Abfrage und
    // Abonnement nach dem Abmelden mit dem oeffentlichen Schluessel weiter.
    if (!userId) return;
    fetchCounts();

    // Refresh counts periodically (every 60s)
    const interval = setInterval(fetchCounts, 60_000);

    // Sofort-Refresh wenn Tickets im UI geändert werden (Status, Antwort, Löschen)
    const onTickets = () => fetchCounts();
    window.addEventListener("tickets-updated", onTickets);

    // Listen for realtime changes on benachrichtigungen
    const channel = supabase
      .channel("sidebar-counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "benachrichtigungen", filter: `benutzer_id=eq.${userId}` },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emails", filter: `benutzer_id=eq.${userId}` },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "objekt_einreichungen" },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "empfehlungen" },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follow_ups" },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hv_tickets" },
        () => fetchCounts()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      window.removeEventListener("tickets-updated", onTickets);
      supabase.removeChannel(channel);
    };
  }, [fetchCounts, userId]);

  return counts;
}
