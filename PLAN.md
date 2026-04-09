# Musteleads — Custom Event Lead Capture App

## Overview

A mobile app (iOS first, Android later) that replaces Popl for event lead capture. The app scans event badge QR codes, decodes attendee data, exports leads as **Salesforce-ready CSV**, and saves them to the user's **phone Contacts**.

**Branding:** Coder brand (Black/White logo, coder.com/brand guidelines). Press kit at github.com/coder/presskit.

---

## Popl Feature Audit (What We're Replacing)

Popl is an in-person lead capture platform. Its core capabilities:

| Popl Feature | In Scope? | Notes |
|---|---|---|
| **Universal Badge Scanner** (QR/barcode on event badges) | **Yes** | Core requirement |
| **QR code decoding** (vCard, MeCard, URL, plain-text) | **Yes** | Core requirement |
| **OCR on badge text** (when QR is encrypted/unusable) | **Yes** | Fallback when QR yields no useful data |
| **Paper business card scanning** (OCR) | **Yes** | Re-uses OCR pipeline |
| **CSV export** (Salesforce-importable) | **Yes** | Core requirement (direct Salesforce API sync deferred to Phase 2) |
| **Save to phone Contacts** | **Yes** | Core requirement |
| **Offline scanning + deferred sync** | **Yes** | Events have bad Wi-Fi |
| **Lead qualification tags & notes** | **Yes** | Essential for follow-up |
| **Digital business card sharing** (NFC / QR) | Phase 2 | Not in initial scope |
| **AI-powered data enrichment** (20+ data partners) | Phase 2 | Requires paid enrichment APIs |
| **Salesforce direct API sync** | Phase 2 | OAuth 2.0 PKCE + REST API lead creation |
| **Automated follow-up emails** | Phase 2 | Can be handled by Salesforce workflows |
| **Campaign / event management dashboard** | Phase 2 | Web admin portal |
| **Team management / multi-user** | Phase 2 | |
| **Analytics / ROI tracking** | Phase 2 | |

---

## 2026 Event Calendar & Badge Platform Research

These are the target events. Badge QR code format varies by registration platform.

| Event | Location | Dates | Registration Platform | Expected QR Format |
|---|---|---|---|---|
| **Google Cloud Next** | Las Vegas | Apr 22-24 | GPJ (George P. Johnson) | Opaque attendee ID → Cipher Lab |
| **Spring Intelligence Symposium** | DC | Apr 28-29 | TBD | Likely vCard or opaque ID |
| **Modern Day Marine** | DC | Apr 28-30 | TBD (defense expo) | Likely SPARGO or proprietary |
| **SOF Week** | Tampa | May 18-21 | **Cvent** | Opaque attendee ID (encrypted) → Cipher Lab |
| **CANSEC 2026** | Ottawa | May 27-28 | CADSI (proprietary) | Likely encrypted → Cipher Lab |
| **TECHNET CYBER** | Baltimore | Jun 2-4 | **SPARGO, Inc.** | Likely opaque ID → Cipher Lab |
| **TechNet International** | Brussels | Jun 9-10 | AFCEA Europe | Likely SPARGO or similar |
| **CANIC 2026** | Ottawa | Jun 10 | TBD | Likely vCard or opaque ID |
| **Eurosatory** | Paris | Jun 15-19 | COGES Events | Defense expo → encrypted |
| **ACI National Defense** | San Diego | Jul 21-22 | TBD | Likely vCard |
| **Carahsoft DevOps Day** | Reston | Jul 28 | TBD | Likely vCard |
| **DoDIIS 2026** | Tampa | Aug 9-12 | **Cvent** (likely) | Opaque ID → Cipher Lab |
| **AFCEA TechNet Augusta** | Augusta | Aug 17-20 | **SPARGO, Inc.** | Opaque ID → Cipher Lab |
| **AFA Air, Space & Cyber** | DC | Sep 14-16 | TBD | Likely opaque ID |
| **Defense TechConnect** | DC | Sep 21 | TBD | Likely vCard |
| **TechNet IndoPacific** | Honolulu | Oct 28-31 | **SPARGO, Inc.** | Opaque ID → Cipher Lab |
| **MilCIS 2026** | Canberra | Nov 17-19 | TBD (Australian defense) | Likely encrypted |
| **AWS re:Invent** | Las Vegas | Nov 30 - Dec 4 | **AWS Events** (proprietary) | Opaque attendee ID → Cipher Lab |

