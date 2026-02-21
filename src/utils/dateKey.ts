export type VisitDayCode = "D" | "L" | "M" | "MI" | "J" | "V" | "S";

const WEEK_DAY_CODES: VisitDayCode[] = ["D", "L", "M", "MI", "J", "V", "S"];

export function dateToKey(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function keyToDate(dateKey: number): Date {
	return new Date(dateKey);
}

export function dateKeyToISODate(dateKey: number): string {
	const d = new Date(dateKey);
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yyyy}-${mm}-${dd}`;
}

export function isoDateToDateKey(iso: string): number | null {
	if (typeof iso !== "string") return null;
	const trimmed = iso.trim();
	const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(trimmed);
	if (!m) return null;
	const yyyy = Number(m[1]);
	const mm = Number(m[2]);
	const dd = Number(m[3]);
	if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
	const d = new Date(yyyy, mm - 1, dd);
	const key = dateToKey(d);
	return Number.isFinite(key) ? key : null;
}

export function visitDayFromDate(date: Date): VisitDayCode {
	return WEEK_DAY_CODES[date.getDay()] ?? "D";
}

export function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

export function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6;
}

export function nextBusinessDay(date: Date): Date {
	let d = addDays(date, 1);
	d.setHours(0, 0, 0, 0);
	while (isWeekend(d)) d = addDays(d, 1);
	return d;
}

/**
 * Computes the week start (Sunday 00:00 local time) for a given date key.
 *
 * Important: ControlPedido weeks are partitioned by RECEIVE week.
 */
export function weekStartKeyFromDateKey(dateKey: number): number {
	const d = new Date(dateKey);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - d.getDay());
	return d.getTime();
}
