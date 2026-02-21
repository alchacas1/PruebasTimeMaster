type DateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

const COSTA_RICA_TZ = "America/Costa_Rica";

const pad3 = (value: number): string => String(Math.trunc(value)).padStart(3, "0");

const getCostaRicaParts = (date: Date): DateTimeParts => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: COSTA_RICA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const out: Partial<DateTimeParts> = {};
  for (const p of parts) {
    if (p.type === "year") out.year = p.value;
    if (p.type === "month") out.month = p.value;
    if (p.type === "day") out.day = p.value;
    if (p.type === "hour") out.hour = p.value;
    if (p.type === "minute") out.minute = p.value;
    if (p.type === "second") out.second = p.value;
  }

  return {
    year: out.year || "0000",
    month: out.month || "01",
    day: out.day || "01",
    hour: out.hour || "00",
    minute: out.minute || "00",
    second: out.second || "00",
  };
};

/**
 * Returns ISO-like string using Costa Rica local wall time and explicit offset.
 * Costa Rica currently observes a fixed UTC-06:00 offset (no DST).
 * Example: 2026-02-20T00:13:07.055-06:00
 */
export const toCostaRicaISO = (date: Date): string => {
  const { year, month, day, hour, minute, second } = getCostaRicaParts(date);
  const ms = pad3(date.getMilliseconds());
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}-06:00`;
};

export const nowCostaRicaISO = (): string => toCostaRicaISO(new Date());
