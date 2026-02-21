import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ProviderEntry } from '../types/firestore';

interface ProvidersDocument {
	company: string;
	nextCode: number;
	providers: ProviderEntry[];
}

type ProviderVisitDay = 'D' | 'L' | 'M' | 'MI' | 'J' | 'V' | 'S';
type ProviderVisitFrequency = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | '22 DIAS';

const VISIT_DAYS: ProviderVisitDay[] = ['D', 'L', 'M', 'MI', 'J', 'V', 'S'];
const VISIT_FREQUENCIES: ProviderVisitFrequency[] = ['SEMANAL', 'QUINCENAL', 'MENSUAL', '22 DIAS'];

const normalizeVisitDays = (raw: unknown): ProviderVisitDay[] => {
	if (!Array.isArray(raw)) return [];
	const out: ProviderVisitDay[] = [];
	for (const item of raw) {
		if (typeof item !== 'string') continue;
		const normalized = item.trim().toUpperCase();
		if (VISIT_DAYS.includes(normalized as ProviderVisitDay)) {
			out.push(normalized as ProviderVisitDay);
		}
	}
	// unique while preserving order
	return out.filter((d, idx) => out.indexOf(d) === idx);
};

const normalizeVisitFrequency = (raw: unknown): ProviderVisitFrequency | undefined => {
	if (typeof raw !== 'string') return undefined;
	const normalized = raw.trim().toUpperCase();
	return VISIT_FREQUENCIES.includes(normalized as ProviderVisitFrequency)
		? (normalized as ProviderVisitFrequency)
		: undefined;
};

const normalizeVisitConfig = (raw: unknown): ProviderEntry['visit'] | undefined => {
	if (!raw || typeof raw !== 'object') return undefined;
	const data = raw as Record<string, unknown>;
	const createOrderDays = normalizeVisitDays(data.createOrderDays);
	const receiveOrderDays = normalizeVisitDays(data.receiveOrderDays);
	const frequency = normalizeVisitFrequency(data.frequency);
	if (!frequency) return undefined;
	if (createOrderDays.length === 0 && receiveOrderDays.length === 0) return undefined;

	const startDateKeyRaw = data.startDateKey ?? (data as any).startdatekey ?? (data as any).startDate;
	let startDateKey: number | undefined;
	if (typeof startDateKeyRaw === 'number' && Number.isFinite(startDateKeyRaw) && startDateKeyRaw > 0) {
		startDateKey = startDateKeyRaw;
	} else if (typeof startDateKeyRaw === 'string') {
		const trimmed = startDateKeyRaw.trim();
		const parsed = Number.parseInt(trimmed, 10);
		if (Number.isFinite(parsed) && parsed > 0) startDateKey = parsed;
	}

	// For SEMANAL we don't need an anchor; omit to keep storage clean.
	if (frequency === 'SEMANAL') startDateKey = undefined;
	// For non-weekly frequencies, keep startDateKey optional for backward compatibility.
	return {
		createOrderDays,
		receiveOrderDays,
		frequency,
		startDateKey,
	};
};

/**
 * Determina la categoría automáticamente basándose en el tipo de movimiento
 */
const getCategoryFromType = (type?: string): 'Ingreso' | 'Gasto' | 'Egreso' | undefined => {
	if (!type || typeof type !== 'string') return undefined;

	const normalizedType = type.trim().toUpperCase();

	// Ingresos
	if (normalizedType === 'VENTAS' || normalizedType === 'OTROS INGRESOS') {
		return 'Ingreso';
	}

	// Gastos
	const gastos = [
		'SALARIOS',
		'TELEFONOS',
		'CARGAS SOCIALES',
		'AGUINALDOS',
		'VACACIONES',
		'POLIZA RIESGOS DE TRABAJO',
		'PAGO TIMBRE Y EDUCACION',
		'PAGO IMPUESTOS A SOCIEDADES',
		'PATENTES MUNICIPALES',
		'ALQUILER LOCAL',
		'ELECTRICIDAD',
		'AGUA',
		'INTERNET',
		'MANTENIMIENTO INSTALACIONES',
		'PAPELERIA Y UTILES',
		'ASEO Y LIMPIEZA',
		'REDES SOCIALES',
		'MATERIALES DE EMPAQUE',
		'CONTROL PLAGAS',
		'MONITOREO DE ALARMAS',
		'FACTURA ELECTRONICA',
		'GASTOS VARIOS',
		'TRANSPORTE',
		'SERVICIOS PROFESIONALES',
		'MANTENIMIENTO MOBILIARIO Y EQUIPO',
	];

	if (gastos.includes(normalizedType)) {
		return 'Gasto';
	}

	// Egresos
	const egresos = [
		'EGRESOS VARIOS',
		'PAGO TIEMPOS',
		'PAGO BANCA',
		'COMPRA INVENTARIO',
		'COMPRA ACTIVOS',
		'PAGO IMPUESTO RENTA',
		'PAGO IMPUESTO IVA',
		'RETIRO EFECTIVO'
	];

	if (egresos.includes(normalizedType)) {
		return 'Egreso';
	}

	return undefined;
};

