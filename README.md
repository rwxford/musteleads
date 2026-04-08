# WeaselLeads

Event lead capture app for trade shows, conferences, and defense/intel events.

**Scan badges. Scan business cards. Export to Salesforce. Save to Contacts.**

## Features

- **Badge QR Scanner** — Decodes vCard, MeCard, URL, and plain-text QR codes from event badges
- **Business Card Scanner** — OCR-powered scanning of paper business cards (name, company, title, email, phone)
- **Cipher Lab** — Reverse-engineers encrypted/proprietary badge QR codes by learning from known pairs
- **CSV Export** — Salesforce Data Import Wizard compatible CSV export
- **Phone Contacts** — Save leads directly to device contacts
- **Offline-First** — All scans saved locally; export when ready

## Target Events (2026)

Google Cloud Next, SOF Week, TECHNET CYBER, TechNet Augusta, DoDIIS, Eurosatory, CANSEC, AFA Air Space & Cyber, TechNet IndoPacific, AWS re:Invent, and more.

## Tech Stack

- React Native (Expo) — iOS first
- react-native-vision-camera — QR/barcode scanning
- Google ML Kit — On-device OCR
- SQLite — Offline lead storage
- Coder brand theming

## Status

🚧 Under active development — MVP targeting Google Cloud Next (April 22, 2026)
