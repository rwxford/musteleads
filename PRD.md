# Musteleads — Product Requirements Document

> **Version**: 2.0  
> **Last Updated**: 2026-04-16  
> **Author**: Ross Weatherford, Director US Public Sector @ Coder  
> **Status**: Draft — pending review

---

## 1. Problem Statement

Coder's field team attends 15+ defense, intelligence, and technology conferences per year. At each event, the team captures leads by scanning attendee badge QR codes and collecting business cards. The current solution — Popl — costs ~$500/year per seat, locks data in a proprietary platform, provides poor CRM integration, and frequently fails on encrypted badge QR codes used by defense events.

**We need a self-owned, mobile-first lead capture tool that:**
- Scans badge QR codes AND reads printed badge text when QR fails
- Scans paper business cards via OCR
- Works offline (conference Wi-Fi is unreliable)
- Exports leads as Salesforce-compatible CSV
- Saves contacts as .vcf files to the phone's address book
- Matches or exceeds Popl's ~98% OCR accuracy on badges and cards

---

## 2. Product Vision

**Musteleads** is a Progressive Web App (PWA) that replaces Popl for in-person lead capture at trade shows and conferences. It runs in the browser, installs to the home screen, works offline, and gives the user full ownership of their lead data.

The name is a portmanteau of "mustelid" (the weasel family — the Coder mascot is a pine marten) and "leads."

### Why PWA, Not Native

| Factor | PWA | Native (iOS/Android) |
|--------|-----|----------------------|
| Time to market | Days | Weeks (+ App Store review) |
| Distribution | Share a URL | Requires App Store account ($99/yr) |
| Offline | Service worker + IndexedDB | Full native storage |
| Camera | Web Camera API (iOS 11+, all Android) | Native camera SDK |
| Updates | Instant (deploy to Vercel) | App Store review cycle |
| Code reuse | 100% shared | Separate codebases or React Native bridge |

**Decision**: PWA for Phase 1. Native apps deferred to Phase 2 if PWA limitations surface.

---

## 3. Target Users

| User | Description |
|------|-------------|
| **Primary** | Coder field sales team (Ross + reps) attending conferences |
| **Secondary** | Any Coder employee at a booth or networking event |
| **Stretch** | Open-source the tool for the broader sales community |

### User Environment
- **Device**: iPhone (primary), Android (secondary)
- **Network**: Unreliable conference Wi-Fi — app MUST work fully offline
- **Lighting**: Convention halls — fluorescent overhead, badge holders with glare
- **Pace**: Scanning 50-200 badges per day at a busy booth. Speed matters.
- **CRM**: Salesforce (primary), HubSpot (future)

---

## 4. Competitive Analysis: Popl

Popl is the market leader for in-person lead capture. Here's what they do and how Musteleads maps to it.

### 4.1 Popl Scanning Capabilities

| Popl Feature | How It Works | Musteleads Approach |
|--------------|-------------|---------------------|
| **Universal Badge Scanner** | OCR on printed badge text. Cloud-based AI OCR (likely Google Cloud Vision or Azure CV). Claims 98% accuracy. Works when QR is encrypted. | **Google Cloud Vision API** for OCR (98.7% accuracy). Tesseract.js as offline-only fallback. |
| **QR Code Scanner** | Decodes badge QR codes (vCard, MeCard, URL, plain text). Handles LinkedIn QR codes. | **html5-qrcode** library. Parse vCard 3.0/4.0, MeCard, URL, plain text. Add LinkedIn QR support. |
| **Business Card Scanner** | OCR → digital contact card. Photo stored alongside contact. | **Google Cloud Vision API** for OCR. Store card photo in IndexedDB. |
| **Custom Lead Capture Forms** | Event organizers build custom intake forms. | **Phase 2.** Manual entry form with configurable fields covers the gap. |

### 4.2 Popl AI & Enrichment

| Popl Feature | How It Works | Musteleads Approach |
|--------------|-------------|---------------------|
| **AI Enrichment** | After scan, queries 20+ data sources to fill in missing email, phone, LinkedIn, company info, firmographics. Takes 5-15 seconds. | **Phase 2.** Use Clearbit/Apollo/Hunter.io APIs. For Phase 1, user manually completes missing fields. |
| **AI-powered field extraction** | NLP to parse OCR text into structured fields (name, title, company, email, phone). | **Phase 1.** Regex + heuristic extraction. Cloud Vision returns structured text blocks with bounding boxes — use spatial layout (largest text = name, position-based company/title detection). |

### 4.3 Popl Lead Management

