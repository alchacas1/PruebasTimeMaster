export interface EmpresaEmpleado {
  Empleado: string;
  hoursPerShift: number;
  extraAmount: number;
  ccssType: 'TC' | 'MT';
  /**
   * Si es true (y amboshorarios no es true), el empleado se muestra solo en CalculoHorasPrecios
   * y se oculta del ControlHorario normal.
   */
  calculoprecios?: boolean;
  /**
   * Si es true, el empleado se muestra en ambos horarios (prioridad sobre calculoprecios).
   */
  amboshorarios?: boolean;
}

export interface Empresas {
  id?: string;
  ownerId: string;
  name: string;
  ubicacion: string;
  empleados: EmpresaEmpleado[];
}

// Documento de la nueva colección "empleados" (relacionado por empresaId)
export interface Empleado {
  id?: string;
  empresaId: string;
  // opcional: para futuras reglas multi-tenant (no es requerido para relacionar con empresa)
  ownerId?: string;
  // Nombre del empleado
  Empleado: string;
  ccssType: 'TC' | 'MT' | 'PH'; // Tipo de cotización en CCSS (Tiempo Completo, Medio Tiempo, Pago por Hora)

  // --- Datos adicionales (sección Empleados) ---
  // 1) Pago de hora en bruto
  pagoHoraBruta?: number;
  // 2) Día de contratación (guardado como YYYY-MM-DD para evitar problemas de zona horaria)
  diaContratacion?: string;
  // 3) Pagan aguinaldo
  paganAguinaldo?: string;
  // 4) Cantidad de horas que trabaja
  cantidadHorasTrabaja?: number;
  // 5) Le dan recibo de pago
  danReciboPago?: string;
  // 6) Contrato físico
  contratoFisico?: string;
  // 7) Se cuenta con espacio de comida
  espacioComida?: string;
  // 8) Se brindan vacaciones
  brindanVacaciones?: string;
  // 9) Incluido en CCSS
  incluidoCCSS?: boolean;
  // 10) Incluido en INS
  incluidoINS?: boolean;