const padCode = (value: unknown): string => {
	if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
		return String(value).padStart(4, '0');
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return '';
		const parsed = Number.parseInt(trimmed, 10);
		if (!Number.isNaN(parsed) && parsed >= 0) {
			return String(parsed).padStart(4, '0');
		}
		return trimmed.padStart(4, '0');
	}

	const fallback = String(value ?? '').trim();
	if (!fallback) return '';
	const parsed = Number.parseInt(fallback, 10);
	if (!Number.isNaN(parsed) && parsed >= 0) {
		return String(parsed).padStart(4, '0');
	}
	return fallback.padStart(4, '0');
};

const normalizeProviderEntry = (raw: unknown, fallbackCompany: string): ProviderEntry | null => {
	if (!raw || typeof raw !== 'object') return null;

	const data = raw as Record<string, unknown>;
	const name = typeof data.name === 'string' ? data.name.trim() : '';
	if (!name) return null;

	const codeSource = data.code ?? data.id ?? data.identifier;
	const code = padCode(codeSource ?? '');
	if (!code.trim()) return null;

	const companyCandidate = typeof data.company === 'string' ? data.company.trim() : '';
	const typeCandidate = typeof data.type === 'string' ? data.type.trim().toUpperCase() : undefined;

	// Si hay una categoría guardada, la usamos; si no, la determinamos del tipo
	const categoryCandidate = typeof data.category === 'string'
		? data.category.trim() as 'Ingreso' | 'Gasto' | 'Egreso'
		: getCategoryFromType(typeCandidate);

	const createdAt = typeof data.createdAt === 'string' ? data.createdAt : undefined;
	const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : undefined;
	const correonotifi = typeof data.correonotifi === 'string' ? data.correonotifi.trim() : undefined;
	const visit = normalizeVisitConfig(data.visit);

	return {
		name,
		code,
		company: companyCandidate || fallbackCompany,
		type: typeCandidate && typeCandidate.length > 0 ? typeCandidate : undefined,
		category: categoryCandidate,
		createdAt,
		updatedAt,
		correonotifi,
		visit
	};
};

const highestCode = (providers: ProviderEntry[]): number => {
	return providers.reduce((max, provider) => {
		const numeric = Number.parseInt(provider.code, 10);
		if (Number.isFinite(numeric) && numeric > max) {
			return numeric;
		}
		return max;
	}, -1);
};

const deriveNextCode = (nextCodeValue: unknown, providers: ProviderEntry[]): number => {
	const stored = typeof nextCodeValue === 'number' && Number.isFinite(nextCodeValue) && nextCodeValue >= 0
		? nextCodeValue
		: undefined;

	const maxExisting = highestCode(providers);

	if (typeof stored === 'number' && stored > maxExisting) {
		return stored;
	}

	return maxExisting + 1;
};

const normalizeProvidersDocument = (raw: unknown, company: string): ProvidersDocument => {
	if (!raw || typeof raw !== 'object') {
		return {
			company,
			nextCode: 0,
			providers: []
		};
	}

	const data = raw as Record<string, unknown>;
	const companyCandidate = typeof data.company === 'string' && data.company.trim().length > 0
		? data.company.trim()
		: company;

	const providersArray = Array.isArray(data.providers) ? data.providers : [];
	const providers = providersArray
		.map(item => normalizeProviderEntry(item, companyCandidate))
		.filter((item): item is ProviderEntry => item !== null);

	return {
		company: companyCandidate,
		nextCode: deriveNextCode(data.nextCode, providers),
		providers
	};
};

