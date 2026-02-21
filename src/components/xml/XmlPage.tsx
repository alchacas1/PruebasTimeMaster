'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FileCode, Upload, Trash2, AlertTriangle, ChevronDown, Eye, X, Download, Search, Loader2 } from 'lucide-react';
import tiposEgresoXmlCatalog from '@/data/tiposEgresoXml.json';
import useToast from '@/hooks/useToast';
import useXmlEgresos from '@/hooks/useXmlEgresos';
import ConfirmModal from '@/components/ui/ConfirmModal';

type TipoEgresoXml = {
  codigo: string;
  nombre: string;
  cuenta?: string;
};

const TIPOS_EGRESO_XML: TipoEgresoXml[] = (tiposEgresoXmlCatalog as TipoEgresoXml[])
  .filter((t) => t && typeof t.codigo === 'string' && typeof t.nombre === 'string')
  .map((t) => ({
    codigo: (t.codigo || '').trim(),
    nombre: (t.nombre || '').trim(),
    cuenta: (t.cuenta || '').trim() || undefined,
  }))
  .filter((t) => Boolean(t.codigo) && Boolean(t.nombre))
  .sort((a, b) => {
    // Orden alfabético por nombre (lo que el usuario busca/ve).
    const byName = a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
  });

type FacturaParty = {
  nombre?: string;
  identificacionTipo?: string;
  identificacionNumero?: string;
  nombreComercial?: string;
  correoElectronico?: string;
  telefono?: string;
  ubicacion?: string;
};

type FacturaMedioPago = {
  tipo?: string;
  otros?: string;
  total?: string;
};

type FacturaImpuestoDesglose = {
  codigo?: string;
  codigoTarifaIVA?: string;
  tarifa?: string;
  totalMontoImpuesto?: string;
};

type FacturaResumen = {
  moneda?: string;
  tipoCambio?: string;
  totalVenta?: string;
  totalDescuentos?: string;
  totalVentaNeta?: string;
  totalGravado?: string;
  totalMercanciasGravadas?: string;
  totalOtrosCargos?: string;
  totalImpuesto?: string;
  totalComprobante?: string;
  mediosPago?: FacturaMedioPago[];
  desgloseImpuesto?: FacturaImpuestoDesglose[];
};

type FacturaInfo = {
  tipoComprobanteCodigo?: string;
  tipoComprobanteNombre?: string;
  tiposTransaccion?: string[];
  clave?: string;
  numeroConsecutivo?: string;
  fechaEmision?: string;
  proveedorSistemas?: string;
  codigoActividadEmisor?: string;
  codigoActividadReceptor?: string;
  condicionVenta?: string;
  condicionVentaOtros?: string;
  emisor?: FacturaParty;
  receptor?: FacturaParty;
  resumen?: FacturaResumen;
};

function isNotaCreditoFactura(f: FacturaInfo | undefined | null): boolean {
  const codigo = (f?.tipoComprobanteCodigo || '').trim();
  return codigo === '03';
}

function getFacturaSign(f: FacturaInfo | undefined | null): 1 | -1 {
  return isNotaCreditoFactura(f) ? -1 : 1;
}

function applySign(value: number, sign: 1 | -1): number {
  return sign === -1 ? -value : value;
}

type ParsedXmlItem = {
  id: string;
  fileName: string;
  status: 'ok' | 'error';
  rawXml?: string;
  factura?: FacturaInfo;
  error?: string;
  tipoEgreso: string | null;
  createdAt: number;
};

const TIPO_MEDIO_PAGO_LABEL: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta (crédito o débito)',
  '03': 'Cheque',
  '04': 'Transferencia bancaria',
  '05': 'Recaudado por terceros',
  '06': 'Otros',
};

const TIPO_TRANSACCION_LABEL: Record<string, string> = {
  '01': 'Venta de bienes o servicios',
  '02': 'Devolución de mercadería',
  '03': 'Bonificaciones',
  '04': 'Descuentos',
  '05': 'Otros',
};

const TIPO_COMPROBANTE_LABEL: Record<string, string> = {
  '01': 'Factura electrónica',
  '02': 'Nota de débito electrónica',
  '03': 'Nota de crédito electrónica',
  '04': 'Tiquete electrónico',
  '05': 'Confirmación de aceptación',
  '06': 'Confirmación de aceptación parcial',
  '07': 'Confirmación de rechazo',
};

// Catálogo: Código de Impuesto (Costa Rica)
// Fuente: docs/factura_v4.4.xml (CodigoImpuestoType)
const IMPUESTO_CODIGO_LABEL: Record<string, string> = {
  '01': 'Impuesto al Valor Agregado',
  '02': 'Impuesto Selectivo de Consumo',
  '03': 'Impuesto único a los combustibles',
  '04': 'Impuesto específico de bebidas alcohólicas',
  '05': 'Impuesto específico sobre bebidas envasadas sin contenido alcohólico y jabones de tocador',
  '06': 'Impuesto a los productos de tabaco',
  '07': 'IVA (cálculo especial)',
  '08': 'IVA Régimen de Bienes Usados (Factor)',
  '12': 'Impuesto específico al Cemento',
  '99': 'Otros',
};

// Catálogo: Código Tarifa IVA (Costa Rica)
// Fuente: docs/factura_v4.4.xml (CodigoTarifaIVAType)
const CODIGO_TARIFA_IVA_LABEL: Record<string, string> = {
  '01': 'Tarifa 0% (Artículo 32, num 1, RLIVA)',
  '02': 'Tarifa reducida 1%',
  '03': 'Tarifa reducida 2%',
  '04': 'Tarifa reducida 4%',
  '05': 'Transitorio 0%',
  '06': 'Transitorio 4%',
  '07': 'Tarifa transitoria 8%',
  '08': 'Tarifa general 13%',
  '09': 'Tarifa reducida 0.5%',
  '10': 'Tarifa Exenta',
  '11': 'Tarifa 0% sin derecho a crédito',
};

function labelForCode(codeRaw: string | undefined, catalog: Record<string, string>): string {
  const code = (codeRaw || '').trim();
  if (!code) return '—';
  const label = catalog[code];
  return label ? `${code} - ${label}` : code;
}

function labelForImpuestoCodigo(codeRaw?: string): string {
  const code = (codeRaw || '').trim();
  if (!code) return '—';
  const label = IMPUESTO_CODIGO_LABEL[code];
  return label ? `${label} (${code})` : code;
}

function labelForCodigoTarifaIVA(codeRaw?: string): string {
  return labelForCode(codeRaw, CODIGO_TARIFA_IVA_LABEL);
}

function inferTipoComprobanteFromRootLocalName(localName: string | null): { codigo?: string; nombre?: string } {
  const ln = (localName || '').trim();
  // Costa Rica comprobantes: infer from root element name.
  // Not all schemas include an explicit <Tipo> for comprobante.
  switch (ln) {
    case 'FacturaElectronica':
      return { codigo: '01', nombre: TIPO_COMPROBANTE_LABEL['01'] };
    case 'NotaDebitoElectronica':
      return { codigo: '02', nombre: TIPO_COMPROBANTE_LABEL['02'] };
    case 'NotaCreditoElectronica':
      return { codigo: '03', nombre: TIPO_COMPROBANTE_LABEL['03'] };
    case 'TiqueteElectronico':
      return { codigo: '04', nombre: TIPO_COMPROBANTE_LABEL['04'] };
    case 'MensajeReceptor':
      // Mensaje receptor suele mapear a 05-07; sin campo adicional no podemos distinguir.
      return { codigo: undefined, nombre: 'Mensaje receptor (confirmación)' };
    default:
      return { codigo: undefined, nombre: ln || undefined };
  }
}

