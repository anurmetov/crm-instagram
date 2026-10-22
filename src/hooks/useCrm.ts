import { useCallback, useEffect, useState } from 'react';
import { leadsRepository } from '../services/leads';
import type { Lead } from '../lib/domain';

export function useCrm() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setLeads(await leadsRepository.list()); }
    catch (error) { setError(error instanceof Error ? error.message : 'Не удалось загрузить контакты'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void reload();
    const onStorage = (event: StorageEvent) => { if (!event.key || ['potok-crm-v2', 'potok-crm-demo-v1'].includes(event.key)) void reload(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [reload]);
  const save = useCallback(async (lead: Lead) => {
    const saved = await leadsRepository.save(lead);
    setLeads(current => current.some(item => item.id === saved.id)
      ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]);
    return saved;
  }, []);
  const remove = useCallback(async (id: string) => {
    await leadsRepository.remove(id); setLeads(current => current.filter(lead => lead.id !== id));
  }, []);
  return { leads, loading, error, reload, save, remove };
}
