import { SerialValue } from "../CoreTypings";

export type Primitive = number | boolean | string | null;

export type P = number | boolean | string | null;
export type A = P | P[];

export type Method = (...args: any[]) => SerialValue;

export const isP = (v: unknown): v is P => v === null || ["number", "string", "boolean"].includes(typeof v);
export const toArr = (v: A): P[] => (Array.isArray(v) ? v : [v]);
export const num = (v: P) => (typeof v === "number" ? v : Number(v as any));
export const cmp = (a: P, b: P) => (a === b ? 0 : a! < b! ? -1 : 1);
export const eq = (a: A, b: A): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!eq(a[i] as any, b[i] as any)) return false;
    return true;
  }
  return a === b;
};
export const uniq = (arr: P[]) => {
  const out: P[] = [];
  for (const v of arr) if (!out.some((x) => eq(x, v))) out.push(v);
  return out;
};
export const flatDeep = (arr: any[], d: number): any[] =>
  d <= 0 ? arr.slice() : arr.reduce<any[]>((r, v) => r.concat(Array.isArray(v) ? flatDeep(v, d - 1) : v), []);

export const toStr = (v: P) => (v == null ? "" : String(v));
export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const unCapFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const kebab = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
export const snake = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/\s+/g, "_")
    .toLowerCase();
export const camel = (s: string) => {
  return s.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^(.)/, (m) => m.toLowerCase());
};

export const EPOCH_1970 = 0;
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export const getDaysInMonth = (year: number, month: number): number => {
  if (month === 2) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 30;
};

export const getYearFromTimestamp = (ts: number): number => {
  const days = Math.floor(ts / MS_PER_DAY);
  let year = 1970;
  let daysLeft = days;

  while (daysLeft >= 365) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const yearDays = isLeap ? 366 : 365;
    if (daysLeft >= yearDays) {
      daysLeft -= yearDays;
      year++;
    } else {
      break;
    }
  }
  return year;
};

export const getMonthDayFromTimestamp = (ts: number): { month: number; day: number } => {
  const year = getYearFromTimestamp(ts);
  const yearStart = getTimestampForYear(year);
  const daysSinceYearStart = Math.floor((ts - yearStart) / MS_PER_DAY);

  let month = 1;
  let daysLeft = daysSinceYearStart;

  while (month <= 12) {
    const daysInMonth = getDaysInMonth(year, month);
    if (daysLeft >= daysInMonth) {
      daysLeft -= daysInMonth;
      month++;
    } else {
      break;
    }
  }

  return { month, day: daysLeft + 1 };
};

export const getTimestampForYear = (year: number): number => {
  let days = 0;
  for (let y = 1970; y < year; y++) {
    days += (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  }
  return days * MS_PER_DAY;
};

export const createTimestamp = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number => {
  const yearStart = getTimestampForYear(year);
  let dayOfYear = 0;

  for (let m = 1; m < month; m++) {
    dayOfYear += getDaysInMonth(year, m);
  }
  dayOfYear += day - 1;

  return yearStart + dayOfYear * MS_PER_DAY + hour * MS_PER_HOUR + minute * MS_PER_MINUTE + second * MS_PER_SECOND;
};

export const dateNow = {
  current: () => new Date(),
};
