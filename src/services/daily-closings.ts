import { FirestoreService } from './firestore';

export type DailyClosingRecord = {
    id: string;
    createdAt: string;
    closingDate: string;
    manager: string;
    totalCRC: number;
    totalUSD: number;
    recordedBalanceCRC: number;
    recordedBalanceUSD: number;
    diffCRC: number;
    diffUSD: number;
    notes: string;
    breakdownCRC: Record<number, number>;
    breakdownUSD: Record<number, number>;
    adjustmentResolution?: {
        removedAdjustments?: Array<{
            id?: string;
            currency?: 'CRC' | 'USD';
            amount?: number;
            amountIngreso?: number;
            amountEgreso?: number;
            manager?: string;
            createdAt?: string;
        }>;
        note?: string;
        postAdjustmentBalanceCRC?: number;
        postAdjustmentBalanceUSD?: number;
    };
};

export type DailyClosingsDocument = {
    company: string;
    updatedAt: string;
    closingsByDate: Record<string, DailyClosingRecord[]>;
};

const COLLECTION_NAME = 'cierres';
const MAX_CLOSING_RECORDS = 50;

const pad = (value: number): string => value.toString().padStart(2, '0');

const buildDateKeyFromDate = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const resolveISOString = (value: unknown, fallback?: string): string => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
            const parsed = Date.parse(trimmed);
            if (!Number.isNaN(parsed)) {
                return new Date(parsed).toISOString();
            }
            return trimmed;
        }
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString();
        }
    }
    if (value && typeof value === 'object') {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') {
            try {
                const date = candidate.toDate();
                if (date instanceof Date && !Number.isNaN(date.getTime())) {
                    return date.toISOString();
                }
            } catch {
                // ignore invalid timestamp values
            }
        }
    }
    if (fallback) return fallback;
    return new Date().toISOString();
};

const sanitizeMoney = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return Math.trunc(parsed);
        }
    }
    return 0;
};

const sanitizeBreakdown = (input: unknown): Record<number, number> => {
    if (!input || typeof input !== 'object') return {};
    return Object.entries(input as Record<string, unknown>).reduce<Record<number, number>>((acc, [key, rawValue]) => {
        const denom = Number(key);
        if (!Number.isFinite(denom)) return acc;
        const count = sanitizeMoney(rawValue);
        if (count > 0) acc[Math.trunc(denom)] = count;
        return acc;
    }, {});
};

type AdjustmentResolutionRemoval = NonNullable<
    NonNullable<DailyClosingRecord['adjustmentResolution']>['removedAdjustments']
>[number];

const buildDateKeyFromISO = (isoString: string): string => {
    const parsed = Date.parse(isoString);
    if (!Number.isNaN(parsed)) {
        return buildDateKeyFromDate(new Date(parsed));
    }
    if (isoString.length >= 10) {
        const candidate = isoString.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
            return candidate;
        }
    }
    return buildDateKeyFromDate(new Date());
};