### Key Findings

- **AFCEA events** (TechNet Cyber, Augusta, IndoPacific) use **SPARGO, Inc.** for registration and expo management. Badges use QR codes for lead capture scanning.
- **SOF Week** uses **Cvent** as their registration vendor. Their data policy confirms "all attendee badges will contain a QR code that can be scanned by Exhibitor Lead Capture devices."
- **Google Cloud Next** uses **GPJ** for registration. Badge scanning at expo gives exhibitors access to attendee info.
- **AWS re:Invent** uses proprietary AWS Events registration. Booth exhibitors scan badges to collect lead data (name, email, phone). QR codes are opaque IDs, not vCard.
- **Most defense/intel events** use encrypted or opaque ID QR codes. This is exactly where the **Cipher Lab** feature is critical.

### Implication for App Design

For ~80% of these events, badge QR codes will contain an **opaque attendee ID** (not vCard data). The app must handle this via:
1. **Cipher Lab** — Learn the encoding by collecting (encrypted QR, known plaintext) pairs from the event's official scanner.
2. **OCR fallback** — Read the name, company, and title printed on the badge face.
3. **Manual entry** — For edge cases, allow quick manual entry with email as required field.

---

## Architecture

### Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Next.js (mobile-first PWA) | Mobile-friendly web app, no app store needed, instant deploy via Vercel/Cloudflare |
| **Camera / QR** | `html5-qrcode` + Web Camera API | Browser-native camera access, no native dependencies, works on all mobile browsers |
| **OCR (badge + business card)** | Tesseract.js (WASM) or Google Cloud Vision API | Tesseract.js runs in-browser offline; Cloud Vision for higher accuracy (optional) |
| **Contacts** | vCard file download (.vcf) | Generate .vcf file, browser prompts 'Add to Contacts' on mobile |
| **CSV Export** | Blob download + Web Share API | Salesforce Data Import Wizard compatible |
| **Local DB** | IndexedDB (via Dexie.js) + localStorage | Browser-native offline storage, PWA service worker cache |
| **State** | Zustand | Lightweight, works in web and React Native |
| **Navigation** | Next.js App Router | File-based routing, SSR/SSG support |
| **Styling** | Tailwind CSS | Utility-first CSS, mobile-first responsive design |

### High-Level Data Flow

```
                         ┌─────────────────────────────────┐
                         │         Scanner Screen           │
                         │  ┌───────────┬────────────────┐  │
                         │  │Badge QR   │ Business Card  │  │
                         │  │  Mode     │    Mode        │  │
                         │  └─────┬─────┴───────┬────────┘  │
                         └────────┼─────────────┼───────────┘
                                  │             │
                    ┌─────────────┘             └──────────────┐
                    ▼                                          ▼
             ┌─────────────┐                          ┌──────────────┐
             │ QR Decoder   │                          │  OCR Engine  │
             │ (VisionCam)  │                          │  (ML Kit)    │
             └──────┬───────┘                          └──────┬───────┘
                    │                                         │
          ┌─────────┼──────────┐              ┌───────────────┼──────────┐
          ▼         ▼          ▼              ▼               ▼          ▼
     ┌────────┐ ┌────────┐ ┌────────┐  ┌──────────┐   ┌──────────┐ ┌────────┐
     │ vCard  │ │MeCard  │ │Cipher  │  │ Name/    │   │ Phone/   │ │ Email  │
     │ Parser │ │ Parser │ │  Lab   │  │ Company/ │   │ Address  │ │Extractor│
     └───┬────┘ └───┬────┘ └───┬────┘  │ Title    │   │ Extract  │ └───┬────┘
         │          │          │       └────┬─────┘   └────┬─────┘     │
         └──────────┴──────────┴────────────┴──────────────┴───────────┘
                                            │
                                            ▼
                                  ┌─────────────────┐
                                  │  Lead Review     │
                                  │  Screen          │
                                  │  (edit/tag/note) │
                                  │  [email required]│
                                  └────────┬────────┘
                                           │
                    ┌──────────────────────┼──────────────────┐
                    ▼                      ▼                  ▼
             ┌─────────────┐     ┌──────────────┐    ┌──────────────┐
             │  IndexedDB  │     │  CSV Export   │    │  vCard       │
             │  (Dexie.js) │────▶│  (Salesforce) │    │  Download    │
             └─────────────┘     └──────────────┘    └──────────────┘
```

