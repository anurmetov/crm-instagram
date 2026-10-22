import { ArrowUpRight, ArrowRight, TrendingUp } from 'lucide-react';
import { STAGES, getStats, money } from '../lib/domain';
import type { Lead, Page } from '../lib/domain';
import { Avatar } from './ui';

export function Metrics({ leads, navigate, onOpen }: { leads: Lead[]; navigate: (page: Page) => void; onOpen: (lead: Lead) => void }) {
  const stats = getStats(leads);
  const won = leads.filter(lead => lead.stage === 'won').sort((a, b) => b.updated.localeCompare(a.updated));
  const chartStages = STAGES.slice(0, 6);
  const max = Math.max(1, ...chartStages.map(stage => leads.filter(lead => lead.stage === stage.id).length));
  return <section className="metrics" aria-label="Показатели продаж">
    <article className="metric-card leads-metric">
      <div className="metric-heading"><h2>Лидов в работе</h2><button className="round-arrow" onClick={() => navigate('leads')} aria-label="Открыть все контакты"><ArrowUpRight size={18} /></button></div>
      <div className="metric-value-row"><strong className="metric-big">{stats.active}</strong><span className="metric-detail"><b>{stats.total} контактов</b><br />в вашей базе</span><span className="mobile-metric-tag"><span />Всё под контролем</span></div>
      <div className="chart-caption">Лиды по этапам <span><i />Автосбор<i />Вручную</span></div>
      <div className="mini-chart" role="img" aria-label="Количество лидов по этапам и источникам">
        {chartStages.map((stage, index) => {
          const group = leads.filter(lead => lead.stage === stage.id);
          const automatic = group.filter(lead => lead.source !== 'manual').length;
          return <div className="chart-column" key={stage.id} title={`${stage.name}: ${group.length}`}><div className="chart-bars"><i style={{ height: `${Math.max(4, automatic / max * 100)}%` }} /><i style={{ height: `${Math.max(4, (group.length - automatic) / max * 100)}%` }} /></div><small>0{index + 1}</small></div>;
        })}
      </div>
      <div className="mobile-metric-footer"><span>Потенциал воронки</span><b>{money(stats.potential)}</b><ArrowUpRight size={16} /></div>
    </article>
    <article className="metric-card won-metric">
      <div className="metric-heading"><div><h2>Успешные сделки</h2><p>Получено: <b>{money(stats.revenue)}</b><span className="lime-dot" />{stats.won} сделки</p></div><button className="round-arrow" onClick={() => navigate('analytics')} aria-label="Аналитика успешных сделок"><ArrowUpRight size={18} /></button></div>
      <div className="mini-table"><div className="mini-table-head"><span>Клиент</span><span>Сумма</span><span>Статус</span></div>
        {won.slice(0, 3).map(lead => <button className="mini-deal" key={lead.id} onClick={() => onOpen(lead)}><span className="mini-person"><Avatar lead={lead} /><span><b>{lead.name}</b><small>{lead.handle ? `@${lead.handle}` : 'Ник пока недоступен'}</small></span></span><b>{money(lead.amount)}</b><span className="paid-label">Оплачено</span></button>)}
        {!won.length && <p className="mini-empty">Здесь появятся ваши первые победы.</p>}
      </div>
    </article>
    <article className="metric-card sales-metric">
      <div className="metric-heading"><h2>Обзор продаж</h2><button className="round-arrow" onClick={() => navigate('analytics')} aria-label="Открыть обзор продаж"><ArrowUpRight size={18} /></button></div>
      <div className="sales-stat"><span>Потенциал воронки</span><div><strong>{money(stats.potential)}</strong><small>В работе<br /><b>{stats.active} лидов</b></small></div><div className="progress-track"><i style={{ width: `${stats.potential + stats.revenue ? stats.potential / (stats.potential + stats.revenue) * 100 : 0}%` }} /></div></div>
      <div className="sales-stat"><span>Конверсия в оплату</span><div><strong>{stats.conversion}<em>%</em></strong><small>Оплатили<br /><b>{stats.won} из {stats.total}</b></small></div><div className="progress-track lime"><i style={{ width: `${stats.conversion}%` }} /></div></div>
    </article>
    <button className="mobile-sales-card" onClick={() => navigate('analytics')}><span className="mobile-sales-icon"><TrendingUp size={18} /></span><span><small>Выручка</small><strong>{money(stats.revenue)}</strong></span><span className="conversion-pill">{stats.conversion}% конверсия<ArrowRight size={12} /></span></button>
  </section>;
}