| Popl Feature | How It Works | Musteleads Approach |
|--------------|-------------|---------------------|
| **Lead qualification tags** | Predefined + custom tags (Hot/Warm/Cold, product interest, etc.) | **Phase 1.** Tag system with presets + custom tags. |
| **Notes & voice-to-text** | Text notes + voice recording transcribed to text. | **Phase 1.** Text notes. Voice-to-text via Web Speech API (stretch). |
| **Lead scoring** | AI-based lead score from enrichment data. | **Phase 2.** Manual qualification for now. |
| **Duplicate detection** | Merges duplicate contacts by email. | **Phase 1.** De-duplicate by email on export. In-app duplicate warning on scan. |

### 4.4 Popl Export & CRM

| Popl Feature | How It Works | Musteleads Approach |
|--------------|-------------|---------------------|
| **CSV export** | Download leads as CSV. | **Phase 1.** Salesforce-compatible CSV with correct headers. |
| **Salesforce sync** | One-click push to Salesforce via OAuth. | **Phase 2.** OAuth 2.0 PKCE + REST API. |
| **HubSpot sync** | Direct integration. | **Phase 2.** |
| **Zapier/webhooks** | Automation triggers on lead capture. | **Phase 2.** |
| **Automated follow-up emails** | Trigger templated email on scan. | **Phase 2.** Salesforce workflows can handle this. |

### 4.5 Popl Offline & Sync

| Popl Feature | How It Works | Musteleads Approach |
|--------------|-------------|---------------------|
| **Offline scanning** | Full functionality offline. Syncs when back online. | **Phase 1.** IndexedDB + service worker. Server sync when online. |
| **Cross-device sync** | Cloud-based, multi-device. | **Phase 1.** Postgres server DB as sync backup. |

### 4.6 Popl Campaign Management

| Popl Feature | How It Works | Musteleads Approach |
|--------------|-------------|---------------------|
| **Event/campaign grouping** | Organize leads by event with ROI metrics. | **Phase 1.** Event name field on every lead. Filter/group by event. ROI metrics in Phase 2. |
| **Team management** | Admin assigns seats, views team leads. | **Phase 2.** |
| **Analytics dashboard** | Scans per event, conversion rates, ROI. | **Phase 2.** |

---

## 5. Functional Requirements

### FR-1: Badge QR Code Scanning

**Priority**: P0 (must-have)

The app scans QR codes on conference badges. Different events use different QR encodings.

| Sub-requirement | Description |
|----------------|-------------|
| FR-1.1 | Decode **vCard 3.0/4.0** QR codes into structured contact data. |
| FR-1.2 | Decode **MeCard** format QR codes. |
| FR-1.3 | Decode **URL-based** QR codes. If URL points to a public profile page, attempt to scrape contact info. Otherwise, store URL and fall back to badge OCR. |
| FR-1.4 | Decode **plain text** QR codes using heuristic delimiter detection (pipe, comma, tab, fixed-width). |
| FR-1.5 | Handle **encrypted/opaque ID** QR codes gracefully — store raw data, immediately fall back to badge OCR for contact extraction. |
| FR-1.6 | Support QR, Data Matrix, Aztec, and PDF417 barcode formats. |
| FR-1.7 | Scan must complete in <2 seconds from camera focus to parsed result. |
| FR-1.8 | Camera viewfinder shows a scan region overlay. Provide haptic feedback (vibration) and audio beep on successful scan. |
| FR-1.9 | Support **LinkedIn QR codes** — detect `linkedin.com/in/` URLs and store as LinkedIn profile field. |

### FR-2: Badge Text OCR (Cloud-Powered)

**Priority**: P0 (must-have)

When a QR code is encrypted, unreadable, or absent, the app reads the printed text on the badge face.

| Sub-requirement | Description |
|----------------|-------------|
| FR-2.1 | Primary OCR engine: **Google Cloud Vision API** (`TEXT_DETECTION`). Target ≥95% character accuracy on conference badges. |
| FR-2.2 | Offline fallback: **Tesseract.js** (WASM, in-browser). Accept lower accuracy (~50-70%) when offline. |
| FR-2.3 | Auto-detect when to use OCR: if QR scan yields an opaque/encrypted string (no vCard/MeCard/URL pattern), auto-trigger badge face OCR. |
| FR-2.4 | Extract structured fields from OCR text: **name** (first + last), **company/organization**, **title/role**. |
| FR-2.5 | Use spatial layout analysis from Cloud Vision response (text block positions, font sizes) to improve field classification — largest text block is typically the name, second largest is company. |
| FR-2.6 | Handle common badge artifacts: plastic holder glare, lanyard overlap, curved/tilted badges, low conference lighting. Apply image preprocessing (contrast, sharpening) before OCR. |
| FR-2.7 | Store OCR confidence score with each lead. Flag low-confidence results (<70%) for manual review. |
| FR-2.8 | OCR processing must complete in <5 seconds (cloud) or <10 seconds (offline/Tesseract). |

### FR-3: Business Card Scanning

**Priority**: P0 (must-have)

The app captures a photo of a paper business card and extracts contact information via OCR.