---

## QR Code Decoding Strategy

Event badges use several QR formats. The app must handle all of them:

### 1. vCard (most common)
```
BEGIN:VCARD
VERSION:3.0
N:Smith;Jane;;;
FN:Jane Smith
ORG:Acme Corp
TITLE:VP Sales
TEL;TYPE=WORK:+15551234567
EMAIL;TYPE=WORK:[email protected]
END:VCARD
```
**Parser:** Regex-based vCard 3.0/4.0 parser that extracts N, FN, ORG, TITLE, TEL, EMAIL, ADR, URL fields.

### 2. MeCard (compact vCard variant)
```
MECARD:N:Smith,Jane;ORG:Acme Corp;TEL:+15551234567;EMAIL:[email protected];;
```
**Parser:** Key-value parser splitting on `;` and `:`.

### 3. URL-based (dynamic QR linking to event platform)
```
https://eventplatform.com/attendee/abc123
```
**Strategy:** Extract the URL, attempt HTTP GET to resolve attendee data (if the platform exposes a public profile). If not resolvable, fall back to OCR on the physical badge.

### 4. Encrypted / proprietary event QR codes — Reverse-Engineering Mode
Many events encrypt their badge QR data so only the official scanner works. Instead of giving up, the app includes a **cipher-learning mode** that reverse-engineers the encoding:

#### How It Works
1. **Capture the encrypted QR** — Scan the badge QR code and store the raw ciphertext.
2. **Capture the plaintext** — Use the event's official scanner (or manually enter the result) to get the decoded attendee data.
3. **Build a pair** — The app stores `(ciphertext, plaintext)` pairs in a local "cipher lab" database.
4. **Pattern detection** — After collecting multiple pairs, the app analyzes them to determine the encoding scheme:
   - **Base64 / URL-encoding** — Simple decode attempt on every scan.
   - **Fixed-offset substitution** — Character frequency analysis across pairs.
   - **Delimiter-based custom format** — Structural pattern matching (e.g., fields separated by `|`, `,`, or fixed-width offsets).
   - **Symmetric encryption (AES/DES)** — If pairs reveal a consistent key, store it for the event.
   - **Lookup table / hash** — If the QR is just an opaque ID, the app maps IDs → contact data from the collected pairs and can decode future badges from the same event that share the same ID scheme.
5. **Auto-decode** — Once a pattern is identified for an event, the app applies it automatically to subsequent scans at that event.
6. **Fallback** — If no pattern is found, OCR on the badge's printed text (name, company, title).

#### Cipher Lab UI
- **Pair Collection Screen**: Side-by-side entry — scan QR on left, enter/scan plaintext on right.
- **Event Cipher Profile**: Each event gets a cipher profile storing the algorithm + parameters.
- **Confidence Indicator**: Shows how many pairs collected and whether the pattern is confirmed.
- **Export/Import**: Share cipher profiles between team members at the same event.

#### Data Model
```typescript
interface CipherPair {
  id: string;
  eventId: string;
  rawQRData: string;      // encrypted/encoded content from badge QR
  decodedData: LeadData;  // known-good result from official scanner
  capturedAt: Date;
}

interface EventCipher {
  eventId: string;
  eventName: string;
  algorithm: 'base64' | 'url-encoded' | 'substitution' | 'delimiter' | 'aes' | 'lookup' | 'unknown';
  parameters: Record<string, string>;  // key, delimiter char, offset, etc.
  confidence: number;       // 0-1, based on number of validated pairs
  pairsCollected: number;
  verified: boolean;         // true once algorithm correctly decodes a new pair
}
```

