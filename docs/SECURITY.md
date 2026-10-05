# Security- en privacyoverzicht

Status: **ontwerp en implementatie getoetst met eigen tests, niet extern geaudit, niet gecertificeerd.** OWASP ASVS 5.0.0 is gebruikt als kader; de koppeling hieronder is op hoofdstukniveau (de afzonderlijke eisnummers moet een reviewer nalopen).

## 1. Dreigingsmodel (beknopt)

| Dreiging | Maatregelen | Resterend risico |
|---|---|---|
| **Accountovername** (lid of staf) | Wachtwoord ≥ 12 tekens door Better Auth gehasht; inlogbegrenzing 5/5 min/IP; generieke foutmeldingen; MFA (TOTP) verplicht voor manager/sysadmin; sessies 24 uur, `HttpOnly`/`Secure`/`SameSite=Lax`; bij wachtwoordreset alle sessies ingetrokken; blokkeren van staf beëindigt sessies direct | Geen wachtwoord-lekcontrole (breach-check); MFA voor scanner standaard uit (`REQUIRE_MFA_SCANNER`); IP-limiet leunt op `x-forwarded-for` van Vercel |
| **Gestolen/gekopieerde (screenshot) QR** | QR = opaque bearer-token; scanner toont altijd naam + lidnummer ter vergelijking; directe, onomkeerbare intrekking/heruitgifte; scanlog toont wie/wanneer | **Een statische QR kan worden gekopieerd en blijft geldig tot intrekking.** Dit is bewust zo gedocumenteerd en wordt niet "opgelost" |
| **Token raden/enumeratie** | 256 bit entropie; formaatcontrole; HMAC-lookup; generiek "onbekend"-antwoord; rate limits per controleur (60/min) en per IP (120/min); geen persoonsgegevens bij onbekende code | Verwaarloosbaar; wel volume-DoS op de endpoint (platformniveau) |
| **Misbruik scannerrechten** | Persoonlijke accounts; alleen sysadmin kent rollen toe; scanner ziet alleen uitkomst + naam + lidnummer, geen lijst/zoekfunctie; scanlog; rol-/blokkeerwijziging beëindigt sessies | Een kwaadwillende controleur kan namen van gescande leden zien (noodzakelijk voor de taak) |
| **Onbevoegde ledeninzage (IDOR/BOLA)** | Leden bereiken passen alleen via `account_member_access`; Wallet-/pasroutes antwoorden 404 bij andermans id; lijst en detail gebruiken dezelfde expliciete koppeling; geen koppeling op e-mailgelijkheid | Foutieve koppeling door een beheerder (mitigatie: preview + bevestiging + audit) |
| **Gestolen beheeraccount** | MFA verplicht; minimale rechten; audit; beheerrollen nooit gedeeld; sessie-intrekking; bevestiging + reden bij risicovolle acties; geen bulkverwijdering | Gestolen MFA-apparaat + wachtwoord; audit is aanvullend, niet preventief |
| **Gegevenslekken** | Dataminimalisatie (QR/Wallet/audit/scanlog zonder PII of token); versleutelde tokenopslag; secrets alleen server-side (Sensitive env vars); CSP, `no-store`, geen caching van persoonlijke data; bewaartermijnen + opruimjob; regio `fra1` | Databaseprovider-/Vercel-configuratie buiten de code; EU-regio van Neon moet door de club worden bevestigd |
| **Onjuiste intrekking / onterecht geldig** | Eén statusmodule; database is bron van waarheid; fail-safe scanner; onomkeerbare `revoked`; unieke index op token en op één levende pas; alle statuswijzigingen geaudit met reden | Wallet-kopieën (niet leidend); menselijke fouten bij heractiveren (bevoegd account + reden + audit) |
| **Upload/CSV-misbruik** | Alleen `.csv`, max 1 MB/5000 rijen; kolommen op allowlist; velden valideren en lengtes begrenzen; waarden als tekst gerenderd (React-escaping), nooit als HTML; export-helper neutraliseert formule-injectie; preview wordt na commit gewist | Er is nog geen export-functie in de UI; de helper (`csvCell`) is getest maar nog niet gebruikt |
| **CSRF / open redirects** | Next.js Origin-controle voor server actions; eigen routes eisen eigen Origin; geen redirect met door gebruikers aangeleverde URL; `SameSite=Lax` | — |
| **XSS** | React-escaping, CSP met nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`), `object-src 'none'`, `frame-ancestors 'none'`; enige `dangerouslySetInnerHTML` is de zelf gegenereerde QR-SVG | `style-src 'unsafe-inline'` (nodig voor de huidige inline stijlen) |

## 2. Autorisatiematrix

Rechten zijn gedefinieerd in `src/lib/permissions.ts` en worden **server-side** gecontroleerd in elke pagina (`requireStaff`/`requireMember`), elke server action en elke API-route (`apiStaff`/`getSession`). Verborgen knoppen zijn nooit de enige bescherming.

| Recht | Lid | Scanner | Ledenbeheer (manager) | Systeembeheer |
|---|:-:|:-:|:-:|:-:|
| Eigen gekoppelde passen/leden zien, Wallet toevoegen | ✔ | – | – | – |
| Pas scannen (`/api/scan`, `/scanner`) | – | ✔ | ✔ | ✔ |
| Leden zoeken/bekijken (`/beheer/leden`) | – | – | ✔ | ✔ |
| Leden aanmaken/wijzigen | – | – | ✔ | ✔ |
| Passen deactiveren, heractiveren, heruitgeven, intrekken, lid verwijderen | – | – | ✔ | ✔ |
| Account ↔ lid koppelen/ontkoppelen | – | – | ✔ | ✔ |
| CSV-import | – | – | ✔ | ✔ |
| Mail-afleverstatus, uitnodiging opnieuw sturen | – | – | ✔ | ✔ |
| Staf-accounts aanmaken, rol wijzigen, blokkeren, e-mail wijzigen | – | – | – | ✔ |
| Auditlog inzien | – | – | – | ✔ |
| MFA verplicht | – | optioneel | ✔ | ✔ |

Aanvullende regels: een beheerder kan zijn eigen rol niet wijzigen of zichzelf blokkeren; er blijft altijd ≥ 1 actieve sysadmin; staf-adressen kunnen niet voor ledenaccounts worden gebruikt; een lid kan passtatus of eigen lidnummer nooit wijzigen (er bestaat geen schrijfpad voor leden).

## 3. ASVS 5.0.0-checklist (hoofdstukniveau)

Legenda: **T** = door een geautomatiseerde test gedekt · **I** = geïmplementeerd, niet apart getest · **E** = vereist externe configuratie/review · **O** = open/niet gedaan.

| Hoofdstuk | Status | Opmerking |
|---|:-:|---|
| V1 Encoding & Sanitization | T/I | React-escaping; CSV-waarden als tekst (T); geen eigen SQL-string-concatenatie (Drizzle/parameters); LIKE-wildcards geëscaped |
| V2 Validation & Business Logic | T | Server-side (handmatige) validatie van alle invoer; statusregels en overgangen getest; rate limits getest |
| V3 Web Frontend Security | T/I | CSP/headers getest (T); cookies; geen secrets in client; `Referrer-Policy`, `Permissions-Policy` (camera alleen op `/scanner`) |
| V4 API & Web Service | T | Origin-controle, `no-store`, minimale antwoorden, 401/403/404-gedrag getest |
| V5 File Handling | T/I | CSV-upload: type/grootte/rijen begrensd; bestand wordt niet opgeslagen, alleen gevalideerde rijen tijdelijk |
| V6 Authentication | T/I/E | Better Auth; activatie/reset eenmalig en gehasht (T); MFA-flow (I, handmatig niet met echt toestel); breach-check **O** |
| V7 Session Management | T/I | 24 uur sliding; intrekking bij reset/rolwijziging/blokkeren (T); geen cookiecache |
| V8 Authorization | T | Rollenmatrix e2e getest; IDOR-tests voor leden/Wallet; **O**: elke server action is niet afzonderlijk met een ruw POST-verzoek getest (guard staat in elke action; zie risico's) |
| V9 Self-contained Tokens | I | Alleen de Google Wallet-JWT (RS256, server-side ondertekend; getest tegen testsleutel) |
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
- Apple Developer-account (Pass Type ID, certificaten) en Google Wallet-issuer; nu niet geconfigureerd.
- `CRON_SECRET` instellen (zonder secret zijn de cron-endpoints dicht, dus mail-retry en opruimen draaien dan niet).
- Productiedomein en eventuele Vercel Deployment Protection-instellingen (controleer dat de productie-URL publiek bereikbaar is voor leden).
- GitHub: secret scanning/push protection en Dependabot activeren.
- Bewaartermijnen, incidentcontact en verwerkingsregister door de club vast te stellen (AVG).

## 5. Bekende afhankelijkheidsmeldingen (`npm audit --omit=dev`)
- `passkit-generator` → `node-forge` (hoog: handtekeningverificatie met geneste digest) en `joi` (hoog): wij gebruiken `node-forge` alleen voor het **ondertekenen** van passen, niet voor het verifiëren van invoer, en `joi` valideert alleen onze eigen, vaste pass-eigenschappen. Praktisch risico laag, maar volg updates van `passkit-generator`.
- `drizzle-kit` → oude `esbuild` (matig): alleen build-/ontwikkeltool, draait niet in de runtime.

## 6. Resterende risico's (eerlijk samengevat)
0. **Demo-accounts** (`SEED_DEMO`): bekende accounts met wachtwoorden in de buildlog; alleen voor testen en vóór echt gebruik verwijderen (`SEED_DEMO=remove`).
1. Gekopieerde QR blijft geldig tot intrekking (ontwerpkeuze, zie §1).
2. Wallet-kopieën worden niet door Apple/Google afgedwongen; alleen de online scanner is leidend.
3. Server actions zijn beschermd door `requireStaff` in elke actie en door Next.js' Origin-controle, maar niet per actie met een ruw POST-verzoek getest.
4. Geen echte apparaat-, Apple-, Google- of Resend-tests; geen belasting- of penetratietest.
5. Eén sleutel voor token-hash en één voor versleuteling: verlies of rotatie heeft grote gevolgen (zie README).
6. CSP bevat `style-src 'unsafe-inline'`.

## 7. Incident-runbook (kort)
**Contact:** *door de club in te vullen* (naam, e-mail, telefoon; en de datum waarop de AVG-meldplicht is beoordeeld).
1. **Gelekte of gestolen pas/QR:** Beheer → lid → *Opnieuw uitgeven* (aanleiding "Gelekt"). De oude token is direct en definitief ongeldig. Controleer scanlog/audit.
2. **Gestolen beheer- of scanneraccount:** Beheer → Personeel → *Blokkeren* (beëindigt sessies); wijzig het wachtwoord via "Wachtwoord vergeten"; controleer auditlog op wijzigingen.
3. **Vermoeden van databaselek of sleutelcompromis:** zet de site in onderhoud (Vercel *Pause*), roteer `BETTER_AUTH_SECRET`, `CRON_SECRET`, Resend-sleutel en Wallet-sleutels; bij `TOKEN_HMAC_KEY`/`TOKEN_ENC_KEY`: **alle passen heruitgeven** (de oude tokens zijn dan gecompromitteerd of onleesbaar). Beoordeel de AVG-meldplicht (72 uur).
4. **Verkeerde accountkoppeling:** Beheer → lid → *Ontkoppelen*; auditlog bevat wie koppelde.
5. **Back-up en herstel:** gebruik de point-in-time-restore van de databaseprovider of `pg_dump`/`pg_restore`; draai daarna `npx tsx scripts/migrate.ts`. Test dit vóór ingebruikname.