| Sub-requirement | Description |
|----------------|-------------|
| FR-3.1 | Card capture mode with credit-card-shaped overlay guide in the viewfinder. |
| FR-3.2 | Extract: **name**, **company**, **title**, **email**, **phone**, **address**, **website**, **LinkedIn URL**. |
| FR-3.3 | Use Google Cloud Vision API as primary OCR engine; Tesseract.js as offline fallback. |
| FR-3.4 | Store the card photo alongside the lead record for manual reference. |
| FR-3.5 | Handle both horizontal and vertical card orientations. |
| FR-3.6 | Support cards in English. Other languages are stretch goals. |

### FR-4: Lead Review & Editing

**Priority**: P0 (must-have)

After every scan, the user reviews and corrects the extracted data before saving.

| Sub-requirement | Description |
|----------------|-------------|
| FR-4.1 | Post-scan review screen pre-filled with extracted fields. User can edit any field. |
| FR-4.2 | **Email is required** to save a lead. If OCR didn't extract an email, the user must type one. |
| FR-4.3 | Show OCR confidence indicator. Highlight fields that are low-confidence. |
| FR-4.4 | Add **tags** (predefined: Hot/Warm/Cold + custom tags). |
| FR-4.5 | Add **free-text notes** (e.g., "Interested in enterprise plan, follow up Thursday"). |
| FR-4.6 | Add **event name** (auto-populated from settings, editable). |
| FR-4.7 | **Duplicate detection**: If email matches an existing lead, warn user and offer to merge/update. |
| FR-4.8 | Save button stores lead to IndexedDB immediately. Fire-and-forget sync to server DB when online. |
| FR-4.9 | "Scan Another" button returns to scanner after save. |

### FR-5: Lead List & Search

**Priority**: P0 (must-have)

| Sub-requirement | Description |
|----------------|-------------|
| FR-5.1 | Scrollable list of all captured leads, most recent first. |
| FR-5.2 | Search by name, company, email, or any field. |
| FR-5.3 | Filter by: event name, tags, date range, export status. |
| FR-5.4 | Lead count displayed at top. |
| FR-5.5 | Tap a lead to view full detail. Edit from detail screen. |
| FR-5.6 | Swipe-to-delete with confirmation. |
| FR-5.7 | Bulk select for batch export or delete. |

### FR-6: CSV Export (Salesforce-Compatible)

**Priority**: P0 (must-have)

| Sub-requirement | Description |
|----------------|-------------|
| FR-6.1 | Export leads as RFC 4180 CSV file with Salesforce Data Import Wizard headers. |
| FR-6.2 | Column mapping: `First Name`, `Last Name`, `Company`, `Title`, `Email`, `Phone`, `Lead Source`, `Description`, `Event Name`, `Scanned At`. |
| FR-6.3 | Filter before export: by event, date range, tags, or "all un-exported." |
| FR-6.4 | De-duplicate by email before export. |
| FR-6.5 | Use Web Share API on mobile (email, AirDrop, Files). Blob download fallback on desktop. |
| FR-6.6 | Mark leads as `exported` after successful export. Track export history. |

### FR-7: vCard Contact Save

**Priority**: P0 (must-have)

| Sub-requirement | Description |
|----------------|-------------|
| FR-7.1 | Generate vCard 3.0 `.vcf` file from lead data. |
| FR-7.2 | Map fields: FN, N, ORG, TITLE, TEL, EMAIL, NOTE (with event name + date). |
| FR-7.3 | Single-lead download triggers native "Add to Contacts" prompt on mobile. |
| FR-7.4 | Batch export: multi-contact .vcf file. |

### FR-8: Offline Support

**Priority**: P0 (must-have)

| Sub-requirement | Description |
|----------------|-------------|
| FR-8.1 | App is fully functional offline: scanning (using Tesseract.js fallback), lead storage, CSV export, vCard generation. |
| FR-8.2 | Service worker caches app shell, static assets, and Tesseract.js WASM files. |
| FR-8.3 | All leads stored in IndexedDB (Dexie.js) as primary store. |
| FR-8.4 | Online/offline indicator in the UI. |
| FR-8.5 | When connectivity returns, auto-sync pending leads to server Postgres DB. |
| FR-8.6 | Queue failed server syncs and retry with exponential backoff. |
| FR-8.7 | PWA manifest enables "Add to Home Screen" with app icon, name, and splash screen. |

### FR-9: Settings & Configuration

**Priority**: P1 (should-have)

| Sub-requirement | Description |
|----------------|-------------|
| FR-9.1 | Set current **event name** (auto-applied to all new scans). |
| FR-9.2 | Manage **tag presets** (add/remove/reorder). |
| FR-9.3 | Toggle **debug mode** (show OCR traces, raw QR data, confidence scores). |
| FR-9.4 | View **export history**. |
| FR-9.5 | View **sync status** (pending leads, last sync time). |
| FR-9.6 | OCR engine preference: Cloud (default) vs. Offline-only. |

