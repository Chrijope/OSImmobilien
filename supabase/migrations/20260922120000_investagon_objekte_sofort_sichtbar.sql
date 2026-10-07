-- Objekte aus Investagon sind sofort sichtbar, nicht mehr Entwurf
--
-- WARUM
--
-- Der Import legte bisher jedes neue Objekt aus Investagon als Entwurf an
-- (`sichtbar = false`, `status = 'entwurf'`). Einen Entwurf sehen nur Admin
-- und Inhaber sowie der Objektpartner, der ihn angelegt hat. Im Vertrieb kam
-- ein neues Objekt damit erst nach einem zweiten Handgriff an, obwohl
-- Investagon die fuehrende Objektdatenbank ist und die Angaben dort bereits
-- geprueft sind.
--
-- Die Edge Function `investagon-import` setzt ab jetzt beim ERSTEN Anlegen
-- `sichtbar = true` und `status = 'freigegeben'`. Diese Migration zieht die
-- Objekte nach, die schon in der Datenbank liegen.
--
-- WAS SIE NICHT ANFASST
--
-- Von Hand angelegte Objekte. Sie tragen keine `meta->>investagonSlug` und
-- fallen aus der Bedingung heraus. Dort bleibt der Entwurf der Arbeitsschritt,
-- der er ist, und der Schieberegler fuer die Sichtbarkeit bleibt unveraendert.
--
-- ACHTUNG, EINMALIGE WIRKUNG
--
-- War ein Investagon-Objekt bewusst von Hand ausgeblendet, hebt diese
-- Migration das einmalig auf. Der Abgleich selbst tut das nicht: Bei einem
-- schon vorhandenen Objekt nimmt er `status` und `sichtbar` ausdruecklich aus
-- den Aenderungen heraus (siehe `ohneFreigabe` in der Edge Function). Ein
-- spaeter wieder ausgeblendetes Objekt bleibt also ausgeblendet.
--
-- Zurueckdrehen laesst sich das gezielt, weil jede hier geaenderte Zeile einen
-- Vermerk bekommt:
--
--   update public.objekte
--      set sichtbar = false,
--          status   = 'entwurf',
--          meta     = meta - 'entwurfAufgehobenAm'
--    where meta ? 'entwurfAufgehobenAm';
--
-- MEHRFACH AUSFUEHRBAR
--
-- Beim zweiten Lauf findet die Bedingung nichts mehr und es aendert sich
-- nichts.
--
-- PRUEFUNG (aendert nichts, muss 0 Entwuerfe melden):
--
--   select count(*) filter (where sichtbar and status = 'freigegeben') as freigegeben,
--          count(*) filter (where not sichtbar or status <> 'freigegeben') as entwurf
--     from public.objekte
--    where meta->>'investagonSlug' is not null;

UPDATE public.objekte
   SET sichtbar = true,
       status   = 'freigegeben',
       meta     = COALESCE(meta, '{}'::jsonb)
                  || jsonb_build_object('entwurfAufgehobenAm', to_char(now(), 'YYYY-MM-DD'))
 WHERE meta->>'investagonSlug' IS NOT NULL
   AND (sichtbar IS DISTINCT FROM true OR status IS DISTINCT FROM 'freigegeben');