### 5. Plain text
Some badges encode `FirstName LastName | Company | Title` or CSV-style data.
**Parser:** Heuristic text parser using common delimiter patterns.

---

## Module Breakdown

### Module 1: Scanner (`/src/scanner/`)

The scanner has two co-equal modes selectable via a tab/toggle at the top of the camera view:

**Mode A: Badge QR Scanner**
- **CameraView**: Full-screen camera with QR overlay frame
- **QRProcessor**: Receives raw QR data string, routes to correct parser
- **VCardParser**: Parses vCard 3.0/4.0 text into a `Lead` object
- **MeCardParser**: Parses MeCard format
- **TextParser**: Heuristic parser for plain text badges
- **BadgeOCRFallback**: When QR yields opaque/encrypted data and no cipher profile exists, capture badge face via OCR to extract name/company/title

**Mode B: Business Card Scanner**
- **CardCaptureView**: Camera with card-shaped overlay guide (credit-card aspect ratio)
- **CardOCRProcessor**: Captures frame, runs ML Kit text recognition, applies business-card-specific extraction:
  - **NameExtractor**: Identifies the largest/boldest text block as the person's name
  - **CompanyExtractor**: Detects company name (often second-largest text or near a logo)
  - **ContactExtractor**: Regex patterns for email, phone, URL, address
  - **TitleExtractor**: Heuristic for job titles (common keywords: Director, VP, Manager, Engineer, etc.)
- **CardImageStore**: Saves a photo of the card alongside the lead record for reference

**Shared**
- **ScanModeToggle**: Toggle between "Badge" and "Card" modes; persists last-used mode
- Both modes feed into the same `Lead` object and Lead Review Screen

### Module 2: Cipher Lab (`/src/cipher/`)

- **CipherLab**: Manages `(ciphertext, plaintext)` pair collection per event
- **PatternAnalyzer**: Runs analysis across collected pairs to detect the encoding scheme:
  - Tries Base64 / URL-decode first (zero pairs needed)
  - Delimiter pattern matching (2+ pairs)
  - Character substitution / XOR analysis (5+ pairs)
  - AES key brute-force from known-plaintext (10+ pairs)
  - Lookup table mapping for opaque IDs
- **CipherProfiles**: CRUD for per-event cipher profiles; auto-applied on scan
- **Decoders**: Pluggable decoder modules (Base64, Delimiter, Substitution, AES, Lookup)
- **CipherExport**: Serialize/deserialize profiles for sharing between team devices

### Module 3: Lead Management (`/src/leads/`)

- **LeadStore**: Zustand store for in-memory leads
- **LeadDB**: SQLite CRUD for persistent lead storage
- **LeadReviewScreen**: Edit form after scan (pre-filled fields, add tags/notes)
- **LeadListScreen**: Searchable/filterable list of all captured leads
- **LeadDetailScreen**: Full lead view with actions (sync to SF, save to contacts)
- **TagManager**: Create/assign qualification tags

### Module 4: CSV Export (`/src/export/`)

- **CSVExporter**: Generate Salesforce-importable CSV files from leads
  - Column headers match Salesforce Lead object: `FirstName`, `LastName`, `Company`, `Title`, `Email`, `Phone`, `LeadSource`, `Description`, `Event_Name__c`, `Scanned_At__c`
  - Filter by event, date range, tags, or all leads
  - De-duplication by email before export
- **ShareService**: Uses Web Share API (mobile) or Blob download (desktop) to save/send the CSV
- **ExportHistory**: Track what was exported and when (avoid re-exporting)

### Module 5: Phone Contacts Integration (`/src/export/`)

- **VCardGenerator**: Generates .vcf (vCard 3.0) files from Lead data
  - Maps Lead fields → vCard properties (FN, N, ORG, TITLE, TEL, EMAIL)
  - On mobile browsers, downloading a .vcf file triggers the native "Add to Contacts" prompt
  - Batch export: generate multi-contact .vcf file
