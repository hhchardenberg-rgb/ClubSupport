# HHC ClubSupport — Ledenpas, Scanner en Beheer

Digitale ledenpas voor supportersvereniging HHC ClubSupport (HHC Hardenberg). Eén applicatie met drie gescheiden ervaringen op één backend:

| Ervaring | Adres | Doelgroep | Installeerbaar als app |
|---|---|---|---|
| **Ledenpas** | `/` (stuurt door naar `/ledenpas`) | leden | ja ("HHC ClubSupport Ledenpas") |
| **Scanner** | `/scanner` (niet gelinkt vanaf de ledenkant) | controleurs en beheerders | ja ("HHC ClubSupport Scanner", eigen icoon) |
| **Beheer** | `/beheer` (niet gelinkt vanaf de ledenkant) | beheerders | nee |

> Dit project claimt **geen** formele certificering. OWASP ASVS 5.0.0 is gebruikt als verificatiekader; zie [docs/SECURITY.md](docs/SECURITY.md) voor wat getest is en wat nog open staat.

## Aannames (zichtbaar vastgelegd, door de club aan te passen)

1. Een beheerder voert leden handmatig in of importeert ze via CSV; er is geen openbare zelfregistratie.
2. Eén lid heeft maximaal één levende pas (actief of gedeactiveerd); heruitgifte trekt de vorige pas definitief in.
3. Een pas blijft geldig totdat een bevoegde beheerder die deactiveert, intrekt of het lid verwijdert. **Geen** automatische vervaldatum, betaalintegratie of ledenstatus die de geldigheid beïnvloedt.
4. De scanner toont geldigheid, naam en lidnummer — geen foto of overige contactgegevens.
5. Een scan vereist een werkende internetverbinding.
6. De onboardingmail gaat naar het door de beheerder ingevoerde adres; het lid stelt bij eerste gebruik zelf een wachtwoord in.
7. Eén geverifieerd account kan meerdere leden en passen bevatten. Bij gedeelde e-mailadressen toont de applicatie de groepering ter bevestiging; alleen expliciet gekoppelde leden zijn zichtbaar.
8. Overige velden, rollen en bewaartermijnen zijn configureerbaar tot de club ze vaststelt (zie [Bewaartermijnen](#bewaartermijnen)).

Extra keuzes die ik heb gemaakt: *gedeactiveerd* is tijdelijk en heractiveerbaar (zelfde QR), *definitief ingetrokken* is onomkeerbaar. Voor een ingetrokken of verwijderde pas toont de scanner **geen** naam (dataminimalisatie); voor een gedeactiveerde pas wél naam en lidnummer, zodat de controleur kan handelen.

## Stack en architectuurbeslissingen

- **Next.js 16 (App Router, TypeScript)** op **Vercel**; **Postgres (Neon)** via **Drizzle ORM** met SQL-migraties in `drizzle/` (reproduceerbaar; draaien automatisch bij productie-deploys).
- **Better Auth** is de identity provider (wachtwoord-hashing, sessies, TOTP-MFA). Er is geen eigen wachtwoordopslag of cryptografie. Activatie-/resetlinks zijn eigen eenmalige tokens (alleen hash opgeslagen); het wachtwoord zelf wordt via Better Auth ingesteld.
- **Passen en tokens**: token = 256 bit uit de CSPRNG (base64url, 43 tekens, zonder betekenis). Opgeslagen als **HMAC-SHA256** (lookup) en **AES-256-GCM** (alleen levende passen, zodat de QR dezelfde token kan tonen; bij intrekking gewist). Unieke index op de hash; unieke index "één levende pas per lid".
- **Statusregels op één plek**: `src/lib/status.ts`. De database is de enige bron van waarheid; de scanner vraagt bij élke scan de server.
- **Fail-safe scanner**: `src/lib/scan-view.ts` — alleen een exact verwacht 200-antwoord geeft GELDIG; elke fout, time-out of afwijking geeft "Niet gecontroleerd — verbinding nodig".
- **E-mail**: transactionele outbox (`email_outbox`) met idempotente sleutels, begrensde retries en backoff; verzending pas ná de databasetransactie; Resend als provider; **testmodus** leidt alle mail om naar één adres.
- **PWA**: aparte manifesten en service workers voor Ledenpas en Scanner. Service workers cachen alleen de app-shell/statische bestanden en een neutrale offline-pagina — nooit API-antwoorden, ledengegevens of scanresultaten.
- **Beveiliging**: CSP met nonce per verzoek (alle pagina's dynamisch gerenderd), strikte security headers, `no-store` op alle pagina's, Origin-controle op eigen POST-routes, Postgres-rate-limiter, regio `fra1` voor functies.
- **Huisstijl**: zie [Vormgeving](#vormgeving).

## Vormgeving

Uitgangspunt is het **HHC-huisstijlhandboek 2024**; er is geen nieuwe huisstijl bedacht. Toegepaste richtlijnen:

| Richtlijn uit het handboek | Toepassing |
|---|---|
| Basiskleuren **oranje `#ff6600` en zwart**, altijd als volle kleur, nooit als tint | Alle vlakken en knoppen; geen verlopen, geen lichtere oranjetinten (uitgeschakelde knoppen zijn grijs met een streeprand). Geen groen. |
| Tekst-op-kleur-combinaties: zwart op oranje, oranje op zwart, wit op zwart, zwart op wit; **nooit oranje tekst op wit of grijs** | Knoppen: zwarte tekst op oranje. Oranje tekst alleen op zwart (header, pas, actieve tab). Lichtgrijs `#f2f2f2` alleen als pagina-achtergrond (zoals in het handboek). |
| **DIN** (Light voor koppen, Regular voor tekst, Bold voor nadruk, Black voor krachtige woorden), koppen in hoofdletters | DIN Next LT Pro (Light/Regular/Medium/Bold) + FF DIN Black, zelf gehost (woff2). Koppen Light in hoofdletters, labels en knoppen Bold. |
| **Logo**: schildvorm niet vervormen of herkleuren; een kwart logobreedte witruimte; minimaal 42 px breed | Het officiële PNG-logo staat in header, inlogschermen, de pas, e-mail en app-iconen; altijd op zwart of oranje en met behoud van verhouding. |
| Beeldtaal: vlakke, stoere blokken in oranje/zwart met grote typografie | Zwarte header met oranje onderrand, zwarte pas-kaart met oranje kopstrook, harde randen, grote kopteksten. |

**Samengevat per ervaring**
- **Ledenpas:** de pas is een kaart (oranje kopstrook met logo, zwart vlak, witte QR). Meerdere passen staan in een veegbare carrousel met pijlen, stippen en toetsenbord; de volgende kaart piekt in beeld.
- **Scanner:** één grote actie ("Scan starten"), resultaten als vol-scherm-paneel met icoon én tekst: GELDIG (zwart + oranje vinkje), ONGELDIG (rood + kruis), NIET GECONTROLEERD (oranje + geen-verbinding-icoon). Leesbaar in fel licht door hoog contrast en grote letters.
- **Beheer:** compacte header met menu (op telefoon een veegbare rij), tweekoloms lidpagina op desktop, tabellen die op telefoon horizontaal scrollen, overal dezelfde knoppen, meldingen en statusbadges.
- **Herbruikbare onderdelen:** `src/components/ui.tsx` (`Alert`, `Flash`, `StatusBadge`, `Badge`, `PageTitle`, `EmptyState`), `Logo`, `SiteHeader`, `AuthShell`, `PassCarousel`, en de ontwerptokens/klassen in `src/app/globals.css`.

**Aannames waar het handboek niets over zegt** (bewust zo gekozen):
1. *Rood* `#b00020` voor fouten en onomkeerbare acties (het handboek kent geen foutkleur; groen is bewust vermeden, succes is zwart met een oranje vinkje).
2. *Afgeronde hoeken* (10–12 px) en een zachte, minimale schaduw voor een moderne digitale uitstraling; het handboek is voor drukwerk en noemt geen UI-hoeken.
3. *Hoverstatus* van knoppen: omkeren naar zwart/oranje, passend bij de twee huiskleuren.
4. *Pagina-achtergrond* lichtgrijs `#f2f2f2` (de achtergrond van de handboekpagina's); geen donker thema, omdat de huisstijl uit oranje en zwart bestaat.
5. Het handboek noemt het logo met en zonder gloss; hier wordt het aangeleverde RGB-logo gebruikt.

Toegankelijkheid: contrast (zwart/oranje/wit), grote tikdoelen (≥ 44–50 px), zichtbare focus (oranje ring + zwarte rand), labels bij alle velden, `role=alert/status` bij meldingen, `prefers-reduced-motion`. Een automatische axe-controle (WCAG 2.1 A/AA) draait in de browsertests op de kernschermen op telefoon en desktop; dat dekt maar een deel van de eisen, dus een handmatige schermlezertest blijft nodig.

## Datamodel

```
user (Better Auth)  1─n  account_member_access  n─1  member  1─n  pass
   │ role: member | scanner | manager | sysadmin         │ memberNumber (uniek), fullName, email, membershipNote, deletedAt
   │ twoFactorEnabled, disabledAt                          └ pass: tokenHash (uniek), tokenCiphertext, status, revocationReason, …
   ├── account_token   (activation | reset; alleen hash; verloopt; eenmalig)
   ├── email_outbox    (kind, status, attempts, providerRef; géén tokens/wachtwoorden)
   ├── audit_event     (actor, actie, doel, beperkte metadata — nooit tokens/wachtwoorden)
   └── scan_event      (controleur, tijdstip, uitkomst, pasreferentie — nooit de ruwe token)
import_batch (tijdelijke preview, wordt na commit gewist) · app_rate_limit · rate_limit (Better Auth)
```

`Member` ≠ `Pass`: het lid is de persoon, de pas het uitgegeven token. `account_member_access` is de expliciete autorisatierelatie (met wie koppelde/ontkoppelde en wanneer); e-mailgelijkheid koppelt nooit automatisch.

## Rollen en rechten (minimale rechten)

Zie de volledige autorisatiematrix in [docs/SECURITY.md](docs/SECURITY.md). Kort: **lid** (eigen gekoppelde passen), **scanner** (alleen scannen), **manager/ledenbeheer** (leden, passen, import, koppelingen, mailstatus + scannen), **sysadmin** (alles + accounts en audit). MFA is verplicht voor manager en sysadmin; optioneel voor scanner (`REQUIRE_MFA_SCANNER=true`).

## Statusregels pas

`active` → `deactivated` (reden verplicht, heractiveerbaar) · `active|deactivated` → `revoked` (definitief; via intrekken, heruitgifte of verwijderen van het lid). `revoked` heeft geen uitgaande overgangen en de versleutelde token wordt gewist.

## Lokaal starten

Vereist Node 22 en Postgres 16.

```bash
npm ci
cp .env.example .env.local        # vul DATABASE_URL en de drie secrets (zie commentaar in het bestand)
createdb clubsupport_dev
set -a; . ./.env.local; set +a    # scripts (tsx) lezen .env.local niet zelf; `next dev` wel
npx tsx scripts/migrate.ts        # migraties toepassen
BOOTSTRAP_ADMIN_EMAIL=jij@example.test npx tsx scripts/bootstrap-admin.ts   # eerste beheerder: activatielink verschijnt in de terminal
npm run dev
```

In ontwikkeling toont `bootstrap-admin` de activatielink in de terminal; met `EMAIL_MODE=disabled` worden geen mails verstuurd. Een nieuw schema maak je met `npx drizzle-kit generate` (nooit bestaande migraties wijzigen).

## Tests

```bash
npm test            # 41 unit-/integratietests tegen een lokale Postgres (maakt zelf database clubsupport_test)
npm run test:e2e    # bouwt en draait 21 end-to-end- en browsertests (Chromium, nepcamera, axe-toegankelijkheidscontrole)
```

Voor Postgres: `TEST_ADMIN_DATABASE_URL` (standaard `postgres://postgres:postgres@localhost:5432/postgres`). Overzicht per vereiste test: [docs/TESTING.md](docs/TESTING.md).

## Deployment (Vercel)

1. Project gekoppeld aan de GitHub-repo; productiebranch bepaalt de productie-deploy.
2. Zet de variabelen uit `.env.example` in Vercel (secrets als *Sensitive*). `DATABASE_URL` komt van de Neon-koppeling.
3. De build draait `tsx scripts/migrate.ts` en `scripts/bootstrap-admin.ts` en daarna `next build`. **Alleen productie-deploys migreren** (previews niet).
4. Crons (`vercel.json`): mail-retry en opruimen draaien dagelijks; beveiligd met `CRON_SECRET` (zet een willekeurige waarde van ≥ 16 tekens). Op het Hobby-plan zijn alleen dagelijkse crons mogelijk; direct na een beheeractie wordt de outbox al meteen verwerkt.
5. **Kies een EU-regio** voor zowel de Neon-database als de functies (`vercel.json` zet `fra1`).

### Eerste beheerder
Zet `BOOTSTRAP_ADMIN_EMAIL` (alleen Production), deploy, en haal de eenmalige activatielink (24 uur) uit de buildlog. Stel een wachtwoord in en richt MFA in. Het adres wijzigen kan later onder *Beheer → Accounts*. Verwijder daarna de variabele.

### Auth
Better Auth met e-mail+wachtwoord (min. 12 tekens), geen publieke registratie, sessies 24 uur (sliding, `HttpOnly`, `Secure`, `SameSite=Lax`), inlogpogingen begrensd (5 per 5 minuten per IP), TOTP-MFA met herstelcodes. Wachtwoordherstel stuurt alleen een eenmalige link (1 uur) met altijd dezelfde generieke bevestiging; bij een reset worden alle sessies ingetrokken.

### E-mail
`EMAIL_MODE=test` (standaard): elke mail gaat naar `EMAIL_TEST_RECIPIENT` met prefix `[TEST]`. Om echt te versturen: verifieer een afzenderdomein bij Resend, zet `EMAIL_FROM`, `RESEND_API_KEY` en `EMAIL_MODE=live`. `disabled` verstuurt niets (status "uitgeschakeld" in Beheer).

### Wallet
Apple Wallet en Google Wallet worden **niet** gebruikt. Leden gebruiken de pas in de app; na inloggen kan een offline kopie op het toestel worden bewaard (zie Offline gebruik).

### Offline gebruik door leden
Na inloggen bewaart de Ledenpas (met toestemming van het lid, aan/uit te zetten op het ledenscherm) een kopie van de eigen passen op het toestel, zodat de QR ook zonder internet te tonen is. De kopie verloopt na `OFFLINE_PASS_MAX_DAYS` (standaard 30, max 90), wordt bij elke online sessie ververst en bij uitloggen gewist. Een service worker (`/sw-ledenpas.js`) houdt de offline pagina en bestanden beschikbaar. Let op: een nieuw geïnstalleerde service worker neemt in sommige browsers pas na enkele seconden de pagina's over. De scanner blijft **altijd online** valideren, dus een ingetrokken pas wordt daar alsnog afgekeurd.

### Zoeken door de scanner en controlelogboek
Zonder pas kan de controleur een lid zoeken op naam of lidnummer (minimaal 3 tekens, maximaal 8 resultaten, begrensd per minuut). Het resultaat toont alleen naam, lidnummer en of er een actieve pas is. In Beheer staat onder **Controles** een doorzoekbaar controlelogboek (controleur, uitkomst, lid, periode); zoektermen worden niet vastgelegd. Op de pagina's *Controles* en *Audit* kiest u met knoppen per account wie u wilt inzien; ook vanuit *Accounts*.

### Demo-/testaccounts
Met `SEED_DEMO=true` (Production) maakt de build bij de eerste keer drie demo-accounts met **synthetische gegevens** en willekeurige wachtwoorden: één ledenaccount met 1 pas, één met 3 passen en een testcontroleur. De wachtwoorden verschijnen **één keer** in de buildlog (verder niet opgeslagen); bestaande accounts blijven ongemoeid. `SEED_DEMO=reset` maakt nieuwe, `SEED_DEMO=remove` verwijdert alle demo-gegevens. **Verwijder de demo-accounts vóór echte leden worden ingevoerd** en laat de variabele niet staan: het zijn bekende accounts. Er wordt voor demo-accounts geen e-mail verstuurd.

### Overige configuratie
`SCAN_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `DELETED_MEMBER_RETENTION_DAYS`, `REQUIRE_MFA_SCANNER`, `OFFLINE_PASS_MAX_DAYS`, `DB_POOL_MAX` — zie `.env.example`.

## Bewaartermijnen
Standaard: scanlog 90 dagen · auditlog 730 dagen · verwijderde leden 90 dagen daarna definitief gewist (incl. passen en koppelingen) · tokens/importpreviews/rate-limit-rijen/sessies kort · verzonden mails 90 dagen. Dagelijkse opruimjob: `/api/cron/purge`. De club moet deze termijnen vaststellen.

## Bekende beperkingen
- **Een statische QR kan worden gekopieerd** (screenshot, foto). Mitigatie: de scanner toont altijd naam en lidnummer ter vergelijking met een legitimatiebewijs, en een gelekte pas kan direct en definitief worden ingetrokken/heruitgegeven. Dit voorkomt screenshots **niet** volledig.
- De offline kopie op het toestel van een lid wordt niet op afstand ongeldig; **intrekking wordt uitsluitend door de online scanner afgedwongen.** De kopie bevat de pastoken in `localStorage` van de browser (zie docs/SECURITY.md).
- Sleutels niet roteren zonder plan: een nieuwe `TOKEN_HMAC_KEY` maakt alle passen onbekend, een nieuwe `TOKEN_ENC_KEY` maakt opgeslagen tokens onleesbaar (passen tonen dan "tijdelijk niet beschikbaar" tot heruitgifte).
- App-iconen, favicon, en e-mailafbeeldingen worden uit het logo gegenereerd: `node scripts/make-icons.mjs brand-source/HHC_ClubSupport_Logo_RGB.png` (vereist Chromium via Playwright). Het bronbestand staat in `brand-source/`.
- DIN-fonts zijn door HHC aangeleverd; controleer of de licentie webgebruik dekt.
- Niet getest op een echt iOS-/Android-toestel en niet met een echt Resend-account; zie [docs/TESTING.md](docs/TESTING.md).