const generateRecordId = (): string => `dc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const sanitizeRecord = (raw: unknown): DailyClosingRecord | null => {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Partial<DailyClosingRecord> & Record<string, unknown>;
    const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id.trim() : generateRecordId();
    const closingDate = resolveISOString(candidate.closingDate, new Date().toISOString());
    const createdAt = resolveISOString(candidate.createdAt, closingDate);
    const manager = typeof candidate.manager === 'string' ? candidate.manager.trim() : '';
    const notes = typeof candidate.notes === 'string' ? candidate.notes.trim() : '';

    const record: DailyClosingRecord = {
        id,
        createdAt,
        closingDate,
        manager,
        totalCRC: sanitizeMoney(candidate.totalCRC),
        totalUSD: sanitizeMoney(candidate.totalUSD),
        recordedBalanceCRC: sanitizeMoney(candidate.recordedBalanceCRC),
        recordedBalanceUSD: sanitizeMoney(candidate.recordedBalanceUSD),
        diffCRC: sanitizeMoney(candidate.diffCRC),
        diffUSD: sanitizeMoney(candidate.diffUSD),
        notes,
        breakdownCRC: sanitizeBreakdown(candidate.breakdownCRC),
        breakdownUSD: sanitizeBreakdown(candidate.breakdownUSD),
    } as DailyClosingRecord;

    // sanitize optional adjustmentResolution if present
    if (candidate.adjustmentResolution && typeof candidate.adjustmentResolution === 'object') {
        try {
            const ar = candidate.adjustmentResolution as Record<string, unknown>;
            const resolution: DailyClosingRecord['adjustmentResolution'] = {};
            const removed = Array.isArray(ar.removedAdjustments)
                ? (ar.removedAdjustments as unknown[])
                    .map((it): AdjustmentResolutionRemoval | undefined => {
                        if (!it || typeof it !== 'object') return undefined;
                        const candidateItem = it as Record<string, unknown>;
                        const item: Partial<AdjustmentResolutionRemoval> = {};
                        if (typeof candidateItem.id === 'string' && candidateItem.id.trim().length > 0) {
                            item.id = candidateItem.id.trim();
                        }
                        if (candidateItem.currency === 'USD') item.currency = 'USD';
                        else if (candidateItem.currency === 'CRC') item.currency = 'CRC';
                        if (candidateItem.amount !== undefined) item.amount = sanitizeMoney(candidateItem.amount);
                        if (candidateItem.amountIngreso !== undefined) item.amountIngreso = sanitizeMoney(candidateItem.amountIngreso);
                        if (candidateItem.amountEgreso !== undefined) item.amountEgreso = sanitizeMoney(candidateItem.amountEgreso);
                        if (typeof candidateItem.manager === 'string' && candidateItem.manager.trim().length > 0) {
                            item.manager = candidateItem.manager.trim();
                        }
                        if (typeof candidateItem.createdAt === 'string' && candidateItem.createdAt.trim().length > 0) {
                            item.createdAt = candidateItem.createdAt.trim();
                        }
                        return Object.keys(item).length > 0 ? (item as AdjustmentResolutionRemoval) : undefined;
                    })
                    .filter((entry): entry is AdjustmentResolutionRemoval => Boolean(entry))
                : undefined;
            if (removed && removed.length > 0) {
                resolution.removedAdjustments = removed;
            }
            if (typeof ar.note === 'string') {
                const trimmedNote = ar.note.trim();
                if (trimmedNote.length > 0) {
                    resolution.note = trimmedNote;
                }
            }
            if (ar.postAdjustmentBalanceCRC !== undefined) {
                resolution.postAdjustmentBalanceCRC = sanitizeMoney(ar.postAdjustmentBalanceCRC);
            }
            if (ar.postAdjustmentBalanceUSD !== undefined) {
                resolution.postAdjustmentBalanceUSD = sanitizeMoney(ar.postAdjustmentBalanceUSD);
            }
            if (Object.keys(resolution).length > 0) {
                record.adjustmentResolution = resolution;
            }
        } catch {
            // ignore malformed resolution
        }
    }

    return record;
};

const sortValueForRecord = (record: DailyClosingRecord): number => {
    const createdAtTs = Date.parse(record.createdAt);
    if (!Number.isNaN(createdAtTs)) return createdAtTs;
    const closingAtTs = Date.parse(record.closingDate);
    if (!Number.isNaN(closingAtTs)) return closingAtTs;
    return 0;
};

const sortRecordsDescending = (a: DailyClosingRecord, b: DailyClosingRecord): number =>
    sortValueForRecord(b) - sortValueForRecord(a);

const trimClosingsMap = (map: Record<string, DailyClosingRecord[]>): Record<string, DailyClosingRecord[]> => {
    const buffer: Array<{ dateKey: string; record: DailyClosingRecord }> = [];
    Object.entries(map).forEach(([, records]) => {
        if (!Array.isArray(records)) return;
        records.forEach(record => {
            const sanitized = sanitizeRecord(record);
            if (!sanitized) return;
            const resolvedKey = buildDateKeyFromISO(sanitized.closingDate);
            buffer.push({ dateKey: resolvedKey, record: sanitized });
        });
    });
    buffer.sort((a, b) => sortRecordsDescending(a.record, b.record));
    const trimmed = buffer.slice(0, MAX_CLOSING_RECORDS);
    const result: Record<string, DailyClosingRecord[]> = {};
    trimmed.forEach(({ dateKey, record }) => {
        if (!result[dateKey]) {
            result[dateKey] = [];
        }
        result[dateKey].push(record);
    });
    Object.keys(result).forEach(key => {
        result[key] = result[key].slice().sort(sortRecordsDescending);
    });
    return result;
};

const sanitizeDocument = (raw: unknown, fallbackCompany: string): DailyClosingsDocument => {
    const base: DailyClosingsDocument = {
        company: fallbackCompany,
        updatedAt: new Date().toISOString(),
        closingsByDate: {},
    };
    if (!raw || typeof raw !== 'object') {
        return base;
    }
    const candidate = raw as Partial<DailyClosingsDocument> & {
        closings?: unknown;
        closingsByDate?: unknown;
    };

    if (typeof candidate.company === 'string' && candidate.company.trim().length > 0) {
        base.company = candidate.company.trim();
    }
    base.updatedAt = resolveISOString(candidate.updatedAt, base.updatedAt);

    const collectionMap: Record<string, DailyClosingRecord[]> = {};

    if (candidate.closingsByDate && typeof candidate.closingsByDate === 'object') {
        Object.entries(candidate.closingsByDate as Record<string, unknown>).forEach(([rawKey, rawList]) => {
            if (!Array.isArray(rawList)) return;
            const sanitizedRecords = rawList
                .map(record => sanitizeRecord(record))
                .filter((record): record is DailyClosingRecord => record !== null);
            if (sanitizedRecords.length === 0) return;
            const normalizedKey = buildDateKeyFromISO(rawKey);
            collectionMap[normalizedKey] = sanitizedRecords.sort(sortRecordsDescending);
        });
    } else if (Array.isArray(candidate.closings)) {
        candidate.closings.forEach(record => {
            const sanitized = sanitizeRecord(record);
            if (!sanitized) return;
            const dateKey = buildDateKeyFromISO(sanitized.closingDate);
            const list = collectionMap[dateKey] ?? [];
            list.push(sanitized);
            collectionMap[dateKey] = list;
        });
    }

    base.closingsByDate = trimClosingsMap(collectionMap);
    return base;
};

export class DailyClosingsService {
    static readonly MAX_RECORDS = MAX_CLOSING_RECORDS;

    private static buildDocumentId(company: string): string {
        return company.trim();
    }

    static extractAllClosings(document: DailyClosingsDocument): DailyClosingRecord[] {
        const entries = Object.values(document.closingsByDate).flat();
        return entries.slice().sort(sortRecordsDescending);
    }

    static async getDocument(company: string): Promise<DailyClosingsDocument | null> {
        const docId = this.buildDocumentId(company);
        if (!docId) return null;
        const raw = await FirestoreService.getById(COLLECTION_NAME, docId);
        if (!raw) return null;
        return sanitizeDocument(raw, docId);
    }

    static async getClosingsForDate(company: string, dateKey: string): Promise<DailyClosingRecord[]> {
        const doc = await this.getDocument(company);
        if (!doc) return [];
        const normalizedKey = buildDateKeyFromISO(dateKey);
        return doc.closingsByDate[normalizedKey]?.slice() ?? [];
    }

    static async saveClosing(company: string, record: DailyClosingRecord): Promise<void> {
        const docId = this.buildDocumentId(company);
        if (!docId) {
            throw new Error('Company ID is required for saving closing');
        }
        const sanitizedRecord = sanitizeRecord(record);
        if (!sanitizedRecord) {
            throw new Error('Invalid closing record data');
        }
        const existingDocument = await this.getDocument(company);
        const currentMap = existingDocument?.closingsByDate ?? {};
        const dateKey = buildDateKeyFromISO(sanitizedRecord.closingDate);
        const list = currentMap[dateKey] ?? [];
        const filtered = list.filter(item => item.id !== sanitizedRecord.id);
        currentMap[dateKey] = [sanitizedRecord, ...filtered];
        const trimmed = trimClosingsMap(currentMap);
        const payload: DailyClosingsDocument = {
            company: existingDocument?.company ?? docId,
            updatedAt: new Date().toISOString(),
            closingsByDate: trimmed,
        };
        await FirestoreService.addWithId(COLLECTION_NAME, docId, payload);
        
        // Verify the save was successful by reading back the data
        // Note: This works reliably because Firestore SDK serves reads from local cache
        // immediately after writes, ensuring consistency for the same client
        const verifyDoc = await this.getDocument(company);
        if (!verifyDoc) {
            throw new Error('Failed to verify closing save: document not found after save');
        }
        const verifyList = verifyDoc.closingsByDate[dateKey];
        const savedRecord = verifyList?.find(item => item.id === sanitizedRecord.id);
        if (!savedRecord) {
            throw new Error(`Failed to verify closing save: record ${sanitizedRecord.id} not found after save`);
        }
    }
}