export class ProvidersService {
	private static readonly COLLECTION_NAME = 'proveedores';
	private static readonly CACHE_TTL_MS = 15_000;
	private static readonly providersCache = new Map<string, { expiresAt: number; providers: ProviderEntry[] }>();

	private static cloneProviders(providers: ProviderEntry[]): ProviderEntry[] {
		return (providers || []).map((p) => ({
			...p,
			visit: p.visit
				? {
					...p.visit,
					createOrderDays: Array.isArray(p.visit.createOrderDays) ? [...p.visit.createOrderDays] : [],
					receiveOrderDays: Array.isArray(p.visit.receiveOrderDays) ? [...p.visit.receiveOrderDays] : [],
				}
				: undefined,
		}));
	}

	static async getProviders(company: string): Promise<ProviderEntry[]> {
		const trimmedCompany = (company || '').trim();
		if (!trimmedCompany) {
			return [];
		}

		const cached = this.providersCache.get(trimmedCompany);
		if (cached && cached.expiresAt > Date.now()) {
			return this.cloneProviders(cached.providers);
		}

		const docRef = doc(db, this.COLLECTION_NAME, trimmedCompany);
		const snapshot = await getDoc(docRef);

		if (!snapshot.exists()) {
			return [];
		}

		const normalized = normalizeProvidersDocument(snapshot.data(), trimmedCompany);
		this.providersCache.set(trimmedCompany, {
			expiresAt: Date.now() + this.CACHE_TTL_MS,
			providers: normalized.providers,
		});
		return this.cloneProviders(normalized.providers);
	}

	static async addProvider(
		company: string,
		providerName: string,
		providerType?: string,
		correonotifi?: string,
		visit?: ProviderEntry['visit']
	): Promise<ProviderEntry> {
		const trimmedCompany = (company || '').trim();
		if (!trimmedCompany) {
			throw new Error('No se pudo determinar la empresa del usuario.');
		}

		const trimmedName = (providerName || '').trim();
		if (!trimmedName) {
			throw new Error('El nombre del proveedor es obligatorio.');
		}

		const docRef = doc(db, this.COLLECTION_NAME, trimmedCompany);

		const newProvider = await runTransaction(db, async transaction => {
			const snapshot = await transaction.get(docRef);
			const document = snapshot.exists()
				? normalizeProvidersDocument(snapshot.data(), trimmedCompany)
				: {
					company: trimmedCompany,
					nextCode: 0,
					providers: [] as ProviderEntry[]
				};

			const normalizedName = trimmedName.toUpperCase();
			const normalizedType = typeof providerType === 'string' && providerType.trim().length > 0
				? providerType.trim().toUpperCase()
				: undefined;
			const duplicate = document.providers.some(
				provider => provider.name.toUpperCase() === normalizedName
			);

			if (duplicate) {
				throw new Error('Ya existe un proveedor con ese nombre.');
			}

			const nextNumericCode = deriveNextCode(document.nextCode, document.providers);
			const category = getCategoryFromType(normalizedType);
			const now = new Date().toISOString();
			const trimmedCorreo = typeof correonotifi === 'string' ? correonotifi.trim() : undefined;
			const sanitizedVisit = visit ? normalizeVisitConfig(visit as unknown) : undefined;
			const shouldPersistVisit = Boolean(
				normalizedType === 'COMPRA INVENTARIO' &&
				sanitizedVisit &&
				sanitizedVisit.frequency &&
				sanitizedVisit.createOrderDays.length > 0 &&
				sanitizedVisit.receiveOrderDays.length > 0
			);
			const createdProvider: ProviderEntry = {
				code: String(nextNumericCode).padStart(4, '0'),
				name: normalizedName,
				company: document.company,
				type: normalizedType,
				category,
				createdAt: now,
				updatedAt: now,
				correonotifi: trimmedCorreo && trimmedCorreo.length > 0 ? trimmedCorreo : undefined,
				visit: shouldPersistVisit ? sanitizedVisit : undefined
			};

			const updatedDocument: ProvidersDocument = {
				company: document.company,
				nextCode: nextNumericCode + 1,
				providers: [createdProvider, ...document.providers]
			};

			// Firestore rejects fields with `undefined`. Sanitize providers array to omit
			// undefined properties before writing.
			const firestoreDoc: Record<string, unknown> = {
				company: updatedDocument.company,
				nextCode: updatedDocument.nextCode,
				providers: updatedDocument.providers.map(p => {
					const out: Record<string, unknown> = {
						code: p.code,
						name: p.name,
						company: p.company,
					};
					if (typeof p.type === 'string' && p.type.length > 0) out.type = p.type;
					if (typeof p.category === 'string' && p.category.length > 0) out.category = p.category;
					if (typeof p.createdAt === 'string' && p.createdAt.length > 0) out.createdAt = p.createdAt;
					if (typeof p.updatedAt === 'string' && p.updatedAt.length > 0) out.updatedAt = p.updatedAt;
					if (typeof p.correonotifi === 'string' && p.correonotifi.length > 0) out.correonotifi = p.correonotifi;
					if (p.visit) {
						out.visit = {
							createOrderDays: p.visit.createOrderDays,
							receiveOrderDays: p.visit.receiveOrderDays,
							frequency: p.visit.frequency,
						};
						if (typeof p.visit.startDateKey === 'number' && Number.isFinite(p.visit.startDateKey)) {
							(out.visit as any).startDateKey = p.visit.startDateKey;
						}
					}
					return out;
				}),
			};

			transaction.set(docRef, firestoreDoc);
			return createdProvider;
		});

		this.providersCache.delete(trimmedCompany);
		return newProvider;
	}

