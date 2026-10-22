import { Instagram, UserRound, Zap } from 'lucide-react';
import { STAGES } from '../lib/domain';
import type { SelectOption } from './Select';

const stageDescriptions = ['Первое знакомство с контактом', 'Обсуждаете запрос и детали', 'Встреча запланирована', 'Обсуждаете предложение после встречи', 'Предложение принято, ожидаете оплату', 'Сделка успешно завершена', 'Сделка завершена без оплаты'];
export const stageOptions: SelectOption[] = STAGES.map((stage, index) => ({ value: stage.id, label: stage.name, color: stage.color, description: stageDescriptions[index] }));
export const sourceOptions: SelectOption[] = [
  { value: 'manual', label: 'Вручную', icon: <UserRound size={17} /> },
  { value: 'manychat', label: 'ManyChat', icon: <Zap size={17} /> },
  { value: 'instagram', label: 'Instagram', icon: <Instagram size={17} /> },
];
export const sourceFilterOptions: SelectOption[] = [{ value: 'all', label: 'Все источники' }, ...sourceOptions];
export const sortOptions: SelectOption[] = [
  { value: 'recent', label: 'Сначала новые' }, { value: 'name', label: 'По имени' },
  { value: 'amount', label: 'По сумме ↓' },
];
export const periodOptions: SelectOption[] = [
  { value: 'all', label: 'За всё время' }, { value: 'week', label: 'Последние 7 дней' }, { value: 'month', label: 'Этот месяц' },
];