function prettyPrintXml(xml: string): string {
  const input = (xml || '').replace(/\r\n/g, '\n').trim();
  if (!input) return '';

  // If XML is invalid, keep original so user can inspect it.
  try {
    const doc = new DOMParser().parseFromString(input, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return input;
  } catch {
    return input;
  }

  // Insert newlines between tags
  const formatted = input
    .replace(/\?>\s*</g, '?>\n<')
    .replace(/(>)(<)(\/*)/g, '$1\n$2$3');

  const lines = formatted
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let indent = 0;
  const pad = (n: number) => '  '.repeat(Math.max(0, n));

  const out: string[] = [];
  for (const line of lines) {
    // Closing tag decreases indent first
    if (/^<\//.test(line)) indent = Math.max(0, indent - 1);

    out.push(pad(indent) + line);

    // Opening tag that is not self-closing, not declaration, not comment, not doctype
    const isOpening =
      /^<[^!?/][^>]*>$/.test(line) &&
      !/\/>$/.test(line) &&
      !/^<[^>]+>.*<\//.test(line); // not <tag>text</tag> on one line

    if (isOpening) indent += 1;
  }

  return out.join('\n');
}

const CR_NUMBER_2D = new Intl.NumberFormat('es-CR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CR_CURRENCY_2D = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseDecimal(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatNumber2(raw?: string): string {
  const n = parseDecimal(raw);
  if (n === null) return '—';
  return CR_NUMBER_2D.format(n);
}

function formatMoney(raw?: string, currencyCode?: string): string {
  const n = parseDecimal(raw);
  if (n === null) return '—';

  const code = (currencyCode || '').trim().toUpperCase();
  if (!code || code === 'CRC') {
    return CR_CURRENCY_2D.format(n);
  }

  // Try to format other currencies when possible
  try {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Fallback: show number + currency code
    return `${CR_NUMBER_2D.format(n)} ${code}`;
  }
}

const CR_DATE_SIMPLE = new Intl.DateTimeFormat('es-CR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatSimpleDate(raw?: string): string {
  const input = (raw || '').trim();
  if (!input) return '—';

  // If date comes as YYYY-MM-DD (without time), parse as local date to avoid TZ shifts.
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(input);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const d = new Date(year, month - 1, day);
      if (Number.isFinite(d.getTime())) return CR_DATE_SIMPLE.format(d);
    }
  }

  // Otherwise, try normal Date parse (ISO with time/timezone).
  const d = new Date(input);
  if (Number.isFinite(d.getTime())) return CR_DATE_SIMPLE.format(d);

  // Fallback: keep only the date segment if it looks like ISO.
  const datePart = input.split('T')[0];
  return datePart || input;
}

function firstElement(parent: Document | Element, localName: string): Element | null {
  const nodes = parent.getElementsByTagNameNS('*', localName);
  return nodes && nodes.length > 0 ? (nodes[0] as Element) : null;
}

function firstText(parent: Document | Element, localName: string): string | undefined {
  const el = firstElement(parent, localName);
  const text = el?.textContent?.trim();
  return text ? text : undefined;
}

function formatPhone(codigoPais?: string, numTelefono?: string) {
  const cp = (codigoPais || '').trim();
  const nt = (numTelefono || '').trim();
  if (!cp && !nt) return undefined;
  if (cp && nt) return `+${cp} ${nt}`;
  return nt || (cp ? `+${cp}` : undefined);
}

function joinDefined(parts: Array<string | undefined>, separator = ', ') {
  const filtered = parts.map((p) => (p || '').trim()).filter(Boolean);
  return filtered.length ? filtered.join(separator) : undefined;
}

function parseFacturaXml(xmlText: string): FacturaInfo {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors && parseErrors.length > 0) {
    throw new Error('XML inválido o mal formado');
  }

  const root = doc.documentElement;
  if (!root) throw new Error('XML vacío');

  const inferredTipo = inferTipoComprobanteFromRootLocalName(root.localName);

  // Collect TipoTransaccion values (without extracting products details)
  const tipoTransaccionSet = new Set<string>();
  const tipoTransEls = root.getElementsByTagNameNS('*', 'TipoTransaccion');
  for (let i = 0; i < tipoTransEls.length; i++) {
    const raw = (tipoTransEls[i]?.textContent || '').trim();
    if (raw) tipoTransaccionSet.add(raw);
  }

  // Nota: deliberadamente NO leemos DetalleServicio/LineaDetalle (productos)
  const emisorEl = firstElement(root, 'Emisor');
  const receptorEl = firstElement(root, 'Receptor');
  const resumenEl = firstElement(root, 'ResumenFactura');

  // Infer tax rates from any <Impuesto> nodes without extracting products.
  // We only use these to enrich the resumen breakdown.
  const inferredTarifaByKey = new Map<string, string>();
  const impuestoEls = root.getElementsByTagNameNS('*', 'Impuesto');
  for (let i = 0; i < impuestoEls.length; i++) {
    const imp = impuestoEls[i] as Element;
    const codigo = firstText(imp, 'Codigo');
    const codigoTarifaIVA = firstText(imp, 'CodigoTarifaIVA');
    const tarifa = firstText(imp, 'Tarifa');
    if (!codigo || !codigoTarifaIVA || !tarifa) continue;
    const key = `${codigo}|${codigoTarifaIVA}`;
    if (!inferredTarifaByKey.has(key)) inferredTarifaByKey.set(key, tarifa);
  }

  const buildParty = (partyEl: Element | null): FacturaParty | undefined => {
    if (!partyEl) return undefined;

    const identEl = firstElement(partyEl, 'Identificacion');
    const ubicEl = firstElement(partyEl, 'Ubicacion');
    const telEl = firstElement(partyEl, 'Telefono');

    const telefono = formatPhone(
      telEl ? firstText(telEl, 'CodigoPais') : undefined,
      telEl ? firstText(telEl, 'NumTelefono') : undefined
    );

    const ubicacion = joinDefined(
      [
        ubicEl ? firstText(ubicEl, 'Provincia') : undefined,
        ubicEl ? firstText(ubicEl, 'Canton') : undefined,
        ubicEl ? firstText(ubicEl, 'Distrito') : undefined,
        ubicEl ? firstText(ubicEl, 'Barrio') : undefined,
        ubicEl ? firstText(ubicEl, 'OtrasSenas') : undefined,
      ],
      ' - '
    );

    return {
      nombre: firstText(partyEl, 'Nombre'),
      identificacionTipo: identEl ? firstText(identEl, 'Tipo') : undefined,
      identificacionNumero: identEl ? firstText(identEl, 'Numero') : undefined,
      nombreComercial: firstText(partyEl, 'NombreComercial'),
      correoElectronico: firstText(partyEl, 'CorreoElectronico'),
      telefono,
      ubicacion,
    };
  };

  const mediosPago: FacturaMedioPago[] = [];
  if (resumenEl) {
    const medioPagoEls = resumenEl.getElementsByTagNameNS('*', 'MedioPago');
    for (let i = 0; i < medioPagoEls.length; i++) {
      const mp = medioPagoEls[i] as Element;
      mediosPago.push({
        tipo: firstText(mp, 'TipoMedioPago'),
        otros: firstText(mp, 'MedioPagoOtros'),
        total: firstText(mp, 'TotalMedioPago'),
      });
    }
  }

  const monedaEl = resumenEl ? firstElement(resumenEl, 'CodigoTipoMoneda') : null;

  const computeTotalDescuentos = (): string | undefined => {
    // Primary (FE CR): <ResumenFactura><TotalDescuentos>
    const fromResumen = resumenEl ? firstText(resumenEl, 'TotalDescuentos') : undefined;
    const parsedFromResumen = parseDecimal(fromResumen);
    if (parsedFromResumen !== null) return fromResumen;

    // Fallback: sum all <MontoDescuento> nodes across the XML.
    // This does NOT extract product details; it only aggregates amounts.
    const montoEls = root.getElementsByTagNameNS('*', 'MontoDescuento');
    if (!montoEls || montoEls.length === 0) return undefined;
    let sum = 0;
    let found = false;
    for (let i = 0; i < montoEls.length; i++) {
      const raw = (montoEls[i]?.textContent || '').trim();
      const n = parseDecimal(raw);
      if (n === null) continue;
      found = true;
      sum += n;
    }
    if (!found) return undefined;
    if (Math.abs(sum) < 1e-9) return '0.00';
    return sum.toFixed(2);
  };

  const desgloseImpuesto: FacturaImpuestoDesglose[] = [];
  if (resumenEl) {
    const desgloseEls = resumenEl.getElementsByTagNameNS('*', 'TotalDesgloseImpuesto');
    for (let i = 0; i < desgloseEls.length; i++) {
      const d = desgloseEls[i] as Element;
      const codigo = firstText(d, 'Codigo');
      const codigoTarifaIVA = firstText(d, 'CodigoTarifaIVA');
      const totalMontoImpuesto = firstText(d, 'TotalMontoImpuesto');

      // If amount is explicitly zero, don't include it in the IVA breakdown.
      const monto = parseDecimal(totalMontoImpuesto);
      if (monto !== null && Math.abs(monto) < 1e-9) continue;

      const key = codigo && codigoTarifaIVA ? `${codigo}|${codigoTarifaIVA}` : '';
      const tarifa = key ? inferredTarifaByKey.get(key) : undefined;
      desgloseImpuesto.push({
        codigo,
        codigoTarifaIVA,
        tarifa,
        totalMontoImpuesto,
      });
    }
  }

  const info: FacturaInfo = {
    tipoComprobanteCodigo: inferredTipo.codigo,
    tipoComprobanteNombre: inferredTipo.nombre,
    tiposTransaccion: tipoTransaccionSet.size ? Array.from(tipoTransaccionSet) : undefined,
    clave: firstText(root, 'Clave'),
    proveedorSistemas: firstText(root, 'ProveedorSistemas'),
    codigoActividadEmisor: firstText(root, 'CodigoActividadEmisor'),
    codigoActividadReceptor: firstText(root, 'CodigoActividadReceptor'),
    numeroConsecutivo: firstText(root, 'NumeroConsecutivo'),
    fechaEmision: firstText(root, 'FechaEmision'),
    condicionVenta: firstText(root, 'CondicionVenta'),
    condicionVentaOtros: firstText(root, 'CondicionVentaOtros'),
    emisor: buildParty(emisorEl),
    receptor: buildParty(receptorEl),
    resumen: resumenEl
      ? {
        moneda: monedaEl ? firstText(monedaEl, 'CodigoMoneda') : undefined,
        tipoCambio: monedaEl ? firstText(monedaEl, 'TipoCambio') : undefined,
        totalMercanciasGravadas: firstText(resumenEl, 'TotalMercanciasGravadas'),
        totalGravado: firstText(resumenEl, 'TotalGravado'),
        totalVenta: firstText(resumenEl, 'TotalVenta'),
        totalDescuentos: computeTotalDescuentos(),
        totalVentaNeta: firstText(resumenEl, 'TotalVentaNeta'),
        totalOtrosCargos: firstText(resumenEl, 'TotalOtrosCargos'),
        totalImpuesto: firstText(resumenEl, 'TotalImpuesto'),
        totalComprobante: firstText(resumenEl, 'TotalComprobante'),
        mediosPago: mediosPago.length ? mediosPago : undefined,
        desgloseImpuesto: desgloseImpuesto.length ? desgloseImpuesto : undefined,
      }
      : undefined,
  };

  return info;
}

function isLikelyXmlFile(file: File) {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type.includes('xml')) return true;
  return name.endsWith('.xml');
}

export default function XmlPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addLoadingTotal, setAddLoadingTotal] = useState(0);
  const [addLoadingDone, setAddLoadingDone] = useState(0);
  const addLoadingOpIdRef = useRef(0);
  const [xmlModalItemId, setXmlModalItemId] = useState<string | null>(null);
  const [tipoEgresoQueryByItemId, setTipoEgresoQueryByItemId] = useState<Record<string, string>>({});
  const [openTipoEgresoDropdownItemId, setOpenTipoEgresoDropdownItemId] = useState<string | null>(null);
  const tipoEgresoTouchRef = useRef<{
    itemId: string;
    value: string;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'clear' | 'export' | 'delete' | 'deleteReceptor' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [exportMissingCount, setExportMissingCount] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; fileName: string } | null>(null);
  const [pendingDeleteReceptor, setPendingDeleteReceptor] = useState<{
    key: string;
    receptorId: string;
    receptorLabel: string;
    ids: string[];
  } | null>(null);
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [exportOptionsLoading, setExportOptionsLoading] = useState(false);
  const [exportAllowMissingTipo, setExportAllowMissingTipo] = useState(false);

  const [openReceptorGroupByKey, setOpenReceptorGroupByKey] = useState<Record<string, boolean>>({});

  type XmlDbRecord = {
    fileName: string;
    xmlText: string;
    tipoEgreso?: string | null;
    createdAt?: number;
  };

  const pendingExportRecordsRef = useRef<XmlDbRecord[] | null>(null);
  const pendingExportAssignedRecordsRef = useRef<XmlDbRecord[] | null>(null);

  const { showToast } = useToast();
  const {
    files,
    isReady,
    error: dbError,
    hasFile,
    addXmlText,
    setTipoEgreso,
    remove,
    clearAll,
    getAllFromDb,
  } = useXmlEgresos();

  const pickFilesLabel = files.length > 0 ? 'Agregar más archivos' : 'Seleccionar XML';

  const closeConfirm = useCallback(() => {
    if (confirmLoading) return;
    setConfirmOpen(false);
    setConfirmAction(null);
    setExportMissingCount(0);
    pendingExportRecordsRef.current = null;
    setPendingDelete(null);
    setPendingDeleteReceptor(null);
  }, [confirmLoading]);

  const tipoEgresoCodigoToLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of TIPOS_EGRESO_XML) {
      // Label visible: nombre primero y el código al final. Sin cuenta.
      map.set(t.codigo, `${t.nombre} (${t.codigo})`);
    }
    return map;
  }, []);

  const tipoEgresoCodigoToCuenta = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of TIPOS_EGRESO_XML) {
      if (t.cuenta) map.set(t.codigo, t.cuenta);
    }
    return map;
  }, []);

  const items = useMemo<ParsedXmlItem[]>(() => {
    const next: ParsedXmlItem[] = [];
    for (const rec of files) {
      try {
        const factura = parseFacturaXml(rec.xmlText);
        next.push({
          id: rec.fileName,
          fileName: rec.fileName,
          status: 'ok',
          rawXml: rec.xmlText,
          factura,
          tipoEgreso: rec.tipoEgreso ?? null,
          createdAt: rec.createdAt || 0,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido parseando XML';
        next.push({
          id: rec.fileName,
          fileName: rec.fileName,
          status: 'error',
          rawXml: rec.xmlText,
          error: message,
          tipoEgreso: rec.tipoEgreso ?? null,
          createdAt: rec.createdAt || 0,
        });
      }
    }
    return next;
  }, [files]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    if (dbError) {
      showToast('No se puede cargar XML: error abriendo IndexedDB', 'error');
      return;
    }

    const list = Array.from(files || []);
    const xmlFiles = list.filter(isLikelyXmlFile);
    if (xmlFiles.length === 0) return;

    const opId = (addLoadingOpIdRef.current += 1);
    setAddLoading(true);
    setAddLoadingTotal(xmlFiles.length);
    setAddLoadingDone(0);

    try {
      let done = 0;
      for (const file of xmlFiles) {
        try {
          const fileName = file.name;

          // 1) Duplicado (fuente de verdad: IndexedDB)
          const exists = await hasFile(fileName);
          if (exists) {
            showToast(`Duplicado: ${fileName} ya está cargado`, 'warning');
            continue;
          }

          // 2) Leer texto
          const text = await file.text();

          // 3) Validar XML antes de persistir
          try {
            parseFacturaXml(text);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'XML inválido';
            showToast(`XML inválido (${fileName}): ${msg}`, 'error');
            continue;
          }

          // 4) Persistir en IndexedDB
          const res = await addXmlText({ fileName, xmlText: text });
          if (res.status === 'duplicate') {
            showToast(`Duplicado: ${fileName} ya está cargado`, 'warning');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error desconocido cargando XML';
          showToast(message, 'error');
        } finally {
          done += 1;
          if (opId === addLoadingOpIdRef.current) setAddLoadingDone(done);
        }
      }
    } finally {
      if (opId === addLoadingOpIdRef.current) {
        setAddLoading(false);
        setAddLoadingTotal(0);
        setAddLoadingDone(0);
      }
    }
  }, [dbError, showToast, hasFile, addXmlText]);

  const onPickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const cleanupAfterRemove = useCallback((id: string) => {
    setXmlModalItemId((prev) => (prev === id ? null : prev));
    setTipoEgresoQueryByItemId((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOpenTipoEgresoDropdownItemId((prev) => (prev === id ? null : prev));
  }, []);

  const performRemoveOne = useCallback(async (id: string) => {
    try {
      await remove(id);
      showToast('XML eliminado correctamente', 'success');
      cleanupAfterRemove(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error eliminando XML';
      showToast(msg, 'error');
    }
  }, [remove, showToast, cleanupAfterRemove]);

  const onRequestRemove = useCallback((id: string, fileName: string) => {
    setPendingDelete({ id, fileName });
    setConfirmAction('delete');
    setConfirmOpen(true);
  }, []);

  const performRemoveMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        await remove(id);
        cleanupAfterRemove(id);
      }
      showToast(`Se eliminaron ${ids.length} XML`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error eliminando XML';
      showToast(msg, 'error');
    }
  }, [remove, cleanupAfterRemove, showToast]);

  const onRequestRemoveReceptor = useCallback((group: { key: string; receptorId: string; receptorLabel: string; ids: string[] }) => {
    setPendingDeleteReceptor(group);
    setConfirmAction('deleteReceptor');
    setConfirmOpen(true);
  }, []);

  const receptorGroups = useMemo(() => {
    type Group = {
      key: string;
      receptorId: string;
      receptorLabel: string;
      receptorName?: string;
      items: ParsedXmlItem[];
    };

    const map = new Map<string, Group>();
    for (const item of items) {
      const receptorId = (item.factura?.receptor?.identificacionNumero || '').trim();
      const receptorName = (item.factura?.receptor?.nombre || item.factura?.receptor?.nombreComercial || '').trim();
      const key = receptorId || '__NO_RECEPTOR__';
      const receptorLabel = receptorId || 'Sin cédula';

      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        if (!existing.receptorName && receptorName) existing.receptorName = receptorName;
      } else {
        map.set(key, {
          key,
          receptorId,
          receptorLabel,
          receptorName: receptorName || undefined,
          items: [item],
        });
      }
    }

    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      const aMissing = a.key === '__NO_RECEPTOR__';
      const bMissing = b.key === '__NO_RECEPTOR__';
      if (aMissing !== bMissing) return aMissing ? 1 : -1;

      return (a.receptorLabel || '').localeCompare((b.receptorLabel || ''), 'es', { sensitivity: 'base', numeric: true });
    });
    return groups;
  }, [items]);

  const receptorCedulaGroupCount = receptorGroups.reduce((acc, g) => acc + (((g.receptorId || '').trim() ? 1 : 0)), 0);
  const canDeleteReceptorBlocks = receptorCedulaGroupCount > 1;

  const toggleReceptorGroup = useCallback((key: string) => {
    setOpenReceptorGroupByKey((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const performClearAll = useCallback(async () => {
    if (!isReady) return;
    if (dbError) {
      showToast('No se puede limpiar: error abriendo IndexedDB', 'error');
      return;
    }

    try {
      await clearAll();
      showToast('XML eliminados correctamente', 'success');
      setXmlModalItemId(null);
      setTipoEgresoQueryByItemId({});
      setOpenTipoEgresoDropdownItemId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error limpiando XML';
      showToast(msg, 'error');
    }
  }, [isReady, dbError, clearAll, showToast]);

  const onClear = useCallback(() => {
    if (!isReady) return;
    if (dbError) {
      showToast('No se puede limpiar: error abriendo IndexedDB', 'error');
      return;
    }
    if (files.length === 0) return;

    setConfirmAction('clear');
    setConfirmOpen(true);
  }, [isReady, dbError, files.length, showToast]);

  const performExportExcel = useCallback(async (options?: { records?: XmlDbRecord[]; allowMissingTipo?: boolean }) => {
    if (!isReady) return;
    if (dbError) {
      showToast('No se puede exportar: error abriendo IndexedDB', 'error');
      return;
    }

    const allowMissingTipo = Boolean(options?.allowMissingTipo);
    const records = options?.records ?? ((await getAllFromDb()) as XmlDbRecord[]);
    if (records.length === 0) {
      showToast('No hay XML para exportar', 'warning');
      return;
    }

    const missingTipo = records.filter((r) => !(r.tipoEgreso || '').trim());
    if (missingTipo.length > 0 && !allowMissingTipo) {
      showToast(`Faltan tipos de egreso en ${missingTipo.length} XML. Asigna el tipo antes de exportar.`, 'warning');
      return;
    }

    if (missingTipo.length > 0 && allowMissingTipo) {
      showToast(`Exportando con faltantes: ${missingTipo.length} XML quedarán como “SIN TIPO”.`, 'warning');
    }

    let okItems: Array<{
      fileName: string;
      tipoEgreso: string;
      tipoEgresoLabel: string;
      cuenta: string;
      factura: FacturaInfo;
    }> = [];

    try {
      okItems = records.map((r) => {
        const tipo = (r.tipoEgreso || '').trim();
        const factura = parseFacturaXml(r.xmlText);
        const tipoLabel = tipo ? (tipoEgresoCodigoToLabel.get(tipo) || tipo) : 'SIN TIPO';
        const cuenta = tipo ? (tipoEgresoCodigoToCuenta.get(tipo) || '—') : '—';
        return {
          fileName: r.fileName,
          tipoEgreso: tipo,
          tipoEgresoLabel: tipoLabel,
          cuenta,
          factura,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'XML inválido';
      showToast(`No se pudo exportar: ${msg}`, 'error');
      return;
    }

    // Ordenar alfabéticamente por tipo de egreso (label visible)
    okItems.sort((a, b) => {
      const la = (a.tipoEgresoLabel || '').trim();
      const lb = (b.tipoEgresoLabel || '').trim();
      const cmp = la.localeCompare(lb, 'es', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;

      const fa = (a.factura?.fechaEmision || '').trim();
      const fb = (b.factura?.fechaEmision || '').trim();
      const cFecha = fa.localeCompare(fb, 'es');
      if (cFecha !== 0) return cFecha;

      const pa = (a.factura?.emisor?.nombre || '').trim();
      const pb = (b.factura?.emisor?.nombre || '').trim();
      const cProv = pa.localeCompare(pb, 'es', { sensitivity: 'base' });
      if (cProv !== 0) return cProv;

      const na = (a.factura?.numeroConsecutivo || '').trim();
      const nb = (b.factura?.numeroConsecutivo || '').trim();
      const cNum = na.localeCompare(nb, 'es');
      if (cNum !== 0) return cNum;

      return (a.fileName || '').localeCompare((b.fileName || ''), 'es', { sensitivity: 'base' });
    });

    type TaxKey = string;
    const toTaxKey = (codigo?: string, codigoTarifaIVA?: string): TaxKey => `${(codigo || '').trim()}|${(codigoTarifaIVA || '').trim()}`;

    const taxKeyToLabel = new Map<TaxKey, string>();
    for (const item of okItems) {
      const desglose = item.factura?.resumen?.desgloseImpuesto || [];
      for (const d of desglose) {
        const key = toTaxKey(d.codigo, d.codigoTarifaIVA);
        if (!taxKeyToLabel.has(key)) {
          const impuesto = labelForImpuestoCodigo(d.codigo);
          const tarifa = d.codigoTarifaIVA ? labelForCodigoTarifaIVA(d.codigoTarifaIVA) : '—';
          taxKeyToLabel.set(key, `${impuesto} | ${tarifa}`);
        }
      }
    }

    const taxKeys = Array.from(taxKeyToLabel.keys()).sort((a, b) => {
      const la = taxKeyToLabel.get(a) || a;
      const lb = taxKeyToLabel.get(b) || b;
      return la.localeCompare(lb, 'es');
    });

    const header = [
      'Proveedor',
      'Correo',
      'Tipo egreso',
      'Cuenta',
      'Total venta',
      'Total descuentos',
      ...taxKeys.map((k) => taxKeyToLabel.get(k) || k),
      'Otros cargos',
      'Total comprobante',
    ];
    const rows: Array<Array<string | number>> = [header];

    let sumTotalVenta = 0;
    let sumTotalDescuentos = 0;
    let sumOtrosCargos = 0;
    let sumTotalComprobante = 0;

    let sumFacturasTotalComprobante = 0;
    let sumNotasCreditoTotalComprobante = 0;

    const sumFacturasByTaxKey = new Map<TaxKey, number>();
    const sumNotasCreditoByTaxKey = new Map<TaxKey, number>();
    const sumByTaxKey = new Map<TaxKey, number>();
    const sumByTipoEgreso = new Map<string, number>();

    for (const item of okItems) {
      const f = item.factura!;
      const sign = getFacturaSign(f);
      const isNotaCredito = sign === -1;
      const proveedor = f.emisor?.nombre || '—';
      const correo = f.emisor?.correoElectronico || '—';

      const totalVenta = applySign(parseDecimal(f.resumen?.totalVenta) || 0, sign);
      const totalDescuentos = applySign(parseDecimal(f.resumen?.totalDescuentos) || 0, sign);
      const otrosCargos = applySign(parseDecimal(f.resumen?.totalOtrosCargos) || 0, sign);
      const totalComprobante = applySign(parseDecimal(f.resumen?.totalComprobante) || 0, sign);
      sumTotalVenta += totalVenta;
      sumTotalDescuentos += totalDescuentos;
      sumOtrosCargos += otrosCargos;
      sumTotalComprobante += totalComprobante;

      if (isNotaCredito) sumNotasCreditoTotalComprobante += totalComprobante;
      else sumFacturasTotalComprobante += totalComprobante;

      // Acumular por tipo de egreso
      const tipoKey = item.tipoEgresoLabel;
      sumByTipoEgreso.set(tipoKey, (sumByTipoEgreso.get(tipoKey) || 0) + totalComprobante);

      const invoiceTaxSums = new Map<TaxKey, number>();
      const desglose = f.resumen?.desgloseImpuesto || [];
      for (const d of desglose) {
        const monto = parseDecimal(d.totalMontoImpuesto);
        if (monto === null) continue;
        if (Math.abs(monto) < 1e-9) continue;
        const key = toTaxKey(d.codigo, d.codigoTarifaIVA);
        const signedMonto = applySign(monto, sign);
        invoiceTaxSums.set(key, (invoiceTaxSums.get(key) || 0) + signedMonto);
        sumByTaxKey.set(key, (sumByTaxKey.get(key) || 0) + signedMonto);

        if (isNotaCredito) {
          sumNotasCreditoByTaxKey.set(key, (sumNotasCreditoByTaxKey.get(key) || 0) + signedMonto);
        } else {
          sumFacturasByTaxKey.set(key, (sumFacturasByTaxKey.get(key) || 0) + signedMonto);
        }
      }

      const taxCells = taxKeys.map((key) => {
        const v = invoiceTaxSums.get(key);
        return v && Math.abs(v) >= 1e-9 ? v : 0;
      });

      rows.push([proveedor, correo, item.tipoEgresoLabel, item.cuenta, totalVenta, totalDescuentos, ...taxCells, otrosCargos, totalComprobante]);
    }

    // Helper para crear filas vacías
    const createEmptyRow = () => header.map(() => '');

    // Añadir totales por tipo de egreso
    rows.push(createEmptyRow());
    rows.push(['TOTALES POR TIPO DE EGRESO', '', '', '', '', '', ...taxKeys.map(() => ''), '', '']);

    const tipoEgresoEntries = Array.from(sumByTipoEgreso.entries()).sort((a, b) => {
      const va = a[1];
      const vb = b[1];
      if (va !== vb) return va - vb;
      return a[0].localeCompare(b[0], 'es', { sensitivity: 'base' });
    });
    for (const [tipoEgreso, total] of tipoEgresoEntries) {
      rows.push(['', '', tipoEgreso, '', '', '', ...taxKeys.map(() => ''), '', total]);
    }

    // Añadir fila de TOTAL general
    rows.push(createEmptyRow());

    // Totales separados: facturas vs notas de crédito (NC) y neto.
    rows.push(['TOTAL FACTURAS', '', '', '', '', '', ...taxKeys.map((k) => sumFacturasByTaxKey.get(k) || 0), '', sumFacturasTotalComprobante]);
    rows.push(['TOTAL NOTAS DE CRÉDITO (NC)', '', '', '', '', '', ...taxKeys.map((k) => sumNotasCreditoByTaxKey.get(k) || 0), '', sumNotasCreditoTotalComprobante]);
    rows.push(['TOTAL NETO (Facturas - NC)', '', '', '', '', '', ...taxKeys.map((k) => sumByTaxKey.get(k) || 0), '', sumTotalComprobante]);
    rows.push(createEmptyRow());

    rows.push([
      'TOTAL',
      '',
      '',
      '',
      sumTotalVenta,
      sumTotalDescuentos,
      ...taxKeys.map((k) => sumByTaxKey.get(k) || 0),
      sumOtrosCargos,
      sumTotalComprobante,
    ]);

    const date = new Date().toISOString().slice(0, 10);
    const fileName = `facturas_xml_${date}.xlsx`;

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 30 },
        { wch: 34 },
        { wch: 30 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        ...taxKeys.map(() => ({ wch: 22 })),
        { wch: 16 },
        { wch: 18 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
      XLSX.writeFile(wb, fileName);

      await clearAll();
      setXmlModalItemId(null);
      setTipoEgresoQueryByItemId({});
      setOpenTipoEgresoDropdownItemId(null);
      showToast('Exportación exitosa. XML eliminados.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error exportando a Excel';
      showToast(msg, 'error');
    }
  }, [isReady, dbError, getAllFromDb, tipoEgresoCodigoToLabel, tipoEgresoCodigoToCuenta, clearAll, showToast]);

  const performExportPdf = useCallback(async (options?: { records?: XmlDbRecord[]; allowMissingTipo?: boolean }) => {
    if (!isReady) return;
    if (dbError) {
      showToast('No se puede exportar: error abriendo IndexedDB', 'error');
      return;
    }

    const allowMissingTipo = Boolean(options?.allowMissingTipo);
    const records = options?.records ?? ((await getAllFromDb()) as XmlDbRecord[]);
    if (records.length === 0) {
      showToast('No hay XML para exportar', 'warning');
      return;
    }

    const missingTipo = records.filter((r) => !(r.tipoEgreso || '').trim());
    if (missingTipo.length > 0 && !allowMissingTipo) {
      showToast(`Faltan tipos de egreso en ${missingTipo.length} XML. Asigna el tipo antes de exportar.`, 'warning');
      return;
    }

    if (missingTipo.length > 0 && allowMissingTipo) {
      showToast(`Exportando con faltantes: ${missingTipo.length} XML quedarán como “SIN TIPO”.`, 'warning');
    }

    let okItems: Array<{
      fileName: string;
      tipoEgreso: string;
      tipoEgresoLabel: string;
      cuenta: string;
      factura: FacturaInfo;
    }> = [];

    try {
      okItems = records.map((r) => {
        const tipo = (r.tipoEgreso || '').trim();
        const factura = parseFacturaXml(r.xmlText);
        const tipoLabel = tipo ? (tipoEgresoCodigoToLabel.get(tipo) || tipo) : 'SIN TIPO';
        const cuenta = tipo ? (tipoEgresoCodigoToCuenta.get(tipo) || '—') : '—';
        return {
          fileName: r.fileName,
          tipoEgreso: tipo,
          tipoEgresoLabel: tipoLabel,
          cuenta,
          factura,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'XML inválido';
      showToast(`No se pudo exportar: ${msg}`, 'error');
      return;
    }

    // Ordenar alfabéticamente por tipo de egreso (label visible)
    okItems.sort((a, b) => {
      const la = (a.tipoEgresoLabel || '').trim();
      const lb = (b.tipoEgresoLabel || '').trim();
      const cmp = la.localeCompare(lb, 'es', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;

      const fa = (a.factura?.fechaEmision || '').trim();
      const fb = (b.factura?.fechaEmision || '').trim();
      const cFecha = fa.localeCompare(fb, 'es');
      if (cFecha !== 0) return cFecha;

      const pa = (a.factura?.emisor?.nombre || '').trim();
      const pb = (b.factura?.emisor?.nombre || '').trim();
      const cProv = pa.localeCompare(pb, 'es', { sensitivity: 'base' });
      if (cProv !== 0) return cProv;

      const na = (a.factura?.numeroConsecutivo || '').trim();
      const nb = (b.factura?.numeroConsecutivo || '').trim();
      const cNum = na.localeCompare(nb, 'es');
      if (cNum !== 0) return cNum;

      return (a.fileName || '').localeCompare((b.fileName || ''), 'es', { sensitivity: 'base' });
    });

    const date = new Date().toISOString().slice(0, 10);
    const fileName = `facturas_xml_${date}.pdf`;

    try {
      const { jsPDF } = await import('jspdf');
      const autoTableMod: any = await import('jspdf-autotable');
      const autoTable: any = autoTableMod?.default || autoTableMod?.autoTable || autoTableMod;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'b4' });
      doc.setFontSize(14);
      doc.text('Exportación de facturas (XML)', 40, 40);

      const head = [[
        'Fecha',
        'NumeroDeFactura',
        'Proveedor',
        'Iva',
        'Descuento',
        'Total',
        'Cuenta',
        'Tipo egreso',
      ]];

      // Evitar símbolos de moneda (p.ej. ₡) porque no siempre están soportados
      // por las fuentes embebidas por defecto en jsPDF y pueden salir como caracteres raros.
      const formatMoneyForPdf = (raw?: string, currencyCode?: string): string => {
        const n = parseDecimal(raw);
        if (n === null) return '—';
        const code = (currencyCode || '').trim().toUpperCase();
        const base = CR_NUMBER_2D.format(n);
        if (!code || code === 'CRC') return base;
        return `${base} ${code}`;
      };

      const addToSum = (map: Map<string, number>, currencyCode: string | undefined, raw: string | undefined, sign: 1 | -1) => {
        const n = parseDecimal(raw);
        if (n === null) return;
        const code = (currencyCode || 'CRC').trim().toUpperCase() || 'CRC';
        map.set(code, (map.get(code) || 0) + applySign(n, sign));
      };

      const formatTotalsForPdf = (map: Map<string, number>): string => {
        if (map.size === 0) return '0.00';

        const entries = Array.from(map.entries())
          .filter(([, v]) => Number.isFinite(v) && Math.abs(v) >= 1e-9)
          .sort(([a], [b]) => a.localeCompare(b, 'es'));

        if (entries.length === 0) return '0.00';
        if (entries.length === 1) {
          const [code, sum] = entries[0];
          const base = CR_NUMBER_2D.format(sum);
          return code === 'CRC' ? base : `${base} ${code}`;
        }

        return entries
          .map(([code, sum]) => `${code}: ${CR_NUMBER_2D.format(sum)}`)
          .join(' | ');
      };

      const ivaSumByCurrency = new Map<string, number>();
      const totalSumByCurrency = new Map<string, number>();

      const ivaFacturasSumByCurrency = new Map<string, number>();
      const ivaNotasCreditoSumByCurrency = new Map<string, number>();
      const totalFacturasSumByCurrency = new Map<string, number>();
      const totalNotasCreditoSumByCurrency = new Map<string, number>();
      const sumByTipoEgreso = new Map<string, Map<string, number>>();

      type TaxKey = string;
      const toTaxKey = (codigo?: string, codigoTarifaIVA?: string): TaxKey => `${(codigo || '').trim()}|${(codigoTarifaIVA || '').trim()}`;
      const ivaTaxKeyToLabel = new Map<TaxKey, string>();
      const ivaSumsByTaxKey = new Map<TaxKey, Map<string, number>>();

      const body = okItems.map((item) => {
        const f = item.factura;
        const moneda = f.resumen?.moneda;
        const sign = getFacturaSign(f);
        const isNotaCredito = sign === -1;
        const consecutivo = (f.numeroConsecutivo || '').trim();
        const numeroFactura = consecutivo ? `${consecutivo}` : '—';
        const proveedor = (f.emisor?.nombre || '').trim() || '—';
        const fecha = formatSimpleDate(f.fechaEmision);

        addToSum(ivaSumByCurrency, moneda, f.resumen?.totalImpuesto, sign);
        addToSum(totalSumByCurrency, moneda, f.resumen?.totalComprobante, sign);

        if (isNotaCredito) {
          addToSum(ivaNotasCreditoSumByCurrency, moneda, f.resumen?.totalImpuesto, sign);
          addToSum(totalNotasCreditoSumByCurrency, moneda, f.resumen?.totalComprobante, sign);
        } else {
          addToSum(ivaFacturasSumByCurrency, moneda, f.resumen?.totalImpuesto, sign);
          addToSum(totalFacturasSumByCurrency, moneda, f.resumen?.totalComprobante, sign);
        }

        // Acumular por tipo de egreso
        const tipoKey = item.tipoEgresoLabel;
        const tipoMap = sumByTipoEgreso.get(tipoKey) || new Map<string, number>();
        addToSum(tipoMap, moneda, f.resumen?.totalComprobante, sign);
        sumByTipoEgreso.set(tipoKey, tipoMap);

        // Resumen por tipo de IVA usando el desglose del XML
        const desglose = f.resumen?.desgloseImpuesto || [];
        for (const d of desglose) {
          const monto = parseDecimal(d.totalMontoImpuesto);
          if (monto === null) continue;
          if (Math.abs(monto) < 1e-9) continue;

          const key = toTaxKey(d.codigo, d.codigoTarifaIVA);
          if (!ivaTaxKeyToLabel.has(key)) {
            const impuesto = labelForImpuestoCodigo(d.codigo);
            const tarifa = d.codigoTarifaIVA ? labelForCodigoTarifaIVA(d.codigoTarifaIVA) : '—';
            ivaTaxKeyToLabel.set(key, `${impuesto} | ${tarifa}`);
          }

          const curr = (moneda || 'CRC').trim().toUpperCase() || 'CRC';
          const byCurrency = ivaSumsByTaxKey.get(key) || new Map<string, number>();
          byCurrency.set(curr, (byCurrency.get(curr) || 0) + applySign(monto, sign));
          ivaSumsByTaxKey.set(key, byCurrency);
        }

        const iva = formatMoneyForPdf(String(applySign(parseDecimal(f.resumen?.totalImpuesto) || 0, sign)), moneda);
        const descuento = formatMoneyForPdf(String(applySign(parseDecimal(f.resumen?.totalDescuentos) || 0, sign)), moneda);
        const total = formatMoneyForPdf(String(applySign(parseDecimal(f.resumen?.totalComprobante) || 0, sign)), moneda);

        return [fecha, numeroFactura, proveedor, iva, descuento, total, item.cuenta, item.tipoEgresoLabel];
      });

      const summaryTitleRowIndex = body.length;

      // Resumen por tipo de IVA (solo si hay desglose)
      const ivaTaxKeys = Array.from(ivaTaxKeyToLabel.keys()).sort((a, b) => {
        const la = ivaTaxKeyToLabel.get(a) || a;
        const lb = ivaTaxKeyToLabel.get(b) || b;
        return la.localeCompare(lb, 'es', { sensitivity: 'base' });
      });

      if (ivaTaxKeys.length > 0) {
        body.push(['', '', 'Resumen de IVA', '', '', '', '', '']);
        for (const k of ivaTaxKeys) {
          const label = ivaTaxKeyToLabel.get(k) || k;
          const sums = ivaSumsByTaxKey.get(k) || new Map<string, number>();
          const amount = formatTotalsForPdf(sums);
          body.push(['', '', label, amount, '', '', '', '']);
        }
      }

      // Totales por tipo de egreso
      body.push(['', '', '', '', '', '', '', '']);
      const tipoEgresoTitleRowIndex = body.length;
      body.push(['', '', 'TOTALES POR TIPO DE EGRESO', '', '', '', '', '']);
      const tipoSortValue = (sums: Map<string, number>): number => {
        if (!sums || sums.size === 0) return 0;
        const crc = sums.get('CRC');
        if (typeof crc === 'number' && Number.isFinite(crc)) return crc;
        let sum = 0;
        for (const v of sums.values()) {
          if (typeof v === 'number' && Number.isFinite(v)) sum += v;
        }
        return sum;
      };

      const tipoEgresoEntries = Array.from(sumByTipoEgreso.entries()).sort((a, b) => {
        const va = tipoSortValue(a[1]);
        const vb = tipoSortValue(b[1]);
        if (va !== vb) return va - vb;
        return a[0].localeCompare(b[0], 'es', { sensitivity: 'base' });
      });
      for (const [tipoEgreso, sumsMap] of tipoEgresoEntries) {
        const amount = formatTotalsForPdf(sumsMap);
        body.push(['', '', tipoEgreso, '', '', amount, '', '']);
      }

      // Totales separados Facturas / NC / Neto
      body.push(['', '', '', '', '', '', '', '']);
      const splitTotalsTitleRowIndex = body.length;
      body.push(['', '', 'TOTALES (FACTURAS / NOTAS DE CRÉDITO / NETO)', '', '', '', '', '']);
      body.push(['', '', 'TOTAL FACTURAS', formatTotalsForPdf(ivaFacturasSumByCurrency), '', formatTotalsForPdf(totalFacturasSumByCurrency), '', '']);
      body.push(['', '', 'TOTAL NOTAS DE CRÉDITO (NC)', formatTotalsForPdf(ivaNotasCreditoSumByCurrency), '', formatTotalsForPdf(totalNotasCreditoSumByCurrency), '', '']);
      body.push(['', '', 'TOTAL NETO (Facturas - NC)', formatTotalsForPdf(ivaSumByCurrency), '', formatTotalsForPdf(totalSumByCurrency), '', '']);

      // Fila final de totales (IVA y Total)
      body.push(['', '', '', '', '', '', '', '']);
      body.push([
        'TOTAL',
        '',
        '',
        formatTotalsForPdf(ivaSumByCurrency),
        '',
        formatTotalsForPdf(totalSumByCurrency),
        '',
        '',
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 60,
        theme: 'plain',
        styles: {
          fontSize: 9,
          cellPadding: 4,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [30, 64, 175],
          textColor: 255,
        },
        didParseCell: (data: any) => {
          // resaltar la última fila (totales)
          const rowIndex = data?.row?.index;
          const bodyLen = Array.isArray(body) ? body.length : 0;
          if (typeof rowIndex === 'number' && rowIndex === bodyLen - 1) {
            data.cell.styles.fontStyle = 'bold';
          }

          // Resaltar título del resumen IVA si existe
          if (typeof rowIndex === 'number' && rowIndex === summaryTitleRowIndex && ivaTaxKeyToLabel.size > 0) {
            data.cell.styles.fontStyle = 'bold';
          }

          // Resaltar título de totales por tipo de egreso
          if (typeof rowIndex === 'number' && rowIndex === tipoEgresoTitleRowIndex) {
            data.cell.styles.fontStyle = 'bold';
          }

          // Resaltar título de totales separados
          if (typeof rowIndex === 'number' && rowIndex === splitTotalsTitleRowIndex) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 120 },
          2: { cellWidth: 210 },
          3: { cellWidth: 70, halign: 'center' },
          4: { cellWidth: 80, halign: 'center' },
          5: { cellWidth: 80, halign: 'right' },
          6: { cellWidth: 80 },
          7: { cellWidth: 210 },
        },
        margin: { left: 40, right: 40 },
      });

      doc.save(fileName);

      await clearAll();
      setXmlModalItemId(null);
      setTipoEgresoQueryByItemId({});
      setOpenTipoEgresoDropdownItemId(null);
      showToast('Exportación PDF exitosa. XML eliminados.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error exportando a PDF';
      showToast(msg, 'error');
    }
  }, [isReady, dbError, getAllFromDb, tipoEgresoCodigoToLabel, tipoEgresoCodigoToCuenta, clearAll, showToast]);

  const onExport = useCallback(() => {
    void (async () => {
      if (!isReady) return;
      if (dbError) {
        showToast('No se puede exportar: error abriendo IndexedDB', 'error');
        return;
      }
      if (receptorGroups.length > 1) {
        showToast('No se puede exportar cuando hay más de un receptor. Deja solo un receptor cargado para exportar.', 'warning');
        return;
      }
      if (files.length === 0) return;
      if (confirmLoading) return;
      if (exportOptionsOpen || exportOptionsLoading) return;

      setConfirmLoading(true);
      try {
        const records = (await getAllFromDb()) as XmlDbRecord[];
        if (records.length === 0) {
          showToast('No hay XML para exportar', 'warning');
          return;
        }

        const missing = records.filter((r) => !(r.tipoEgreso || '').trim()).length;
        if (missing > 0) {
          pendingExportRecordsRef.current = records;
          setExportMissingCount(missing);
          setConfirmAction('export');
          setConfirmOpen(true);
          return;
        }

        pendingExportAssignedRecordsRef.current = records;
        setExportAllowMissingTipo(false);
        setExportOptionsOpen(true);
      } finally {
        setConfirmLoading(false);
      }
    })();
  }, [isReady, dbError, receptorGroups.length, files.length, confirmLoading, exportOptionsOpen, exportOptionsLoading, getAllFromDb, showToast]);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        await addFiles(files);
      }
    },
    [addFiles]
  );

  const xmlModalItem = useMemo(() => {
    if (!xmlModalItemId) return null;
    return items.find((i) => i.id === xmlModalItemId) || null;
  }, [items, xmlModalItemId]);

  const xmlModalFormatted = useMemo(() => {
    const raw = xmlModalItem?.rawXml;
    return raw ? prettyPrintXml(raw) : '';
  }, [xmlModalItem?.rawXml]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-3 sm:px-4 lg:px-0">
      <ConfirmModal
        open={confirmOpen}
        title={
          confirmAction === 'clear'
            ? 'Limpiar XML'
            : confirmAction === 'export'
              ? 'Exportar'
              : confirmAction === 'deleteReceptor'
                ? 'Eliminar receptor'
                : confirmAction === 'delete'
                  ? 'Eliminar XML'
                  : 'Confirmar acción'
        }
        message={
          confirmAction === 'clear' ? (
            <>
              ¿Seguro que deseas limpiar todo? Se borrarán los XML almacenados.
            </>
          ) : confirmAction === 'export' ? (
            <>
              Faltan tipos de egreso en {exportMissingCount} XML.{"\n"}
              Si continúas, esos XML se exportarán como “SIN TIPO”.{"\n"}
              Al realizar esta acción se limpiarán los XML.
            </>
          ) : confirmAction === 'deleteReceptor' ? (
            <>
              ¿Seguro que deseas eliminar todos los XML del receptor?
              {pendingDeleteReceptor?.receptorLabel ? (
                <>
                  <br />
                  <span className="font-medium">{pendingDeleteReceptor.receptorLabel}</span>
                </>
              ) : null}
              {pendingDeleteReceptor?.ids?.length ? (
                <>
                  <br />
                  Se eliminarán <span className="font-medium">{pendingDeleteReceptor.ids.length}</span> XML.
                </>
              ) : null}
            </>
          ) : confirmAction === 'delete' ? (
            <>
              ¿Seguro que deseas eliminar este XML? Se borrará de los XML almacenados.
              {pendingDelete?.fileName ? (
                <>
                  <br />
                  <span className="font-medium">{pendingDelete.fileName}</span>
                </>
              ) : null}
            </>
          ) : (
            <>¿Confirmas esta acción?</>
          )
        }
        confirmText={
          confirmAction === 'clear'
            ? 'Sí, limpiar'
            : confirmAction === 'export'
              ? 'Exportar igualmente'
              : confirmAction === 'deleteReceptor'
                ? 'Sí, eliminar receptor'
                : confirmAction === 'delete'
                  ? 'Sí, eliminar'
                  : 'Confirmar'
        }
        cancelText="Cancelar"
        actionType={confirmAction === 'clear' ? 'delete' : confirmAction === 'export' ? 'change' : confirmAction === 'delete' || confirmAction === 'deleteReceptor' ? 'delete' : 'assign'}
        loading={confirmLoading}
        onCancel={closeConfirm}
        onConfirm={() => {
          void (async () => {
            if (confirmLoading) return;
            const action = confirmAction;
            setConfirmLoading(true);
            try {
              if (action === 'clear') {
                await performClearAll();
              } else if (action === 'export') {
                // Si faltan tipos y el usuario confirma, igual se debe mostrar
                // la elección de exportación (PDF / Excel).
                pendingExportAssignedRecordsRef.current = pendingExportRecordsRef.current ?? null;
                setExportAllowMissingTipo(true);
                setExportOptionsOpen(true);
              } else if (action === 'delete') {
                if (pendingDelete) {
                  await performRemoveOne(pendingDelete.id);
                }
              } else if (action === 'deleteReceptor') {
                if (pendingDeleteReceptor?.ids?.length) {
                  await performRemoveMany(pendingDeleteReceptor.ids);
                }
              }
            } finally {
              setConfirmLoading(false);
              setConfirmOpen(false);
              setConfirmAction(null);
              setExportMissingCount(0);
              pendingExportRecordsRef.current = null;
              setPendingDelete(null);
              setPendingDeleteReceptor(null);
            }
          })();
        }}
      />

      {addLoading && (
        <div
          className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/60 dark:bg-black/80"
          style={{ pointerEvents: 'auto' }}
          role="dialog"
          aria-modal="true"
          aria-label="Cargando XML"
        >
          <div className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-lg shadow-2xl p-5 sm:p-6 w-full max-w-xs sm:max-w-sm border border-[var(--input-border)] flex flex-col items-center mx-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <div className="mt-3 text-base font-semibold text-center">Cargando XML…</div>
            <div className="mt-1 text-sm text-center text-[var(--muted-foreground)]">
              {addLoadingTotal > 0
                ? `Procesando ${Math.min(addLoadingDone, addLoadingTotal)}/${addLoadingTotal}`
                : 'Procesando archivos seleccionados'}
            </div>
            <div className="mt-3 text-xs text-center text-[var(--muted-foreground)]">
              Espera un momento; esta acción bloquea la sección.
            </div>
          </div>
        </div>
      )}

      {exportOptionsOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 dark:bg-black/80"
          style={{ pointerEvents: 'auto' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !exportOptionsLoading) setExportOptionsOpen(false);
          }}
        >
          <div
            className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-lg shadow-2xl p-4 sm:p-6 w-full max-w-xs sm:max-w-sm border border-[var(--input-border)] flex flex-col items-center mx-2 relative"
            style={{ zIndex: 100000 }}
          >
            <h2 className="text-lg font-bold text-center w-full">Exportar</h2>
            <div className="mt-2 text-sm sm:text-base text-center w-full break-words whitespace-pre-line text-[var(--muted-foreground)]">
              Selecciona el formato de exportación.
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-2 mt-5 w-full">
              <button
                className="px-4 py-2 rounded bg-[var(--button-bg)] text-[var(--button-text)] hover:bg-[var(--button-hover)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 justify-center w-full sm:w-auto"
                onClick={() => {
                  if (exportOptionsLoading) return;
                  setExportOptionsOpen(false);
                  pendingExportAssignedRecordsRef.current = null;
                }}
                disabled={exportOptionsLoading}
                type="button"
              >
                Cancelar
              </button>

              <button
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 justify-center w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => {
                  void (async () => {
                    if (exportOptionsLoading) return;
                    setExportOptionsLoading(true);
                    try {
                      await performExportPdf({
                        records: pendingExportAssignedRecordsRef.current ?? undefined,
                        allowMissingTipo: exportAllowMissingTipo,
                      });
                    } finally {
                      setExportOptionsLoading(false);
                      setExportOptionsOpen(false);
                      pendingExportAssignedRecordsRef.current = null;
                    }
                  })();
                }}
                disabled={exportOptionsLoading}
                type="button"
              >
                Pdf
              </button>

              <button
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 justify-center w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => {
                  void (async () => {
                    if (exportOptionsLoading) return;
                    setExportOptionsLoading(true);
                    try {
                      await performExportExcel({
                        records: pendingExportAssignedRecordsRef.current ?? undefined,
                        allowMissingTipo: exportAllowMissingTipo,
                      });
                    } finally {
                      setExportOptionsLoading(false);
                      setExportOptionsOpen(false);
                      pendingExportAssignedRecordsRef.current = null;
                    }
                  })();
                }}
                disabled={exportOptionsLoading}
                type="button"
              >
                Excel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <FileCode className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[var(--foreground)]">XML</h2>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">
                  Carga uno o varios XML. Se lee toda la factura excepto productos (DetalleServicio/LineaDetalle).
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={onPickFiles}
                  disabled={!isReady || Boolean(dbError) || addLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-[var(--primary)] text-white hover:bg-[var(--button-hover)] transition-colors w-full sm:w-52 h-11 whitespace-nowrap"
                >
                  <Upload className="w-4 h-4" />
                  {pickFilesLabel}
                </button>

                {(() => {
                  const exportBlockedByReceptor = receptorGroups.length > 1;
                  const exportDisabled =
                    !isReady ||
                    Boolean(dbError) ||
                    addLoading ||
                    exportBlockedByReceptor ||
                    files.length === 0 ||
                    confirmLoading ||
                    exportOptionsOpen ||
                    exportOptionsLoading;

                  return (
                    <div className={`relative group w-full sm:w-52 ${exportBlockedByReceptor ? 'cursor-not-allowed' : ''}`}>
                      <button
                        type="button"
                        onClick={onExport}
                        disabled={exportDisabled}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 w-full h-11 whitespace-nowrap"
                        title="Exporta las facturas cargadas"
                      >
                        <Download className="w-4 h-4" />
                        Exportar
                      </button>

                      {exportBlockedByReceptor && (
                        <div className="hidden group-hover:block absolute z-30 left-1/2 -translate-x-1/2 top-full mt-2 w-max max-w-[18rem]">
                          <div className="rounded border border-yellow-400 bg-yellow-200 text-red-700 text-xs px-3 py-2 shadow-lg">
                            No se puede exportar porque hay más de un receptor cargado.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={onClear}
                  disabled={!isReady || Boolean(dbError) || addLoading || files.length === 0 || confirmLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-50 w-full sm:w-52 h-11 whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpiar todo
                </button>
              </div>
            </div>

            {dbError && (
              <div className="mt-4 p-3 rounded border border-red-500/30 bg-red-500/10 text-red-700 text-sm">
                Error abriendo IndexedDB: {dbError}
              </div>
            )}

            {!dbError && !isReady && (
              <div className="mt-4 p-3 rounded border border-blue-500/30 bg-blue-500/10 text-blue-700 text-sm">
                Cargando XML persistidos…
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              multiple
              className="hidden"
              onChange={(e) => {
                const input = e.currentTarget;
                const snapshot = Array.from(input.files || []);

                // Clear after snapshot so the FileList isn't lost.
                // This also allows selecting the same file again.
                input.value = '';

                if (snapshot.length > 0) {
                  void addFiles(snapshot);
                }
              }}
            />

            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={onDrop}
              className={`mt-4 rounded-lg border-2 border-dashed p-6 transition-colors ${isDragging
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-[var(--border)] bg-[var(--muted)]'
                }`}
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
                <Upload className="w-5 h-5 text-[var(--muted-foreground)]" />
                <div className="text-sm text-[var(--muted-foreground)]">
                  Arrastra y suelta archivos XML aquí, o usa “{pickFilesLabel}”.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xl font-medium text-[var(--foreground)]">XML cargados</div>
            <div className="text-2xl font-bold text-[var(--foreground)] tabular-nums">{items.length}</div>
          </div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
            {items.length === 1 ? '1 XML cargado' : `${items.length} XML cargados`}
          </div>
        </div>
      )}

      {items.length > 0 && (
        (() => {
          const renderItem = (item: ParsedXmlItem) => {
            const f = item.factura;
            const total = f?.resumen?.totalComprobante;
            const moneda = f?.resumen?.moneda;
            const tipoAsignado = (item.tipoEgreso || '').trim();

            return (
              <div
                key={item.id}
                className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-4 sm:p-5"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-[var(--foreground)] truncate">
                        {item.fileName}
                      </div>
                      {item.status === 'error' && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-500/15 text-red-600 border border-red-500/30">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Error
                        </span>
                      )}
                      {item.status === 'ok' && (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-700 border border-green-500/30">
                          OK
                        </span>
                      )}
                      {!tipoAsignado && (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded bg-red-500 text-black border border-red-500">
                          Tipo pendiente
                        </span>
                      )}
                    </div>

                    {item.status === 'error' ? (
                      <div className="text-sm text-red-600 mt-2">{item.error}</div>
                    ) : (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="text-[var(--muted-foreground)] md:col-span-3">
                          <div className='flex items-start '>
                            <span className="font-medium text-[var(--foreground)] block sm:inline">Clave:</span>
                            <span className="block sm:inline sm:ml-1 break-all md:break-normal md:whitespace-nowrap md:overflow-x-auto md:inline-block md:max-w-full">
                              {f?.clave || '—'}
                            </span>
                          </div>
                        </div>
                        <div className="text-[var(--muted-foreground)]">
                          <span className="font-medium text-[var(--foreground)]">Fecha:</span>{' '}
                          {formatSimpleDate(f?.fechaEmision)}
                        </div>
                        <div className="text-[var(--muted-foreground)]">
                          <span className="font-medium text-[var(--foreground)]">Total:</span>{' '}
                          {formatMoney(total, moneda)}
                        </div>

                        {f?.resumen?.totalDescuentos && parseDecimal(f.resumen.totalDescuentos) !== null && parseDecimal(f.resumen.totalDescuentos) !== 0 && (
                          <div className="text-[var(--muted-foreground)]">
                            <span className="font-medium text-[var(--foreground)]">Descuento:</span>{' '}
                            {formatMoney(f.resumen.totalDescuentos, moneda)}
                          </div>
                        )}

                        <div className="text-[var(--muted-foreground)] md:col-span-3">
                          <span className="font-medium text-[var(--foreground)]">Emisor → Receptor:</span>{' '}
                          {(f?.emisor?.nombre || '—') + ' → ' + (f?.receptor?.nombre || '—')}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto lg:flex-shrink-0">
                    <div className="relative w-full sm:w-[28rem] lg:w-[32rem] max-w-full">
                      <input
                        value={(() => {
                          const selectedCodigo = item.tipoEgreso ?? '';
                          const selectedLabel = selectedCodigo ? (tipoEgresoCodigoToLabel.get(selectedCodigo) || selectedCodigo) : '';
                          return tipoEgresoQueryByItemId[item.id] ?? selectedLabel;
                        })()}
                        onChange={(e) => {
                          const nextQuery = e.currentTarget.value;
                          setTipoEgresoQueryByItemId((prev) => ({ ...prev, [item.id]: nextQuery }));
                          setOpenTipoEgresoDropdownItemId(item.id);
                        }}
                        onFocus={(e) => {
                          const inputEl = e.currentTarget;
                          setOpenTipoEgresoDropdownItemId(item.id);
                          const selectedCodigo = item.tipoEgreso ?? '';
                          const selectedLabel = selectedCodigo ? (tipoEgresoCodigoToLabel.get(selectedCodigo) || selectedCodigo) : '';
                          setTipoEgresoQueryByItemId((prev) => ({ ...prev, [item.id]: prev[item.id] ?? selectedLabel }));

                          // After React updates the input value, place caret at the end.
                          setTimeout(() => {
                            try {
                              const end = inputEl.value.length;
                              inputEl.setSelectionRange(end, end);
                            } catch {
                              // ignore
                            }
                          }, 0);
                        }}
                        onBlur={() => {
                          // Delay closing so option onMouseDown can run.
                          setTimeout(() => {
                            setOpenTipoEgresoDropdownItemId((prev) => (prev === item.id ? null : prev));
                          }, 200);
                        }}
                        disabled={item.status !== 'ok'}
                        className="w-full px-2.5 sm:px-3 py-2 pr-8 bg-[var(--card-bg)] border border-[var(--border)] rounded text-xs sm:text-sm text-[var(--foreground)] disabled:opacity-50"
                        placeholder="Tipo de egreso"
                        title="Filtrar/seleccionar tipo de egreso"
                        aria-label="Filtrar/seleccionar tipo de egreso"
                      />
                      <Search className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />

                      {openTipoEgresoDropdownItemId === item.id &&
                        (() => {
                          const query = (tipoEgresoQueryByItemId[item.id] || '').trim().toLowerCase();
                          const allTypes: Array<{ value: string; label: string; group: string }> = [
                            { value: '', label: 'Quitar selección', group: '' },
                            ...TIPOS_EGRESO_XML.map((t) => ({
                              value: t.codigo,
                              label: `${t.nombre} (${t.codigo})`,
                              group: 'Tipos de egreso',
                            })),
                          ];

                          const filteredTypes =
                            query.length === 0
                              ? allTypes
                              : allTypes.filter(
                                (t) => t.label.toLowerCase().includes(query) || t.value.toLowerCase().includes(query)
                              );

                          if (filteredTypes.length === 0) return null;

                          const groupedTypes = filteredTypes.reduce((acc, type) => {
                            const group = type.group || 'general';
                            if (!acc[group]) acc[group] = [];
                            acc[group].push(type);
                            return acc;
                          }, {} as Record<string, typeof filteredTypes>);

                          return (
                            <div className="absolute z-10 w-full bg-[var(--card-bg)] border border-[var(--border)] rounded mt-1 max-h-60 overflow-y-auto shadow-lg">
                              {Object.entries(groupedTypes).map(([group, types]) => (
                                <React.Fragment key={group}>
                                  {group !== 'general' && group !== '' && (
                                    <div className="px-3 py-1 text-[10px] font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] uppercase">
                                      {group}
                                    </div>
                                  )}
                                  {types.map((t) => (
                                    <div
                                      key={`${t.value}|${t.label}`}
                                      className="p-2 hover:bg-blue-400/20 cursor-pointer transition-all duration-200 text-xs sm:text-sm"
                                      onMouseDown={() => {
                                        void (async () => {
                                          try {
                                            await setTipoEgreso(item.fileName, t.value ? t.value : null);
                                          } catch (err) {
                                            const msg = err instanceof Error ? err.message : 'Error guardando tipo de egreso';
                                            showToast(msg, 'error');
                                          }
                                        })();
                                        setTipoEgresoQueryByItemId((prev) => ({ ...prev, [item.id]: t.value ? t.label : '' }));
                                        setOpenTipoEgresoDropdownItemId(null);
                                      }}
                                      onTouchStart={(e) => {
                                        const touch = e.touches[0];
                                        if (!touch) return;
                                        tipoEgresoTouchRef.current = {
                                          itemId: item.id,
                                          value: t.value,
                                          startX: touch.clientX,
                                          startY: touch.clientY,
                                          moved: false,
                                        };
                                      }}
                                      onTouchMove={(e) => {
                                        const state = tipoEgresoTouchRef.current;
                                        if (!state || state.itemId !== item.id || state.value !== t.value) return;
                                        const touch = e.touches[0];
                                        if (!touch) return;
                                        const dx = Math.abs(touch.clientX - state.startX);
                                        const dy = Math.abs(touch.clientY - state.startY);
                                        if (dx > 8 || dy > 8) {
                                          state.moved = true;
                                        }
                                      }}
                                      onTouchCancel={() => {
                                        const state = tipoEgresoTouchRef.current;
                                        if (!state || state.itemId !== item.id) return;
                                        tipoEgresoTouchRef.current = null;
                                      }}
                                      onTouchEnd={(e) => {
                                        const state = tipoEgresoTouchRef.current;
                                        tipoEgresoTouchRef.current = null;
                                        if (!state) return;
                                        if (state.itemId !== item.id || state.value !== t.value) return;
                                        if (state.moved) return; // user was scrolling, do not select

                                        // It's a tap: prevent the synthetic click + keep selection consistent.
                                        e.preventDefault();
                                        void (async () => {
                                          try {
                                            await setTipoEgreso(item.fileName, t.value ? t.value : null);
                                          } catch (err) {
                                            const msg = err instanceof Error ? err.message : 'Error guardando tipo de egreso';
                                            showToast(msg, 'error');
                                          }
                                        })();
                                        setTipoEgresoQueryByItemId((prev) => ({ ...prev, [item.id]: t.value ? t.label : '' }));
                                        setOpenTipoEgresoDropdownItemId(null);
                                      }}
                                    >
                                      {t.label}
                                    </div>
                                  ))}
                                </React.Fragment>
                              ))}
                            </div>
                          );
                        })()}
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setXmlModalItemId(item.id)}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors w-full sm:w-auto"
                        aria-label={`Ver XML de ${item.fileName}`}
                        title="Ver XML"
                        disabled={!item.rawXml}
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onRequestRemove(item.id, item.fileName)}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors w-full sm:w-auto disabled:opacity-50"
                        aria-label={`Eliminar ${item.fileName}`}
                        title="Eliminar"
                        disabled={addLoading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {item.status === 'ok' && f && (
                  <details className="mt-4">
                    <summary className="cursor-pointer select-none inline-flex items-center gap-2 text-sm text-[var(--foreground)]">
                      <ChevronDown className="w-4 h-4" />
                      Ver detalles
                    </summary>

                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="p-4 rounded border border-[var(--border)] bg-[var(--muted)]">
                        <div className="font-semibold text-[var(--foreground)] mb-2">Encabezado</div>
                        <div className="text-sm text-[var(--muted-foreground)] space-y-1">
                          <div>
                            <span className="font-medium text-[var(--foreground)]">Tipo comprobante:</span>{' '}
                            {f.tipoComprobanteCodigo || f.tipoComprobanteNombre
                              ? `${f.tipoComprobanteCodigo ? `${f.tipoComprobanteCodigo} - ` : ''}${f.tipoComprobanteNombre || ''}`.trim() || '—'
                              : '—'}
                          </div>
                          <div><span className="font-medium text-[var(--foreground)]">Número consecutivo:</span> {f.numeroConsecutivo || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Proveedor sistemas:</span> {f.proveedorSistemas || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Actividad emisor:</span> {f.codigoActividadEmisor || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Actividad receptor:</span> {f.codigoActividadReceptor || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Condición venta:</span> {f.condicionVenta || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Condición otros:</span> {f.condicionVentaOtros || '—'}</div>
                          <div>
                            <span className="font-medium text-[var(--foreground)]">Tipo transacción:</span>{' '}
                            {f.tiposTransaccion && f.tiposTransaccion.length > 0
                              ? f.tiposTransaccion.map((t) => labelForCode(t, TIPO_TRANSACCION_LABEL)).join(' | ')
                              : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded border border-[var(--border)] bg-[var(--muted)]">
                        <div className="font-semibold text-[var(--foreground)] mb-2">Resumen</div>
                        <div className="text-sm text-[var(--muted-foreground)] space-y-1">
                          <div><span className="font-medium text-[var(--foreground)]">Total gravado:</span> {formatMoney(f.resumen?.totalGravado, f.resumen?.moneda)}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Total merc. gravadas:</span> {formatMoney(f.resumen?.totalMercanciasGravadas, f.resumen?.moneda)}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Total venta:</span> {formatMoney(f.resumen?.totalVenta, f.resumen?.moneda)}</div>
                          {f.resumen?.totalDescuentos && parseDecimal(f.resumen.totalDescuentos) !== null && parseDecimal(f.resumen.totalDescuentos) !== 0 && (
                            <div><span className="font-medium text-[var(--foreground)]">Total descuentos:</span> {formatMoney(f.resumen.totalDescuentos, f.resumen?.moneda)}</div>
                          )}
                          <div><span className="font-medium text-[var(--foreground)]">Total venta neta:</span> {formatMoney(f.resumen?.totalVentaNeta, f.resumen?.moneda)}</div>
                          {f.resumen?.totalOtrosCargos && parseDecimal(f.resumen.totalOtrosCargos) !== null && parseDecimal(f.resumen.totalOtrosCargos) !== 0 && (
                            <div><span className="font-medium text-[var(--foreground)]">Total otros cargos:</span> {formatMoney(f.resumen.totalOtrosCargos, f.resumen?.moneda)}</div>
                          )}
                          <div><span className="font-medium text-[var(--foreground)]">Total impuesto:</span> {formatMoney(f.resumen?.totalImpuesto, f.resumen?.moneda)}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Total comprobante:</span> {formatMoney(f.resumen?.totalComprobante, f.resumen?.moneda)}</div>
                        </div>

                        <div className="mt-3">
                          <div className="font-medium text-[var(--foreground)] mb-1">IVA aplicado</div>
                          <div className="text-sm text-[var(--muted-foreground)] space-y-1">
                            <div>
                              <span className="font-medium text-[var(--foreground)]">Total IVA:</span>{' '}
                              {formatMoney(f.resumen?.totalImpuesto, f.resumen?.moneda)}
                            </div>
                            {(() => {
                              const desgloseRaw = f.resumen?.desgloseImpuesto || [];
                              const desglose = desgloseRaw.filter((d) => {
                                const monto = parseDecimal(d.totalMontoImpuesto);
                                return monto === null || Math.abs(monto) >= 1e-9;
                              });

                              if (desglose.length === 0) {
                                return <div className="text-xs text-[var(--muted-foreground)]">Sin desglose de IVA en el XML.</div>;
                              }

                              const renderRow = (d: (typeof desglose)[number], idx?: number) => (
                                <div key={idx} className="flex flex-wrap gap-x-3">
                                  <div>
                                    <span className="font-medium text-[var(--foreground)]">Impuesto:</span>{' '}
                                    {labelForImpuestoCodigo(d.codigo)}
                                  </div>
                                  <div>
                                    <span className="font-medium text-[var(--foreground)]">Tarifa IVA:</span>{' '}
                                    {d.codigoTarifaIVA ? labelForCodigoTarifaIVA(d.codigoTarifaIVA) : '—'}
                                  </div>
                                  <div>
                                    <span className="font-medium text-[var(--foreground)]">%:</span>{' '}
                                    {d.tarifa ? `${formatNumber2(d.tarifa)}%` : '—'}
                                  </div>
                                  <div>
                                    <span className="font-medium text-[var(--foreground)]">Monto:</span>{' '}
                                    {formatMoney(d.totalMontoImpuesto, f.resumen?.moneda)}
                                  </div>
                                </div>
                              );

                              if (desglose.length === 1) {
                                return <div className="mt-1">{renderRow(desglose[0])}</div>;
                              }

                              return (
                                <details className="mt-1">
                                  <summary className="cursor-pointer select-none inline-flex items-center gap-2 text-xs text-[var(--foreground)]">
                                    <ChevronDown className="w-4 h-4" />
                                    Ver desglose de IVA ({desglose.length})
                                  </summary>
                                  <div className="mt-2 space-y-1">
                                    {desglose.map((d, idx) => renderRow(d, idx))}
                                  </div>
                                </details>
                              );
                            })()}
                          </div>
                        </div>

                        {f.resumen?.mediosPago && f.resumen.mediosPago.length > 0 && (
                          <div className="mt-3">
                            <div className="font-medium text-[var(--foreground)] mb-1">Medios de pago</div>
                            <div className="text-sm text-[var(--muted-foreground)] space-y-1">
                              {f.resumen.mediosPago.map((mp, idx) => (
                                <div key={idx} className="flex flex-wrap gap-x-3">
                                  <div><span className="font-medium text-[var(--foreground)]">Tipo:</span> {labelForCode(mp.tipo, TIPO_MEDIO_PAGO_LABEL)}</div>
                                  <div><span className="font-medium text-[var(--foreground)]">Otros:</span> {mp.otros || '—'}</div>
                                  <div><span className="font-medium text-[var(--foreground)]">Total:</span> {formatMoney(mp.total, f.resumen?.moneda)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-4 rounded border border-[var(--border)] bg-[var(--muted)]">
                        <div className="font-semibold text-[var(--foreground)] mb-2">Emisor</div>
                        <div className="text-sm text-[var(--muted-foreground)] space-y-1">
                          <div><span className="font-medium text-[var(--foreground)]">Nombre:</span> {f.emisor?.nombre || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Identificación:</span> {(f.emisor?.identificacionTipo || '—') + ' ' + (f.emisor?.identificacionNumero || '')}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Nombre comercial:</span> {f.emisor?.nombreComercial || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Correo:</span> {f.emisor?.correoElectronico || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Teléfono:</span> {f.emisor?.telefono || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Ubicación:</span> {f.emisor?.ubicacion || '—'}</div>
                        </div>
                      </div>

                      <div className="p-4 rounded border border-[var(--border)] bg-[var(--muted)]">
                        <div className="font-semibold text-[var(--foreground)] mb-2">Receptor</div>
                        <div className="text-sm text-[var(--muted-foreground)] space-y-1">
                          <div><span className="font-medium text-[var(--foreground)]">Nombre:</span> {f.receptor?.nombre || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Identificación:</span> {(f.receptor?.identificacionTipo || '—') + ' ' + (f.receptor?.identificacionNumero || '')}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Nombre comercial:</span> {f.receptor?.nombreComercial || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Correo:</span> {f.receptor?.correoElectronico || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Teléfono:</span> {f.receptor?.telefono || '—'}</div>
                          <div><span className="font-medium text-[var(--foreground)]">Ubicación:</span> {f.receptor?.ubicacion || '—'}</div>
                        </div>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            );
          };

          if (receptorGroups.length === 1) {
            return <div className="space-y-4">{receptorGroups[0]!.items.map(renderItem)}</div>;
          }

          return (
            <div className="space-y-4">
              {receptorGroups.map((group) => {
                const isOpen = Boolean(openReceptorGroupByKey[group.key]);
                const ids = group.items.map((i) => i.id);
                return (
                  <div key={group.key} className="space-y-3">
                    <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => toggleReceptorGroup(group.key)}
                          className="flex items-start gap-2 min-w-0 text-left"
                        >
                          <ChevronDown className={`w-4 h-4 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--foreground)] truncate">
                              Receptor: {group.receptorLabel}
                            </div>
                            {group.receptorName && (
                              <div className="text-xs text-[var(--muted-foreground)] truncate">{group.receptorName}</div>
                            )}
                          </div>
                        </button>

                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 flex-shrink-0">
                          <span className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted-foreground)]">
                            {group.items.length} XML
                          </span>
                          {canDeleteReceptorBlocks && Boolean((group.receptorId || '').trim()) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onRequestRemoveReceptor({
                                  key: group.key,
                                  receptorId: group.receptorId,
                                  receptorLabel: group.receptorLabel,
                                  ids,
                                });
                              }}
                              disabled={addLoading}
                              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded border border-red-500/40 text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                              title="Eliminar todos los XML de este receptor"
                            >
                              <Trash2 className="w-4 h-4" />
                              Eliminar bloque
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isOpen && <div className="space-y-4">{group.items.map(renderItem)}</div>}
                  </div>
                );
              })}
            </div>
          );
        })()
      )}

      {xmlModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            // close on backdrop click
            if (e.target === e.currentTarget) setXmlModalItemId(null);
          }}
        >
          <div className="absolute inset-0 bg-black/60" />

          <div className="relative w-full max-w-4xl bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
              <div className="min-w-0">
                <div className="text-sm text-[var(--muted-foreground)]">XML puro</div>
                <div className="font-semibold text-[var(--foreground)] truncate">
                  {xmlModalItem.fileName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setXmlModalItemId(null)}
                className="inline-flex items-center justify-center w-9 h-9 rounded border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="max-h-[70vh] overflow-auto rounded border border-[var(--border)] bg-[var(--muted)] p-3">
                <pre className="text-xs whitespace-pre-wrap break-words text-[var(--foreground)]">
                  {xmlModalFormatted || xmlModalItem.rawXml || 'Sin contenido'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
