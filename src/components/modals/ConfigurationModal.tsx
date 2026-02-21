'use client'

import { X, Settings, User, Shield, Timer, TimerOff, LogOut, Calculator, GripVertical } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import TokenInfo from '../session/TokenInfo';

interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  showSessionTimer: boolean;
  onToggleSessionTimer: (show: boolean) => void;
  showCalculator: boolean;
  onToggleCalculator: (show: boolean) => void;
  showSupplierWeekInMenu: boolean;
  onToggleSupplierWeekInMenu: (show: boolean) => void;
  enableHomeMenuSortMobile: boolean;
  onToggleHomeMenuSortMobile: (enabled: boolean) => void;
  onLogoutClick: () => void;
}

export default function ConfigurationModal({
  isOpen,
  onClose,
  showSessionTimer,
  onToggleSessionTimer,
  showCalculator,
  onToggleCalculator,
  showSupplierWeekInMenu,
  onToggleSupplierWeekInMenu,
  enableHomeMenuSortMobile,
  onToggleHomeMenuSortMobile,
  onLogoutClick
}: ConfigurationModalProps) {
  const { user } = useAuth();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--background)] rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-[var(--foreground)] flex items-center gap-3">
              <Settings className="w-6 h-6 text-blue-600" />
              Configuración del Sistema
            </h2>
            <button
              onClick={onClose}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* User Information */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              Información del Usuario
            </h3>
            <div className="bg-[var(--hover-bg)] rounded-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <User className="w-8 h-8 text-[var(--muted-foreground)]" />
                <div>
                  <div className="font-medium text-[var(--foreground)]">{user?.name}</div>
                  <div className="text-sm text-[var(--muted-foreground)]">
                    Usuario activo: <strong>{user?.name}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Session Management */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" />
              Gestión de Sesión
            </h3>
            <div className="space-y-4">
              <TokenInfo isOpen={true} onClose={() => { }} inline={true} />

              {/* Toggle para FloatingSessionTimer */}
              <div className="bg-[var(--hover-bg)] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {showSessionTimer ? (
                      <Timer className="w-5 h-5 text-blue-500" />
                    ) : (
                      <TimerOff className="w-5 h-5 text-gray-500" />
                    )}
                    <div>
                      <div className="font-medium text-[var(--foreground)]">
                        Temporizador Flotante
                      </div>
                      <div className="text-sm text-[var(--muted-foreground)]">
                        {showSessionTimer ? 'Visible en pantalla' : 'Oculto'}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={showSessionTimer}
                        onChange={(e) => onToggleSessionTimer(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`block w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${showSessionTimer
                        ? 'bg-blue-600 shadow-lg'
                        : 'bg-gray-300 dark:bg-gray-600'
                        }`}>
                      </div>
                      <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out shadow-sm ${showSessionTimer ? 'translate-x-6' : 'translate-x-0'
                        }`}>
                      </div>
                    </div>
                  </label>
                </div>
                <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                  {showSessionTimer
                    ? 'El temporizador de sesión se muestra en la esquina inferior derecha'
                    : 'Activa para mostrar el temporizador de sesión flotante'
                  }
                </div>
              </div>

              {/* Toggle para Calculadora Siempre Visible */}
              <div className="bg-[var(--hover-bg)] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calculator className={`w-5 h-5 ${showCalculator ? 'text-green-500' : 'text-gray-500'}`} />
                    <div>
                      <div className="font-medium text-[var(--foreground)]">
                        Mostrar Siempre la Calculadora
                      </div>
                      <div className="text-sm text-[var(--muted-foreground)]">
                        {showCalculator ? 'Calculadora visible en todas las páginas' : 'Calculadora oculta'}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={showCalculator}
                        onChange={(e) => onToggleCalculator(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`block w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${showCalculator
                        ? 'bg-green-600 shadow-lg'
                        : 'bg-gray-300 dark:bg-gray-600'
                        }`}>
                      </div>
                      <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out shadow-sm ${showCalculator ? 'translate-x-6' : 'translate-x-0'
                        }`}>
                      </div>
                    </div>
                  </label>
                </div>
                <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                  {showCalculator
                    ? 'La calculadora estará disponible en todas las páginas como botón flotante'
                    : 'Activa para mostrar la calculadora flotante en toda la aplicación'
                  }
                </div>
              </div>

              {/* Toggle para mostrar/ocultar tarjeta semanal de proveedores en Home */}
              <div className="bg-[var(--hover-bg)] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Settings className={`w-5 h-5 ${showSupplierWeekInMenu ? 'text-green-500' : 'text-gray-500'}`} />
                    <div>
                      <div className="font-medium text-[var(--foreground)]">
                        Mostrar en menu la tarjeta de Semana Proveedores
                      </div>
                      <div className="text-sm text-[var(--muted-foreground)]">
                        {showSupplierWeekInMenu
                          ? 'Tarjeta visible en el Home (si tienes permisos)'
                          : 'Tarjeta oculta en el Home'
                        }
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={showSupplierWeekInMenu}
                        onChange={(e) => onToggleSupplierWeekInMenu(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`block w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${showSupplierWeekInMenu
                          ? 'bg-green-600 shadow-lg'
                          : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                      />
                      <div
                        className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out shadow-sm ${showSupplierWeekInMenu
                          ? 'translate-x-6'
                          : 'translate-x-0'
                          }`}
                      />
                    </div>
                  </label>
                </div>
                <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                  {showSupplierWeekInMenu
                    ? 'Se muestra la tarjeta de Semana actual (proveedores) en el menú principal'
                    : 'Activa para mostrar la tarjeta semanal de proveedores en el Home'
                  }
                </div>
              </div>

              {/* Toggle para habilitar ordenar el menú del Home */}
              <div className="bg-[var(--hover-bg)] rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GripVertical className={`w-5 h-5 ${enableHomeMenuSortMobile ? 'text-green-500' : 'text-gray-500'}`} />
                    <div>
                      <div className="font-medium text-[var(--foreground)]">
                        Ordenar menú
                      </div>
                      <div className="text-sm text-[var(--muted-foreground)]">
                        {enableHomeMenuSortMobile
                          ? 'Arrastra para reordenar las tarjetas del Home'
                          : 'Desactivado para evitar toques accidentales'
                        }
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={enableHomeMenuSortMobile}
                        onChange={(e) => onToggleHomeMenuSortMobile(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`block w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${enableHomeMenuSortMobile
                          ? 'bg-green-600 shadow-lg'
                          : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                      />
                      <div
                        className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out shadow-sm ${enableHomeMenuSortMobile
                          ? 'translate-x-6'
                          : 'translate-x-0'
                          }`}
                      />
                    </div>
                  </label>
                </div>
                <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                  Aplica en todas las pantallas.
                </div>
              </div>
            </div>
          </div>

          {/* Actions Section */}
          <div className="border-t border-[var(--input-border)] pt-6">
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-4">Acciones</h3>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[var(--hover-bg)] text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  onClose();
                  onLogoutClick();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close */}
      <div
        className="absolute inset-0 -z-10"
        onClick={onClose}
      />
    </div>
  );
}