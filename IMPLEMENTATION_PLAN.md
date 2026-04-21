# Musteleads — Implementation Plan

> **Based on**: PRD v2.0 (2026-04-16)  
> **Scope**: Phase 1 MVP improvements — fix scanning, add Cloud OCR, polish UX  
> **Current state**: App deployed at musteleads.vercel.app, core flows working but OCR unusable

---

## Current State Assessment

### What Works
- [x] QR scanning UI (html5-qrcode) — camera opens, viewfinder renders
- [x] vCard, MeCard, plain-text QR parsers
- [x] Lead review/edit form (email required)
- [x] IndexedDB storage (Dexie.js)
- [x] Server Postgres sync (Neon via Vercel)
- [x] Lead list with search
- [x] CSV export (Salesforce headers)
- [x] vCard .vcf generation + download
- [x] PWA manifest + service worker
- [x] Bottom navigation
- [x] Coder brand theming (black/white)
- [x] Debug trace system
- [x] OCR trace storage (client + server)

### What's Broken / Missing
- [ ] **QR detection fails on real badges** — html5-qrcode not detecting Space Symposium badge QR codes at all
- [ ] **Tesseract.js OCR is unusable** — 29-54% accuracy on real badges, mostly garbage output
- [ ] **No Cloud OCR** — Google Cloud Vision API not integrated
- [ ] **No OCR routing** — no logic to choose cloud vs. offline engine
- [ ] **No image preprocessing** — no contrast/sharpening before OCR
- [ ] **No duplicate detection** — same person can be scanned multiple times
- [ ] **No scan feedback** — no haptic vibration or audio on successful scan
- [ ] **No confidence flagging** — low-confidence fields not highlighted in review screen
- [ ] **Tag system incomplete** — no preset tags, no custom tag creation UI
- [ ] **No LinkedIn field** — not captured or stored

---

## Implementation Milestones

### Milestone 1: Fix QR Scanning (Day 1)
**Goal**: QR codes on real conference badges actually get detected and decoded.

#### Tasks

**1.1 Diagnose QR detection failure**
- Test html5-qrcode with sample QR images from Space Symposium badges
- Check if the issue is: format not supported, resolution too low, scan region too small, or library bug
- Test alternative: generate known QR codes and verify library works at all

**1.2 Improve html5-qrcode configuration**
- Enable all supported formats: `QR_CODE`, `DATA_MATRIX`, `AZTEC`, `PDF_417`, `CODE_128`
- Increase scan frequency (`fps: 10` or higher)
- Remove `qrbox` size constraint — let the library scan the full viewfinder
- Set `aspectRatio: { ideal: 1 }` for camera, not for scan region
- Enable `experimentalFeatures: { useBarCodeDetectorIfSupported: true }` — uses native BarcodeDetector API on supported browsers (Chrome Android, Safari 16.4+)

**1.3 Add QR library fallback**
- If html5-qrcode fails to detect after 10 seconds, show "No QR detected — capture badge for OCR" button
- This makes the OCR path easily accessible without removing QR scanning

**1.4 Add scan feedback**
- `navigator.vibrate(200)` on successful QR decode
- Optional audio beep (respect device silent mode)

**Tests:**
- Scan a vCard QR code → verify lead data populated
- Scan a plain-text QR → verify heuristic parsing
- Scan an opaque/encrypted QR → verify graceful fallback to OCR prompt
- Verify scan works on iOS Safari and Android Chrome

---

### Milestone 2: Google Cloud Vision OCR Integration (Day 1-2)
**Goal**: Replace Tesseract.js as the primary OCR engine with Cloud Vision API.

#### Tasks

**2.1 Create `/api/ocr` server route**
- `POST /api/ocr` accepts `{ image: string (base64), mode: 'badge' | 'card' }`
- Reads `GOOGLE_CLOUD_VISION_API_KEY` from env
- Calls `https://vision.googleapis.com/v1/images:annotate` with `TEXT_DETECTION`
- Returns: `{ text: string, blocks: TextBlock[], confidence: number, processingTimeMs: number }`
- If API key not configured, return 503 with helpful error
- Rate limit: simple in-memory counter, max 10 req/min per IP (prevent accidental loops)

**2.2 Create `CloudVisionOCR.ts` client module**
- `async processImage(base64Image: string, mode: 'badge' | 'card'): Promise<OCRResult>`
- Calls `/api/ocr` endpoint
- Handles timeout (5 second abort signal)
- Handles network errors gracefully (returns `{ error: 'offline', fallback: true }`)
- Parses response into `OCRResult` type matching existing Tesseract interface

