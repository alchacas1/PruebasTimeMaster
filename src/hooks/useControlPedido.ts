import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ControlPedidoService,
	type ControlPedidoEntry,
} from "../services/controlpedido";

export function useControlPedido(
	company?: string,
	weekStartKey?: number,
	enabled: boolean = true
) {
	const [entries, setEntries] = useState<ControlPedidoEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const normalizedCompany = useMemo(() => (company || "").trim(), [company]);
	const normalizedWeekStartKey =
		typeof weekStartKey === "number" && Number.isFinite(weekStartKey)
			? weekStartKey
			: undefined;

	useEffect(() => {
		if (!enabled || !normalizedCompany || normalizedWeekStartKey === undefined) {
			setEntries([]);
			setLoading(false);
			setError(null);
			return;
		}

		setLoading(true);
		setError(null);

		const unsubscribe = ControlPedidoService.subscribeWeek(
			normalizedCompany,
			normalizedWeekStartKey,
			(next) => {
				setEntries(next);
				setLoading(false);
				setError(null);
			},
			(err) => {
				const message =
					err instanceof Error
						? err.message
						: "Error al cargar control de pedido.";
				setError(message);
				setLoading(false);
			}
		);

		return () => unsubscribe();
	}, [enabled, normalizedCompany, normalizedWeekStartKey]);

	const addOrder = useCallback(
		async (payload: Omit<ControlPedidoEntry, "id" | "createdAt">) => {
			if (!normalizedCompany) {
				const message = "No se pudo determinar la empresa del usuario.";
				setError(message);
				throw new Error(message);
			}

			try {
				setError(null);
				await ControlPedidoService.addEntry(normalizedCompany, payload);
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: "No se pudo guardar el control de pedido.";
				setError(message);
				throw err instanceof Error ? err : new Error(message);
			}
		},
		[normalizedCompany]
	);

	const deleteOrdersForProviderReceiveDay = useCallback(
		async (providerCode: string, receiveDateKey: number) => {
			if (!normalizedCompany) {
				const message = "No se pudo determinar la empresa del usuario.";
				setError(message);
				throw new Error(message);
			}

			try {
				setError(null);
				return await ControlPedidoService.deleteByProviderAndReceiveDateKey(
					normalizedCompany,
					providerCode,
					receiveDateKey
				);
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: "No se pudo eliminar el control de pedido.";
				setError(message);
				throw err instanceof Error ? err : new Error(message);
			}
		},
		[normalizedCompany]
	);

	return {
		entries,
		loading,
		error,
		addOrder,
		deleteOrdersForProviderReceiveDay,
	};
}
