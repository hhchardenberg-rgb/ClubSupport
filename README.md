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
3. Een scan is alleen **geldig als de pas actief is én het lidmaatschap op dat moment geldig is** (zie [Ledenadministratie](#ledenadministratie)). Dit vervangt de eerdere aanname dat alleen de pas zelf telt. Er is **geen** betaalintegratie; of contributiebetaling het lidmaatschap moet beïnvloeden is een afzonderlijke, nog te nemen productbeslissing.
4. De scanner toont geldigheid, naam en lidnummer — geen foto of overige contactgegevens.
5. Een scan vereist een werkende internetverbinding.
6. De onboardingmail gaat naar het door de beheerder ingevoerde adres; het lid stelt bij eerste gebruik zelf een wachtwoord in.
7. Eén geverifieerd account kan meerdere leden en passen bevatten. Bij gedeelde e-mailadressen toont de applicatie de groepering ter bevestiging; alleen expliciet gekoppelde leden zijn zichtbaar.
8. Overige velden, rollen en bewaartermijnen zijn configureerbaar tot de club ze vaststelt (zie [Bewaartermijnen](#bewaartermijnen)).

Extra keuzes die ik heb gemaakt (naast de ledenadministratie-aannames onder [Ledenadministratie](#ledenadministratie)): *gedeactiveerd* is tijdelijk en heractiveerbaar (zelfde QR), *definitief ingetrokken* is onomkeerbaar. Voor een ingetrokken of verwijderde pas toont de scanner **geen** naam (dataminimalisatie); voor een gedeactiveerde pas wél naam en lidnummer, zodat de controleur kan handelen.

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
   │ twoFactorEnabled, disabledAt                          ├ membership: status, startDate, endDate (historie; ≤ 1 lopend)
   │                                                       └ pass: tokenHash (uniek), tokenCiphertext, status, revocationReason, …
   ├── account_token   (activation | reset; alleen hash; verloopt; eenmalig)
   ├── email_outbox    (kind, status, attempts, providerRef; géén tokens/wachtwoorden)
   ├── audit_event     (actor, actie, doel, beperkte metadata — nooit tokens/wachtwoorden)
   └── scan_event      (controleur, tijdstip, uitkomst, pasreferentie — nooit de ruwe token)
import_batch (tijdelijke preview, wordt na commit gewist) · app_rate_limit · rate_limit (Better Auth)
```

`Member` ≠ `Membership` ≠ `Account` ≠ `Pass`: het lid is de persoon, het lidmaatschap de relatie met de vereniging, het account de login, de pas het uitgegeven token. `account_member_access` is de expliciete autorisatierelatie (met wie koppelde/ontkoppelde en wanneer); e-mailgelijkheid koppelt nooit automatisch.

## Rollen en rechten (minimale rechten)

Zie de volledige autorisatiematrix in [docs/SECURITY.md](docs/SECURITY.md). Kort: **lid** (eigen gekoppelde passen), **scanner** (alleen scannen), **manager/ledenbeheer** (leden, lidmaatschappen, passen, import, export, koppelingen, mailstatus + scannen; geen rollen/beveiliging), **sysadmin** (alles + accounts en audit). MFA is verplicht voor manager en sysadmin; optioneel voor scanner (`REQUIRE_MFA_SCANNER=true`).

## Ledenadministratie

Vier afzonderlijke begrippen, met expliciete koppelingen en elk een eigen status:

| Begrip | Tabel | Wat | Status |
|---|---|---|---|
| **Lid** | `member` | de persoon: lidnummer (uniek, onveranderlijk), naam, optioneel e-mail, optionele externe referentie, notitie | gearchiveerd (`archived_at`, omkeerbaar) · verwijderd (`deleted_at`, wissen na bewaartermijn) |
| **Lidmaatschap** | `membership` | relatie met de vereniging, met begin- en einddatum (kalenderdagen, Europe/Amsterdam, einddatum = laatste geldige dag) | opgeslagen: `active` · `suspended` · `ended`; afgeleid: *geldig*, *nog niet gestart*, *verlopen*, *geschorst*, *beëindigd*, *geen lidmaatschap* |
| **Account** | `user` + `account_member_access` | de login; één account kan **expliciet** aan meerdere leden zijn gekoppeld (gezin) | geactiveerd / niet geactiveerd / geblokkeerd |
| **Ledenpas** | `pass` | digitale pas van **één** lid met eigen QR-token | `active` · `deactivated` · `revoked` |

**Scanregel** (`src/lib/status.ts`, de enige plek): geldig ⇔ pas `active` **én** lid niet verwijderd/gearchiveerd **én** lidmaatschap nu geldig. Alle andere combinaties zijn ongeldig; zonder lidmaatschapsregel is een scan ongeldig (fail-safe). De scanner toont dan *ONGELDIG · Lidmaatschap niet geldig* met alleen naam en lidnummer; de reden (beëindigd/geschorst/verlopen) wordt bewust niet naar de scanner gestuurd. Een Wallet-pas bestaat niet meer in deze app (door de club afgevoerd), dus er is geen Wallet-synchronisatie nodig; een offline kopie op het toestel van een lid toont nooit een QR voor een niet-geldig lidmaatschap en blijft slechts een weergave: **de scanner is altijd leidend**.

**Statusbetekenis** (ook in de app uitgelegd op de lidpagina):
- *Geldig*: actief, begindatum bereikt (of leeg), einddatum niet voorbij (of leeg). *Nog niet gestart*: actief, begindatum in de toekomst. *Verlopen*: actief, einddatum voorbij. *Geschorst*: door een beheerder, nooit geldig ongeacht datums, weer te activeren. *Beëindigd*: nooit geldig; een nieuw lidmaatschap start als nieuwe regel (historie blijft). Hoogstens één lopend (actief/geschorst) lidmaatschap per lid (unieke index).
- Een actief account maakt een niet-geldig lidmaatschap niet geldig, en een actieve pas evenmin.
- *Gearchiveerd*: lid uit de standaardlijsten, scans ongeldig, niet zichtbaar in de ledenomgeving; **niets wordt gewist** en het is omkeerbaar. *Verwijderen* is een aparte stap die alleen na archivering kan, per lid, met reden, getypt lidnummer en een overzicht van wat het raakt; de pas wordt direct ingetrokken en na de bewaartermijn wordt het lid definitief gewist. Accounts en andere gekoppelde leden worden daarbij **nooit** verwijderd.
- Betaling/contributie: geen invloed (niet gebouwd; productbeslissing nog open).

**Beheer** (`/beheer`): ledenlijst met zoeken (naam, lidnummer, externe referentie) en filters op lidmaatschap, pas en archief · lidpagina met overzicht (lidmaatschap, pas, accounts, "scan nu geldig?"), statusuitleg, lidmaatschap starten/schorsen/activeren/beëindigen/datums, pas blokkeren/vervangen/intrekken/als verloren markeren, gegevens, accounts (met "ook gekoppeld aan"), historie (audit per lid), archiveren/herstellen/verwijderen · **Koppelingen** (`/beheer/ledenaccounts`): per ledenaccount de gekoppelde leden met statussen en ontkoppelen · import en export.

**Ledenomgeving**: een account ziet alleen expliciet gekoppelde, niet-verwijderde en niet-gearchiveerde leden, elk met eigen lidmaatschaps- en passtatus (en pas/QR alleen als geldig), plus een lijst "Gekoppelde leden". Geen beheerdersnotities, audit- of andere accountgegevens. Toegang wordt server-side bepaald via `account_member_access`; er zijn geen ledenroutes met een lid-ID in de URL.

**E-mail is nooit een identiteit**: meerdere leden mogen hetzelfde adres hebben; er wordt nooit automatisch samengevoegd of gekoppeld op e-mail, naam of iets anders. Adressen worden alleen getrimd en naar kleine letters gezet (zoals Better Auth doet); plus-adressen en andere varianten blijven aparte adressen. Bij meerdere leden voor één nieuw account gaat er maximaal één uitnodiging uit (idempotente sleutel per account).

### Oud-leden
Een **oud-lid** is een lid van wie het lidmaatschap is **beëindigd of verlopen** (einddatum voorbij). Dit is een afgeleide categorie (geen aparte opgeslagen status, dus nooit tegenstrijdig met het lidmaatschap): `lid` (geldig, nog niet gestart, geschorst) · `oud-lid` (beëindigd of verlopen) · `geen` (geen lidmaatschap). Zodra de einddatum voorbij is, wordt iemand automatisch oud-lid; met een nieuw lidmaatschap wordt het lid weer lid. Een oud-lid blijft een volledig ledenrecord (pasgeschiedenis, koppelingen, historie) en kan worden gearchiveerd. In Beheer: filter **Oud-leden** op de ledenlijst, badge *Oud-lid* in lijst en lidpagina, teller op het overzicht, kolom `categorie` in de export, en een eigen doelgroep voor nieuwsbrieven. De pas van een oud-lid is niet geldig (scanregel).

### Nieuwsbrieven
Module in Beheer (`/beheer/nieuwsbrieven`, recht `newsletter.manage`: ledenbeheer en systeembeheer). Werkwijze: **concept → voorbeeld → testmail naar uzelf → bevestigen → versturen**.
- **Tekst**: platte tekst met lichte opmaak (lege regel = alinea, `## Kop`, `- ` opsomming, `**vet**`, `[tekst](https://…)` of een los https-adres). Er wordt nooit ruwe HTML overgenomen; alles wordt geëscaped en alleen http(s)-links worden links. Max. 150 tekens onderwerp (geen regeleinden) en 20.000 tekens tekst. Het voorbeeld staat in een sandbox-iframe.
- **Doelgroepen**: *Leden* (geldig lidmaatschap, niet gearchiveerd), *Oud-leden* (beëindigd of verlopen, ook gearchiveerd), *Iedereen met een e-mailadres* (alle niet-verwijderde leden). Alleen het contactadres van het lid wordt gebruikt; **gedeelde adressen (gezin) ontvangen één mail**; leden zonder adres en verwijderde leden nooit; afgemelde adressen nooit. Vóór het versturen ziet u het aantal ontvangers; dat moet kloppen op het moment van bevestigen.
- **Verzenden**: concept → *in verzending* → *verstuurd* (of *geannuleerd*). Ontvangers worden vastgelegd per adres (`newsletter_delivery`) en in batches van 25 verstuurd terwijl de beheerpagina open staat (met voortgang); de dagelijkse cron (`/api/cron/outbox`) maakt de rest af en herhaalt mislukte pogingen (max. 5, backoff). Annuleren stopt wat nog wacht; mislukte verzendingen zijn opnieuw te proberen. Een verstuurde nieuwsbrief is niet meer te wijzigen of te verwijderen.
- **Afmelden (verplicht in elke mail)**: elke mail heeft een afmeldlink met een persoonlijk, niet te raden token (HMAC; niets opgeslagen) én `List-Unsubscribe`/`List-Unsubscribe-Post` voor één-klik afmelden in mailprogramma's. De afmeldpagina muteert pas na een klik (veilig tegen link-prefetching) en toont alleen een gemaskeerd adres. Afmelden geldt per e-mailadres voor **alle nieuwsbrieven** (`newsletter_optout`), niet voor activatie-/reset-/pasmails. Aanmelden (ongedaan maken) is bewust niet in de app: dat vraagt een nieuwe toestemming van de persoon (zie openstaande beslissingen).
- **Testmodus**: staat `EMAIL_MODE` niet op `live`, dan worden hoogstens **3** mails echt verstuurd (en alleen naar `EMAIL_TEST_RECIPIENT`); de rest wordt als overgeslagen vastgelegd. In `live` gaat de nieuwsbrief naar de echte ontvangers: zet dit pas na verificatie van het afzenderdomein (SPF/DKIM) bij Resend.
- **Plannen**: een concept kan worden gepland (datum en tijd in Amsterdamse tijd, minimaal 10 minuten en hooguit een jaar vooruit; geplande nieuwsbrieven zijn niet te wijzigen, wel te annuleren). De ontvangers worden pas op het **verzendmoment** bepaald. Het moment wordt opgepakt door de dagelijkse cron én zodra een beheerder de nieuwsbriefpagina's opent; op het Vercel Hobby-plan draait de cron maar één keer per dag (rond 08:15), dus een plan voor later die dag wordt pas bij de eerstvolgende controle verstuurd. Voor een nauwkeurig tijdstip is een Pro-plan met een uurlijkse cron nodig. Zijn er dan geen ontvangers meer, dan wordt het weer een concept met een foutmelding.
- **Privacy**: per verzending wordt alleen het e-mailadres bewaard (geen naam, geen lidnummer), tot `NEWSLETTER_DELIVERY_RETENTION_DAYS` (standaard 730 dagen; daarna werkt de afmeldlink uit die oude mail niet meer). Afmeldingen worden bewaard zolang de afmelding moet worden gerespecteerd. Het auditlog bevat nooit e-mailadressen of tekst. Optioneel `NEWSLETTER_SENDER_INFO` (afzenderregel onderaan elke mail, bijv. vereniging + adres).

### CSV-import en -export
Import in vier stappen: **upload → kolomkoppeling → voorbeeld → bevestigen**. Herkende kolommen: `lidnummer`, `naam`, `email`, `notitie`, `externe_referentie`, `lidmaatschap` (actief/geschorst/beëindigd), `begindatum`, `einddatum` (JJJJ-MM-DD of DD-MM-JJJJ); andere kolomnamen koppelt de beheerder zelf. Matchsleutel voor bestaande leden: **lidnummer** (standaard) of een gekozen **externe referentie**; nooit e-mail. Per rij toont het voorbeeld *nieuw / bijwerken (met velden) / ongewijzigd / fout / te beoordelen*. Gedeelde e-mailadressen zijn toegestaan (groepering ter bevestiging). Dubbele lidnummers in het bestand zijn een fout; een lidnummer dat bij een ander lid hoort of afwijkt van het gematchte lid wordt geweigerd; gearchiveerde/verwijderde leden worden niet bijgewerkt. **Mogelijke dubbele personen** (zelfde naam na normalisatie bij een ander lidnummer) worden gesignaleerd en alleen op expliciete keuze per regel als nieuw lid geïmporteerd — nooit samengevoegd. Bijwerken wijzigt alleen opgegeven (niet-lege) velden, maakt geen account/uitnodiging/pas aan, en leegmaken via import bestaat niet. Verwerken vraagt expliciete bevestiging en gebeurt in één transactie; herhaald importeren geeft geen dubbele leden, passen of uitnodigingen. Het ruwe bestand en het voorbeeld worden na verwerken gewist (en verlopen na 1 uur); het bestand zelf wordt nooit opgeslagen.

Export (`POST /api/beheer/export`, knop op de ledenlijst; recht `members.export`): CSV van de huidige selectie met lidnummer, naam, e-mail, externe referentie, categorie (lid/oud-lid/geen), lidmaatschap + datums, passtatus, gearchiveerd en notitie — **nooit tokens**. Origin-controle (CSRF), MFA, limiet 10/uur per account, `no-store`, formule-injectie geneutraliseerd, en elke export staat in het auditlog (filters en aantal, geen persoonsgegevens).

### Migratie en terugdraaien
Migratie `drizzle/0004_ledenadministratie.sql` voegt `membership`, `member.external_ref`, `member.archived_at` en `import_batch.raw/mapping` toe en maakt voor **elk bestaand niet-verwijderd lid een lopend lidmaatschap zonder datums** aan (idempotent), zodat bestaande passen en koppelingen na de migratie ongewijzigd geldig blijven. Maak vóór de eerste productiedeploy een Neon-back-up/branch. Terugdraaien: eerst de code van vóór deze wijziging terugzetten en daarna eventueel `drop table membership; alter table member drop column external_ref, drop column archived_at; alter table import_batch drop column raw, drop column mapping;` — zonder de nieuwe code is er geen lidmaatschapscontrole meer. Bestaande leden, passen en accountkoppelingen worden niet gewijzigd.

## Statusregels pas

De pas zelf (los van het lidmaatschap): `active` → `deactivated` (reden verplicht, heractiveerbaar) · `active|deactivated` → `revoked` (definitief; via intrekken, heruitgifte of verwijderen van het lid). `revoked` heeft geen uitgaande overgangen en de versleutelde token wordt gewist.

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
npm test            # 99 unit-/integratietests tegen een lokale Postgres (maakt zelf database clubsupport_test)
npm run test:e2e    # bouwt en draait 43 end-to-end- en browsertests (Chromium, nepcamera, axe-toegankelijkheidscontrole)
```

Voor Postgres: `TEST_ADMIN_DATABASE_URL` (standaard `postgres://postgres:postgres@localhost:5432/postgres`). Overzicht per vereiste test: [docs/TESTING.md](docs/TESTING.md).

## Deployment (Vercel)

1. Project gekoppeld aan de GitHub-repo; productiebranch bepaalt de productie-deploy.
2. Zet de variabelen uit `.env.example` in Vercel (secrets als *Sensitive*). `DATABASE_URL` komt van de Neon-koppeling.
3. De build draait `tsx scripts/migrate.ts` en `scripts/bootstrap-admin.ts` en daarna `next build`. **Alleen productie-deploys migreren** (previews niet).
4. Crons (`vercel.json`): mail-retry (incl. afmaken van nieuwsbrieven) en opruimen draaien dagelijks; beveiligd met `CRON_SECRET` (zet een willekeurige waarde van ≥ 16 tekens). Op het Hobby-plan zijn alleen dagelijkse crons mogelijk; direct na een beheeractie wordt de outbox al meteen verwerkt.
5. **Kies een EU-regio** voor zowel de Neon-database als de functies (`vercel.json` zet `fra1`).

### Eerste beheerder
Zet `BOOTSTRAP_ADMIN_EMAIL` (alleen Production), deploy, en haal de eenmalige activatielink (24 uur) uit de buildlog. Stel een wachtwoord in en richt MFA in. Het adres wijzigen kan later onder *Beheer → Accounts*. Verwijder daarna de variabele.

### Inloggen, passkeys en MFA-herstel
- **Geen autofill bij tweestapsverificatie**: het veld voor de verificatie- en herstelcode heeft `autocomplete="off"`, een neutrale veldnaam, uitgeschakelde autocorrectie/spellingcontrole en de negeer-attributen van de gangbare wachtwoordmanagers (`src/lib/no-autofill.ts`); het veld begint altijd leeg en wordt na een fout geleegd. Getest in Chromium.
- **Gelekte wachtwoorden**: bij het instellen of resetten van een wachtwoord wordt het gecontroleerd via Pwned Passwords (k-anonymity: alleen de eerste 5 tekens van de SHA-1-hash verlaten de server; het wachtwoord nooit). Een gelekt wachtwoord wordt geweigerd zonder de link te verbruiken. Bij elke geslaagde wachtwoordlogin wordt ook het bestaande wachtwoord gecontroleerd; bij een treffer krijgt het account (maximaal maandelijks) een mail om een nieuw wachtwoord te kiezen. Valt de dienst uit, dan faalt de controle **open** (niemand wordt buitengesloten). Uit te zetten met `PASSWORD_BREACH_CHECK=off`.
- **Passkeys (WebAuthn)**: leden, controleurs en beheerders kunnen een passkey instellen op hun beveiligingspagina (`/ledenpas/beveiliging`, `/scanner/beveiliging`, `/beheer/beveiliging`) en daarmee inloggen ("Inloggen met passkey"). Gebruikersverificatie (pincode/biometrie) is **server-side verplicht**, dus voor beheer-rollen telt een passkey als volwaardige tweede factor (geen aparte authenticator-app nodig). Bij het eerste instellen van MFA kiezen beheerders tussen app en passkey. Er zijn meerdere passkeys per account mogelijk; de laatste tweede factor van een beheerder kan niet worden verwijderd.
- **MFA-herstel**: (1) inloggen met een **herstelcode** ("Telefoon kwijt?"), (2) **nieuwe herstelcodes** maken (met wachtwoord), (3) **reset door systeembeheer** op de pagina Accounts (reden + bevestiging; verwijdert authenticator, herstelcodes en passkeys, beëindigt sessies; het account en alle systeembeheerders krijgen een melding), niet voor jezelf, (4) **noodscript** als geen systeembeheerder meer kan inloggen: `DATABASE_URL=… npx tsx scripts/reset-mfa.ts <e-mail> "<reden>"`. Houd daarom minimaal twee systeembeheerders actief.

### Waarschuwing bij verdachte activiteit
Systeembeheer ziet onder **Meldingen** (`/beheer/meldingen`, ook als banner op het overzicht) en ontvangt per e-mail: meerdere mislukte inlogpogingen voor een account (≥ 5 in 15 min; ook het account zelf krijgt een mail) en veel mislukte pogingen vanaf één herkomst, meerdere onjuiste verificatiecodes (≥ 5 in 15 min per herkomst), veel onbekende/afgewezen scans door één controleur (≥ 10 in 10 min: code-raden), ongewoon veel zoekopdrachten (> 100 per uur), meerdere exports kort achter elkaar (3 in een uur) of een export buiten kantooruren (23:00–06:00), een gebruikte herstelcode, een gewijzigde rol en een MFA-reset. Accounts krijgen daarnaast een melding bij een toegevoegde/verwijderde passkey en nieuwe herstelcodes. Een melding bevat **nooit** wachtwoorden, codes, e-mailadressen of ruwe IP-adressen (alleen een HMAC-hash van de herkomst); per voorval één melding (dedupe-sleutel). Afhandelen wordt vastgelegd; informatieve meldingen tellen niet mee in de teller. Drempels staan in `THRESHOLDS` (`src/server/security.ts`).

### Wijzigingsverzoeken van leden
Op `/ledenpas/verzoeken` kan een account voor elk **expliciet gekoppeld** lid een verzoek doen: *gegevens wijzigen* (naam en/of contact-e-mailadres; wijzigt nooit het inlogadres) of *lidmaatschap opzeggen* (gewenste einddatum, max. een jaar vooruit). Er verandert **niets vóór goedkeuring**. De ledenadministratie (`/beheer/verzoeken`, recht `members.write`, teller in de navigatie) ziet huidig versus gevraagd en keurt goed (wordt in één transactie doorgevoerd en geaudit) of wijst af (reden verplicht; het lid ziet die). Het lid krijgt de uitkomst per e-mail en kan een openstaand verzoek intrekken. Eén open verzoek per lid en type, max. 10 per dag per account. Goedkeuren wordt geweigerd bij een staf-e-mailadres, een gearchiveerd lid of ontbrekend lidmaatschap. Een opzegging met een einddatum in de toekomst laat het lidmaatschap tot die dag lopen (daarna oud-lid); met vandaag of eerder eindigt het direct. Afgehandelde verzoeken worden na 90 dagen gewist.

### Auth
Better Auth met e-mail+wachtwoord (min. 12 tekens), geen publieke registratie, sessies 24 uur (sliding, `HttpOnly`, `Secure`, `SameSite=Lax`), inlogpogingen begrensd (5 per 5 minuten per IP), TOTP-MFA met herstelcodes. Wachtwoordherstel stuurt alleen een eenmalige link (1 uur) met altijd dezelfde generieke bevestiging; bij een reset worden alle sessies ingetrokken.

### E-mail
`EMAIL_MODE=test` (standaard): elke mail gaat naar `EMAIL_TEST_RECIPIENT` met prefix `[TEST]`. Om echt te versturen: verifieer een afzenderdomein bij Resend, zet `EMAIL_FROM`, `RESEND_API_KEY` en `EMAIL_MODE=live`. `disabled` verstuurt niets (status "uitgeschakeld" in Beheer).

### Wallet
Apple Wallet en Google Wallet worden **niet** gebruikt. Leden gebruiken de pas in de app; na inloggen kan een offline kopie op het toestel worden bewaard (zie Offline gebruik).

### Offline gebruik door leden
Na inloggen bewaart de Ledenpas (met toestemming van het lid, aan/uit te zetten op het ledenscherm) een kopie van de eigen passen op het toestel, zodat de QR ook zonder internet te tonen is. De kopie verloopt na `OFFLINE_PASS_MAX_DAYS` (standaard 30, max 90), wordt bij elke online sessie ververst en bij uitloggen gewist. Een service worker (`/sw-ledenpas.js`) houdt de offline pagina en bestanden beschikbaar. Let op: een nieuw geïnstalleerde service worker neemt in sommige browsers pas na enkele seconden de pagina's over. De scanner blijft **altijd online** valideren, dus een ingetrokken pas wordt daar alsnog afgekeurd.

### Pas bewaren of afdrukken
Bij elke actieve pas staan de knoppen **Pas bewaren als afbeelding** (de hele pas als PNG: logo, naam, lidnummer en QR; deelmenu op telefoons, anders download) en **Afdrukken** (alleen die pas). Dit gebeurt volledig op het toestel. Let op: een bewaarde afbeelding of afdruk is een kopie van de QR en blijft geldig tot de pas wordt ingetrokken; zie "Een statische QR kan worden gekopieerd".

### Zoeken door de scanner en controlelogboek
Zonder pas kan de controleur een lid zoeken op naam of lidnummer (minimaal 3 tekens, maximaal 8 resultaten, begrensd per minuut). Het resultaat toont alleen naam, lidnummer en of er een actieve pas is. In Beheer staat onder **Controles** een doorzoekbaar controlelogboek (controleur, uitkomst, lid, periode); zoektermen worden niet vastgelegd. Op de pagina's *Controles* en *Audit* kiest u met knoppen per account wie u wilt inzien; ook vanuit *Accounts*.

### Demo-/testaccounts
Met `SEED_DEMO=true` (Production) maakt de build bij de eerste keer drie demo-accounts met **synthetische gegevens** en willekeurige wachtwoorden: één ledenaccount met 1 pas, één met 3 passen en een testcontroleur. De wachtwoorden verschijnen **één keer** in de buildlog (verder niet opgeslagen); bestaande accounts blijven ongemoeid. `SEED_DEMO=reset` maakt nieuwe, `SEED_DEMO=remove` verwijdert alle demo-gegevens. **Verwijder de demo-accounts vóór echte leden worden ingevoerd** en laat de variabele niet staan: het zijn bekende accounts. Er wordt voor demo-accounts geen e-mail verstuurd.

### Overige configuratie
`SCAN_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, `DELETED_MEMBER_RETENTION_DAYS`, `REQUIRE_MFA_SCANNER`, `OFFLINE_PASS_MAX_DAYS`, `NEWSLETTER_DELIVERY_RETENTION_DAYS`, `PASSWORD_BREACH_CHECK`, `NEWSLETTER_SENDER_INFO`, `DB_POOL_MAX` — zie `.env.example`.

## Bewaartermijnen
Standaard: scanlog 90 dagen · auditlog 730 dagen · verwijderde leden 90 dagen daarna definitief gewist (incl. passen en koppelingen) · tokens/importpreviews/rate-limit-rijen/sessies kort · verzonden mails 90 dagen. Verzendregels van nieuwsbrieven 730 dagen na verzending · beveiligingsmeldingen 365 dagen · afgehandelde wijzigingsverzoeken 90 dagen. Dagelijkse opruimjob: `/api/cron/purge`. De club moet deze termijnen vaststellen.

## Bekende beperkingen
- **Een statische QR kan worden gekopieerd** (screenshot, foto). Mitigatie: de scanner toont altijd naam en lidnummer ter vergelijking met een legitimatiebewijs, en een gelekte pas kan direct en definitief worden ingetrokken/heruitgegeven. Dit voorkomt screenshots **niet** volledig.
- De offline kopie op het toestel van een lid wordt niet op afstand ongeldig; **intrekking wordt uitsluitend door de online scanner afgedwongen.** De kopie bevat de pastoken in `localStorage` van de browser (zie docs/SECURITY.md).
- Sleutels niet roteren zonder plan: een nieuwe `TOKEN_HMAC_KEY` maakt alle passen onbekend, een nieuwe `TOKEN_ENC_KEY` maakt opgeslagen tokens onleesbaar (passen tonen dan "tijdelijk niet beschikbaar" tot heruitgifte).
- App-iconen, favicon, en e-mailafbeeldingen worden uit het logo gegenereerd: `node scripts/make-icons.mjs brand-source/HHC_ClubSupport_Logo_RGB.png` (vereist Chromium via Playwright). Het bronbestand staat in `brand-source/`.
- DIN-fonts zijn door HHC aangeleverd; controleer of de licentie webgebruik dekt.
- Niet getest op een echt iOS-/Android-toestel en niet met een echt Resend-account; zie [docs/TESTING.md](docs/TESTING.md).