	static async removeProvider(company: string, providerCode: string): Promise<ProviderEntry> {
		const trimmedCompany = (company || '').trim();
		if (!trimmedCompany) {
			throw new Error('No se pudo determinar la empresa del usuario.');
		}

		const normalizedCode = padCode(providerCode);
		if (!normalizedCode) {
			throw new Error('Código de proveedor no válido.');
		}

		const docRef = doc(db, this.COLLECTION_NAME, trimmedCompany);

		const removedProvider = await runTransaction(db, async transaction => {
			const snapshot = await transaction.get(docRef);
			if (!snapshot.exists()) {
				throw new Error('El proveedor no existe.');
			}

			const document = normalizeProvidersDocument(snapshot.data(), trimmedCompany);
			const targetIndex = document.providers.findIndex(p => p.code === normalizedCode);

			if (targetIndex === -1) {
				throw new Error('El proveedor no existe.');
			}

			const providerToRemove = document.providers[targetIndex];
			const updatedProviders = document.providers.filter((_, idx) => idx !== targetIndex);
			const highestRemaining = highestCode(updatedProviders);

			const updatedDocument: ProvidersDocument = {
				company: document.company,
				nextCode: Math.max(document.nextCode, highestRemaining + 1, 0),
				providers: updatedProviders
			};

			// Sanitize before writing to Firestore to avoid `undefined` values.
			const firestoreDoc: Record<string, unknown> = {
				company: updatedDocument.company,
				nextCode: updatedDocument.nextCode,
				providers: updatedDocument.providers.map(p => {
					const out: Record<string, unknown> = {
						code: p.code,
						name: p.name,
						company: p.company,
					};
					if (typeof p.type === 'string' && p.type.length > 0) out.type = p.type;
					if (typeof p.category === 'string' && p.category.length > 0) out.category = p.category;
					if (typeof p.createdAt === 'string' && p.createdAt.length > 0) out.createdAt = p.createdAt;
					if (typeof p.updatedAt === 'string' && p.updatedAt.length > 0) out.updatedAt = p.updatedAt;
					if (typeof p.correonotifi === 'string' && p.correonotifi.length > 0) out.correonotifi = p.correonotifi;
					return out;
				}),
			};

			transaction.set(docRef, firestoreDoc);
			return providerToRemove;
		});

		this.providersCache.delete(trimmedCompany);
		return removedProvider;
	}