### FR-10: Cipher Lab (Encrypted QR Reverse-Engineering)

**Priority**: P2 (nice-to-have for Phase 1, important for defense events)

| Sub-requirement | Description |
|----------------|-------------|
| FR-10.1 | Collect `(encrypted QR data, known plaintext)` pairs per event. |
| FR-10.2 | Auto-detect encoding scheme: Base64, URL-encoding, delimiter-based, substitution cipher, AES, lookup table. |
| FR-10.3 | Store per-event cipher profiles. Auto-apply to subsequent scans. |
| FR-10.4 | Export/import cipher profiles to share between team devices. |
| FR-10.5 | Confidence indicator showing pairs collected and pattern match status. |

---

## 6. Non-Functional Requirements

### NFR-1: Performance

| Requirement | Target |
|-------------|--------|
| QR scan to parsed result | <2 seconds |
| Cloud OCR (badge or card) | <5 seconds end-to-end |
| Offline OCR (Tesseract.js) | <10 seconds |
| App cold start (installed PWA) | <3 seconds |
| Lead list scroll (500+ leads) | 60 fps, no jank |

### NFR-2: Reliability

| Requirement | Target |
|-------------|--------|
| OCR accuracy (Cloud Vision, badges) | ≥95% character accuracy |
| OCR accuracy (Cloud Vision, cards) | ≥95% character accuracy |
| OCR accuracy (Tesseract.js offline) | ≥50% (acceptable for offline fallback) |
| Data loss prevention | Zero lead loss. IndexedDB is source of truth. |
| Offline operation | 100% core functionality without network. |

### NFR-3: Security & Privacy

| Requirement | Description |
|-------------|-------------|
| Data in transit | HTTPS only. Cloud Vision API calls over TLS. |
| Data at rest (client) | IndexedDB in browser sandbox. No sensitive data in localStorage. |
| Data at rest (server) | Postgres with Vercel/Neon managed encryption. |
| API key protection | Google Cloud Vision API key stored as server-side env var. OCR requests proxied through Next.js API route — key never exposed to client. |
| PII handling | Lead data contains PII (names, emails, phones). No third-party analytics that would leak PII. |
| Image handling | Card photos stored in IndexedDB only. Not uploaded to server unless user explicitly enables server sync for images. |

### NFR-4: Compatibility

| Platform | Minimum Version |
|----------|----------------|
| iOS Safari | iOS 15+ |
| Android Chrome | Android 10+ (Chrome 90+) |
| Desktop Chrome | Latest stable (for testing) |

### NFR-5: Cost

| Service | Pricing | Expected Usage | Monthly Cost |
|---------|---------|---------------|-------------|
| Google Cloud Vision API | First 1,000 units/month FREE, then $1.50/1,000 | ~200-500 scans/event, 2-3 events/month | **$0-2/month** (within free tier most months) |
| Vercel hosting | Free tier (hobby) | Low traffic, single user | **$0** |
| Neon Postgres | Free tier | <1GB data | **$0** |
| Domain (optional) | N/A | Using vercel.app subdomain | **$0** |
| **Total** | | | **$0-2/month** |

---

## 7. Technical Architecture

### 7.1 System Diagram