- **Permission handling**: Camera permission via Web Camera API (`navigator.mediaDevices`)

### Module 6: Offline Support (`/src/offline/`)

- **Service Worker**: Caches app shell, static assets, and Tesseract.js WASM files for offline use
- **IndexedDB (Dexie.js)**: All leads stored in browser IndexedDB — persists across sessions
- **PWA Manifest**: Enables "Add to Home Screen" with app name, icon, splash screen
- **Online/Offline detection**: `navigator.onLine` + `online`/`offline` events to show sync status banner

---

## Screen Map

```
App
├── HomeScreen (quick stats, recent leads, scan button)
├── ScannerScreen
│   ├── BadgeQRMode (QR overlay + OCR fallback)
│   ├── BusinessCardMode (card-shaped guide + full OCR)
│   └── LeadReviewScreen (post-scan edit form, email required)
├── CipherLabScreen
│   ├── PairCollectionView (scan encrypted QR + enter/scan decoded result)
│   ├── EventCipherList (per-event cipher profiles with confidence %)
│   └── CipherImportExport
├── LeadsScreen (list of all leads)
│   └── LeadDetailScreen (full view, actions)
├── SettingsScreen
│   ├── CSV Export (filter + share)
│   ├── Default Tags
│   ├── Offline Mode indicator
│   └── About
└── EventsScreen (group leads by event name/date)
```

---

## Salesforce CSV Export Detail

Phase 1 uses CSV export instead of direct Salesforce API integration. The CSV is formatted for Salesforce Data Import Wizard.

### CSV Column Mapping

| App Field | CSV Column | Salesforce Lead Field | Required? |
|---|---|---|---|
| firstName | `First Name` | `FirstName` | No |
| lastName | `Last Name` | `LastName` | **Yes** |
| company | `Company` | `Company` | **Yes** |
| title | `Title` | `Title` | No |
| email | `Email` | `Email` | **Yes** |
| phone | `Phone` | `Phone` | No |
| notes | `Description` | `Description` | No |
| tags | `Lead Source` | `LeadSource` | No |
| eventName | `Event Name` | `Event_Name__c` | No |
| scannedAt | `Scanned At` | `Scanned_At__c` | No |

> **Note:** Email is enforced as required in-app. If a scan does not yield an email, the user must manually enter one before the lead can be saved.

### Export Flow
1. User taps **Export** on LeadsScreen or SettingsScreen
2. Filter dialog: by event, date range, tags, or "all un-exported"
3. App generates CSV with headers matching Salesforce import wizard
4. Share sheet opens (email, AirDrop, Files, etc.)
5. Leads marked as `exported` in local DB

### Sample CSV Output
```csv
First Name,Last Name,Company,Title,Email,Phone,Lead Source,Description,Event Name,Scanned At
Jane,Smith,Acme Corp,VP Sales,[email protected],+15551234567,Trade Show,"Met at booth, interested in enterprise plan",TechNet Cyber 2026,2026-06-02T14:30:00Z
```

---

## Phone Contacts Save Detail

Using vCard 3.0 `.vcf` file generation:

```
BEGIN:VCARD
VERSION:3.0
N:Smith;Jane;;;
FN:Jane Smith
ORG:Acme Corp
TITLE:VP Sales
TEL;TYPE=WORK:+15551234567
EMAIL;TYPE=WORK:[email protected]
NOTE:Captured at TechNet Cyber 2026 on 2026-06-02
END:VCARD
```

On mobile browsers (Safari, Chrome), downloading a `.vcf` file triggers the native "Add to Contacts" prompt. No app permissions needed.

---

## Offline Strategy

1. **All scans** are saved to IndexedDB immediately (regardless of connectivity)
2. Each lead has a `syncStatus` field: `pending` | `exported` | `saved_to_contacts`
3. Service worker caches app shell + Tesseract.js WASM for full offline use
4. User sees a banner: "X leads pending export" on home screen

---

## Project Structure

