import { useCallback, useEffect, useRef, useState } from 'react';
import { dataMode, leadsRepository } from '../services/leads';
import type { Lead } from '../lib/domain';

export function useCrm() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const readVersion = useRef(0), writes = useRef(0);
  const reload = useCallback(async (quiet = false) => {
    if (quiet && writes.current) return;
    const version = ++readVersion.current;
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const data = await leadsRepository.list();
      if (version === readVersion.current && !writes.current) { setLeads(data); setSyncError(''); setError(''); }
    }
    catch (error) {
      if (version === readVersion.current) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить контакты';
        if (quiet) setSyncError(message); else setError(message);
      }
    }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => {
    void reload();
    const onStorage = (event: StorageEvent) => { if (!event.key || ['potok-crm-v2', 'potok-crm-demo-v1'].includes(event.key)) void reload(); };
    window.addEventListener('storage', onStorage);
    const onVisible = () => { if (dataMode === 'api' && !document.hidden) void reload(true); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = dataMode === 'api' ? setInterval(() => { if (!document.hidden) void reload(true); }, 5000) : undefined;
    return () => { window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', onVisible); clearInterval(timer); ++readVersion.current; };
  }, [reload]);
  const save = useCallback(async (lead: Lead) => {
    ++readVersion.current; writes.current++;
    try {
      const saved = await leadsRepository.save(lead);
      setLeads(current => current.some(item => item.id === saved.id)
        ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current]);
      return saved;
    } finally { ++readVersion.current; writes.current--; }
  }, []);
  const remove = useCallback(async (id: string) => {
    ++readVersion.current; writes.current++;
    try { await leadsRepository.remove(id); setLeads(current => current.filter(lead => lead.id !== id)); }
    finally { ++readVersion.current; writes.current--; }
  }, []);
  return { leads, loading, error, syncError, reload, save, remove };
}