**2.3 Create `OCRRouter.ts` — automatic engine selection**
```typescript
async function performOCR(image: string, mode: 'badge' | 'card'): Promise<OCRResult> {
  if (navigator.onLine) {
    try {
      return await cloudVisionOCR(image, mode);
    } catch (e) {
      // Cloud failed — fall back to Tesseract
      return await tesseractOCR(image, mode);
    }
  }
  return await tesseractOCR(image, mode);
}
```

**2.4 Spatial field extraction from Cloud Vision response**
- Parse `fullTextAnnotation.pages[0].blocks` for bounding box info
- Sort text blocks by bounding box height (descending) → largest = name
- Second largest block (below name on Y-axis) → company
- Remaining blocks → classify via regex/heuristics:
  - Email: `/[\w.-]+@[\w.-]+\.\w{2,}/`
  - Phone: `/[\+\d\s\-\(\)]{7,}/`
  - Title: keyword match (Director, VP, Manager, Engineer, etc.)
  - URL/LinkedIn: `/linkedin\.com|https?:\/\//`

**2.5 Update `BadgeOCRFallback.ts` and `CardOCRProcessor.ts`**
- Replace direct Tesseract calls with `OCRRouter.performOCR()`
- Pass Cloud Vision structured blocks to field extraction (use spatial data when available)
- Keep Tesseract-specific extraction logic as fallback path

**2.6 Set up Vercel environment variable**
- User adds `GOOGLE_CLOUD_VISION_API_KEY` to Vercel project settings
- Document GCP setup: create project → enable Cloud Vision API → create API key → restrict to Vision API

**Tests:**
- Unit test: `/api/ocr` route with mock Cloud Vision response → verify structured output
- Unit test: `OCRRouter` with online/offline scenarios
- Unit test: Spatial field extraction with sample Cloud Vision response
- Integration test: capture badge image → cloud OCR → verify name/company extracted
- Offline test: disable network → verify Tesseract fallback kicks in

---

### Milestone 3: Image Preprocessing (Day 2)
**Goal**: Improve OCR accuracy by preprocessing images before sending to OCR engine.

#### Tasks

**3.1 Create `ImagePreprocessor.ts`**
- Use HTML5 Canvas API for client-side image manipulation
- Pipeline: resize → grayscale → contrast enhancement → sharpen → crop
- Operations:
  - **Resize**: Scale to max 2048px on longest side (Cloud Vision limit, reduces upload size)
  - **Auto-contrast**: Histogram stretch — map darkest pixel to 0, lightest to 255
  - **Sharpen**: 3x3 convolution kernel for edge enhancement
  - **Grayscale**: Convert to grayscale (improves OCR on colored badges)
- Return processed image as base64 JPEG (quality 0.85 for size/quality balance)
- Measure and log preprocessing time

**3.2 Add badge-specific preprocessing**
- Detect and reduce glare (plastic badge holder reflection)
- Optional: perspective correction if badge is tilted (stretch goal)

**3.3 Wire preprocessing into OCR pipeline**
- Scanner captures raw image → `ImagePreprocessor.process()` → OCR engine
- Store both raw and preprocessed images in debug trace (when debug mode on)

**Tests:**
- Before/after comparison: preprocess a low-contrast badge image, run OCR on both, compare accuracy
- Verify preprocessing adds <500ms to pipeline

---

### Milestone 4: Scanner UX Improvements (Day 2-3)
**Goal**: Make the scanner feel fast, responsive, and trustworthy.

#### Tasks

**4.1 Badge mode UX flow**
- Camera opens immediately (warm up camera on page load)
- QR scanner runs continuously in background
- "Capture Badge" button always visible at bottom for manual OCR trigger
- On QR detect: haptic + beep → parse → auto-navigate to review
- On "Capture Badge" tap: freeze frame → preprocess → OCR → navigate to review
- Loading state: "Processing..." overlay with spinner during OCR (show engine: "Cloud OCR" or "Offline OCR")

**4.2 Card mode UX flow**
- Camera with card-shaped overlay guide (3.5:2 aspect ratio, credit card proportions)
- "Capture" button at bottom
- On capture: freeze frame → show preview → "Use This Photo" / "Retake" buttons
- On confirm: preprocess → OCR → navigate to review
- Store card photo in IndexedDB alongside lead

