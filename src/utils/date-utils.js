import { format, parse, isWeekend, addDays, subDays } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const IST_TIMEZONE = 'Asia/Kolkata';

// NSE Market Holidays 2024
const NSE_HOLIDAYS_2024 = [
  '2024-01-26', // Republic Day
  '2024-03-08', // Maha Shivratri
  '2024-03-25', // Holi
  '2024-03-29', // Good Friday
  '2024-04-11', // Id-Ul-Fitr
  '2024-04-17', // Ram Navami
  '2024-04-21', // Mahavir Jayanti
  '2024-05-01', // Maharashtra Day
  '2024-05-23', // Buddha Pournima
  '2024-06-17', // Bakri Id
  '2024-07-17', // Muharram
  '2024-08-15', // Independence Day
  '2024-08-26', // Janmashtami
  '2024-10-02', // Gandhi Jayanti
  '2024-10-12', // Dussehra
  '2024-11-01', // Diwali
  '2024-11-15', // Gurunanak Jayanti
  '2024-12-25', // Christmas
];

// NSE Market Holidays 2025
const NSE_HOLIDAYS_2025 = [
  '2025-02-26', // Maha Shivratri
  '2025-03-14', // Holi
  '2025-03-31', // Id-Ul-Fitr
  '2025-04-10', // Mahavir Jayanti
  '2025-04-14', // Dr.Ambedkar Jayanti
  '2025-04-18', // Good Friday
  '2025-05-01', // Maharashtra Day
  '2025-08-15', // Independence Day
  '2025-08-27', // Janmashtami
  '2025-10-02', // Gandhi Jayanti & Dussehra
  '2025-10-21', // Diwali
  '2025-11-05', // Gurunanak Jayanti
  '2025-12-25', // Christmas
];

// NSE Market Holidays 2026 (must keep in sync with SessionManager.loadTradingHolidays())
const NSE_HOLIDAYS_2026 = [
  '2026-01-26', // Republic Day
  '2026-03-01', // Mahashivratri
  '2026-03-14', // Holi
  '2026-03-30', // Ram Navami
  '2026-04-02', // Mahavir Jayanti
  '2026-04-03', // Good Friday
  '2026-04-06', // Id-ul-Fitr
  '2026-04-14', // Dr. Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-06-13', // Id-ul-Adha
  '2026-07-13', // Moharram
  '2026-08-15', // Independence Day
  '2026-08-25', // Janmashtami
  '2026-09-02', // Ganesh Chaturthi
  '2026-09-12', // Id-e-Milad
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-17', // Dussehra
  '2026-11-04', // Diwali Laxmi Puja
  '2026-11-05', // Diwali Balipratipada
  '2026-11-20', // Gurunanak Jayanti
  '2026-12-25', // Christmas
];

const NSE_HOLIDAYS = [...NSE_HOLIDAYS_2024, ...NSE_HOLIDAYS_2025, ...NSE_HOLIDAYS_2026];

export function isTradingDay(date) {
  const dateStr = format(date, 'yyyy-MM-dd');
  
  // Check if weekend
  if (isWeekend(date)) {
    return false;
  }
  
  // Check if holiday
  if (NSE_HOLIDAYS.includes(dateStr)) {
    return false;
  }
  
  return true;
}

/**
 * Get the most recent trading day strictly before `date`.
 * Walks backward day-by-day, skipping weekends and NSE holidays.
 */
export function getPreviousTradingDay(date) {
  let prev = subDays(date, 1);
  while (!isTradingDay(prev)) {
    prev = subDays(prev, 1);
  }
  return prev;
}

export function getNextTradingDay(date) {
  let nextDay = addDays(date, 1);
  while (!isTradingDay(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
}

export function toIST(date) {
  return toZonedTime(date, IST_TIMEZONE);
}

export function fromIST(date) {
  return fromZonedTime(date, IST_TIMEZONE);
}

export function formatIST(date, formatStr = 'yyyy-MM-dd HH:mm:ss') {
  const istDate = toIST(date);
  return format(istDate, formatStr);
}

export function parseIST(dateStr, formatStr = 'yyyy-MM-dd HH:mm:ss') {
  const parsed = parse(dateStr, formatStr, new Date());
  return fromIST(parsed);
}

export function getMarketTime(dateStr, timeStr) {
  // dateStr: '2024-07-31', timeStr: '09:15'
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = parse(dateStr, 'yyyy-MM-dd', new Date());
  date.setHours(hours, minutes, 0, 0);
  return fromIST(date);
}

export function isMarketHours(date, config) {
  const istDate = toIST(date);
  const timeStr = format(istDate, 'HH:mm');
  
  return timeStr >= config.trading.marketOpen && 
         timeStr <= config.trading.marketClose;
}

export function isExpiryDay(date, instrument) {
  // For now, simplified logic - expiry is typically last Thursday of the month
  // Nifty weekly expiry: Thursday, BankNifty weekly expiry: Wednesday
  const dayOfWeek = date.getDay();
  
  if (instrument === 'NIFTY') {
    return dayOfWeek === 4; // Thursday
  } else if (instrument === 'BANKNIFTY') {
    return dayOfWeek === 3; // Wednesday
  }
  
  return false;
}

export { NSE_HOLIDAYS };