```
┌──────────────────────────────────────────────────────┐
│                    Client (PWA)                       │
│                                                      │
│  ┌─────────────┐   ┌──────────────┐                  │
│  │ Camera View  │   │ Card Capture │                  │
│  │ (QR Scanner) │   │ (Photo Mode) │                  │
│  └──────┬───────┘   └──────┬───────┘                  │
│         │                  │                          │
│         ▼                  ▼                          │
│  ┌─────────────┐   ┌──────────────┐                  │
│  │QR Processor │   │ Image Buffer │                  │
│  │(vCard/MeCard│   │              │                  │
│  │/Text/URL)   │   │              │                  │
│  └──────┬───────┘   └──────┬───────┘                  │
│         │                  │                          │
│         │    ┌─────────────┘                          │
│         │    │                                        │
│         │    ▼                                        │
│         │  ┌──────────────────────────┐               │
│         │  │   OCR Router             │               │
│         │  │   Online? → API route    │               │
│         │  │   Offline? → Tesseract   │               │
│         │  └───────────┬──────────────┘               │
│         │              │                              │
│         │    ┌─────────┴─────────┐                    │
│         │    │                   │                    │
│         │    ▼                   ▼                    │
│         │ ┌────────┐    ┌──────────────┐              │
│         │ │Cloud   │    │ Tesseract.js │              │
│         │ │Vision  │    │ (WASM)       │              │
│         │ │via API │    │ Offline only │              │
│         │ │route   │    └──────┬───────┘              │
│         │ └───┬────┘           │                      │
│         │     │                │                      │
│         │     └────────┬───────┘                      │
│         │              │                              │
│         │              ▼                              │
│         │    ┌──────────────────┐                     │
│         │    │ Field Extractor  │                     │
│         │    │ (Name, Company,  │                     │
│         │    │  Title, Contact) │                     │
│         │    └────────┬─────────┘                     │
│         │             │                               │
│         └──────┬──────┘                               │
│                │                                      │
│                ▼                                      │
│       ┌─────────────────┐                             │
│       │  Lead Review     │                            │
│       │  Screen          │                            │
│       └────────┬────────┘                             │
│                │                                      │
│                ▼                                      │
│       ┌─────────────────┐    ┌─────────────────┐      │
│       │ IndexedDB       │───▶│ Server Sync     │      │
│       │ (Dexie.js)      │    │ (fire & forget) │      │
│       └─────────────────┘    └────────┬────────┘      │
│                                       │               │
└───────────────────────────────────────┼───────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────┐
│                 Server (Next.js API Routes)            │
│                                                       │
│  /api/ocr          → Proxy to Google Cloud Vision     │
│  /api/leads        → CRUD leads in Postgres           │
│  /api/leads/[id]   → Single lead operations           │
│  /api/traces       → OCR debug traces                 │
│  /api/logs         → Application logs                 │
│  /api/health       → Health check + DB status         │
│                                                       │
│  Postgres (Neon)   → leads, traces, logs tables       │
└───────────────────────────────────────────────────────┘
```

### 7.2 Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 16 + TypeScript | App Router, API routes, SSR, Vercel deploy |
| Styling | Tailwind CSS 4 | Mobile-first utility classes |
| QR Scanning | html5-qrcode | Browser-native, supports QR/DataMatrix/Aztec/PDF417 |
| OCR (primary) | **Google Cloud Vision API** via `/api/ocr` | 98.7% accuracy, structured text blocks with positions |
| OCR (offline) | Tesseract.js 7 (WASM) | In-browser, no network needed. Lower accuracy acceptable. |
| Client DB | Dexie.js (IndexedDB) | Offline-first, persistent, no size limits |
| Server DB | Drizzle ORM + @vercel/postgres (Neon) | Sync backup, query support |
| State | Zustand | Lightweight, framework-agnostic |
| PWA | next-pwa | Service worker, caching, install prompt |
| CSV | papaparse | RFC 4180 generation |
| Deploy | Vercel | Auto-deploy from GitHub, free tier |

### 7.3 OCR Architecture (Key Design Decision)

**Problem**: Tesseract.js WASM produces 29-54% accuracy on real conference badges. This is unusable.

**Solution**: Dual-engine OCR with automatic routing.

```
Image captured
      │
      ▼
 navigator.onLine?
   │          │
   YES        NO
   │          │
   ▼          ▼
 /api/ocr    Tesseract.js
 (server)    (in-browser)
   │          │
   ▼          │
 Google       │
 Cloud        │
 Vision       │
 API          │
   │          │
   └────┬─────┘
        │
        ▼
 Field Extraction
 (regex + heuristics + spatial layout)
        │
        ▼
 Lead Review Screen
```

**`/api/ocr` server route**:
- Receives base64-encoded image from client
- Calls Google Cloud Vision API `TEXT_DETECTION` endpoint
- Returns structured text annotations (text, bounding boxes, confidence)
- API key stored as `GOOGLE_CLOUD_VISION_API_KEY` env var on Vercel — never exposed to client
- Rate limiting: max 10 requests/minute per client (prevent abuse)

**Google Cloud Vision API response includes**:
- `textAnnotations[0].description` — full text block
- `textAnnotations[1..n]` — individual words with bounding polygons
- Bounding box positions enable spatial analysis (largest text = name, etc.)

**Cost control**:
- First 1,000 units/month free
- Expected usage: 200-500 scans per event, 2-3 events/month = 400-1,500/month
- Worst case: ~$0.75/month overage
- Google offers $300 in free credits for new accounts

### 7.4 Data Model

```typescript
interface Lead {
  id: string;                    // UUID
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  email: string;                 // Required — enforced in UI
  phone: string;
  linkedIn: string;              // LinkedIn profile URL
  website: string;
  address: string;
  notes: string;
  tags: string[];                // ["Hot", "Enterprise", "Follow-up Thursday"]
  eventName: string;
  source: 'qr-vcard' | 'qr-mecard' | 'qr-text' | 'qr-url' | 'badge-ocr' | 'card-ocr' | 'manual';
  ocrConfidence: number;         // 0-100, from OCR engine
  ocrEngine: 'cloud-vision' | 'tesseract' | 'none';
  cardImageId: string | null;    // Reference to stored card photo
  rawQRData: string | null;      // Raw QR content for debugging
  syncStatus: 'pending' | 'synced' | 'failed';
  exportStatus: 'not-exported' | 'exported';
  exportedAt: string | null;
  createdAt: string;             // ISO 8601
  updatedAt: string;
}

interface OCRTrace {
  id: string;
  leadId: string;
  engine: 'cloud-vision' | 'tesseract';
  rawResponse: string;           // Full API response (JSON)
  extractedText: string;         // Combined text
  confidence: number;
  processingTimeMs: number;
  imagePreprocessing: string;    // What preprocessing was applied
  fieldExtractions: Record<string, string>;  // Which text → which field
  createdAt: string;
}
```

