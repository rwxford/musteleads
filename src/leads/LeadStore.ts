import { create } from 'zustand';
import { db } from './LeadDB';
import type { Lead, LeadInput } from '@/types/Lead';
import { v4 as uuidv4 } from 'uuid';

interface LeadState {
  leads: Lead[];
  loading: boolean;
  loadLeads: () => Promise<void>;
  addLead: (input: LeadInput) => Promise<Lead>;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  getLeadsByEvent: (eventName: string) => Lead[];
  getPendingCount: () => number;
}

export const useLeadStore = create<LeadState>((set, get) => ({
  leads: [],
  loading: false,

  loadLeads: async () => {
    set({ loading: true });
    const leads = await db.leads.toArray();
    set({ leads, loading: false });
  },

  addLead: async (input: LeadInput) => {
    const now = new Date().toISOString();
    const lead: Lead = {
      id: uuidv4(),
      firstName: input.firstName || '',
      lastName: input.lastName || '',
      company: input.company || '',
      title: input.title || '',
      email: input.email || '',
      phone: input.phone || '',
      notes: input.notes || '',
      tags: input.tags || [],
      eventName: input.eventName || '',
      scannedAt: now,
      source: input.source,
      syncStatus: 'pending',
      rawQRData: input.rawQRData,
      cardImageBlob: input.cardImageBlob,
      createdAt: now,
      updatedAt: now,
    };
    await db.leads.add(lead);
    set((state) => ({ leads: [...state.leads, lead] }));

    // Sync to server in the background — fire and forget.
    import('@/lib/serverSync').then(m => m.syncLeadToServer(lead as unknown as Record<string, unknown>)).catch(() => {});

    return lead;
  },

  updateLead: async (id: string, updates: Partial<Lead>) => {
    const updatedFields = { ...updates, updatedAt: new Date().toISOString() };
    await db.leads.update(id, updatedFields);
    set((state) => ({
      leads: state.leads.map((l) => (l.id === id ? { ...l, ...updatedFields } : l)),
    }));

    // Sync update to server in the background.
    const merged = get().leads.find(l => l.id === id);
    if (merged) {
      import('@/lib/serverSync').then(m => m.syncLeadToServer(merged as unknown as Record<string, unknown>)).catch(() => {});
    }
  },

  deleteLead: async (id: string) => {
    await db.leads.delete(id);
    set((state) => ({ leads: state.leads.filter((l) => l.id !== id) }));
  },

  getLeadsByEvent: (eventName: string) => {
    return get().leads.filter((l) => l.eventName === eventName);
  },

  getPendingCount: () => {
    return get().leads.filter((l) => l.syncStatus === 'pending').length;
  },
}));
