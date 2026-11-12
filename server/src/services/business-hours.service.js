const DEFAULT_TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Sao_Paulo';

const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function normalizeBusinessHours(value) {
  const source = value && typeof value === 'object' ? value : {};
  const days = {};
  for (let day = 0; day < 7; day += 1) {
    days[day] = (Array.isArray(source.days?.[day]) ? source.days[day] : [])
      .filter(interval => validTime(interval?.start) && validTime(interval?.end) && interval.start < interval.end)
      .map(interval => ({ start: interval.start, end: interval.end }))
      .sort((a, b) => a.start.localeCompare(b.start));
  }
  return {
    enabled: source.enabled === true,
    timezone: String(source.timezone || DEFAULT_TIME_ZONE),
    days
  };
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return {
    day: WEEKDAY_INDEX[get('weekday')],
    minute: Number(get('hour')) * 60 + Number(get('minute'))
  };
}

function timeToMinute(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function isOpenAt(schedule, date) {
  if (!schedule.enabled) return true;
  const local = zonedParts(date, schedule.timezone);
  return (schedule.days[local.day] || []).some(interval => {
    const start = timeToMinute(interval.start);
    const end = timeToMinute(interval.end);
    return local.minute >= start && local.minute < end;
  });
}

function nextOpening(schedule, date) {
  if (!schedule.enabled || isOpenAt(schedule, date)) return date;
  const rounded = new Date(date.getTime() - (date.getTime() % 60000) + 60000);
  for (let offset = 0; offset <= 8 * 24 * 60; offset += 1) {
    const candidate = new Date(rounded.getTime() + offset * 60000);
    if (isOpenAt(schedule, candidate)) return candidate;
  }
  return null;
}

function formatSchedule(scheduleInput) {
  const schedule = normalizeBusinessHours(scheduleInput);
  if (!schedule.enabled) return 'Atendimento 24 horas';
  const lines = [];
  for (let day = 0; day < 7; day += 1) {
    const intervals = schedule.days[day] || [];
    if (intervals.length) lines.push(`${DAY_NAMES[day]}: ${intervals.map(item => `${item.start} às ${item.end}`).join(' e ')}`);
  }
  return lines.length ? lines.join('\n') : 'Sem horário de atendimento configurado';
}

function getDepartmentAvailability(department, at = new Date()) {
  const schedule = normalizeBusinessHours(department?.business_hours);
  const isOpen = isOpenAt(schedule, at);
  const nextOpenAt = isOpen ? at : nextOpening(schedule, at);
  return {
    isOpen,
    nextOpenAt,
    schedule,
    scheduleLabel: formatSchedule(schedule),
    nextOpenLabel: nextOpenAt ? new Intl.DateTimeFormat('pt-BR', {
      timeZone: schedule.timezone,
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(nextOpenAt) : 'quando o departamento reabrir'
  };
}

module.exports = { normalizeBusinessHours, getDepartmentAvailability, formatSchedule, isOpenAt, nextOpening };
