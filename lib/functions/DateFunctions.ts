import { format as dateFnsFormat } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  createTimestamp,
  dateNow,
  getMonthDayFromTimestamp,
  getYearFromTimestamp,
  Method,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  num,
  P,
} from "./FunctionHelpers";

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v == null) return dateNow.current();
  if (typeof v === "string") return new Date(v);
  return new Date(num(v as P));
}

export const dateFunctions: Record<string, Method> = {
  /**
   * Returns the current Unix timestamp in milliseconds.
   * @name timeNow
   * @returns The current Unix timestamp in milliseconds.
   * @example timeNow() //=> 1762071908493
   */
  timeNow: () => Date.now(),
  /**
   * Creates a timestamp from date components (UTC).
   * @name timeCreate
   * @param year Year.
   * @param month Month.
   * @param day Day of month.
   * @param hour Hour.
   * @param minute Minute.
   * @param second Second.
   * @returns Created value.
   * @example timeCreate(2024, 12, 25, 10, 30) //=> 1735119000000
   */
  timeCreate: (year?: P, month?: P, day?: P, hour?: P, minute?: P, second?: P) => {
    if (typeof year === "undefined") return Date.now();
    const current = dateNow.current();
    const y = year == null ? current.getUTCFullYear() : num(year);
    const m = month == null ? current.getUTCMonth() + 1 : num(month);
    const d = day == null ? current.getUTCDate() : num(day);
    const h = hour == null ? current.getUTCHours() : num(hour);
    const min = minute == null ? current.getUTCMinutes() : num(minute);
    const s = second == null ? current.getUTCSeconds() : num(second);
    return createTimestamp(y, m, d, h, min, s);
  },
  /**
   * Returns the year from a timestamp.
   * @name getYear
   * @param timestamp Timestamp in ms.
   * @returns The year from a timestamp.
   * @example getYear(1735689600000) //=> 2025
   */
  getYear: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    return getYearFromTimestamp(ts);
  },
  /**
   * Returns the month (1-12) from a timestamp.
   * @name getMonth
   * @param timestamp Timestamp in ms.
   * @returns The month (1-12) from a timestamp.
   * @example getMonth(1735689600000) //=> 1
   */
  getMonth: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    return getMonthDayFromTimestamp(ts).month;
  },
  /**
   * Returns the day of month from a timestamp.
   * @name getDay
   * @param timestamp Timestamp in ms.
   * @returns The day of month from a timestamp.
   * @example getDay(1735689600000) //=> 1
   */
  getDay: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    return getMonthDayFromTimestamp(ts).day;
  },
  /**
   * Returns the hour (0-23) from a timestamp.
   * @name getHour
   * @param timestamp Timestamp in ms.
   * @returns The hour (0-23) from a timestamp.
   * @example getHour(1735732800000) //=> 12
   */
  getHour: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    return Math.floor((ts % MS_PER_DAY) / MS_PER_HOUR);
  },
  /**
   * Returns the minute (0-59) from a timestamp.
   * @name getMinute
   * @param timestamp Timestamp in ms.
   * @returns The minute (0-59) from a timestamp.
   * @example getMinute(1735734600000) //=> 30
   */
  getMinute: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    return Math.floor((ts % MS_PER_HOUR) / MS_PER_MINUTE);
  },
  /**
   * Returns the second (0-59) from a timestamp.
   * @name getSecond
   * @param timestamp Timestamp in ms.
   * @returns The second (0-59) from a timestamp.
   * @example getSecond(1735734645000) //=> 45
   */
  getSecond: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    return Math.floor((ts % MS_PER_MINUTE) / MS_PER_SECOND);
  },
  /**
   * Returns the weekday (0=Sunday, 6=Saturday) from a timestamp.
   * @name getWeekday
   * @param timestamp Timestamp in ms.
   * @returns The weekday (0=Sunday, 6=Saturday) from a timestamp.
   * @example getWeekday(1735689600000) //=> 3
   */
  getWeekday: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    const days = Math.floor(ts / MS_PER_DAY);
    return (days + 4) % 7;
  },
  /**
   * Returns the weekday name from a timestamp.
   * @name getWeekdayName
   * @param timestamp Timestamp in ms.
   * @returns The weekday name from a timestamp.
   * @example getWeekdayName(1735689600000) //=> "Wednesday"
   */
  getWeekdayName: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekday = (Math.floor(ts / MS_PER_DAY) + 4) % 7;
    return days[weekday];
  },
  /**
   * Returns the month name from a timestamp.
   * @name getMonthName
   * @param timestamp Timestamp in ms.
   * @returns The month name from a timestamp.
   * @example getMonthName(1735689600000) //=> "January"
   */
  getMonthName: (timestamp?: P) => {
    const ts = timestamp == null ? Date.now() : num(timestamp);
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const month = getMonthDayFromTimestamp(ts).month;
    return months[month - 1] || "January";
  },
  /**
   * Returns days until a target timestamp.
   * @name getDaysUntil
   * @param targetTimestamp Target timestamp in ms.
   * @param fromTimestamp Reference timestamp in ms.
   * @returns Days until a target timestamp.
   * @example getDaysUntil(1735689600000) //=> 5
   */
  getDaysUntil: (targetTimestamp: P, fromTimestamp?: P) => {
    const target = num(targetTimestamp);
    const from = fromTimestamp == null ? Date.now() : num(fromTimestamp);
    return Math.ceil((target - from) / MS_PER_DAY);
  },
  /**
   * Returns days since a past timestamp.
   * @name getDaysSince
   * @param pastTimestamp Past timestamp in ms.
   * @param fromTimestamp Reference timestamp in ms.
   * @returns Days since a past timestamp.
   * @example getDaysSince(1735603200000) //=> 1
   */
  getDaysSince: (pastTimestamp: P, fromTimestamp?: P) => {
    const past = num(pastTimestamp);
    const from = fromTimestamp == null ? Date.now() : num(fromTimestamp);
    return Math.floor((from - past) / MS_PER_DAY);
  },
  /**
   * Returns hours until a target timestamp.
   * @name getHoursUntil
   * @param targetTimestamp Target timestamp in ms.
   * @param fromTimestamp Reference timestamp in ms.
   * @returns Hours until a target timestamp.
   * @example getHoursUntil(1735732800000) //=> 24
   */
  getHoursUntil: (targetTimestamp: P, fromTimestamp?: P) => {
    const target = num(targetTimestamp);
    const from = fromTimestamp == null ? Date.now() : num(fromTimestamp);
    return Math.ceil((target - from) / MS_PER_HOUR);
  },
  /**
   * Returns hours since a past timestamp.
   * @name getHoursSince
   * @param pastTimestamp Past timestamp in ms.
   * @param fromTimestamp Reference timestamp in ms.
   * @returns Hours since a past timestamp.
   * @example getHoursSince(1735689600000) //=> 12
   */
  getHoursSince: (pastTimestamp: P, fromTimestamp?: P) => {
    const past = num(pastTimestamp);
    const from = fromTimestamp == null ? Date.now() : num(fromTimestamp);
    return Math.floor((from - past) / MS_PER_HOUR);
  },
  /**
   * Returns minutes until a target timestamp.
   * @name getMinutesUntil
   * @param targetTimestamp Target timestamp in ms.
   * @param fromTimestamp Reference timestamp in ms.
   * @returns Minutes until a target timestamp.
   * @example getMinutesUntil(1735734600000) //=> 30
   */
  getMinutesUntil: (targetTimestamp: P, fromTimestamp?: P) => {
    const target = num(targetTimestamp);
    const from = fromTimestamp == null ? Date.now() : num(fromTimestamp);
    return Math.ceil((target - from) / MS_PER_MINUTE);
  },
  /**
   * Returns minutes since a past timestamp.
   * @name getMinutesSince
   * @param pastTimestamp Past timestamp in ms.
   * @param fromTimestamp Reference timestamp in ms.
   * @returns Minutes since a past timestamp.
   * @example getMinutesSince(1735732800000) //=> 30
   */
  getMinutesSince: (pastTimestamp: P, fromTimestamp?: P) => {
    const past = num(pastTimestamp);
    const from = fromTimestamp == null ? Date.now() : num(fromTimestamp);
    return Math.floor((from - past) / MS_PER_MINUTE);
  },
  /**
   * Converts milliseconds to decimal hours.
   * @name getMsToDecimalHours
   * @param ms Milliseconds.
   * @returns Converted value.
   * @example getMsToDecimalHours(3600000) //=> 1
   */
  getMsToDecimalHours: (ms: P) => {
    const milliseconds = num(ms);
    return milliseconds / 3600000;
  },
  /**
   * Converts decimal hours to clock format.
   * @name getDecimalHoursToClock
   * @param hours Hours.
   * @returns Converted value.
   * @example getDecimalHoursToClock(2.5) //=> "2:30"
   */
  getDecimalHoursToClock: (hours: P) => {
    const h = Math.trunc(num(hours));
    const m = Math.round((Math.abs(num(hours)) % 1) * 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  },
  /**
   * Formats a timestamp using a format string.
   * @name timeFormat
   * @param timestamp Timestamp in ms.
   * @param formatStr Format string.
   * @param tz Time zone name or "local".
   * @returns Formatted string.
   * @example timeFormat(1735689600000, "yyyy-MM-dd HH:mm:ss") //=> "2025-01-01 00:00:00"
   * @example timeFormat(946684800000, "MMMM do, yyyy") //=> "January 1st, 2000"
   * @example timeFormat(946684800000, "MMM d, yy 'at' h:mm a") //=> "Jan 1, 00 at 12:00 AM"
   * @example timeFormat(946684800000, "yyyy-MM-dd HH:mm:ss", "America/New_York") //=> "1999-12-31 19:00:00"
   * @example timeFormat(946684800000, "yyyy-MM-dd HH:mm:ss", "local") //=> Local timezone
   */
  timeFormat: (timestamp: P, formatStr: P, tz?: P) => {
    const ts = num(timestamp);
    const formatString = String(formatStr);
    const date = new Date(ts);

    if (tz == null) {
      const zoned = toZonedTime(date, "UTC");
      return dateFnsFormat(zoned, formatString);
    }

    const timezone = String(tz);
    if (timezone.toLowerCase() === "local") {
      return dateFnsFormat(date, formatString);
    }

    try {
      const zonedDate = toZonedTime(date, timezone);
      return dateFnsFormat(zonedDate, formatString);
    } catch {
      const zoned = toZonedTime(date, "UTC");
      return dateFnsFormat(zoned, formatString);
    }
  },
  /**
   * Returns the day of the month in local time.
   * @name getDate
   * @param v Value.
   * @returns The day of the month in local time.
   * @example getDate("2000-01-02T03:04:05") //=> 2
   */
  getDate: (v: P) => toDate(v).getDate(),
  /**
   * Returns the full year in local time.
   * @name getFullYear
   * @param v Value.
   * @returns The full year in local time.
   * @example getFullYear("2000-01-02T03:04:05") //=> 2000
   */
  getFullYear: (v: P) => toDate(v).getFullYear(),
  /**
   * Returns the hour (0-23) in local time.
   * @name getHours
   * @param v Value.
   * @returns The hour (0-23) in local time.
   * @example getHours("2000-01-02T03:04:05") //=> 3
   */
  getHours: (v: P) => toDate(v).getHours(),
  /**
   * Returns the milliseconds (0-999) in local time.
   * @name getMilliseconds
   * @param v Value.
   * @returns The milliseconds (0-999) in local time.
   * @example getMilliseconds("2000-01-02T03:04:05.006") //=> 6
   */
  getMilliseconds: (v: P) => toDate(v).getMilliseconds(),
  /**
   * Returns the minutes (0-59) in local time.
   * @name getMinutes
   * @param v Value.
   * @returns The minutes (0-59) in local time.
   * @example getMinutes("2000-01-02T03:04:05") //=> 4
   */
  getMinutes: (v: P) => toDate(v).getMinutes(),
  /**
   * Returns the seconds (0-59) in local time.
   * @name getSeconds
   * @param v Value.
   * @returns The seconds (0-59) in local time.
   * @example getSeconds("2000-01-02T03:04:05") //=> 5
   */
  getSeconds: (v: P) => toDate(v).getSeconds(),
  /**
   * Returns the timestamp in milliseconds.
   * @name getTime
   * @param v Value.
   * @returns The timestamp in milliseconds.
   * @example getTime("2000-01-01T00:00:00Z") //=> 946684800000
   */
  getTime: (v: P) => toDate(v).getTime(),
  /**
   * Returns the timezone offset in minutes.
   * @name getTimezoneOffset
   * @param v Value.
   * @returns The timezone offset in minutes.
   * @example getTimezoneOffset("2000-01-01T00:00:00Z") //=> Local timezone offset
   */
  getTimezoneOffset: (v: P) => toDate(v).getTimezoneOffset(),
  /**
   * Returns the day of the month in UTC.
   * @name getUTCDate
   * @param v Value.
   * @returns The day of the month in UTC.
   * @example getUTCDate("2000-01-02T03:04:05Z") //=> 2
   */
  getUTCDate: (v: P) => toDate(v).getUTCDate(),
  /**
   * Returns the weekday (0-6) in UTC.
   * @name getUTCDay
   * @param v Value.
   * @returns The weekday (0-6) in UTC.
   * @example getUTCDay("2000-01-02T03:04:05Z") //=> 0
   */
  getUTCDay: (v: P) => toDate(v).getUTCDay(),
  /**
   * Returns the full year in UTC.
   * @name getUTCFullYear
   * @param v Value.
   * @returns The full year in UTC.
   * @example getUTCFullYear("2000-01-02T03:04:05Z") //=> 2000
   */
  getUTCFullYear: (v: P) => toDate(v).getUTCFullYear(),
  /**
   * Returns the hour (0-23) in UTC.
   * @name getUTCHours
   * @param v Value.
   * @returns The hour (0-23) in UTC.
   * @example getUTCHours("2000-01-02T03:04:05Z") //=> 3
   */
  getUTCHours: (v: P) => toDate(v).getUTCHours(),
  /**
   * Returns the milliseconds (0-999) in UTC.
   * @name getUTCMilliseconds
   * @param v Value.
   * @returns The milliseconds (0-999) in UTC.
   * @example getUTCMilliseconds("2000-01-02T03:04:05.006Z") //=> 6
   */
  getUTCMilliseconds: (v: P) => toDate(v).getUTCMilliseconds(),
  /**
   * Returns the minutes (0-59) in UTC.
   * @name getUTCMinutes
   * @param v Value.
   * @returns The minutes (0-59) in UTC.
   * @example getUTCMinutes("2000-01-02T03:04:05Z") //=> 4
   */
  getUTCMinutes: (v: P) => toDate(v).getUTCMinutes(),
  /**
   * Returns the month (0-11) in UTC.
   * @name getUTCMonth
   * @param v Value.
   * @returns The month (0-11) in UTC.
   * @example getUTCMonth("2000-01-02T03:04:05Z") //=> 0
   */
  getUTCMonth: (v: P) => toDate(v).getUTCMonth(),
  /**
   * Returns the seconds (0-59) in UTC.
   * @name getUTCSeconds
   * @param v Value.
   * @returns The seconds (0-59) in UTC.
   * @example getUTCSeconds("2000-01-02T03:04:05Z") //=> 5
   */
  getUTCSeconds: (v: P) => toDate(v).getUTCSeconds(),
  /**
   * Returns a human-readable date string.
   * @name toDateString
   * @param v Value.
   * @returns A human-readable date string.
   * @example toDateString("2000-01-02T03:04:05") //=> "Sun Jan 02 2000"
   */
  toDateString: (v: P) => toDate(v).toDateString(),
  /**
   * Returns the ISO 8601 string.
   * @name toISOString
   * @param v Value.
   * @returns The ISO 8601 string.
   * @example toISOString("2000-01-02T03:04:05Z") //=> "2000-01-02T03:04:05.000Z"
   */
  toISOString: (v: P) => toDate(v).toISOString(),
  /**
   * Returns the JSON date string.
   * @name toJSON
   * @param v Value.
   * @returns The JSON date string.
   * @example toJSON("2000-01-02T03:04:05Z") //=> "2000-01-02T03:04:05.000Z"
   */
  toJSON: (v: P) => toDate(v).toJSON(),
  /**
   * Returns the locale-formatted date string.
   * @name toLocaleDateString
   * @param v Value.
   * @param args Additional values.
   * @returns The locale-formatted date string.
   * @example toLocaleDateString("2000-01-02T03:04:05Z", "en-US", { timeZone: "UTC" }) //=> "1/2/2000"
   */
  toLocaleDateString: (v: P, ...args: unknown[]) =>
    toDate(v).toLocaleDateString(...(args as Parameters<Date["toLocaleDateString"]>)),
  /**
   * Returns the locale-formatted date and time string.
   * @name toLocaleString
   * @param v Value.
   * @param args Additional values.
   * @returns The locale-formatted date and time string.
   * @example toLocaleString("2000-01-02T03:04:05Z", "en-US", { timeZone: "UTC", hour12: false }) //=> "1/2/2000, 03:04:05"
   */
  toLocaleString: (v: P, ...args: unknown[]) =>
    toDate(v).toLocaleString(...(args as Parameters<Date["toLocaleString"]>)),
  /**
   * Returns the locale-formatted time string.
   * @name toLocaleTimeString
   * @param v Value.
   * @param args Additional values.
   * @returns The locale-formatted time string.
   * @example toLocaleTimeString("2000-01-02T03:04:05Z", "en-US", { timeZone: "UTC", hour12: false }) //=> "03:04:05"
   */
  toLocaleTimeString: (v: P, ...args: unknown[]) =>
    toDate(v).toLocaleTimeString(...(args as Parameters<Date["toLocaleTimeString"]>)),
  /**
   * Returns the Date string representation.
   * @name toString
   * @param v Value.
   * @returns The Date string representation.
   * @example toString("2000-01-02T03:04:05") //=> Local timezone string
   */
  toString: (v: P) => toDate(v).toString(),
  /**
   * Returns the time string representation.
   * @name toTimeString
   * @param v Value.
   * @returns The time string representation.
   * @example toTimeString("2000-01-02T03:04:05") //=> Local time string
   */
  toTimeString: (v: P) => toDate(v).toTimeString(),
  /**
   * Returns the UTC string representation.
   * @name toUTCString
   * @param v Value.
   * @returns The UTC string representation.
   * @example toUTCString("2000-01-02T03:04:05Z") //=> "Sun, 02 Jan 2000 03:04:05 GMT"
   */
  toUTCString: (v: P) => toDate(v).toUTCString(),
};
