export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  linkedIn: string;
  notes: string;
  tags: string[];
  eventName: string;
  scannedAt: string;
  source: 'badge_qr' | 'badge_ocr' | 'card_ocr' | 'business_card' | 'manual' | 'cipher_lab';
  ocrConfidence: number;
  ocrEngine: 'cloud-vision' | 'tesseract' | 'none';
  syncStatus: 'pending' | 'synced' | 'failed';
  exportStatus: 'not-exported' | 'exported';
  exportedAt: string | null;
  cardImageBlob?: Blob;
  rawQRData?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadInput {
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  notes?: string;
  tags?: string[];
  eventName?: string;
  source: Lead['source'];
  ocrConfidence?: number;
  ocrEngine?: Lead['ocrEngine'];
  rawQRData?: string;
  cardImageBlob?: Blob;
}