**4.3 Mode toggle improvements**
- Persist last-used mode in localStorage
- Clear visual distinction between Badge and Card modes
- Badge mode icon: QR code symbol
- Card mode icon: credit card / ID card symbol

**4.4 Auto-OCR when QR yields opaque data**
- If QR scan returns data that doesn't match vCard/MeCard/URL/text patterns:
  - Store raw QR data on lead record
  - Show brief toast: "QR code detected but encrypted — capturing badge text..."
  - Auto-trigger badge OCR without user intervention
  - Navigate to review with OCR-extracted fields + raw QR in debug info

**Tests:**
- Full flow: scan QR badge → review → save → appears in lead list
- Full flow: capture business card → review → save → card photo viewable in detail
- Full flow: encrypted QR → auto-OCR → review with extracted name/company
- Offline flow: all above work without network (Tesseract fallback)

---

### Milestone 5: Lead Management Polish (Day 3)
**Goal**: Duplicate detection, confidence flagging, better tags, LinkedIn field.

#### Tasks

**5.1 Duplicate detection**
- On lead save, check IndexedDB for existing lead with same email
- If match found: show modal — "This email already exists (scanned at [event] on [date])"
  - Options: "Update Existing" (merge fields, prefer non-empty), "Save as New", "Cancel"
- On CSV export: de-duplicate by email (keep most recent)

**5.2 Confidence flagging in review screen**
- Display overall OCR confidence score (0-100%) at top of review form
- Fields populated by OCR: show confidence indicator
  - ≥90%: green checkmark
  - 70-89%: yellow warning icon
  - <70%: red flag icon + field highlighted
- Add "OCR" chip/badge next to auto-filled fields so user knows what was machine-read

**5.3 Tag system completion**
- Preset tags: "Hot", "Warm", "Cold", "Follow Up", "Enterprise", "SMB"
- Custom tag creation: type a new tag name, press Enter to add
- Tags stored in localStorage for persistence across sessions
- Tag display: colored chips on lead list and detail screens
- Filter leads by tag on lead list screen

**5.4 Add LinkedIn field**
- Add `linkedIn` field to Lead interface, Dexie schema, Drizzle schema
- Extract LinkedIn URLs from OCR text and QR data
- Display as clickable link on lead detail screen
- Include in CSV export as `LinkedIn_URL__c` column

**5.5 Lead list improvements**
- Add pull-to-refresh (trigger server sync)
- Swipe-to-delete with confirmation dialog
- Show tag chips inline on each lead card
- Show sync status icon (✓ synced, ↻ pending, ✕ failed)
- Bulk select mode: long-press to enter, checkboxes on each lead

**Tests:**
- Scan same badge twice → verify duplicate warning on second scan
- Scan low-confidence badge → verify yellow/red indicators on review form
- Create custom tag → verify it appears in tag selector on next scan
- Add lead with LinkedIn URL → verify clickable on detail screen

---

### Milestone 6: Export & Data Improvements (Day 3-4)
**Goal**: Robust export with LinkedIn field, export history, vCard improvements.

#### Tasks

**6.1 CSV export updates**
- Add `LinkedIn URL` column to CSV
- Add "un-exported only" filter (default)
- Mark leads as exported after successful export
- Show export count confirmation before generating file

**6.2 Export history**
- Track each export: timestamp, lead count, filter used, filename
- Display in Settings screen under "Export History"
- Store in localStorage (lightweight)

**6.3 vCard generation updates**
- Add LinkedIn URL as `X-SOCIALPROFILE;type=linkedin:` field in vCard
- Add company/title to NOTE field for context
- Verify .vcf files open correctly in iOS Contacts and Android Contacts

**6.4 Server sync improvements**
- Retry failed syncs with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Show last sync timestamp in settings
- "Force Sync" button in settings
- Sync status on home screen: "All leads synced" or "X leads pending sync"

**Tests:**
- Export CSV → open in Excel/Sheets → verify all columns including LinkedIn
- Export vCard → import on iPhone → verify contact created with all fields
- Kill network → scan 5 leads → restore network → verify all 5 sync to server

---

### Milestone 7: PWA & Offline Hardening (Day 4)
**Goal**: Bulletproof offline experience, fast PWA install.

#### Tasks

**7.1 Service worker improvements**
- Cache Tesseract.js WASM files for offline OCR
- Cache all app routes for offline navigation
- Stale-while-revalidate for API routes
- Cache bust on new deployment

