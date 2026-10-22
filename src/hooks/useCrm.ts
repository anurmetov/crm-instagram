import { useCallback, useState } from 'react';
import { MemoryLeadsRepository } from '../services/leads';
import type { Lead } from '../lib/domain';

export function useCrm() {
  const [repository] = useState(() => new MemoryLeadsRepository());
  const [leads, setLeads] = useState(() => repository.list());

  const save = useCallback(async (lead: Lead) => {
    const saved = repository.save(lead);
    setLeads(repository.list());
    return saved;
  }, [repository]);

  const remove = useCallback(async (id: string) => {
    repository.remove(id);
    setLeads(repository.list());
  }, [repository]);

  return { leads, save, remove };
}
