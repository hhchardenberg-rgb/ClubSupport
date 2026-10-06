# Security- en privacyoverzicht

Status: **ontwerp en implementatie getoetst met eigen tests, niet extern geaudit, niet gecertificeerd.** OWASP ASVS 5.0.0 is gebruikt als kader; de koppeling hieronder is op hoofdstukniveau (de afzonderlijke eisnummers moet een reviewer nalopen).

## 1. Dreigingsmodel (beknopt)

| Dreiging | Maatregelen | Resterend risico |
|---|---|---|
| **Accountovername** (lid of staf) | Wachtwoord ≥ 12 tekens door Better Auth gehasht; inlogbegrenzing 5/5 min/IP; generieke foutmeldingen; MFA (TOTP) verplicht voor manager/sysadmin; sessies 24 uur, `HttpOnly`/`Secure`/`SameSite=Lax`; bij wachtwoordreset alle sessies ingetrokken; blokkeren van staf beëindigt sessies direct | Geen wachtwoord-lekcontrole (breach-check); MFA voor scanner standaard uit (`REQUIRE_MFA_SCANNER`); IP-limiet leunt op `x-forwarded-for` van Vercel |
| **Gestolen/gekopieerde (screenshot) QR** | QR = opaque bearer-token; scanner toont altijd naam + lidnummer ter vergelijking; directe, onomkeerbare intrekking/heruitgifte; scanlog toont wie/wanneer | **Een statische QR kan worden gekopieerd en blijft geldig tot intrekking.** Dit is bewust zo gedocumenteerd en wordt niet "opgelost" |
| **Token raden/enumeratie** | 256 bit entropie; formaatcontrole; HMAC-lookup; generiek "onbekend"-antwoord; rate limits per controleur (60/min) en per IP (120/min); geen persoonsgegevens bij onbekende code | Verwaarloosbaar; wel volume-DoS op de endpoint (platformniveau) |
| **Misbruik scannerrechten** | Persoonlijke accounts; alleen sysadmin kent rollen toe; scanner ziet alleen uitkomst + naam + lidnummer; beperkte zoekfunctie (min. 3 tekens, max. 8 resultaten, alleen naam/lidnummer/status, begrensd, zonder zoekterm gelogd); scanlog; rol-/blokkeerwijziging beëindigt sessies | Een kwaadwillende controleur kan namen van gescande leden zien (noodzakelijk voor de taak) |
| **Onbevoegde ledeninzage (IDOR/BOLA)** | Leden bereiken passen alleen via `account_member_access`; pasroutes antwoorden 404 bij andermans id; lijst en detail gebruiken dezelfde expliciete koppeling; geen koppeling op e-mailgelijkheid | Foutieve koppeling door een beheerder (mitigatie: preview + bevestiging + audit) |
| **Gestolen beheeraccount** | MFA verplicht; minimale rechten; audit; beheerrollen nooit gedeeld; sessie-intrekking; bevestiging + reden bij risicovolle acties; geen bulkverwijdering | Gestolen MFA-apparaat + wachtwoord; audit is aanvullend, niet preventief |
| **Gegevenslekken** | Dataminimalisatie (QR/audit/scanlog zonder PII of token); versleutelde tokenopslag; secrets alleen server-side (Sensitive env vars); CSP, `no-store`, geen caching van persoonlijke data; bewaartermijnen + opruimjob; regio `fra1` | Databaseprovider-/Vercel-configuratie buiten de code; EU-regio van Neon moet door de club worden bevestigd |
| **Onjuiste intrekking / onterecht geldig** | Eén statusmodule; database is bron van waarheid; fail-safe scanner; onomkeerbare `revoked`; unieke index op token en op één levende pas; alle statuswijzigingen geaudit met reden | Offline kopieën op toestellen (niet leidend); menselijke fouten bij heractiveren (bevoegd account + reden + audit) |
| **Upload/CSV-misbruik** | Alleen `.csv`, max 1 MB/5000 rijen; kolomkoppeling op een vaste lijst velden; velden valideren en lengtes begrenzen; waarden als tekst gerenderd (React-escaping), nooit als HTML; export neutraliseert formule-injectie (`csvCell`); ruwe tabel en voorbeeld worden na verwerken gewist en verlopen na 1 uur; expliciete bevestiging; nooit samenvoegen op e-mail/naam | Het tijdelijk bewaarde bestand (≤ 1 uur) bevat persoonsgegevens in de database |
| **Onbevoegde export / datalek via export** | Recht `members.export` (manager, sysadmin) + MFA; alleen POST met eigen Origin; limiet 10/uur per account; `no-store`; nooit tokens in het bestand; elke export geaudit (filters, aantal; geen persoonsgegevens) | Een bevoegde beheerder kan een export lekken; de club bepaalt wie dit recht krijgt en hoe het bestand wordt bewaard |
| **Onterecht geldige pas na einde lidmaatschap** | Scan is alleen geldig bij actieve pas **én** geldig lidmaatschap (datums Europe/Amsterdam), zonder lidmaatschap ongeldig; archiveren maakt scans ongeldig; één statusmodule | Een offline kopie of gekopieerde QR toont nog iets op een toestel; alleen de online scanner is leidend. Contributiebetaling is bewust geen invoer |
| **Verlies van MFA-apparaat / buitensluiting** | Herstelcodes (inloggen en opnieuw aanmaken met wachtwoord), meerdere passkeys, reset door systeembeheer (reden, bevestiging, audit, melding aan betrokkene en alle systeembeheerders; niet voor jezelf), noodscript `scripts/reset-mfa.ts` met database-toegang | Een aanvaller met wachtwoord én social engineering richting systeembeheer; identiteit controleren buiten de app is een procedure, geen code. Houd ≥ 2 systeembeheerders |
| **Hergebruikte/gelekte wachtwoorden** | Pwned Passwords (k-anonymity) bij instellen, resetten en inloggen; gelekt wachtwoord wordt geweigerd; melding aan het account | Fail-open bij uitval van de dienst; bestaande gelekte wachtwoorden worden pas bij de volgende login gemeld en niet afgedwongen vervangen |
| **Phishing / wachtwoord-diefstal** | Passkeys (domeingebonden, gebruikersverificatie verplicht) als alternatief en als tweede factor | Een aanvaller met alleen een wachtwoord kan bij eerste inrichting een eigen MFA/passkey registreren (zoals bij elke eerste MFA-inrichting); gebruik uitnodigingslinks van 24 uur en controleer meldingen |
| **Verdachte activiteit blijft onopgemerkt** | Meldingen met drempels (inlogpogingen, MFA-fouten, scan-raden, scraping, exports, rol-/MFA-wijzigingen) naar systeembeheer en betrokken account; dedupe; teller en banner | Drempels zijn heuristisch; een trage aanval onder de drempel valt niet op. IP-herkomst is een hash, geen locatie |
| **Wijzigingsverzoek-misbruik** | Alleen voor expliciet gekoppelde leden (server-side), niets doorgevoerd vóór goedkeuring door ledenadministratie, limieten en één open verzoek per type, goedkeuring geweigerd bij staf-adres/archief, alles geaudit | Een lid met toegang tot een gedeeld account kan namens een ander lid een verzoek doen; de beheerder beoordeelt |
| **Nieuwsbrief: misbruik of onbedoeld massaal versturen** | Alleen recht `newsletter.manage` (manager, sysadmin) + MFA; concept → voorbeeld → testmail → bevestiging met ontvangersaantal dat moet kloppen; atomaire overgang draft → sending (één keer); één regel per adres (unieke index); testmodus verstuurt hoogstens 3 mails; annuleren mogelijk; alles geaudit (aantal, doelgroep, geen adressen/tekst) | Een bevoegde beheerder kan in `live`-modus een foutieve nieuwsbrief versturen; verzonden mails zijn niet terug te halen |
| **Nieuwsbrief-inhoud (XSS/HTML-/header-injectie)** | Platte tekst met vaste opmaakregels; alles geëscaped, alleen http(s)-links, geen ruwe HTML; onderwerp zonder regeleinden; voorbeeld in `sandbox`-iframe; getest | Mailprogramma's kunnen links of afbeeldingen anders tonen |
| **Afmelden / spam-klachten** | Elke mail heeft een persoonlijk HMAC-afmeldtoken (niet te raden, niets opgeslagen), `List-Unsubscribe` + één-klik (RFC 8058), afmeldpagina muteert pas na klik (prefetch-veilig), limiet 30/uur/IP, afmelding geldt direct en ook voor wachtende verzendingen; afgemelde adressen nooit in een doelgroep | Afmeldlink van oude mails werkt niet meer na de bewaartermijn van verzendregels (730 dagen); opnieuw aanmelden vraagt een nieuwe toestemming buiten de app |
| **Ongewenst verwijderen/cascade** | Archiveren en verwijderen zijn aparte stappen; verwijderen alleen na archivering, per lid, met reden, getypt lidnummer en impactoverzicht; accounts en andere leden blijven bestaan; wissen pas na de bewaartermijn | Menselijke fout binnen de bewaartermijn: het lid is dan wel zichtbaar verwijderd, maar nog niet gewist |
| **CSRF / open redirects** | Next.js Origin-controle voor server actions; eigen routes eisen eigen Origin; geen redirect met door gebruikers aangeleverde URL; `SameSite=Lax` | — |
| **XSS** | React-escaping, CSP met nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`), `object-src 'none'`, `frame-ancestors 'none'`; enige `dangerouslySetInnerHTML` is de zelf gegenereerde QR-SVG | `style-src 'unsafe-inline'` (nodig voor de huidige inline stijlen) |

## 2. Autorisatiematrix

Rechten zijn gedefinieerd in `src/lib/permissions.ts` en worden **server-side** gecontroleerd in elke pagina (`requireStaff`/`requireMember`), elke server action en elke API-route (`apiStaff`/`getSession`). Verborgen knoppen zijn nooit de enige bescherming.

| Recht | Lid | Scanner | Ledenbeheer (manager) | Systeembeheer |
|---|:-:|:-:|:-:|:-:|
| Eigen gekoppelde passen/leden zien, offline kopie bewaren | ✔ | – | – | – |
| Pas scannen (`/api/scan`, `/scanner`) | – | ✔ | ✔ | ✔ |
| Leden zoeken/bekijken (`/beheer/leden`) | – | – | ✔ | ✔ |
| Leden en lidmaatschappen aanmaken/wijzigen (schorsen, beëindigen, datums), archiveren | – | – | ✔ | ✔ |
| Passen blokkeren, heractiveren, vervangen, intrekken/als verloren markeren | – | – | ✔ | ✔ |
| Lid definitief verwijderen (na archivering) | – | – | ✔ | ✔ |
| Ledenlijst exporteren (CSV) | – | – | ✔ | ✔ |
| Nieuwsbrieven opstellen, testen, plannen en versturen | – | – | ✔ | ✔ |
| Wijzigingsverzoeken beoordelen | – | – | ✔ | ✔ |
| Wijzigingsverzoek indienen (eigen gekoppelde leden) | ✔ | – | – | – |
| Beveiligingsmeldingen inzien en afhandelen | – | – | – | ✔ |
| MFA van een ander staf-account resetten | – | – | – | ✔ |
| Eigen passkeys en herstelcodes beheren | ✔ | ✔ | ✔ | ✔ |
| Account ↔ lid koppelen/ontkoppelen | – | – | ✔ | ✔ |
| CSV-import (kolomkoppeling, voorbeeld, bevestigen) | – | – | ✔ | ✔ |
| Koppelingenpagina ledenaccounts | – | – | ✔ | ✔ |
| Mail-afleverstatus, uitnodiging opnieuw sturen | – | – | ✔ | ✔ |
| Staf-accounts aanmaken, rol wijzigen, blokkeren, e-mail wijzigen | – | – | – | ✔ |
| Auditlog inzien | – | – | – | ✔ |
| MFA verplicht (authenticator of passkey) | – | optioneel | ✔ | ✔ |

Aanvullende regels: een beheerder kan zijn eigen rol niet wijzigen of zichzelf blokkeren; er blijft altijd ≥ 1 actieve sysadmin; staf-adressen kunnen niet voor ledenaccounts worden gebruikt; een lid kan passtatus of eigen lidnummer nooit wijzigen (er bestaat geen schrijfpad voor leden).

### Ledenadministratie: privacy en dataminimalisatie
Verzameld per lid: lidnummer, naam, optioneel e-mailadres, optionele externe referentie, optionele notitie en het lidmaatschap (status + begin-/einddatum). **Bewust niet** toegevoegd: geboortedatum, adres, telefoon, bankgegevens of andere gevoelige velden — pas toevoegen bij aantoonbare functionele noodzaak en na aanpassing van dit overzicht. Nieuwsbrieven: alleen het contactadres per verzending (geen naam/lidnummer), bewaard 730 dagen; afmeldingen blijven bewaard om ze te respecteren; aan de club is het om vast te stellen op welke grondslag zij leden en oud-leden mailt (toestemming of gerechtvaardigd belang) en hoe zij oud-leden informeert; de afmeldmogelijkheid is altijd aanwezig. Notities zijn alleen zichtbaar voor beheer en staan nooit in de ledenomgeving of de scanner. Leden zien uitsluitend hun eigen, expliciet gekoppelde leden en geen interne reden bij een schorsing of beëindiging. Het audit-spoor van een lid bevat actie, tijd, actor en reden (vrije tekst van de beheerder: schrijf daar geen persoonsgegevens in) en nooit tokens. Bewaartermijnen: zie README.

## 3. ASVS 5.0.0-checklist (hoofdstukniveau)

Legenda: **T** = door een geautomatiseerde test gedekt · **I** = geïmplementeerd, niet apart getest · **E** = vereist externe configuratie/review · **O** = open/niet gedaan.

| Hoofdstuk | Status | Opmerking |
|---|:-:|---|
| V1 Encoding & Sanitization | T/I | React-escaping; CSV-waarden als tekst (T); geen eigen SQL-string-concatenatie (Drizzle/parameters); LIKE-wildcards geëscaped |
| V2 Validation & Business Logic | T | Server-side (handmatige) validatie van alle invoer; statusregels en overgangen getest; rate limits getest |
| V3 Web Frontend Security | T/I | CSP/headers getest (T); cookies; geen secrets in client; `Referrer-Policy`, `Permissions-Policy` (camera alleen op `/scanner`) |
| V4 API & Web Service | T | Origin-controle, `no-store`, minimale antwoorden, 401/403/404-gedrag getest |
| V5 File Handling | T/I | CSV-upload: type/grootte/rijen begrensd; bestand wordt niet opgeslagen, alleen gevalideerde rijen tijdelijk |
| V6 Authentication | T/I/E | Better Auth; activatie/reset eenmalig en gehasht (T); gelekte-wachtwoordcontrole (T, fail-open); passkeys met verplichte gebruikersverificatie (T, virtuele authenticator); herstelcodes en MFA-reset; geen autofill op verificatiecodes (T); MFA-flow met echt toestel **O** |
| V7 Session Management | T/I | 24 uur sliding; intrekking bij reset/rolwijziging/blokkeren (T); geen cookiecache |
| V8 Authorization | T | Rollenmatrix e2e getest; IDOR-tests voor leden; **O**: elke server action is niet afzonderlijk met een ruw POST-verzoek getest (guard staat in elke action; zie risico's) |
| V9 Self-contained Tokens | n.v.t. | Geen JWT's buiten Better Auth-sessies |
| V10 OAuth/OIDC | n.v.t. | Niet gebruikt |
| V11 Cryptography | T/I | CSPRNG, HMAC-SHA256, AES-256-GCM met AAD; sleutelrotatie **O** (zie README) |
| V12 Secure Communication | I/E | HSTS + `upgrade-insecure-requests`; TLS door Vercel/Neon; Neon-verbinding verifieert certificaat |
| V13 Configuration | I/E | Secrets als Sensitive env vars; `.env.example` zonder waarden; gitleaks in CI (nog niet gedraaid op GitHub) |
| V14 Data Protection | T/I | Dataminimalisatie, geen PII in QR/audit/scanlog (T), bewaartermijnen + purge (T), `no-store` |
| V15 Secure Coding & Architecture | I | Beperkte afhankelijkheden; bekende meldingen in §5 |
| V16 Logging & Error Handling | T/I | Audit zonder secrets (T); foutmeldingen generiek; serverlogs bevatten geen tokens (bewust, niet volledig geaudit) |
| V17 WebRTC | n.v.t. | — |

## 4. Wat nog externe configuratie vereist
- Neon-database in een **EU-regio** bevestigen, back-up/point-in-time-herstel van het gekozen plan controleren en een herstel **testen** (niet gedaan).
- Resend: afzenderdomein (SPF/DKIM) en `EMAIL_MODE=live`; nu alleen testmodus.
- `CRON_SECRET` is ingesteld in Vercel (Production, gevoelig); zonder secret zijn de cron-endpoints dicht en draaien mail-retry en opruimen niet. Roteer het bij vermoeden van lekken.
- Productiedomein en eventuele Vercel Deployment Protection-instellingen (controleer dat de productie-URL publiek bereikbaar is voor leden).
- GitHub: secret scanning/push protection en Dependabot activeren.
- Bewaartermijnen, incidentcontact en verwerkingsregister door de club vast te stellen (AVG).

## 5. Bekende afhankelijkheidsmeldingen (`npm audit --omit=dev`)
- `passkit-generator` → `node-forge` (hoog: handtekeningverificatie met geneste digest) en `joi` (hoog): wij gebruiken `node-forge` alleen voor het **ondertekenen** van passen, niet voor het verifiëren van invoer, en `joi` valideert alleen onze eigen, vaste pass-eigenschappen. Praktisch risico laag, maar volg updates van `passkit-generator`.
- `drizzle-kit` → oude `esbuild` (matig): alleen build-/ontwikkeltool, draait niet in de runtime.

## 6. Resterende risico's (eerlijk samengevat)
0. **Demo-accounts** (`SEED_DEMO`): bekende accounts met wachtwoorden in de buildlog; alleen voor testen en vóór echt gebruik verwijderen (`SEED_DEMO=remove`).
1. Gekopieerde QR blijft geldig tot intrekking (ontwerpkeuze, zie §1).
2. **Offline kopie van passen**: de pastoken staat (bij toestemming) in `localStorage` van het toestel van het lid en is daar leesbaar voor kwaadaardige scripts of iemand met toegang tot het ontgrendelde toestel. Mitigaties: strikte CSP met nonce, kopie verloopt (`OFFLINE_PASS_MAX_DAYS`), wordt gewist bij uitloggen, lid kan het uitzetten, ingetrekking blijft online afgedwongen. Een offline weergave is niet door de server in te trekken.
2b. **Afwijking van "geen doorzoekbare ledenlijst"**: de scanner kan nu leden zoeken (naam/lidnummer) om zonder pas te controleren. Beperkt tot rol met `members.lookup`, minimaal 3 tekens, maximaal 8 resultaten, rate limit, alleen naam/lidnummer/passtatus, en elke zoekactie staat zonder zoekterm in het controlelogboek (`scanlog.read`, alleen ledenbeheer en systeembeheer).
3. Server actions zijn beschermd door `requireStaff` in elke actie en door Next.js' Origin-controle, maar niet per actie met een ruw POST-verzoek getest.
4. Geen echte apparaat- of Resend-tests; geen belasting- of penetratietest.
5. Eén sleutel voor token-hash en één voor versleuteling: verlies of rotatie heeft grote gevolgen (zie README).
6. CSP bevat `style-src 'unsafe-inline'`.

## 7. Incident-runbook (kort)
**Contact:** *door de club in te vullen* (naam, e-mail, telefoon; en de datum waarop de AVG-meldplicht is beoordeeld).
1. **Gelekte of gestolen pas/QR:** Beheer → lid → *Opnieuw uitgeven* (aanleiding "Gelekt"). De oude token is direct en definitief ongeldig. Controleer scanlog/audit.
2. **Gestolen beheer- of scanneraccount:** Beheer → Accounts → *Blokkeren* (beëindigt sessies); wijzig het wachtwoord via "Wachtwoord vergeten"; controleer auditlog op wijzigingen.
3. **Vermoeden van databaselek of sleutelcompromis:** zet de site in onderhoud (Vercel *Pause*), roteer `BETTER_AUTH_SECRET`, `CRON_SECRET` en de Resend-sleutel; bij `TOKEN_HMAC_KEY`/`TOKEN_ENC_KEY`: **alle passen heruitgeven** (de oude tokens zijn dan gecompromitteerd of onleesbaar). Beoordeel de AVG-meldplicht (72 uur).
4. **Verkeerde accountkoppeling:** Beheer → lid → *Ontkoppelen*; auditlog bevat wie koppelde.
5. **Back-up en herstel:** gebruik de point-in-time-restore van de databaseprovider of `pg_dump`/`pg_restore`; draai daarna `npx tsx scripts/migrate.ts`. Test dit vóór ingebruikname.
