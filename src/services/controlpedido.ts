import {
	doc,
	getDoc,
	runTransaction,
	serverTimestamp,
	Timestamp,
	onSnapshot,
	type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { weekStartKeyFromDateKey } from "@/utils/dateKey";

export interface ControlPedidoEntry {
	id: string;
	providerCode: string;
	providerName: string;
	createDateKey: number;
	receiveDateKey: number;
	amount: number;
	createdAt?: unknown;
}

interface ControlPedidoWeekDoc {
	company: string;
	weekStartKey: number;
	entries: ControlPedidoEntry[];
	updatedAt?: unknown;
}

const COLLECTION_NAME = "controlpedido";

const createEntryId = (): string => {
	try {
		const c: any = typeof crypto !== "undefined" ? crypto : undefined;
		if (c && typeof c.randomUUID === "function") return c.randomUUID();
	} catch {
		// ignore
	}
	return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const asFiniteNumber = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const normalizeEntry = (raw: unknown): ControlPedidoEntry | null => {
	if (!raw || typeof raw !== "object") return null;
	const data = raw as Record<string, unknown>;
	const id = typeof data.id === "string" ? data.id.trim() : "";
	const providerCode =
		typeof data.providerCode === "string" ? data.providerCode.trim() : "";
	const providerName =
		typeof data.providerName === "string" ? data.providerName.trim() : "";
	const createDateKey = asFiniteNumber(data.createDateKey);
	const receiveDateKey = asFiniteNumber(data.receiveDateKey);
	const amount = asFiniteNumber(data.amount);
	if (!id || !providerCode || !providerName) return null;
	if (createDateKey === null || receiveDateKey === null || amount === null)
		return null;
	return {
		id,
		providerCode,
		providerName,
		createDateKey,
		receiveDateKey,
		amount,
		createdAt: data.createdAt,
	};
};

const normalizeWeekDoc = (
	raw: unknown,
	company: string,
	weekStartKey: number
): ControlPedidoWeekDoc => {
	if (!raw || typeof raw !== "object") {
		return { company, weekStartKey, entries: [] };
	}
	const data = raw as Record<string, unknown>;
	const entriesRaw = Array.isArray(data.entries) ? data.entries : [];
	const entries = entriesRaw
		.map((e) => normalizeEntry(e))
		.filter((e): e is ControlPedidoEntry => e !== null);
	return {
		company:
			typeof data.company === "string" && data.company.trim()
				? data.company.trim()
				: company,
		weekStartKey:
			asFiniteNumber(data.weekStartKey) ?? weekStartKey,
		entries,
		updatedAt: data.updatedAt,
	};
};

const weekDocId = (company: string, weekStartKey: number): string => {
	const c = (company || "").trim();
	return `${c}__${weekStartKey}`;
};

type WeekSubscriber = {
	onValue: (entries: ControlPedidoEntry[]) => void;
	onError?: (error: unknown) => void;
};

type SharedWeekListener = {
	unsubscribe: Unsubscribe;
	subscribers: Set<WeekSubscriber>;
	lastEntries?: ControlPedidoEntry[];
};

export class ControlPedidoService {
	private static sharedWeekListeners = new Map<string, SharedWeekListener>();

	static async deleteByProviderAndReceiveDateKey(
		company: string,
		providerCode: string,
		receiveDateKey: number
	): Promise<number> {
		const trimmedCompany = (company || "").trim();
		const trimmedProviderCode = (providerCode || "").trim();
		if (!trimmedCompany) {
			throw new Error("No se pudo determinar la empresa del usuario.");
		}
		if (!trimmedProviderCode) {
			throw new Error("Proveedor inválido.");
		}
		if (!Number.isFinite(receiveDateKey)) {
			throw new Error("Fecha de recepción inválida.");
		}

		// ControlPedido docs are partitioned by RECEIVE week.
		const receiveWeekStartKey = weekStartKeyFromDateKey(receiveDateKey);
		if (!Number.isFinite(receiveWeekStartKey)) {
			throw new Error("Semana de recepción inválida.");
		}

		const docRef = doc(db, COLLECTION_NAME, weekDocId(trimmedCompany, receiveWeekStartKey));
		let removedCount = 0;

		await runTransaction(db, async (tx) => {
			const snap = await tx.get(docRef);
			if (!snap.exists()) {
				removedCount = 0;
				return;
			}

			const existing = normalizeWeekDoc(snap.data(), trimmedCompany, receiveWeekStartKey);
			const entries = Array.isArray(existing.entries) ? existing.entries : [];
			const nextEntries = entries.filter((e) => {
				const match =
					String(e.providerCode || "").trim() === trimmedProviderCode &&
					Number(e.receiveDateKey) === receiveDateKey;
				if (match) removedCount++;
				return !match;
			});

			if (removedCount === 0) return;

			tx.set(
				docRef,
				{
					company: trimmedCompany,
					weekStartKey: receiveWeekStartKey,
					entries: nextEntries,
					updatedAt: serverTimestamp(),
				},
				{ merge: true }
			);
		});

		return removedCount;
	}

	static subscribeWeek(
		company: string,
		weekStartKey: number,
		onValue: (entries: ControlPedidoEntry[]) => void,
		onError?: (error: unknown) => void
	): Unsubscribe {
		const trimmedCompany = (company || "").trim();
		if (!trimmedCompany || !Number.isFinite(weekStartKey)) {
			onValue([]);
			return () => {};
		}

		const subscriber: WeekSubscriber = { onValue, onError };
		const key = weekDocId(trimmedCompany, weekStartKey);
		const existing = this.sharedWeekListeners.get(key);
		if (existing) {
			existing.subscribers.add(subscriber);
			if (existing.lastEntries) onValue(existing.lastEntries);
			return () => {
				existing.subscribers.delete(subscriber);
				if (existing.subscribers.size === 0) {
					existing.unsubscribe();
					this.sharedWeekListeners.delete(key);
				}
			};
		}

		const docRef = doc(db, COLLECTION_NAME, key);
		const holder: SharedWeekListener = {
			unsubscribe: () => {},
			subscribers: new Set<WeekSubscriber>([subscriber]),
		};
		this.sharedWeekListeners.set(key, holder);

		holder.unsubscribe = onSnapshot(
			docRef,
			(snapshot) => {
				const entries = snapshot.exists()
					? normalizeWeekDoc(snapshot.data(), trimmedCompany, weekStartKey).entries
					: [];
				holder.lastEntries = entries;
				for (const sub of holder.subscribers) sub.onValue(entries);
			},
			(err) => {
				for (const sub of holder.subscribers) sub.onError?.(err);
			}
		);

		return () => {
			holder.subscribers.delete(subscriber);
			if (holder.subscribers.size === 0) {
				holder.unsubscribe();
				this.sharedWeekListeners.delete(key);
			}
		};
	}

	static async addEntry(
		company: string,
		payload: Omit<ControlPedidoEntry, "id" | "createdAt">
	): Promise<ControlPedidoEntry> {
		const trimmedCompany = (company || "").trim();
		if (!trimmedCompany) {
			throw new Error("No se pudo determinar la empresa del usuario.");
		}
		const amount = asFiniteNumber(payload.amount);
		if (amount === null || amount <= 0) {
			throw new Error("Monto inválido.");
		}
		if (!payload.providerCode?.trim() || !payload.providerName?.trim()) {
			throw new Error("Proveedor inválido.");
		}
		if (!Number.isFinite(payload.createDateKey) || !Number.isFinite(payload.receiveDateKey)) {
			throw new Error("Fechas inválidas.");
		}
		if (payload.receiveDateKey < payload.createDateKey) {
			throw new Error("La fecha de recepción no puede ser anterior a la fecha de creación.");
		}

		// ControlPedido docs are partitioned by RECEIVE week.
		const receiveWeekStartKey = weekStartKeyFromDateKey(payload.receiveDateKey);
		if (!Number.isFinite(receiveWeekStartKey)) {
			throw new Error("Semana de recepción inválida.");
		}

		const entry: ControlPedidoEntry = {
			id: createEntryId(),
			providerCode: payload.providerCode.trim(),
			providerName: payload.providerName.trim(),
			createDateKey: payload.createDateKey,
			receiveDateKey: payload.receiveDateKey,
			amount,
			createdAt: Timestamp.now(),
		};

		const docRef = doc(db, COLLECTION_NAME, weekDocId(trimmedCompany, receiveWeekStartKey));

		await runTransaction(db, async (tx) => {
			const snap = await tx.get(docRef);
			const existing = snap.exists()
				? normalizeWeekDoc(snap.data(), trimmedCompany, receiveWeekStartKey)
				: {
						company: trimmedCompany,
						weekStartKey: receiveWeekStartKey,
						entries: [] as ControlPedidoEntry[],
				  };

			const entries = Array.isArray(existing.entries) ? existing.entries : [];
			entries.push(entry);

			tx.set(
				docRef,
				{
					company: trimmedCompany,
					weekStartKey: receiveWeekStartKey,
					entries,
					updatedAt: serverTimestamp(),
				},
				{ merge: true }
			);
		});

		// Return without the server timestamp (caller can rely on snapshot for authoritative state)
		return entry;
	}

	static async getWeek(company: string, weekStartKey: number): Promise<ControlPedidoEntry[]> {
		const trimmedCompany = (company || "").trim();
		if (!trimmedCompany || !Number.isFinite(weekStartKey)) return [];
		const docRef = doc(db, COLLECTION_NAME, weekDocId(trimmedCompany, weekStartKey));
		const snap = await getDoc(docRef);
		if (!snap.exists()) return [];
		return normalizeWeekDoc(snap.data(), trimmedCompany, weekStartKey).entries;
	}
}