```
musteleads/
├── package.json
├── next.config.js              # Next.js + PWA config
├── tailwind.config.ts
├── tsconfig.json
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # Service worker
│   ├── icons/                  # App icons (Coder brand)
│   └── favicon.ico
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout (nav, theme)
│   │   ├── page.tsx            # HomeScreen
│   │   ├── scanner/
│   │   │   └── page.tsx        # ScannerScreen (badge/card toggle)
│   │   ├── leads/
│   │   │   ├── page.tsx        # LeadListScreen
│   │   │   └── [id]/
│   │   │       └── page.tsx    # LeadDetailScreen
│   │   ├── review/
│   │   │   └── page.tsx        # LeadReviewScreen
│   │   ├── cipher-lab/
│   │   │   └── page.tsx        # Cipher Lab screen
│   │   ├── events/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── components/
│   │   ├── CameraView.tsx      # Shared camera with mode toggle
│   │   ├── ScanModeToggle.tsx   # Badge / Card mode switch
│   │   ├── CardCaptureView.tsx  # Card-shaped overlay guide
│   │   ├── LeadForm.tsx        # Lead edit form (shared)
│   │   └── ExportDialog.tsx    # CSV export filter + download
│   ├── scanner/
│   │   ├── QRProcessor.ts
│   │   ├── VCardParser.ts
│   │   ├── MeCardParser.ts
│   │   ├── TextParser.ts
│   │   ├── BadgeOCRFallback.ts
│   │   ├── CardOCRProcessor.ts
│   │   ├── ContactExtractor.ts
│   │   ├── NameExtractor.ts
│   │   └── TitleExtractor.ts
│   ├── cipher/
│   │   ├── CipherLab.ts
│   │   ├── PatternAnalyzer.ts
│   │   ├── CipherProfiles.ts
│   │   ├── decoders/
│   │   │   ├── Base64Decoder.ts
│   │   │   ├── DelimiterDecoder.ts
│   │   │   ├── SubstitutionDecoder.ts
│   │   │   ├── AESDecoder.ts
│   │   │   └── LookupDecoder.ts
│   │   └── CipherExport.ts
│   ├── leads/
│   │   ├── LeadStore.ts        # Zustand store
│   │   ├── LeadDB.ts           # Dexie.js IndexedDB wrapper
│   │   └── TagManager.ts
│   ├── export/
│   │   ├── CSVExporter.ts      # PapaParse CSV generation
│   │   ├── VCardGenerator.ts   # .vcf file generation for contacts
│   │   └── ExportHistory.ts
│   ├── offline/
│   │   └── ServiceWorkerReg.ts # SW registration + cache management
│   ├── types/
│   │   └── Lead.ts
│   └── utils/
│       └── permissions.ts      # Camera permission handling
├── .gitignore
└── README.md
```

---

## Implementation Phases

### Phase 1: Core MVP — Mobile Web PWA, Google Next Sprint (14 days, Apr 8-22)
- [ ] Project scaffold (Next.js + TypeScript + Tailwind CSS + PWA)
- [ ] Camera + QR scanning (html5-qrcode + Web Camera API)
- [ ] Scanner mode toggle: Badge QR / Business Card
- [ ] vCard + MeCard + plain-text parsers
- [ ] Business card OCR pipeline via Tesseract.js (name, company, title, email, phone extraction)
- [ ] Card image capture + IndexedDB storage alongside lead record
- [ ] OCR fallback (Tesseract.js in-browser)
- [ ] Cipher Lab: encrypted QR reverse-engineering mode
  - [ ] Pair collection screen (scan QR + enter plaintext)
  - [ ] Pattern analysis engine (base64, delimiter, substitution, AES, lookup)
  - [ ] Event cipher profiles (persist + auto-apply)
  - [ ] Export/import cipher profiles between devices
- [ ] Lead review/edit screen (email required)
- [ ] IndexedDB local storage (Dexie.js)
- [ ] Lead list + detail screens
- [ ] CSV export (Salesforce Data Import Wizard compatible)
- [ ] Phone Contacts save (vCard .vcf download)
- [ ] PWA offline support (service worker + IndexedDB)
- [ ] Basic settings screen
- [ ] Coder brand theming (Black/White, coder.com/brand), mobile-first responsive
- [ ] Deploy to Vercel/Cloudflare Pages

