'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Scan, Calculator, Type, FileCode, Banknote, Layers, Smartphone, Clock, Truck, Settings, History, X } from 'lucide-react';
import AnimatedStickman from '@/components/ui/AnimatedStickman';
import { User, UserPermissions } from '@/types/firestore';
import { getDefaultPermissions } from '@/utils/permissions';

// Define the menu items with permissions (same as HomeMenu.tsx)
const menuItems = [
  { id: 'scanner', name: 'Escáner', icon: Scan, description: 'Escanear códigos de barras', permission: 'scanner' as keyof UserPermissions },
  { id: 'calculator', name: 'Calculadora', icon: Calculator, description: 'Calcular precios con descuentos', permission: 'calculator' as keyof UserPermissions },
  { id: 'converter', name: 'Conversor', icon: Type, description: 'Convertir y transformar texto', permission: 'converter' as keyof UserPermissions },
  { id: 'xml', name: 'XML', icon: FileCode, description: 'Generar y exportar XML', permission: 'xml' as keyof UserPermissions },
  { id: 'cashcounter', name: 'Contador Efectivo', icon: Banknote, description: 'Contar billetes y monedas (CRC/USD)', permission: 'cashcounter' as keyof UserPermissions },
  { id: 'recetas', name: 'Recetas', icon: Layers, description: 'en mantenimiento', permission: 'recetas' as keyof UserPermissions },
  { id: 'fondogeneral', name: 'Fondo General', icon: Banknote, description: 'Administrar el fondo general', permission: 'fondogeneral' as keyof UserPermissions },
  { id: 'timingcontrol', name: 'Control Tiempos', icon: Smartphone, description: 'Registro de venta de tiempos', permission: 'timingcontrol' as keyof UserPermissions },
  { id: 'controlhorario', name: 'Control Horario', icon: Clock, description: 'Registro de horarios de trabajo', permission: 'controlhorario' as keyof UserPermissions },
  { id: 'supplierorders', name: 'Órdenes Proveedor', icon: Truck, description: 'Gestión de órdenes de proveedores', permission: 'supplierorders' as keyof UserPermissions },
  { id: 'scanhistory', name: 'Historial de Escaneos', icon: History, description: 'Ver historial completo de escaneos', permission: 'scanhistory' as keyof UserPermissions },
  { id: 'edit', name: 'Mantenimiento', icon: Settings, description: 'Gestión y mantenimiento del sistema', permission: 'mantenimiento' as keyof UserPermissions },
];

