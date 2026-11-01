/**
 * Ordner im CRM sind fest (Posteingang, Gesendet, Archiv, Papierkorb) und
 * werden beim Abholen den Ordnern des Postfachs zugeordnet (01.11.2026).
 * Die frühere Liste baute IMAP-Befehle aus ungeprüften Werten; diese
 * Function antwortet nur noch mit den festen Ordnern.
 */
import { antwort, corsHeaders } from "../_shared/mail-anfrage.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return antwort({ folders: [] });
});
