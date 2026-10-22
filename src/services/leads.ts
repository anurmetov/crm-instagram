import { createDemoLeads } from '../data/seed';
import { leadSchema } from '../lib/domain';
import type { Lead } from '../lib/domain';

// Each app instance starts with fresh demo data. Nothing is persisted or fetched.
export class MemoryLeadsRepository {
  private leads = createDemoLeads();

  list(): Lead[] { return structuredClone(this.leads); }

  save(lead: Lead): Lead {
    const validated = leadSchema.parse(lead);
    if (this.leads.some(item => item.handle === validated.handle && item.id !== validated.id)) {
      throw new Error('Контакт с таким Instagram-ником уже есть в базе');
    }
    const exists = this.leads.some(item => item.id === validated.id);
    this.leads = exists ? this.leads.map(item => item.id === validated.id ? validated : item) : [validated, ...this.leads];
    return structuredClone(validated);
  }

  remove(id: string): void { this.leads = this.leads.filter(lead => lead.id !== id); }
}