	static async updateProvider(
		company: string,
		providerCode: string,
		providerName: string,
		providerType?: string,
		correonotifi?: string,
		visit?: ProviderEntry['visit']
	): Promise<ProviderEntry> {
		const trimmedCompany = (company || '').trim();
		if (!trimmedCompany) {
			throw new Error('No se pudo determinar la empresa del usuario.');
		}

		const code = padCode(providerCode);
		if (!code) {
			throw new Error('Codigo de proveedor no valido.');
		}

		const trimmedName = (providerName || '').trim();
		if (!trimmedName) {
			throw new Error('El nombre del proveedor es obligatorio.');
		}

		const docRef = doc(db, this.COLLECTION_NAME, trimmedCompany);

		const updated = await runTransaction(db, async transaction => {
			const snapshot = await transaction.get(docRef);
			if (!snapshot.exists()) {
				throw new Error('El proveedor no existe.');
			}

			const document = normalizeProvidersDocument(snapshot.data(), trimmedCompany);
			const targetIndex = document.providers.findIndex(p => p.code === code);
			if (targetIndex === -1) {
				throw new Error('El proveedor no existe.');
			}

			// Prevent duplicate name with other providers
			const normalizedName = trimmedName.toUpperCase();
			const duplicate = document.providers.some((p, idx) => idx !== targetIndex && p.name.toUpperCase() === normalizedName);
			if (duplicate) {
				throw new Error('Ya existe un proveedor con ese nombre.');
			}

			const normalizedType = typeof providerType === 'string' && providerType.trim().length > 0
				? providerType.trim().toUpperCase()
				: undefined;

			const category = getCategoryFromType(normalizedType);
			const trimmedCorreo = typeof correonotifi === 'string' ? correonotifi.trim() : undefined;
			const sanitizedVisit = visit ? normalizeVisitConfig(visit as unknown) : undefined;
			const shouldPersistVisit = Boolean(
				normalizedType === 'COMPRA INVENTARIO' &&
				sanitizedVisit &&
				sanitizedVisit.frequency &&
				sanitizedVisit.createOrderDays.length > 0 &&
				sanitizedVisit.receiveOrderDays.length > 0
			);
			const updatedProvider: ProviderEntry = {
				...document.providers[targetIndex],
				name: normalizedName,
				type: normalizedType,
				category,
				updatedAt: new Date().toISOString(),
				correonotifi: trimmedCorreo && trimmedCorreo.length > 0 ? trimmedCorreo : undefined,
				visit: shouldPersistVisit ? sanitizedVisit : undefined
			}; const updatedProviders = [...document.providers];
			updatedProviders[targetIndex] = updatedProvider;

			const updatedDocument: ProvidersDocument = {
				company: document.company,
				nextCode: document.nextCode,
				providers: updatedProviders,
			};

			const firestoreDoc: Record<string, unknown> = {
				company: updatedDocument.company,
				nextCode: updatedDocument.nextCode,
				providers: updatedDocument.providers.map(p => {
					const out: Record<string, unknown> = {
						code: p.code,
						name: p.name,
						company: p.company,
					};
					if (typeof p.type === 'string' && p.type.length > 0) out.type = p.type;
					if (typeof p.category === 'string' && p.category.length > 0) out.category = p.category;
					if (typeof p.createdAt === 'string' && p.createdAt.length > 0) out.createdAt = p.createdAt;
					if (typeof p.updatedAt === 'string' && p.updatedAt.length > 0) out.updatedAt = p.updatedAt;
					if (typeof p.correonotifi === 'string' && p.correonotifi.length > 0) out.correonotifi = p.correonotifi;
					if (p.visit) {
						out.visit = {
							createOrderDays: p.visit.createOrderDays,
							receiveOrderDays: p.visit.receiveOrderDays,
							frequency: p.visit.frequency,
						};
						if (typeof p.visit.startDateKey === 'number' && Number.isFinite(p.visit.startDateKey)) {
							(out.visit as any).startDateKey = p.visit.startDateKey;
						}
					}
					return out;
				}),
			};

			transaction.set(docRef, firestoreDoc);
			return updatedProvider;
		});

		this.providersCache.delete(trimmedCompany);
		return updated;
	}

}
