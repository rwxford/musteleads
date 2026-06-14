/**
 * Shared contact extraction types used by both the server
 * `/api/extract` route and the client extractor.
 *
 * Both extraction pipelines (A: Cloud Vision text then LLM,
 * B: multimodal LLM) return the same `ExtractedContact` shape so
 * the rest of the app does not care which engine produced it.
 */

export interface ExtractedContact {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  linkedIn: string;
  eventName: string;
  /** Model self reported confidence, 0.0 to 1.0. */
  confidence: number;
}

export type ExtractPipeline = 'A' | 'B';

export interface ExtractMeta {
  pipeline: ExtractPipeline;
  provider: string;
  model: string;
  latencyMs: number;
  /** Present for pipeline A only: the OCR text fed to the LLM. */
  ocrText?: string;
  /** Present for pipeline A only: Cloud Vision confidence, 0 to 100. */
  ocrConfidence?: number;
}

export interface ExtractResponse extends ExtractedContact {
  _meta: ExtractMeta;
}

export const EMPTY_CONTACT: ExtractedContact = {
  firstName: '',
  lastName: '',
  company: '',
  title: '',
  email: '',
  phone: '',
  linkedIn: '',
  eventName: '',
  confidence: 0,
};

/** Field keys that make up the extracted contact, minus confidence. */
export const CONTACT_FIELDS: Array<keyof ExtractedContact> = [
  'firstName',
  'lastName',
  'company',
  'title',
  'email',
  'phone',
  'linkedIn',
  'eventName',
];
