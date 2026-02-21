'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { Empleado } from '../../types/firestore';
import useToast from '../../hooks/useToast';
import ConfirmModal from './ConfirmModal';

type CcssType = Empleado['ccssType'];

const CCSS_WEEKLY_HOURS: Record<CcssType, number> = {
  TC: 48,
  MT: 24,
  PH: 8,
};

function isCcssType(v: unknown): v is CcssType {
  return v === 'TC' || v === 'MT' || v === 'PH';
}

function inferCcssTypeFromHours(hours: unknown): CcssType | undefined {
  const n = typeof hours === 'number' ? hours : Number(hours);
  if (!Number.isFinite(n)) return undefined;
  if (n === 48) return 'TC';
  if (n === 24) return 'MT';
  if (n === 8) return 'PH';
  return undefined;
}

type ExtraQA = { pregunta: string; respuesta: string };

type ComparableState = {
  pagoHoraBruta?: number;
  diaContratacion: string;
  paganAguinaldo: string;
  ccssType: CcssType;
  danReciboPago: string;
  contratoFisico: string;
  espacioComida: string;
  brindanVacaciones: string;
  incluidoCCSS: boolean;
  incluidoINS: boolean;
  preguntasExtra: ExtraQA[];
};

function normalizeExtraList(list: Array<{ pregunta?: unknown; respuesta?: unknown }>): ExtraQA[] {
  return list
    .map((x) => ({
      pregunta: String(x?.pregunta || '').trim(),
      respuesta: String(x?.respuesta || '').trim(),
    }))
    .filter((x) => x.pregunta || x.respuesta);
}

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  minRows?: number;
}

function AutoResizeTextarea({ value, minRows = 1, className, ...props }: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      className={`${className || ''} overflow-hidden`}
      onInput={adjustHeight}
      {...props}
    />
  );
}

interface EmpleadoDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  empleado: Empleado | null;
  readOnly?: boolean;
  onSave?: (patch: Partial<Empleado>) => Promise<void> | void;
}

function asNumberOrUndefined(raw: string): number | undefined {
  const t = String(raw ?? '').trim();
  if (!t) return undefined;
  const n = Number(t);
  if (Number.isNaN(n)) return undefined;
  return n;
}

function boolLabel(v: boolean | undefined) {
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  return '—';
}

function strLabel(v: string | undefined) {
  const s = String(v || '').trim();
  return s || '—';
}

function normalizeYesNo(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'si' || low === 'sí') return 'Sí';
  if (low === 'no') return 'No';
  return s;
}