> **Google Next scope**: Badge QR scanning, business card OCR, lead review, IndexedDB storage, CSV export, and vCard contact download. PWA installable on phone home screen. Cipher Lab can ship as v1.1 update after the event.

### Phase 2: Native Apps + CRM
- [ ] Native iOS app (React Native — reuse TypeScript business logic)
- [ ] Apple Developer Account enrollment + App Store submission
- [ ] Salesforce OAuth 2.0 PKCE + REST API lead creation
- [ ] Direct Salesforce sync with de-duplication
- [ ] Digital business card sharing (your own QR/NFC card)
- [ ] Data enrichment (Clearbit / Apollo API integration)
- [ ] Automated follow-up email triggers
- [ ] Event/campaign grouping
- [ ] Google Play submission (Android native)

### Phase 3: Team & Enterprise
- [ ] Multi-user support with roles
- [ ] Web admin dashboard
- [ ] Analytics / event ROI tracking
- [ ] HubSpot + other CRM integrations
- [ ] Custom field mapping UI

---

## Key Dependencies

| Package | Purpose | Version |
|---|---|---|
| `next` | Framework (React) | ^15.x |
| `html5-qrcode` | QR/barcode scanning via camera | ^2.x |
| `tesseract.js` | In-browser OCR (WASM) | ^5.x |
| `dexie` | IndexedDB wrapper (offline DB) | ^4.x |
| `zustand` | State management | ^5.x |
| `tailwindcss` | Styling | ^4.x |
| `next-pwa` | PWA + service worker + offline | ^5.x |
| `papaparse` | CSV generation | ^5.x |

---

## Decision: Why Web App (PWA) Instead of Native?

- **No app store friction**: Deploy instantly via URL. No Apple Developer account needed. No review process.
- **Google Next in 14 days**: Web app ships faster than any native approach.
- **Mobile-first PWA**: Add-to-home-screen gives app-like experience. Offline via service worker.
- **Camera access**: Web Camera API + `html5-qrcode` handles QR scanning on mobile browsers.
- **Contact save**: Generate .vcf download — mobile browsers prompt "Add to Contacts" natively.
- **CSV export**: Blob download or Web Share API — no native file system needed.
- **Phase 2**: When native apps are needed, the TypeScript business logic (parsers, cipher lab, lead management) ports directly to React Native.

---

## Resolved (All)

1. **App Name**: Musteleads
2. **Salesforce**: CSV export in Phase 1; direct API integration in Phase 2.
3. **Custom Fields**: Standard Lead fields + `Event_Name__c`, `Scanned_At__c` (custom). CSV headers pre-mapped.
4. **Target Events**: See event calendar above. Primary platforms: **SPARGO** (AFCEA events), **Cvent** (SOF Week, DoDIIS), **GPJ** (Google Next), **AWS Events** (re:Invent).
5. **Branding**: Coder brand — Black/White logo, per coder.com/brand. Press kit at github.com/coder/presskit.
6. **Distribution**: App Store (iOS) first. Google Play in Phase 2.
7. **Apple Developer Account**: Not needed for Phase 1 (PWA). Deferred to Phase 2 alongside native iOS app.
8. **Timeline**: MVP targeting Google Next (April 22). 14-day sprint.

## Native App — Deferred to Phase 2

iOS and Android native apps are deferred to Phase 2. Phase 1 ships as a mobile-first Progressive Web App (PWA):

- **No app store account needed** — deploy via URL
- **Installable** — "Add to Home Screen" on iOS Safari and Android Chrome gives app-like experience
- **Offline-capable** — Service worker caches app shell and static assets
- **Camera access** — Web Camera API works on mobile Safari (iOS 11+) and Chrome
- **Contact save** — .vcf file download triggers native "Add to Contacts" prompt

When ready for Phase 2, the TypeScript business logic (parsers, cipher lab, lead management) ports directly to React Native.
