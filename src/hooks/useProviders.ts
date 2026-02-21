import { useCallback, useEffect, useState } from 'react';
import { ProvidersService } from '../services/providers';
import type { ProviderEntry } from '../types/firestore';

export function useProviders(company?: string) {
	const [providers, setProviders] = useState<ProviderEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchProviders = useCallback(async () => {
		const trimmedCompany = (company || '').trim();

		if (!trimmedCompany) {
			setProviders([]);
			setError(null);
			setLoading(false);
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const data = await ProvidersService.getProviders(trimmedCompany);
			setProviders(data);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Error al cargar los proveedores.';
			setError(message);
			console.error('Error fetching providers:', err);
		} finally {
			setLoading(false);
		}
	}, [company]);

	const addProvider = useCallback(async (name: string, type?: string, correonotifi?: string, visit?: ProviderEntry['visit']) => {
		const trimmedCompany = (company || '').trim();
		if (!trimmedCompany) {
			const message = 'No se pudo determinar la empresa del usuario.';
			setError(message);
			throw new Error(message);
		}

		try {
			setError(null);
			await ProvidersService.addProvider(trimmedCompany, name, type, correonotifi, visit);
			await fetchProviders();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo guardar el proveedor.';
			setError(message);
			console.error('Error adding provider:', err);
			throw err instanceof Error ? err : new Error(message);
		}
	}, [company, fetchProviders]);

	const removeProvider = useCallback(async (code: string) => {
		const trimmedCompany = (company || '').trim();
		if (!trimmedCompany) {
			const message = 'No se pudo determinar la empresa del usuario.';
			setError(message);
			throw new Error(message);
		}

		try {
			setError(null);
			await ProvidersService.removeProvider(trimmedCompany, code);
			await fetchProviders();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo eliminar el proveedor.';
			setError(message);
			console.error('Error removing provider:', err);
			throw err instanceof Error ? err : new Error(message);
		}
	}, [company, fetchProviders]);

	const updateProvider = useCallback(async (code: string, name: string, type?: string, correonotifi?: string, visit?: ProviderEntry['visit']) => {
		const trimmedCompany = (company || '').trim();
		if (!trimmedCompany) {
			const message = 'No se pudo determinar la empresa del usuario.';
			setError(message);
			throw new Error(message);
		}

		try {
			setError(null);
			await ProvidersService.updateProvider(trimmedCompany, code, name, type, correonotifi, visit);
			await fetchProviders();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo actualizar el proveedor.';
			setError(message);
			console.error('Error updating provider:', err);
			throw err instanceof Error ? err : new Error(message);
		}
	}, [company, fetchProviders]);

	useEffect(() => {
		void fetchProviders();
	}, [fetchProviders]);

	return {
		providers,
		loading,
		error,
		addProvider,
		removeProvider,
		updateProvider,
		refetch: fetchProviders
	};
}