function formatLocalISODate(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function RequiredMark({ show, isEmpty }: { show: boolean; isEmpty: boolean }) {
  if (!show) return null;
  return <span className={isEmpty ? 'text-red-500' : 'text-[var(--muted-foreground)]'}> *</span>;
}

export default function EmpleadoDetailsModal({
  isOpen,
  onClose,
  empleado,
  readOnly = false,
  onSave,
}: EmpleadoDetailsModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const { showToast } = useToast();

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [baseSnapshot, setBaseSnapshot] = useState<ComparableState | null>(null);

  const [pagoHoraBruta, setPagoHoraBruta] = useState<string>('');
  const [diaContratacion, setDiaContratacion] = useState<string>('');
  const [paganAguinaldo, setPaganAguinaldo] = useState<string>('');
  const [cantidadHorasTrabaja, setCantidadHorasTrabaja] = useState<string>('');
  const [ccssType, setCcssType] = useState<CcssType>('TC');
  const [danReciboPago, setDanReciboPago] = useState<string>('');
  const [contratoFisico, setContratoFisico] = useState<string>('');
  const [espacioComida, setEspacioComida] = useState<string>('');
  const [brindanVacaciones, setBrindanVacaciones] = useState<string>('');
  const [incluidoCCSS, setIncluidoCCSS] = useState<boolean>(false);
  const [incluidoINS, setIncluidoINS] = useState<boolean>(false);
  const [preguntasExtra, setPreguntasExtra] = useState<ExtraQA[]>([]);

  const title = useMemo(() => {
    const name = String(empleado?.Empleado || '').trim() || 'Empleado';
    return readOnly ? `Información: ${name}` : `Editar: ${name}`;
  }, [empleado?.Empleado, readOnly]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');

    const initialType = (() => {
      if (isCcssType(empleado?.ccssType)) return empleado!.ccssType;
      const inferred = inferCcssTypeFromHours(empleado?.cantidadHorasTrabaja);
      return inferred || 'TC';
    })();

    const baseIncluidoCCSS = Boolean(empleado?.incluidoCCSS);
    const baseIncluidoINS = Boolean(empleado?.incluidoINS);
    const baseDynamicIngresoDate = !baseIncluidoCCSS && !baseIncluidoINS;

    setBaseSnapshot({
      pagoHoraBruta: typeof empleado?.pagoHoraBruta === 'number' ? empleado.pagoHoraBruta : undefined,
      diaContratacion: baseDynamicIngresoDate ? '' : String(empleado?.diaContratacion || '').trim(),
      paganAguinaldo: normalizeYesNo(String(empleado?.paganAguinaldo || '')).trim(),
      ccssType: initialType,
      danReciboPago: normalizeYesNo(String(empleado?.danReciboPago || '')).trim(),
      contratoFisico: normalizeYesNo(String(empleado?.contratoFisico || '')).trim(),
      espacioComida: normalizeYesNo(String(empleado?.espacioComida || '')).trim(),
      brindanVacaciones: normalizeYesNo(String(empleado?.brindanVacaciones || '')).trim(),
      incluidoCCSS: baseIncluidoCCSS,
      incluidoINS: baseIncluidoINS,
      preguntasExtra: normalizeExtraList(Array.isArray(empleado?.preguntasExtra) ? empleado!.preguntasExtra! : []),
    });

    setPagoHoraBruta(empleado?.pagoHoraBruta !== undefined ? String(empleado.pagoHoraBruta) : '');
    setDiaContratacion(String(empleado?.diaContratacion || ''));
    setPaganAguinaldo(normalizeYesNo(String(empleado?.paganAguinaldo || '')));
    setCcssType(initialType);
    setCantidadHorasTrabaja(String(CCSS_WEEKLY_HOURS[initialType]));
    setDanReciboPago(normalizeYesNo(String(empleado?.danReciboPago || '')));
    setContratoFisico(normalizeYesNo(String(empleado?.contratoFisico || '')));
    setEspacioComida(normalizeYesNo(String(empleado?.espacioComida || '')));
    setBrindanVacaciones(normalizeYesNo(String(empleado?.brindanVacaciones || '')));
    setIncluidoCCSS(Boolean(empleado?.incluidoCCSS));
    setIncluidoINS(Boolean(empleado?.incluidoINS));
    setPreguntasExtra(Array.isArray(empleado?.preguntasExtra) ? empleado!.preguntasExtra!.map(x => ({ pregunta: String(x.pregunta || ''), respuesta: String(x.respuesta || '') })) : []);
  }, [empleado, isOpen]);

  useEffect(() => {
    if (isOpen) return;
    setConfirmCloseOpen(false);
    setBaseSnapshot(null);
  }, [isOpen]);

  const useDynamicIngresoDate = !incluidoCCSS && !incluidoINS;
  const displayedDiaContratacion = String(diaContratacion || '').trim() || (useDynamicIngresoDate ? formatLocalISODate() : '');

  const canSave = !readOnly && typeof onSave === 'function';

  const currentSnapshot: ComparableState = useMemo(
    () => ({
      pagoHoraBruta: asNumberOrUndefined(pagoHoraBruta),
      diaContratacion: useDynamicIngresoDate ? '' : String(diaContratacion || '').trim(),
      paganAguinaldo: normalizeYesNo(paganAguinaldo).trim(),
      ccssType,
      danReciboPago: normalizeYesNo(danReciboPago).trim(),
      contratoFisico: normalizeYesNo(contratoFisico).trim(),
      espacioComida: normalizeYesNo(espacioComida).trim(),
      brindanVacaciones: normalizeYesNo(brindanVacaciones).trim(),
      incluidoCCSS,
      incluidoINS,
      preguntasExtra: normalizeExtraList(preguntasExtra),
    }),
    [
      pagoHoraBruta,
      diaContratacion,
      useDynamicIngresoDate,
      paganAguinaldo,
      ccssType,
      danReciboPago,
      contratoFisico,
      espacioComida,
      brindanVacaciones,
      incluidoCCSS,
      incluidoINS,
      preguntasExtra,
    ]
  );

  const hasChanges = useMemo(() => {
    if (readOnly) return false;
    if (!baseSnapshot) return false;
    return JSON.stringify(baseSnapshot) !== JSON.stringify(currentSnapshot);
  }, [baseSnapshot, currentSnapshot, readOnly]);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (readOnly || !hasChanges) {
      onClose();
      return;
    }
    setConfirmCloseOpen(true);
  }, [hasChanges, onClose, readOnly, saving]);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    requestClose();
  };

  const validate = (): { ok: boolean; msg?: string } => {
    const pago = asNumberOrUndefined(pagoHoraBruta);
    if (pago === undefined) return { ok: false, msg: 'Pago de hora en bruto es obligatorio.' };
    if (pago < 0) return { ok: false, msg: 'Pago de hora en bruto no puede ser negativo.' };

    const dia = String(diaContratacion || '').trim();
    if (!dia && !useDynamicIngresoDate) return { ok: false, msg: 'Día de contratación es obligatorio.' };

    if (!String(paganAguinaldo || '').trim()) return { ok: false, msg: 'Pagan aguinaldo es obligatorio.' };

  if (!isCcssType(ccssType)) return { ok: false, msg: 'Tipo de jornada (TC/MT/PH) es obligatorio.' };

    if (!String(danReciboPago || '').trim()) return { ok: false, msg: 'Le dan recibo de pago es obligatorio.' };
    if (!String(contratoFisico || '').trim()) return { ok: false, msg: 'Contrato físico es obligatorio.' };
    if (!String(espacioComida || '').trim()) return { ok: false, msg: 'Se cuenta con espacio de comida es obligatorio.' };
    if (!String(brindanVacaciones || '').trim()) return { ok: false, msg: 'Se brindan vacaciones es obligatorio.' };

    for (const [idx, qa] of preguntasExtra.entries()) {
      const q = String(qa.pregunta || '').trim();
      const a = String(qa.respuesta || '').trim();
      if (!q && !a) continue; // row unused
      if (!q) return { ok: false, msg: `Pregunta extra #${idx + 1}: la pregunta es obligatoria.` };
      if (!a) return { ok: false, msg: `Pregunta extra #${idx + 1}: la respuesta es obligatoria.` };
    }

    return { ok: true };
  };

  const handleSave = async () => {
    if (!canSave) return;
    const v = validate();
    if (!v.ok) {
      setError(v.msg || 'Formulario inválido');
      return;
    }

    // If neither CCSS nor INS is selected, the ingreso date is dynamic (consult-day), so do not persist it.
    const diaFinal = useDynamicIngresoDate ? '' : String(diaContratacion || '').trim();

    const patch: Partial<Empleado> = {
      pagoHoraBruta: asNumberOrUndefined(pagoHoraBruta),
      diaContratacion: diaFinal,
      paganAguinaldo: normalizeYesNo(paganAguinaldo),
      ccssType,
      cantidadHorasTrabaja: CCSS_WEEKLY_HOURS[ccssType],
      danReciboPago: normalizeYesNo(danReciboPago),
      contratoFisico: normalizeYesNo(contratoFisico),
      espacioComida: normalizeYesNo(espacioComida),
      brindanVacaciones: normalizeYesNo(brindanVacaciones),
      incluidoCCSS,
      incluidoINS,
      preguntasExtra: preguntasExtra
        .map((x) => ({ pregunta: String(x.pregunta || '').trim(), respuesta: String(x.respuesta || '').trim() }))
        .filter((x) => x.pregunta || x.respuesta),
    };

    try {
      setSaving(true);
      setError('');
      await onSave(patch);
      showToast('Información guardada correctamente', 'success');
      onClose();
    } catch (e) {
      console.error('Error saving empleado details:', e);
      setError('Error al guardar el empleado');
      showToast('Error al guardar la información', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Global keyboard listener for ESC key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, requestClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  };

  if (!isOpen || !empleado) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2 sm:p-4"
        onKeyDown={handleKeyDown}
        onMouseDown={handleBackdropMouseDown}
      >
      <div className="bg-[var(--background)] rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[var(--input-border)]">
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-semibold text-[var(--foreground)] truncate">{title}</h2>
              <div className="text-xs text-[var(--muted-foreground)] mt-1 break-words">
                {readOnly ? 'Solo lectura' : 'Campos obligatorios'} · Empresa ID: {String(empleado.empresaId || '')}
              </div>
            </div>
            <button onClick={requestClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Required questions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Pago de hora en bruto<RequiredMark show={!readOnly} isEmpty={!pagoHoraBruta.trim()} />
              </label>
              <input
                type="number"
                step="0.01"
                value={pagoHoraBruta}
                onChange={(e) => setPagoHoraBruta(e.target.value)}
                disabled={readOnly}
                className="w-full px-3 py-2 rounded-md bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--foreground)]"
                placeholder="Ej: 2500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Día de contratación<RequiredMark show={!readOnly} isEmpty={!diaContratacion.trim()} />
              </label>
              <input
                type="date"
                value={displayedDiaContratacion}
                onChange={(e) => setDiaContratacion(e.target.value)}
                disabled={readOnly || useDynamicIngresoDate}
                className="w-full px-3 py-2 rounded-md bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--foreground)]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Cantidad de horas que trabaja a la semana?<RequiredMark show={!readOnly} isEmpty={!String(ccssType || '').trim()} />
              </label>
              {readOnly ? (
                <div className="w-full px-3 py-2 rounded-md bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--muted-foreground)] text-sm">
                  {ccssType} ({CCSS_WEEKLY_HOURS[ccssType]} horas)
                </div>
              ) : (
                <select
                  value={ccssType}
                  onChange={(e) => {
                    const next = e.target.value as CcssType;
                    if (!isCcssType(next)) return;
                    setCcssType(next);
                    setCantidadHorasTrabaja(String(CCSS_WEEKLY_HOURS[next]));
                  }}
                  disabled={readOnly}
                  className="w-full px-3 py-2 rounded-md bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--foreground)]"
                >
                  <option value="TC">TC (48 horas)</option>
                  <option value="MT">MT (24 horas)</option>
                  <option value="PH">PH (8 horas)</option>
                </select>
              )}
            </div>

            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2">
                <label className="block text-sm text-[var(--foreground)] mb-1">
                  Pagan aguinaldo?<RequiredMark show={!readOnly} isEmpty={!paganAguinaldo.trim()} />
                </label>
                {readOnly ? (
                  <span className="text-sm text-[var(--muted-foreground)]">{strLabel(empleado.paganAguinaldo)}</span>
                ) : (
                  <AutoResizeTextarea
                    value={paganAguinaldo}
                    onChange={(e) => setPaganAguinaldo(e.target.value)}
                    minRows={1}
                    className="w-full bg-[var(--background)] border border-[var(--input-border)] rounded-md px-2 py-1 text-[var(--foreground)] text-sm resize-none"
                  />
                )}
              </div>

              <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2">
                <label className="block text-sm text-[var(--foreground)] mb-1">
                  Se da recibo de pago?<RequiredMark show={!readOnly} isEmpty={!danReciboPago.trim()} />
                </label>
                {readOnly ? (
                  <span className="text-sm text-[var(--muted-foreground)]">{strLabel(empleado.danReciboPago)}</span>
                ) : (
                  <AutoResizeTextarea
                    value={danReciboPago}
                    onChange={(e) => setDanReciboPago(e.target.value)}
                    minRows={1}
                    className="w-full bg-[var(--background)] border border-[var(--input-border)] rounded-md px-2 py-1 text-[var(--foreground)] text-sm resize-none"
                  />
                )}
              </div>

              <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2">
                <label className="block text-sm text-[var(--foreground)] mb-1">
                  Se cuenta con contrato físico?<RequiredMark show={!readOnly} isEmpty={!contratoFisico.trim()} />
                </label>
                {readOnly ? (
                  <span className="text-sm text-[var(--muted-foreground)]">{strLabel(empleado.contratoFisico)}</span>
                ) : (
                  <AutoResizeTextarea
                    value={contratoFisico}
                    onChange={(e) => setContratoFisico(e.target.value)}
                    minRows={1}
                    className="w-full bg-[var(--background)] border border-[var(--input-border)] rounded-md px-2 py-1 text-[var(--foreground)] text-sm resize-none"
                  />
                )}
              </div>

              <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2">
                <label className="block text-sm text-[var(--foreground)] mb-1">
                  Espacio comida?<RequiredMark show={!readOnly} isEmpty={!espacioComida.trim()} />
                </label>
                {readOnly ? (
                  <span className="text-sm text-[var(--muted-foreground)]">{strLabel(empleado.espacioComida)}</span>
                ) : (
                  <AutoResizeTextarea
                    value={espacioComida}
                    onChange={(e) => setEspacioComida(e.target.value)}
                    minRows={1}
                    className="w-full bg-[var(--background)] border border-[var(--input-border)] rounded-md px-2 py-1 text-[var(--foreground)] text-sm resize-none"
                  />
                )}
              </div>

              <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2">
                <label className="block text-sm text-[var(--foreground)] mb-1">
                  Se brindan vacaciones?<RequiredMark show={!readOnly} isEmpty={!brindanVacaciones.trim()} />
                </label>
                {readOnly ? (
                  <span className="text-sm text-[var(--muted-foreground)]">{strLabel(empleado.brindanVacaciones)}</span>
                ) : (
                  <AutoResizeTextarea
                    value={brindanVacaciones}
                    onChange={(e) => setBrindanVacaciones(e.target.value)}
                    minRows={1}
                    className="w-full bg-[var(--background)] border border-[var(--input-border)] rounded-md px-2 py-1 text-[var(--foreground)] text-sm resize-none"
                  />
                )}
              </div>

              <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2">
                <label className="block text-sm text-[var(--foreground)] mb-1">Incluido CCSS</label>
                {readOnly ? (
                  <span className="text-sm text-[var(--muted-foreground)]">{boolLabel(empleado.incluidoCCSS)}</span>
                ) : (
                  <input type="checkbox" checked={incluidoCCSS} onChange={(e) => setIncluidoCCSS(e.target.checked)} className="w-5 h-5" />
                )}
              </div>

              <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2">
                <label className="block text-sm text-[var(--foreground)] mb-1">Incluido INS</label>
                {readOnly ? (
                  <span className="text-sm text-[var(--muted-foreground)]">{boolLabel(empleado.incluidoINS)}</span>
                ) : (
                  <input type="checkbox" checked={incluidoINS} onChange={(e) => setIncluidoINS(e.target.checked)} className="w-5 h-5" />
                )}
              </div>
            </div>
          </div>

          {/* Extra questions */}
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base sm:text-lg font-medium text-[var(--foreground)]">Preguntas adicionales</h3>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setPreguntasExtra((prev) => [...prev, { pregunta: '', respuesta: '' }])}
                  className="px-2 sm:px-3 py-1.5 sm:py-2 rounded bg-[var(--button-bg)] text-[var(--button-text)] hover:bg-[var(--button-hover)] flex items-center gap-1 sm:gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Agregar</span>
                </button>
              )}
            </div>

            {(() => {
              const items = readOnly
                ? preguntasExtra.filter((x) => String(x?.pregunta || '').trim() || String(x?.respuesta || '').trim())
                : preguntasExtra;

              if (items.length === 0) {
                return <div className="text-sm text-[var(--muted-foreground)] mt-2">No hay preguntas adicionales.</div>;
              }

              return (
                <div className="mt-3 space-y-3">
                  {items.map((qa, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-3 bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md p-3">
                      {readOnly ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-[var(--muted-foreground)]">Pregunta</div>
                            <div className="mt-1 text-sm text-[var(--muted-foreground)] break-words">{strLabel(String(qa.pregunta || ''))}</div>
                          </div>
                          <div>
                            <div className="text-xs text-[var(--muted-foreground)]">Respuesta</div>
                            <div className="mt-1 text-sm text-[var(--muted-foreground)] break-words">{strLabel(String(qa.respuesta || ''))}</div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Pregunta</label>
                            <AutoResizeTextarea
                              value={qa.pregunta}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPreguntasExtra((prev) => prev.map((x, i) => (i === idx ? { ...x, pregunta: v } : x)));
                              }}
                              minRows={2}
                              className="w-full px-3 py-2 rounded-md bg-[var(--background)] border border-[var(--input-border)] text-[var(--foreground)] text-sm resize-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[var(--muted-foreground)] mb-1">Respuesta</label>
                            <AutoResizeTextarea
                              value={qa.respuesta}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPreguntasExtra((prev) => prev.map((x, i) => (i === idx ? { ...x, respuesta: v } : x)));
                              }}
                              minRows={2}
                              className="w-full px-3 py-2 rounded-md bg-[var(--background)] border border-[var(--input-border)] text-[var(--foreground)] text-sm resize-none"
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setPreguntasExtra((prev) => prev.filter((_, i) => i !== idx))}
                              className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 text-sm"
                            >
                              <Trash2 className="w-4 h-4" />
                              Quitar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-600 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="mt-4 sm:mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 rounded bg-[var(--hover-bg)] text-[var(--foreground)] border border-[var(--input-border)] hover:opacity-90 disabled:opacity-60 text-sm sm:text-base"
            >
              Cerrar
            </button>
            {canSave && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full sm:w-auto px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
          <datalist id="yesno-options">
            <option value="Sí" />
            <option value="No" />
          </datalist>
        </div>
      </div>
      </div>

      <ConfirmModal
        open={confirmCloseOpen}
        title="Descartar cambios"
        message="Tienes cambios sin guardar. ¿Deseas cerrar sin guardar?"
        confirmText="Descartar"
        cancelText="Seguir editando"
        actionType="change"
        loading={saving}
        onCancel={() => setConfirmCloseOpen(false)}
        onConfirm={() => {
          setConfirmCloseOpen(false);
          onClose();
        }}
      />
    </>
  );
}