**7.2 Offline indicator**
- Persistent banner at top when offline: "Offline — using local OCR"
- Banner color: yellow/amber
- Auto-dismiss when back online with brief "Back online — syncing..." message

**7.3 PWA install prompt**
- Custom "Install Musteleads" banner on first visit (dismissible)
- Store dismissal in localStorage
- Show install instructions in Settings for manual install

**7.4 App performance**
- Lazy-load Tesseract.js WASM only when needed (offline OCR triggered)
- Lazy-load scanner page (dynamic import of html5-qrcode)
- Measure and optimize cold start time (target: <3s on 4G)

**Tests:**
- Enable airplane mode → open app → scan badge → save lead → export CSV → all works
- Install PWA on iPhone home screen → open → verify app-like experience
- Kill and reopen PWA → verify leads persist from IndexedDB

---

## Task Summary

| Milestone | Day | Key Deliverable | Priority |
|-----------|-----|-----------------|----------|
| 1. Fix QR Scanning | 1 | QR codes actually detected on real badges | P0 |
| 2. Cloud Vision OCR | 1-2 | `/api/ocr` route + `CloudVisionOCR.ts` + `OCRRouter.ts` | P0 |
| 3. Image Preprocessing | 2 | `ImagePreprocessor.ts` — contrast, sharpen, resize | P1 |
| 4. Scanner UX | 2-3 | Fast scan flows, auto-OCR on encrypted QR, card preview | P0 |
| 5. Lead Management | 3 | Duplicate detection, confidence flags, tags, LinkedIn | P1 |
| 6. Export & Data | 3-4 | LinkedIn in CSV/vCard, export history, sync retry | P1 |
| 7. PWA & Offline | 4 | Offline hardening, install prompt, performance | P1 |

---

## Dependencies & Setup

### Google Cloud Vision API Setup (Required Before Milestone 2)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing Coder GCP project)
3. Enable **Cloud Vision API**
4. Create an **API key** (restrict to Cloud Vision API only)
5. Add `GOOGLE_CLOUD_VISION_API_KEY=<key>` to Vercel project environment variables
6. Verify: `curl "https://vision.googleapis.com/v1/images:annotate?key=<key>" -d '{"requests":[]}' ` returns `{"responses":[]}`

### Cost Projection

| Month | Events | Est. Scans | Cloud Vision Cost |
|-------|--------|-----------|-------------------|
| April 2026 | Google Next | ~300 | $0 (free tier) |
| May 2026 | SOF Week, CANSEC | ~500 | $0 (free tier) |
| June 2026 | TechNet Cyber, Eurosatory | ~800 | $0 (free tier) |
| July-Aug 2026 | 3 events | ~600 | $0 (free tier) |
| Peak month | re:Invent | ~1,500 | ~$0.75 |

---

## File Changes Overview

### New Files
```
src/scanner/CloudVisionOCR.ts    — Cloud Vision API client
src/scanner/OCRRouter.ts         — Auto-select cloud vs. offline OCR
src/scanner/ImagePreprocessor.ts — Canvas-based image preprocessing
src/app/api/ocr/route.ts         — Server proxy for Cloud Vision API
```

### Modified Files
```
src/scanner/BadgeOCRFallback.ts  — Use OCRRouter instead of direct Tesseract
src/scanner/CardOCRProcessor.ts  — Use OCRRouter instead of direct Tesseract
src/components/CameraView.tsx    — Fix QR detection, add feedback
src/components/CardCaptureView.tsx — Add preview/retake flow
src/app/review/page.tsx          — Confidence indicators, LinkedIn field
src/app/leads/page.tsx           — Tags, sync status, swipe-to-delete
src/app/leads/[id]/page.tsx      — LinkedIn link, card photo, actions
src/app/export/page.tsx          — LinkedIn column, export history
src/app/settings/page.tsx        — Sync status, OCR preference, export history
src/app/page.tsx                 — Sync status badge, pending count
src/leads/LeadStore.ts           — LinkedIn field, duplicate detection
src/leads/LeadDB.ts              — LinkedIn field, schema update
src/db/schema.ts                 — LinkedIn field in Drizzle schema
src/export/CSVExporter.ts        — LinkedIn column
src/export/VCardGenerator.ts     — LinkedIn X-SOCIALPROFILE field
src/lib/serverSync.ts            — Retry with exponential backoff
```