export default function HomePage() {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showStickman, setShowStickman] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>('');

  // Verificar y cargar la sesión del usuario especial "SEBASTIAN"
  useEffect(() => {
    // Verificar si ya existe una sesión
    const existingSession = localStorage.getItem('pricemaster_session');

    if (!existingSession) {
      // Si no hay sesión, algo salió mal - redirigir al login
      router.push('/');
      return;
    }

    try {
      const session = JSON.parse(existingSession);

      // Verificar que sea la sesión del usuario especial SEBASTIAN
      if (session.isSpecialUser && session.id === 'special-user-sebastian') {
        // Crear el objeto de usuario desde la sesión
        const specialUser: User = {
          id: session.id,
          name: session.name,
          ownercompanie: session.ownercompanie,
          role: session.role,
          permissions: session.permissions,
          ownerId: session.id,
          eliminate: false
        };

        setCurrentUser(specialUser);
        setIsLoading(false);
      } else {
        // Si es una sesión de usuario normal, redirigir a la página principal
        router.push('/');
      }
    } catch (error) {
      console.error('Error loading session:', error);
      router.push('/');
    }
  }, [router]);

  // Filter menu items based on user permissions
  const getVisibleMenuItems = () => {
    if (!currentUser) {
      return [];
    }

    // Get user permissions
    const userPermissions: UserPermissions = currentUser.permissions || getDefaultPermissions(currentUser.role || 'user');

    // Filter items based on user permissions
    return menuItems.filter(item => {
      const hasPermission = userPermissions[item.permission];
      return hasPermission === true;
    });
  };

  const visibleMenuItems = getVisibleMenuItems();

  const handleCardClick = (id: string, name: string) => {
    // Si es la tarjeta Fondo General, navegar a su página
    if (id === 'fondogeneral') {
      // Use hash navigation so header/tab system picks it up (/#fondogeneral)
      if (typeof window !== 'undefined') {
        window.location.hash = '#fondogeneral';
      }
      return;
    }

    // Mostrar modal de mantenimiento en lugar de navegar para las demás
    setSelectedTool(name);
    setShowMaintenanceModal(true);
  };

  const handleCloseModal = () => {
    setShowMaintenanceModal(false);
    setSelectedTool('');
  };

  const handleLogoClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    setHovered(h => !h);

    if (newCount >= 5) {
      setShowStickman(true);
    }
  };

  // Ocultar el AnimatedStickman después de 10 segundos
  useEffect(() => {
    if (showStickman) {
      const timer = setTimeout(() => {
        setShowStickman(false);
      }, 10000); // 10 segundos

      return () => clearTimeout(timer);
    }
  }, [showStickman]);

  // Mostrar loading mientras se crea la sesión
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] py-8">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-[var(--muted-foreground)]">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-8">
      <div className="mb-2 flex items-center justify-center">
        <Calculator
          className={`w-14 h-14 mr-2 transition-transform duration-300 ${hovered ? 'scale-110 rotate-12 text-[var(--foreground)]' : 'scale-100 text-[var(--tab-text-active)]'}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={handleLogoClick}
          style={{ cursor: 'pointer', filter: hovered ? 'drop-shadow(0 0 8px var(--foreground))' : 'none' }}
        />
      </div>
      <h1 className="text-3xl font-bold mb-8 text-center">Bienvenido a Time Master</h1>

      {visibleMenuItems.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl p-8 max-w-md mx-auto">
            <Settings className="w-16 h-16 mx-auto mb-4 text-[var(--muted-foreground)]" />
            <h3 className="text-xl font-semibold mb-2 text-[var(--foreground)]">
              Sin herramientas disponibles
            </h3>
            <p className="text-[var(--muted-foreground)] mb-4">
              No tienes permisos para acceder a ninguna herramienta en este momento.
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Contacta a tu administrador para obtener acceso a las funcionalidades que necesitas.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-screen-xl px-4">
          {visibleMenuItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleCardClick(item.id, item.name)}
              className="bg-[var(--card-bg)] dark:bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl shadow-md p-6 flex flex-col items-center transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 group"
              style={{ minHeight: 160 }}
            >
              <item.icon className="w-10 h-10 mb-3 text-[var(--foreground)] group-hover:scale-110 transition-transform" />
              <span className="text-lg font-semibold mb-1 text-[var(--foreground)] dark:text-[var(--foreground)]">{item.name}</span>
              <span className="text-sm text-[var(--tab-text)] text-center">{item.description}</span>

              {/* No badge - clicking navigates to the Fondo General page */}
            </button>
          ))}
        </div>
      )}

      {/* AnimatedStickman aparece solo después de 5 clicks */}
      {showStickman && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <AnimatedStickman />
        </div>
      )}

      {/* Modal de Mantenimiento */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl shadow-2xl p-8 max-w-md w-full relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mb-4">
                <Settings className="w-8 h-8 text-orange-500 animate-spin" style={{ animationDuration: '3s' }} />
              </div>

              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">
                En Mantenimiento
              </h2>

              <p className="text-[var(--muted-foreground)] mb-4">
                La función <span className="font-semibold text-[var(--foreground)]">{selectedTool}</span> está actualmente en mantenimiento.
              </p>

              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Estamos trabajando para mejorar esta funcionalidad. Vuelve pronto.
              </p>

              <button
                onClick={handleCloseModal}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
