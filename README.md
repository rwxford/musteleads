# Musteleads

Event lead capture app for trade shows, conferences, and defense/intel events.

**Scan badges. Scan business cards. Export to Salesforce. Save to Contacts.**

## Features

- **Badge QR Scanner** — Decodes vCard, MeCard, URL, and plain-text QR codes from event badges
- **Business Card Scanner** — OCR-powered scanning of paper business cards (name, company, title, email, phone)
- **Cipher Lab** — Reverse-engineers encrypted/proprietary badge QR codes by learning from known pairs
- **CSV Export** — Salesforce Data Import Wizard compatible CSV export
- **vCard Contact Save** — Download .vcf files to add leads to phone contacts
- **Offline-First** — PWA with service worker + IndexedDB, works without internet

## Tech Stack

- **Next.js** — Mobile-first Progressive Web App (PWA)
- **html5-qrcode** — QR/barcode scanning via Web Camera API
- **Tesseract.js** — In-browser OCR (WASM, no server needed)
- **Dexie.js** — IndexedDB for offline lead storage
- **Tailwind CSS** — Mobile-first responsive design
- **Coder brand** theming (coder.com/brand)

## Target Events (2026)

Google Cloud Next, SOF Week, TECHNET CYBER, TechNet Augusta, DoDIIS, Eurosatory, CANSEC, AFA Air Space & Cyber, TechNet IndoPacific, AWS re:Invent, and more.

## Status

🚧 Under active development — MVP targeting Google Cloud Next (April 22, 2026)
