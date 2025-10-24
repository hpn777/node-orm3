export interface DialectFunctions {
  escapeVal: (value: any, timezone?: string) => string;
  escapeId: (...identifiers: any[]) => string;
}

export function escapeQuery(dialect: DialectFunctions, query: string, args: any[] = []): string {
  let pos = 0;

  return query.replace(/\?{1,2}/g, (match: string): string => {
    if (match === '?') {
      const arg = args[pos++];
      return dialect.escapeVal(arg);
    }

    if (match === '??') {
      const arg = args[pos++];
      const identifiers = Array.isArray(arg) ? arg : [arg];
      return dialect.escapeId(...identifiers);
    }

    return match;
  });
}

export interface DateToStringOptions {
  dialect: 'mysql' | 'postgresql' | 'sqlite' | 'mssql' | string;
}

export function dateToString(date: Date | string | number, timeZone: string, opts: DateToStringOptions): string {
  const dt = new Date(date);

  if (timeZone !== 'local') {
    const tz = convertTimezone(timeZone);

    dt.setTime(dt.getTime() + dt.getTimezoneOffset() * 60000);
    if (tz !== false) {
      dt.setTime(dt.getTime() + tz * 60000);
    }
  }

  const year = dt.getFullYear();
  const month = zeroPad(dt.getMonth() + 1);
  const day = zeroPad(dt.getDate());
  const hour = zeroPad(dt.getHours());
  const minute = zeroPad(dt.getMinutes());
  const second = zeroPad(dt.getSeconds());
  const milli = zeroPad(dt.getMilliseconds(), 3);

  if (opts.dialect === 'mysql' || timeZone === 'local') {
    return `${year}-${month}-${day} ${hour}:${minute}:${second}.${milli}`;
  }

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${milli}Z`;
}

function zeroPad(value: number, length: number = 2): string {
  let str = String(value);

  while (str.length < length) {
    str = `0${str}`;
  }

  return str;
}

function convertTimezone(tz: string): number | false {
  if (tz === 'Z') {
    return 0;
  }

  const match = tz.match(/([\+\-\s])(\d\d):?(\d\d)?/);
  if (!match) {
    return false;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;

  return sign * (hours + minutes / 60) * 60;
}
