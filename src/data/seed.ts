import { STAGES, dayOffset } from '../lib/domain.ts';
import type { Lead, StageId } from '../lib/domain';

type SeedRow = [string, string, StageId, number, Lead['source'], string, string, string, number | null, Lead['priority'], number];
const rows: SeedRow[] = [
  ['Алина Смирнова', 'alina.smm', 'new', 200, 'manychat', 'СТАРТ', 'Хочет системно развивать личный блог. Интересуется сопровождением.', 'Отправить программу', 0, 'hot', 1],
  ['Мария Волкова', 'masha.creates', 'new', 120, 'manychat', 'РАЗБОР', 'Пришла с рилса про контент. Просит подробнее рассказать о разборе.', 'Ответить на вопросы', 0, 'normal', 0],
  ['Дмитрий Козлов', 'dmitry.pro', 'new', 250, 'manual', '', 'Обсудили развитие экспертного блога. Нужно уточнить запрос.', 'Задать вопросы о целях', 1, 'normal', 3],
  ['Ксения Романова', 'ksenia.lifestyle', 'new', 180, 'manychat', 'КУРС', 'Интересуется обучением. Уже скачала бесплатный гайд.', 'Уточнить опыт', 2, 'normal', 4],
  ['Ольга Миронова', 'olga.design', 'dialogue', 200, 'manychat', 'СТАРТ', 'Дизайнер интерьеров. Хочет получать заявки из блога.', 'Отправить кейс дизайнера', -1, 'hot', 2],
  ['Артём Лебедев', 'artem.expert', 'dialogue', 250, 'manual', '', 'Развивает личный бренд. Обсудили формат и сроки работы.', 'Уточнить решение', 0, 'normal', 3],
  ['Елена Соколова', 'elena.coach', 'dialogue', 120, 'manychat', 'РАЗБОР', 'Коуч. Нужно помочь упаковать профиль и предложение.', 'Предложить время созвона', 1, 'normal', 1],
  ['Полина Белова', 'polina.photo', 'dialogue', 180, 'manychat', 'КУРС', 'Фотограф. Прислала примеры контента и вопросы по курсу.', 'Ответить на вопросы', 0, 'normal', 4],
  ['Виктория Морозова', 'vika.morozova', 'booked', 250, 'manychat', 'СТАРТ', 'Созвон согласован. Запрос: запуск личного продукта.', 'Провести созвон в 14:00', 0, 'hot', 0],
  ['Максим Орлов', 'max.orlov', 'booked', 200, 'manual', '', 'Готов обсудить сотрудничество. Прислал вводные по блогу.', 'Провести созвон в 11:30', 1, 'normal', 3],
  ['Дарья Новикова', 'daria.nova', 'booked', 120, 'manychat', 'РАЗБОР', 'Хочет разобраться с позиционированием и целевой аудиторией.', 'Отправить напоминание', 1, 'normal', 1],
  ['Анастасия Петрова', 'nastya.petrova', 'called', 250, 'manychat', 'СТАРТ', 'Обсудили цели на три месяца. Ждёт персональный план работы.', 'Отправить предложение', 0, 'hot', 2],
  ['Никита Фёдоров', 'nikita.fed', 'called', 200, 'manual', '', 'Созвон прошёл хорошо. Выбирает между двумя форматами.', 'Уточнить выбранный формат', -2, 'normal', 5],
  ['Софья Алексеева', 'sofia.alex', 'payment', 250, 'manychat', 'СТАРТ', 'Согласовали сопровождение на месяц. Реквизиты отправлены.', 'Проверить поступление', 0, 'hot', 4],
  ['Андрей Павлов', 'andrey.pavlov', 'payment', 180, 'manychat', 'КУРС', 'Выбрал обучение. Планирует внести оплату завтра.', 'Уточнить оплату', 1, 'normal', 3],
  ['Анна Кузнецова', 'anna.kuz', 'won', 250, 'manychat', 'СТАРТ', 'Оплатила сопровождение. Стартуем в понедельник.', '', null, 'normal', 0],
  ['Сергей Васильев', 'sergey.v', 'won', 200, 'manual', '', 'Оплата получена. Материалы отправлены.', '', null, 'normal', 2],
  ['Юлия Попова', 'julia.popova', 'won', 180, 'manychat', 'КУРС', 'Присоединилась к обучению. Доступ открыт.', '', null, 'normal', 4],
  ['Ирина Зайцева', 'irina.z', 'lost', 250, 'manychat', 'СТАРТ', 'Вернётся к вопросу позже. Сейчас не готова к вложениям.', '', null, 'normal', 1],
  ['Павел Егоров', 'pavel.egorov', 'lost', 120, 'manual', '', 'Потребность в разборе пока отложил.', '', null, 'normal', 5],
];

export function createDemoLeads(): Lead[] {
  return rows.map((row, index) => {
    const [name, handle, stage, amount, source, keyword, note, nextAction, dueOffset, priority, color] = row;
    const created = new Date(); created.setDate(created.getDate() - Math.min(index + 2, 24)); created.setHours(12, 0, 0, 0);
    const stageIndex = STAGES.findIndex(item => item.id === stage);
    const maxStage = stage === 'lost' ? (index % 2 === 0 ? 3 : 1) : stageIndex;
    const history: Lead['history'] = [{ at: created.toISOString(), kind: 'created', to: 'new', text: source === 'manychat' ? `Лид добавлен по слову «${keyword}»` : 'Лид добавлен вручную' }];
    for (let step = 1; step <= maxStage; step++) {
      history.push({ at: new Date(+created + step * 7_200_000).toISOString(), kind: 'stage', to: STAGES[step].id, text: `Переход в «${STAGES[step].name}»` });
    }
    const lostReason = stage === 'lost' ? (index === 18 ? 'Не подошла стоимость' : 'Пока не актуально') : '';
    if (stage === 'lost') history.push({ at: new Date(+created + (maxStage + 1) * 7_200_000).toISOString(), kind: 'stage', to: 'lost', text: `Отказ: ${lostReason}` });
    return {
      id: `demo-${index}`, name, handle, stage, amount, source, keyword, note, nextAction,
      due: dueOffset === null ? '' : dayOffset(dueOffset), priority, color, lostReason,
      product: amount === 120 ? 'Разбор блога' : amount === 180 ? 'Обучение' : 'Личное сопровождение',
      created: created.toISOString(), updated: history.at(-1)!.at, history,
    };
  });
}
