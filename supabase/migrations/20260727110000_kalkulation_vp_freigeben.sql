-- Kalkulation für Vertriebspartner freigeben
--
-- Die Seite /kalkulation-1 stand in keiner Rollen-Freigabe und war deshalb
-- für Vertriebspartner unsichtbar, obwohl sie das Standardwerkzeug im
-- Kundengespräch ist.
--
-- Hinweis: Vertriebsleiter und Backoffice haben die Route weiterhin nicht.
-- Das ist bewusst so gelassen, weil ausdrücklich nur der Vertriebspartner
-- freigegeben werden sollte.

INSERT INTO public.role_permissions (role, url)
VALUES ('vertriebspartner', '/kalkulation-1')
ON CONFLICT DO NOTHING;