---

## 8. Screen-by-Screen Specifications

### 8.1 Home Screen (`/`)

- **Header**: Musteleads logo + app name
- **Quick Stats**: Total leads, leads today, leads this event
- **Primary CTA**: Large "Scan Badge" button (opens scanner in badge mode)
- **Secondary CTA**: "Scan Card" button (opens scanner in card mode)
- **Recent Leads**: Last 5 leads with name + company + timestamp
- **Offline Banner**: Yellow banner when offline: "Offline mode — scans saved locally"
- **Pending Sync Badge**: "X leads pending sync" if any unsynchronized

### 8.2 Scanner Screen (`/scanner`)

Two modes via toggle at top:

**Badge Mode:**
- Full-screen camera viewfinder
- QR scan region overlay (70% of viewfinder width)
- Auto-detects QR code → parses → routes to review screen
- If QR yields opaque data → auto-triggers OCR capture on badge face
- "Capture Badge" button for manual OCR trigger (when no QR found)
- Haptic feedback + beep on successful QR scan

**Card Mode:**
- Camera viewfinder with credit-card-shaped guide overlay
- "Capture" button to take photo
- Photo sent to OCR engine → parsed → routes to review screen
- Preview of captured card image before processing

### 8.3 Lead Review Screen (`/review`)

- Pre-filled form with all extracted fields
- Fields: First Name, Last Name, Company, Title, Email*, Phone, LinkedIn, Website, Notes
- Email field is **required** — form cannot save without it
- Low-confidence fields highlighted in yellow with ⚠ indicator
- Tag selector (preset tags + custom tag input)
- Notes text area
- Event name (auto-filled from settings, editable)
- OCR confidence score shown (if applicable)
- **Save** button → IndexedDB + server sync
- **Save & Scan Another** button → save + return to scanner
- **Discard** button → return to scanner without saving

### 8.4 Lead List Screen (`/leads`)

- Search bar at top (searches all fields)
- Filter chips: by event, by tag, by date, by export status
- List items show: Name, Company, Email, Event, Tags, Timestamp
- Tap → Lead Detail screen
- Swipe left to delete (with confirm)
- Multi-select mode for bulk operations (export, delete)
- Sort: by date (default), by name, by company

### 8.5 Lead Detail Screen (`/leads/[id]`)

- Full display of all lead fields
- Edit button → inline editing
- Action buttons:
  - "Save to Contacts" → generates and downloads .vcf
  - "Export CSV" → single-lead CSV
  - "Delete" → with confirmation
- Card photo (if captured) displayed as thumbnail, tap to zoom
- OCR trace viewer (debug mode only)
- Sync status indicator

### 8.6 Export Screen (`/export`)

- Export format selector: CSV, vCard, or Both
- Filter options: event, date range, tags, "un-exported only"
- Preview of leads to export (count + list)
- Export button → generates file → opens share sheet (mobile) or downloads (desktop)
- Export history log: previous exports with timestamp + lead count

### 8.7 Settings Screen (`/settings`)

- **Current Event**: Set event name for new scans
- **Tag Management**: Add/remove/reorder preset tags
- **OCR Engine**: Cloud (default) / Offline only
- **Debug Mode**: Toggle OCR traces + raw data display
- **Sync Status**: Pending leads, last sync time, force sync button
- **Export History**: List of past exports
- **About**: Version, credits, links

---

## 9. UX Requirements

### 9.1 Design Principles

1. **Speed over polish**: At a busy booth, every second counts. Minimize taps between scan → save.
2. **Offline-first**: Never block the user because of network. Every action works offline.
3. **Trust but verify**: Auto-fill from OCR, but always show the review screen. Low-confidence fields flagged.
4. **Mobile-first**: Designed for one-handed iPhone use. Thumb-reachable CTAs.

### 9.2 Brand

- **Colors**: Black (`#000000`), White (`#FFFFFF`), accent gray (`#374151`)
- **Logo**: Stylized pine marten (mustelid) — already created, in `/public/icons/`
- **Typography**: System font stack (San Francisco on iOS, Roboto on Android)
- **Coder branding**: Follows coder.com/brand guidelines

### 9.3 Interaction Patterns

