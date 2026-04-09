export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  notes: string;
  tags: string[];
  eventName: string;
  scannedAt: string;
  source: 'badge_qr' | 'business_card' | 'manual' | 'cipher_lab';
  syncStatus: 'pending' | 'exported' | 'saved_to_contacts';
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
  notes?: string;
  tags?: string[];
  eventName?: string;
  source: Lead['source'];
  rawQRData?: string;
  cardImageBlob?: Blob;
}
