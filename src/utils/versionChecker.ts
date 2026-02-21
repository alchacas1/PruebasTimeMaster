import { db } from '@/config/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import versionData from '../data/version.json';

let updateTimeout: NodeJS.Timeout | null = null;
let unsubscribe: (() => void) | null = null;
let lastNotifiedVersion: string | null = null; // Guardar la última versión notificada
let initialVersion: string | null = null; // Versión inicial de la BD al cargar la página
const AUTO_RELOAD_DELAY = 5 * 60 * 1000; // 5 minutos

// Función para mostrar notificación de toast
const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 0) => {
  // Crear contenedor de toast si no existe
  let toastContainer = document.querySelector('.version-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'version-toast-container';
    toastContainer.setAttribute('style', 'position: fixed; top: 20px; right: 20px; z-index: 9999;');
    document.body.appendChild(toastContainer);
  }

  // Crear toast
  const toast = document.createElement('div');
  toast.className = `version-toast ${type}`;
  toast.setAttribute('style', `
    background: white;
    border-left: 4px solid ${type === 'info' ? '#3b82f6' : '#10b981'};
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 10px;
    max-width: 400px;
    animation: slideIn 0.3s ease;
  `);

  toast.innerHTML = `
    <div style="display: flex; gap: 12px; align-items: start;">
      <div style="font-size: 20px;">${type === 'info' ? '🔄' : '✓'}</div>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px; color: #1f2937;">Nueva versión disponible</div>
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 12px;">${message}</div>
        <div style="display: flex; gap: 8px;">
          <button id="update-now-btn" style="
            background: #3b82f6;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">Actualizar Ahora</button>
        </div>
      </div>
      <button id="close-btn" style="
        background: none;
        border: none;
        font-size: 20px;
        color: #9ca3af;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      ">×</button>
    </div>
  `;

  // Agregar estilos de animación si no existen
  if (!document.querySelector('#version-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'version-toast-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .version-toast button:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
    `;
    document.head.appendChild(style);
  }

  toastContainer.appendChild(toast);

  // Event listeners para los botones
  const updateBtn = toast.querySelector('#update-now-btn');
  const closeBtn = toast.querySelector('#close-btn');

  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      window.location.reload();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      toast.remove();
    });
  }

  // Auto-cerrar si se especifica duración
  if (duration > 0) {
    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  return toast;
};

export const startVersionCheck = async () => {
  // Primero, obtener la versión inicial de la BD
  const versionRef = doc(db, 'version', 'current');
  
  try {
    const docSnap = await getDoc(versionRef);
    if (docSnap.exists()) {
      initialVersion = docSnap.data().version;
      console.log('Versión inicial de la BD:', initialVersion);
    } else {
      // Si no existe, usar la versión del JSON como fallback
      initialVersion = versionData.version;
      console.log('No se encontró versión en BD, usando versión local:', initialVersion);
    }
  } catch (error) {
    console.error('Error obteniendo versión inicial:', error);
    initialVersion = versionData.version;
  }
  
  // Ahora escuchar cambios en tiempo real
  unsubscribe = onSnapshot(
    versionRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const serverVersion = docSnap.data().version;
        
        console.log('Versión inicial:', initialVersion);
        console.log('Versión servidor actual:', serverVersion);
        
        // Solo mostrar notificación si:
        // 1. La versión del servidor es diferente a la versión inicial de esta sesión
        // 2. No hemos notificado esta versión antes
        if (initialVersion && serverVersion !== initialVersion && serverVersion !== lastNotifiedVersion) {
          showUpdateNotification(serverVersion);
        }
      } else {
        console.warn('No se encontró el documento de versión en Firestore');
      }
    },
    (error) => {
      console.error('Error escuchando cambios de versión:', error);
    }
  );
};

const showUpdateNotification = (newVersion: string) => {
  // Cancelar timeout anterior si existe
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  // Guardar la versión notificada
  lastNotifiedVersion = newVersion;

  showToast(
    `Se ha detectado una nueva versión (${newVersion}). La página se actualizará automáticamente en 5 minutos.`,
    'info'
  );

  // Programar recarga automática después de 5 minutos
  updateTimeout = setTimeout(() => {
    showToast(
      'La aplicación se está actualizando...',
      'info',
      2000
    );
    
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  }, AUTO_RELOAD_DELAY);
};

// Función para detener la verificación
export const stopVersionCheck = () => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }

  // Resetear la última versión notificada y la versión inicial
  lastNotifiedVersion = null;
  initialVersion = null;
};