- **Haptic feedback**: Vibration on successful QR scan (`navigator.vibrate`)
- **Audio feedback**: Short beep on scan success (optional, respect silent mode)
- **Pull-to-refresh**: On lead list to trigger server sync
- **Swipe gestures**: Swipe-to-delete on lead list
- **Bottom navigation**: 4 tabs — Home, Scan, Leads, Settings

---

## 10. Event-Specific Considerations

### 10.1 Target Events (2026)

| Event | Dates | Location | Expected QR Format | OCR Criticality |
|-------|-------|----------|-------------------|-----------------|
| Google Cloud Next | Apr 22-24 | Las Vegas | Opaque ID | **High** — QR won't decode |
| Spring Intelligence Symposium | Apr 28-29 | DC | Unknown | High |
| Modern Day Marine | Apr 28-30 | DC | Proprietary | High |
| SOF Week | May 18-21 | Tampa | Cvent (encrypted) | **High** |
| CANSEC 2026 | May 27-28 | Ottawa | CADSI (proprietary) | High |
| TechNet Cyber | Jun 2-4 | Baltimore | SPARGO | **High** |
| AWS re:Invent | Nov 30-Dec 4 | Las Vegas | AWS Events (opaque) | **High** |

**Key insight**: ~80% of target events use encrypted/opaque QR codes. Badge OCR is not a fallback — it's the **primary scanning method** for most events. This makes Cloud Vision accuracy critical.

### 10.2 Badge Format Observations

From real-world testing at Space Symposium:
- Badges are in plastic holders with **glare**
- Name is printed in **large text** (24-36pt), company below in smaller text (14-18pt)
- Title and event branding are smaller still
- QR code is on the back or bottom of the badge
- Some badges have QR codes that are simply attendee IDs (no contact data)
- Lanyard clips can obscure top portion of badge

---

## 11. Phase Roadmap

### Phase 1: Core MVP (Current Sprint)

**Goal**: Reliable badge + card scanning with cloud OCR, working offline mode, CSV export.

| Feature | Status | Priority |
|---------|--------|----------|
| QR code scanning (vCard, MeCard, text, URL) | ✅ Built (needs QR detection fixes) | P0 |
| Badge OCR via Google Cloud Vision API | 🔴 Not built | P0 |
| Business card OCR via Cloud Vision | 🔴 Not built | P0 |
| Tesseract.js offline OCR fallback | ✅ Built (low accuracy, acceptable for offline) | P0 |
| OCR Router (auto-select cloud vs. offline) | 🔴 Not built | P0 |
| Lead review/edit screen | ✅ Built | P0 |
| IndexedDB storage | ✅ Built | P0 |
| Server Postgres sync | ✅ Built | P0 |
| Lead list + search + filter | ✅ Built | P0 |
| CSV export (Salesforce) | ✅ Built | P0 |
| vCard contact save | ✅ Built | P0 |
| PWA offline support | ✅ Built | P0 |
| Duplicate detection by email | 🔴 Not built | P1 |
| Tag system (presets + custom) | 🟡 Partial | P1 |
| Lead confidence flagging | 🔴 Not built | P1 |
| Image preprocessing for OCR | 🔴 Not built | P1 |
| Haptic/audio scan feedback | 🔴 Not built | P2 |
| Cipher Lab | 🔴 Not built | P2 |

### Phase 2: CRM Integration & Enrichment

- Salesforce OAuth 2.0 PKCE + direct API lead push
- HubSpot integration
- AI enrichment (Clearbit/Apollo/Hunter.io)
- Automated follow-up email triggers
- Lead scoring
- Voice-to-text notes (Web Speech API)
- Digital business card sharing (your QR code)
- Native iOS app (React Native)

### Phase 3: Team & Enterprise

- Multi-user with roles (admin, rep)
- Web admin dashboard
- Analytics / ROI tracking per event
- Custom field mapping UI
- Team-shared cipher profiles

---

## 12. Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Badge OCR accuracy | ≥95% on cloud, ≥50% offline | Compare extracted fields vs. manual entry |
| Scan-to-save time | <10 seconds (scan + review + save) | Stopwatch testing at events |
| Leads captured per event | ≥100 per day at busy events | Lead count in DB |
| Data loss incidents | Zero | No leads lost due to app crash or sync failure |
| Export accuracy | 100% of saved leads appear in CSV | Manual verification |
| User satisfaction | Replaces Popl without complaints | User feedback |

---