  // Preguntas adicionales configurables
  preguntasExtra?: Array<{
    pregunta: string;
    respuesta: string;
  }>;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProviderEntry {
  code: string;
  name: string;
  company: string;
  type?: string;
  category?: 'Ingreso' | 'Gasto' | 'Egreso';
  createdAt?: string;
  updatedAt?: string;
  correonotifi?: string;
  visit?: {
    createOrderDays: Array<'D' | 'L' | 'M' | 'MI' | 'J' | 'V' | 'S'>;
    receiveOrderDays: Array<'D' | 'L' | 'M' | 'MI' | 'J' | 'V' | 'S'>;
    frequency: 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | '22 DIAS';
    /**
     * Date key (ms at local midnight) that anchors the recurrence.
     * Used for non-weekly frequencies (quincenal/22 días/mensual) to decide which weeks apply.
     */
    startDateKey?: number;
  };
}

export interface ProductEntry {
  /**
   * Firestore doc id (and also stored in the document for compatibility with JSON exports).
   */
  id: string;
  nombre: string;
  descripcion?: string;
  pesoengramos: number;
  precio: number;
  precioxgramo: number;
  createdAt?: string;
  /**
   * Kept as `updateAt` to match the existing JSON model (productos.json).
   */
  updateAt?: string;
}

export interface RecetaProductoItem {
  productId: string;
  gramos: number;
}

export interface RecetaEntry {
  /**
   * Firestore doc id (and also stored in the document for compatibility with JSON exports).
   */
  id: string;
  nombre: string;
  descripcion?: string;
  productos: RecetaProductoItem[];
  /**
   * IVA como decimal (0.13 = 13%).
   * Opcional por compatibilidad con recetas existentes.
   */
  iva?: number;
  /**
   * Margen como decimal (0.35 = 35%).
   */
  margen: number;
  createdAt?: string;
  /**
   * Kept as `updateAt` to match recetas.json.
   */
  updateAt?: string;
}

export interface Sorteo {
  id?: string;
  name: string;
}
export interface UserPermissions {
  scanner: boolean;      // Escáner - Escanear códigos de barras
  calculator: boolean;   // Calculadora - Calcular precios con descuentos
  converter: boolean;    // Conversor - Convertir y transformar texto
  xml: boolean;          // XML - Exportación / generación de XML
  cashcounter: boolean;  // Contador Efectivo - Contar billetes y monedas
  recetas: boolean;      // Recetas - (en mantenimiento)
  notificaciones: boolean; // Notificaciones - Acceso a notificaciones (sin tarjeta en HomeMenu)
  agregarproductosdeli: boolean; // Agregar productos deli - permiso interno (sin tarjeta)
  timingcontrol: boolean; // Control Tiempos - Registro de venta de tiempos
  controlhorario: boolean; // Control Horario - Registro de horarios de trabajo
  calculohorasprecios: boolean; // Calculo horas precios - Cálculo de horas y precios/planilla
  empleados: boolean; // Empleados - Información (próximamente)
  supplierorders: boolean; // Órdenes Proveedor - Gestión de órdenes de proveedores
  mantenimiento: boolean;  // Mantenimiento - Nueva sección de mantenimiento
  fondogeneral?: boolean; // Fondo General - Acceso a administración del fondo general
  fondogeneralBCR?: boolean; // Fondo General - Acceso a la cuenta BCR
  fondogeneralBN?: boolean; // Fondo General - Acceso a la cuenta BN
  fondogeneralBAC?: boolean; // Fondo General - Acceso a la cuenta BAC
  solicitud?: boolean; // Solicitud - Permiso extra en sección de Mantenimiento
  scanhistory: boolean;    // Historial General de Escaneos - Ver historial completo de escaneos
  scanhistoryEmpresas?: string[]; // Empresas específicas para historial de escaneos (almacena company names)
}

export interface User {
  id?: string;
  name: string;
  // correo electrónico del usuario
  email?: string;
  // nombre completo de la persona encargada (para admins)
  fullName?: string;
  // máximo de empresas que un admin puede manejar simultáneamente
  maxCompanies?: number;
  password?: string;
  // si el usuario pertenece a un owner (para multi-tenant)
  ownerId?: string;
  // Nombre de la empresa dueña asignada (espacio ownercompanie)
  ownercompanie?: string;
  role?: 'admin' | 'user' | 'superadmin';
  isActive?: boolean;
  // Campo para marcar eliminación lógica; por defecto false
  eliminate?: boolean;
  permissions?: UserPermissions;
  photoUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ScheduleEntry {
  id?: string;
  companieValue: string;
  employeeName: string;
  year: number;
  month: number;
  day: number;
  shift: string; // 'N', 'D', 'L', or empty string
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ScanResult {
  id?: string;
  code: string;
  timestamp: Date;
  source: 'mobile' | 'web';
  userId?: string;
  userName?: string;
  processed: boolean;
  sessionId?: string;
  processedAt?: Date;
  productName?: string; // Optional product name for scanned codes
  ownercompanie?: string; // Owner company name/identifier assigned from mobile scanning
  hasImages?: boolean; // Indicates if the code has associated images
  codeBU?: string; // Numeric-only code extracted from photo (if available)
}

export interface CcssConfig {
  id?: string;
  ownerId: string; // ID del propietario de la configuración
  companie: companies[]; // Nombre de la empresa propietaria
  updatedAt?: Date;
}
export interface companies {
  ownerCompanie: string; // Nombre de la empresa propietaria
  mt: number; // Valor para Medio Tiempo
  tc: number; // Valor para Tiempo Completo
  valorhora: number; // Valor por hora predeterminado
  horabruta: number; // Valor por hora bruta
}

export interface FondoMovementTypeConfig {
  id?: string;
  category: 'INGRESO' | 'GASTO' | 'EGRESO';
  name: string;
  order?: number; // Para mantener el orden de los tipos
  createdAt?: Date;
  updatedAt?: Date;
}