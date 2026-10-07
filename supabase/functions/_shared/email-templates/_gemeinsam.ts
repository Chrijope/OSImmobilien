/**
 * Die Naht zwischen den Anmeldemails und dem Hausstil.
 *
 * Warum es diesen Ordner ueberhaupt gibt
 * --------------------------------------
 * Die sechs Mails hier werden nicht von `send-transactional-email` verschickt,
 * sondern von `auth-email-hook`. Supabase ruft diesen Hook selbst auf, sobald
 * jemand sich registriert, eingeladen wird, sein Passwort zuruecksetzt oder
 * seine Adresse aendert. Der Hook bekommt die Nutzdaten von Supabase
 * (Bestaetigungslink, Einmalcode) und nicht aus unserem CRM. Deshalb liegen
 * die Vorlagen ausserhalb der Registry der 105 uebrigen Vorlagen: Es gibt
 * keinen Aufrufer im CRM, der sie unter einem Namen anfordern koennte.
 *
 * Dass sie ausserhalb der Registry liegen, war aber kein Grund, sie auch
 * ausserhalb des Layouts zu lassen. Genau das war der Zustand bis hierher:
 * ein zweites, aelteres Aussehen ohne Logo, ohne Hausschrift, ohne Markenbalken
 * und ohne Fusszeile, in schwarzen Knoepfen und Arial. Ausgerechnet die ersten
 * Mails, die ein neuer Partner von uns bekommt.
 *
 * Warum das eine Layout technisch passt
 * -------------------------------------
 * Beide Welten laufen in derselben Deno-Laufzeit, mit denselben Importen
 * (`npm:react@18.3.1`, `npm:@react-email/components@0.0.22`) und derselben
 * `deno.json` (`jsx: react-jsx`). `auth-email-hook` rendert mit demselben
 * `renderAsync`, einmal als HTML und einmal als Nur-Text. Es gab also keinen
 * technischen Grund fuer zwei Layouts, nur einen historischen: Der Ordner
 * stammt aus dem Geruest von Lovable und wurde beim Aufbau des gemeinsamen
 * Layouts uebersehen.
 *
 * Zwei Unterschiede bleiben, und die stehen als Einstellung in jeder Vorlage:
 *
 *   `intern` schaltet den Abmeldelink ab. Der Fuss des Layouts setzt sonst
 *   `{{unsubscribe_url}}` ein, und dieser Platzhalter wird erst vom Versand
 *   ersetzt, wenn ein `unsubscribe_token` mitgeschickt wird. `auth-email-hook`
 *   schickt keines mit, weil eine Anmeldemail nichts ist, wovon man sich
 *   abmelden koennte. Ohne `intern` stuende der rohe Platzhalter in der Mail.
 *
 *   `ohneUnterschrift` laesst den Ansprechpartner weg. Der Hook kennt keinen:
 *   Er weiss nur, welche Adresse sich anmeldet. Uebrig bliebe der Platzhalter
 *   "MOREImmo Team", und der ist schlechter als nichts.
 *
 * Warum die Vorlagen an ihrem Platz bleiben
 * -----------------------------------------
 * `auth-email-hook/index.ts` importiert sie unter genau diesen Pfaden und
 * Namen, und derselbe Hook beantwortet unter `/preview` die Vorschau von
 * Lovable. Ein Verschieben haette an der Gestaltung nichts verbessert und die
 * beiden Stellen zusaetzlich in Gefahr gebracht. Geaendert wurde deshalb nur,
 * woraus die Vorlagen ihr Aussehen beziehen: aus dem gemeinsamen Layout,
 * ueber diese eine Datei.
 *
 * Diese Datei reicht nur weiter. Sie enthaelt bewusst keine eigenen Farben,
 * Groessen oder Texte, sonst waere sie der Anfang des zweiten Layouts, das hier
 * gerade beseitigt wurde.
 */
export {
  Absatz,
  Angaben,
  Code,
  EmailLayout,
  Handlung,
  Hinweis,
  Luft,
  T,
} from '../transactional-email-templates/_layout.tsx'
