-- Selbstauskunft: Sichtbarkeit machen, ob die Einladung angekommen ist
--
-- Anlass: Die Karte "Online-Selbstauskunft" im Kundenprofil zeigte bisher nur
-- "Versendet: <Datum>". Damit weiss der Vertriebspartner nicht, ob die Mail im
-- Spam-Ordner liegt, ob der Kunde sie geoeffnet hat oder ob er den Knopf darin
-- angeklickt hat. Ein Nachfassen war deshalb immer ein Stochern im Nebel.
--
-- Die Loesung ist bewusst keine neue: Fuer den Vertrag gibt es dasselbe seit
-- 20260608150957 auf `signature_requests`. Hier stehen dieselben zwei Spalten
-- und dieselben zwei Setzfunktionen auf `sa_fill_tokens`, damit es im Projekt
-- ein Muster bleibt und nicht zwei.
--
-- Datenschutz: Gespeichert wird ausschliesslich ein Zeitstempel je Token. Es
-- werden keine IP-Adresse, kein Browser und kein Verweis erfasst. Beide
-- Zeitstempel werden nur einmal gesetzt (write-once), es entsteht also kein
-- Verlaufsprofil ueber mehrfaches Oeffnen. Genau so haelt es das vorhandene
-- Vertrags-Tracking.

ALTER TABLE public.sa_fill_tokens
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_opened_at  timestamptz;

-- Der Zaehlpixel in der Mail ruft das hier ueber die Edge Function
-- `track-sa-email` auf. SECURITY DEFINER, weil der Aufruf ohne Anmeldung
-- geschieht und die Tabelle sonst fuer anon gesperrt ist.
CREATE OR REPLACE FUNCTION public.mark_sa_email_opened(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sa_fill_tokens
     SET email_opened_at = now()
   WHERE token = _token
     AND email_opened_at IS NULL;
$$;

-- Wird beim Aufruf der oeffentlichen Selbstauskunft-Seite gesetzt. Das ist der
-- zuverlaessige Teil der Messung: Er haengt nicht daran, ob der Mailclient
-- Bilder laedt.
--
-- Ein Klick heisst zwangslaeufig, dass die Mail geoeffnet wurde. Deshalb wird
-- `email_opened_at` mitgesetzt, falls der Pixel blockiert war. Sonst stuende in
-- der Karte "Link geklickt, aber nie geoeffnet", und das waere Unsinn.
CREATE OR REPLACE FUNCTION public.mark_sa_link_opened(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sa_fill_tokens
     SET link_opened_at  = COALESCE(link_opened_at, now()),
         email_opened_at = COALESCE(email_opened_at, now())
   WHERE token = _token
     AND link_opened_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.mark_sa_email_opened(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sa_link_opened(text)  TO anon, authenticated;
