'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { XmlFileRecord } from '@/services/xmlEgresosDb';
import {
  clearXmlFiles,
  deleteXmlFile,
  getAllXmlFiles,
  getXmlFile,
  putXmlFile,
  updateXmlTipoEgreso,
} from '@/services/xmlEgresosDb';

type AddXmlTextResult = { status: 'added' } | { status: 'duplicate' };

type XmlEgresosContextValue = {
  files: XmlFileRecord[];
  isReady: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasFile: (fileName: string) => Promise<boolean>;
  addXmlText: (params: { fileName: string; xmlText: string }) => Promise<AddXmlTextResult>;
  setTipoEgreso: (fileName: string, tipoEgreso: string | null) => Promise<void>;
  remove: (fileName: string) => Promise<void>;
  clearAll: () => Promise<void>;
  getAllFromDb: () => Promise<XmlFileRecord[]>;
};

const XmlEgresosContext = createContext<XmlEgresosContextValue | null>(null);

export function useXmlEgresosContext(): XmlEgresosContextValue {
  const ctx = useContext(XmlEgresosContext);
  if (!ctx) throw new Error('useXmlEgresosContext must be used within XmlEgresosProvider');
  return ctx;
}

export function XmlEgresosProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState<XmlFileRecord[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshingRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;

    const run = (async () => {
      try {
        setError(null);
        const all = await getAllXmlFiles();
        // newest first for nicer UX
        all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setFiles(all);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error abriendo IndexedDB';
        setError(msg);
        setFiles([]);
      } finally {
        setIsReady(true);
        refreshingRef.current = null;
      }
    })();

    refreshingRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasFile = useCallback(async (fileName: string) => {
    const rec = await getXmlFile(fileName);
    return Boolean(rec);
  }, []);

  const addXmlText = useCallback(async ({ fileName, xmlText }: { fileName: string; xmlText: string }) => {
    const existing = await getXmlFile(fileName);
    if (existing) return { status: 'duplicate' } as const;

    const record: XmlFileRecord = {
      fileName,
      xmlText,
      tipoEgreso: null,
      createdAt: Date.now(),
    };

    await putXmlFile(record);
    setFiles((prev) => [record, ...prev]);
    return { status: 'added' } as const;
  }, []);

  const setTipoEgreso = useCallback(async (fileName: string, tipoEgreso: string | null) => {
    await updateXmlTipoEgreso(fileName, tipoEgreso);
    setFiles((prev) => prev.map((f) => (f.fileName === fileName ? { ...f, tipoEgreso } : f)));
  }, []);

  const remove = useCallback(async (fileName: string) => {
    await deleteXmlFile(fileName);
    setFiles((prev) => prev.filter((f) => f.fileName !== fileName));
  }, []);

  const clearAll = useCallback(async () => {
    await clearXmlFiles();
    setFiles([]);
  }, []);

  const getAllFromDb = useCallback(async () => {
    const all = await getAllXmlFiles();
    all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return all;
  }, []);

  const value = useMemo<XmlEgresosContextValue>(
    () => ({
      files,
      isReady,
      error,
      refresh,
      hasFile,
      addXmlText,
      setTipoEgreso,
      remove,
      clearAll,
      getAllFromDb,
    }),
    [files, isReady, error, refresh, hasFile, addXmlText, setTipoEgreso, remove, clearAll, getAllFromDb]
  );

  return <XmlEgresosContext.Provider value={value}>{children}</XmlEgresosContext.Provider>;
}