## 13. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Google Cloud Vision API unavailable | OCR degrades to Tesseract (~50%) | Low | Tesseract.js fallback always available. Queue images for retry. |
| Conference Wi-Fi too slow for cloud OCR | Cloud OCR timeouts | Medium | 5-second timeout, auto-fallback to Tesseract. Show "Offline OCR" indicator. |
| Badge glare/angle defeats OCR | Incomplete extraction | Medium | Image preprocessing (contrast, sharpening). User can re-capture. Manual entry always available. |
| Free tier exceeded on Cloud Vision | Unexpected charges | Low | Monitor usage. Alert at 800 units/month. Hard cap at 1,500. |
| html5-qrcode fails on certain QR formats | Can't decode badge QR | Medium (observed) | Try multiple barcode formats. Investigate alternative libraries (jsQR, zxing-js). Badge OCR as fallback. |
| IndexedDB storage limits | Data loss on low-storage devices | Low | Warn user at 80% capacity. Encourage export + server sync. |

---

## 14. Open Questions

1. **Google Cloud Vision API account**: Does Coder have an existing GCP project, or do we create a new one? New accounts get $300 free credit.
2. **Image preprocessing**: Should we use client-side canvas manipulation (contrast, sharpening) before sending to Cloud Vision, or let Cloud Vision handle raw images?
3. **Card photo storage**: Store card photos in IndexedDB only, or also sync to server? (Privacy implications for PII in images.)
4. **Cipher Lab priority**: Build it for Phase 1 (needed for defense events starting May), or defer entirely to Phase 2?
5. **QR library**: Stick with html5-qrcode (which has failed on some real badges) or evaluate alternatives (jsQR, @nicolo-ribaudo/zxing-js)?

---

## Appendix A: Google Cloud Vision API Integration Detail

### API Endpoint
```
POST https://vision.googleapis.com/v1/images:annotate
```

### Request Body
```json
{
  "requests": [{
    "image": {
      "content": "<base64-encoded-image>"
    },
    "features": [{
      "type": "TEXT_DETECTION",
      "maxResults": 50
    }]
  }]
}
```

### Response (relevant fields)
```json
{
  "responses": [{
    "textAnnotations": [
      {
        "description": "ROSS WEATHERFORD\nCoder\nDirector, US Public Sector\n...",
        "boundingPoly": { "vertices": [...] }
      },
      {
        "description": "ROSS",
        "boundingPoly": { "vertices": [{"x": 100, "y": 50}, ...] }
      }
    ],
    "fullTextAnnotation": {
      "text": "ROSS WEATHERFORD\nCoder\nDirector, US Public Sector",
      "pages": [{
        "blocks": [{
          "paragraphs": [{
            "words": [{
              "symbols": [{"text": "R"}, {"text": "O"}, ...],
              "boundingBox": {...},
              "confidence": 0.99
            }]
          }]
        }]
      }]
    }
  }]
}
```

### Field Extraction Strategy (from Cloud Vision output)

1. **Full text** from `textAnnotations[0].description` — split by newlines
2. **Spatial analysis** from `fullTextAnnotation.pages[0].blocks`:
   - Sort blocks by font size (bounding box height) — largest = name
   - Second largest = company
   - Remaining lines: classify via heuristics (title keywords, email regex, phone regex)
3. **Confidence** from `fullTextAnnotation.pages[0].blocks[0].paragraphs[0].words[0].confidence`
4. **Fallback to regex** for email (`/[\w.-]+@[\w.-]+\.\w+/`), phone (`/[\+\d\s\-\(\)]{7,}/`), URLs

### Server-Side API Route (`/api/ocr`)

```typescript
// POST /api/ocr
// Body: { image: string (base64), mode: 'badge' | 'card' }
// Returns: { text: string, annotations: TextAnnotation[], confidence: number }

export async function POST(request: Request) {
  const { image, mode } = await request.json();
  
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OCR service not configured' }, { status: 503 });
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: image },
          features: [{ type: 'TEXT_DETECTION', maxResults: 50 }]
        }]
      })
    }
  );

  const data = await response.json();
  // ... process and return structured result
}
```

---

## Appendix B: Salesforce CSV Column Mapping

| App Field | CSV Header | Salesforce Field | Type | Required |
|-----------|-----------|-----------------|------|----------|
| firstName | `First Name` | FirstName | Text | No |
| lastName | `Last Name` | LastName | Text | **Yes** |
| company | `Company` | Company | Text | **Yes** |
| title | `Title` | Title | Text | No |
| email | `Email` | Email | Email | **Yes** (app-enforced) |
| phone | `Phone` | Phone | Phone | No |
| notes | `Description` | Description | Long Text | No |
| tags.join('; ') | `Lead Source` | LeadSource | Picklist | No |
| eventName | `Event Name` | Event_Name__c | Text (custom) | No |
| createdAt | `Scanned At` | Scanned_At__c | DateTime (custom) | No |
| linkedIn | `LinkedIn URL` | LinkedIn_URL__c | URL (custom) | No |

> **Custom fields** (`Event_Name__c`, `Scanned_At__c`, `LinkedIn_URL__c`) must be created in Salesforce before import. Standard fields work out of the box.
