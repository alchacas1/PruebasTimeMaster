'use client';
import React, { useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Trash2, Edit3, ArrowLeftCircle, Download, Image as ImageIcon, X, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import type { ScanHistoryProps as BaseScanHistoryProps, ScanHistoryEntry } from '../../types/barcode';
import { storage } from '@/config/firebase';
import { ref, listAll, getDownloadURL } from 'firebase/storage';

interface ScanHistoryProps extends BaseScanHistoryProps {
  notify?: (msg: string, color?: string) => void;
  onShowImages?: (code: string) => void;
}

interface ScanHistoryRowProps {
  entry: ScanHistoryEntry;
  idx: number;
  editingIdx: number | null;
  editValue: string;
  setEditingIdx: React.Dispatch<React.SetStateAction<number | null>>;
  setEditValue: React.Dispatch<React.SetStateAction<string>>;
  onRename?: (code: string, name: string) => void;
  onRemoveLeadingZero?: (code: string) => void;
  onCopy?: (code: string) => void;
  onDelete?: (code: string) => void;
  onShowImages?: (code: string) => void;
  notify?: (msg: string, color?: string) => void;
}

// Memoized row for performance
const ScanHistoryRow = memo(function ScanHistoryRow({
  entry,
  idx,
  editingIdx,
  editValue,
  setEditingIdx,
  setEditValue,
  onRename,
  onRemoveLeadingZero,
  onCopy,
  onDelete,
  onShowImages,
  notify,
}: ScanHistoryRowProps) {
  return (
    <div className="scan-history-row flex flex-col bg-[var(--card-bg)] dark:bg-[var(--card-bg)] rounded-2xl px-4 py-3 shadow-lg justify-between transition-all duration-300 w-full">
      <div className="flex flex-col items-start flex-1 min-w-0 w-full">
        {editingIdx === idx ? (
          <form
            onSubmit={e => {
              e.preventDefault();
              onRename?.(entry.code, editValue);
              setEditingIdx(null);
              notify?.('Nombre actualizado', 'indigo');
            }}
            className="w-full flex flex-col gap-1"
          >
            <input
              className="w-full px-2 py-2 rounded border text-base mb-2 bg-white/80 dark:bg-zinc-900/80 border-indigo-200 dark:border-indigo-800"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              autoFocus
              onBlur={() => setEditingIdx(null)}
              placeholder="Nombre personalizado"
            />
          </form>
        ) : (
          entry.name && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(entry.name || '');
                notify?.('¡Nombre copiado!', 'indigo');
              }}
              className="text-sm font-semibold text-indigo-600 dark:text-indigo-300 mb-1 truncate max-w-full uppercase hover:bg-indigo-100 dark:hover:bg-indigo-900/30 px-2 py-1 rounded transition-colors cursor-pointer"
              title="Clic para copiar nombre"
            >
              {entry.name.toUpperCase()}
            </button>
          )
        )}
        <span className="font-mono text-lg md:text-xl select-all text-left break-all text-indigo-900 dark:text-indigo-100 bg-white/70 dark:bg-zinc-800/70 px-3 py-2 rounded-lg shadow-sm whitespace-nowrap overflow-x-auto w-full max-w-full" style={{ letterSpacing: '0.10em', marginTop: '0.1rem', marginBottom: '0.1rem', display: 'block' }}>
          {entry.code}
        </span>
      </div>
      <div className="flex flex-row gap-2 mt-3 w-full justify-end">
        <button
          className="p-2 text-blue-500 hover:text-blue-700 bg-blue-100 dark:bg-blue-900 rounded-full border-none"
          title="Eliminar primer dígito"
          onClick={() => {
            onRemoveLeadingZero?.(entry.code);
            notify?.('Primer dígito eliminado', 'blue');
          }}
        >
          <ArrowLeftCircle className="w-6 h-6" />
        </button>
        <button
          className="p-2 text-indigo-500 hover:text-indigo-700 bg-indigo-100 dark:bg-indigo-900 rounded-full border-none"
          title="Agregar/Editar nombre"
          onClick={() => {
            setEditingIdx(idx);
            setEditValue(entry.name || '');
          }}
        >
          <Edit3 className="w-6 h-6" />
        </button>
        <button
          className="p-2 text-green-500 hover:text-green-700 bg-green-100 dark:bg-green-900 rounded-full border-none"
          title="Copiar código"
          onClick={() => {
            onCopy?.(entry.code);
            notify?.('¡Código copiado!', 'green');
          }}
        >
          <Copy className="w-6 h-6" />
        </button>
        {/* Image button - only show if code has images */}
        {entry.hasImages && (
          <button
            className="p-2 text-purple-500 hover:text-purple-700 bg-purple-100 dark:bg-purple-900 rounded-full border-none"
            title="Ver imágenes"
            onClick={() => {
              onShowImages?.(entry.code);
              notify?.('Abriendo imágenes', 'purple');
            }}
          >
            <ImageIcon className="w-6 h-6" />
          </button>
        )}
        <button
          className="p-2 text-red-500 hover:text-red-700 bg-red-100 dark:bg-red-900 rounded-full border-none"
          title="Eliminar código"
          onClick={() => {
            onDelete?.(entry.code);
            notify?.('Código eliminado', 'red');
          }}
        >
          <Trash2 className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
});

export default function ScanHistory({ history, onCopy, onDelete, onRemoveLeadingZero, onRename, onShowImages, notify }: ScanHistoryProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  // Estados para modal de imágenes
  const [showImagesModal, setShowImagesModal] = useState(false);
  const [currentImageCode, setCurrentImageCode] = useState<string>('');
  const [codeImages, setCodeImages] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);

  // Estados para modal de imagen individual
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>('');
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);

  // Memoized handlers for row actions
  const handleRename = useCallback((code: string, name: string) => {
    onRename?.(code, name);
    notify?.('Nombre actualizado', 'indigo');
  }, [onRename, notify]);
  const handleRemoveLeadingZero = useCallback((code: string) => {
    onRemoveLeadingZero?.(code);
    notify?.('Primer dígito eliminado', 'blue');
  }, [onRemoveLeadingZero, notify]);
  const handleCopy = useCallback((code: string) => {
    onCopy?.(code);
    notify?.('¡Código copiado!', 'green');
  }, [onCopy, notify]); const handleDelete = useCallback((code: string) => {
    onDelete?.(code);
    notify?.('Código e imágenes eliminados', 'red');
  }, [onDelete, notify]);

  // Function to load images for a specific barcode from Firebase Storage
  const loadImagesForCode = useCallback(async (barcodeCode: string) => {
    setLoadingImages(true);
    setImageLoadError(null);

    try {
      // Reference to the barcode-images folder
      const storageRef = ref(storage, 'barcode-images/');

      // List all files in the barcode-images folder
      const result = await listAll(storageRef);

      // Filter files that match the barcode pattern
      const matchingFiles = result.items.filter(item => {
        const fileName = item.name;
        // Match exact code name or code with numbers in parentheses
        return fileName === `${barcodeCode}.jpg` ||
          fileName.match(new RegExp(`^${barcodeCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\d+\\)\\.jpg$`));
      });

      // Get download URLs for matching files
      const imageUrls = await Promise.all(
        matchingFiles.map(async (fileRef) => {
          try {
            return await getDownloadURL(fileRef);
          } catch (error) {
            console.error(`Error getting download URL for ${fileRef.name}:`, error);
            return null;
          }
        })
      );

      // Filter out any failed downloads
      const validUrls = imageUrls.filter(url => url !== null) as string[];

      setCodeImages(validUrls);

      if (validUrls.length === 0) {
        setImageLoadError('No se encontraron imágenes para este código');
      }

    } catch (error) {
      console.error('Error loading images:', error);
      setImageLoadError('Error al cargar las imágenes');
      setCodeImages([]);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  // Function to handle showing images
  const handleShowImages = useCallback(async (barcodeCode: string) => {
    setCurrentImageCode(barcodeCode);
    setShowImagesModal(true);
    await loadImagesForCode(barcodeCode);
    onShowImages?.(barcodeCode);
  }, [loadImagesForCode, onShowImages]);

  // Function to close images modal
  const handleCloseImagesModal = useCallback(() => {
    setShowImagesModal(false);
    setCurrentImageCode('');
    setCodeImages([]);
    setImageLoadError(null);
  }, []);

  // Functions for individual image modal
  const handleOpenImageModal = useCallback((imageUrl: string, index: number) => {
    setSelectedImageUrl(imageUrl);
    setSelectedImageIndex(index);
    setShowImageModal(true);
  }, []);

  const handleCloseImageModal = useCallback(() => {
    setShowImageModal(false);
    setSelectedImageUrl('');
    setSelectedImageIndex(0);
  }, []);

  const handleNextImage = useCallback(() => {
    if (codeImages.length > 1) {
      const nextIndex = (selectedImageIndex + 1) % codeImages.length;
      setSelectedImageIndex(nextIndex);
      setSelectedImageUrl(codeImages[nextIndex]);
    }
  }, [codeImages, selectedImageIndex]);

  const handlePreviousImage = useCallback(() => {
    if (codeImages.length > 1) {
      const prevIndex = selectedImageIndex === 0 ? codeImages.length - 1 : selectedImageIndex - 1;
      setSelectedImageIndex(prevIndex);
      setSelectedImageUrl(codeImages[prevIndex]);
    }
  }, [codeImages, selectedImageIndex]);

  const handleExport = useCallback(() => {
    if (history.length === 0) {
      notify?.('No hay códigos para exportar', 'orange');
      return;
    }

    // Filtrar solo códigos que sean números
    const numericCodes = history
      .filter(entry => /^\d+$/.test(entry.code))
      .map(entry => entry.code);

    if (numericCodes.length === 0) {
      notify?.('No hay códigos numéricos para exportar', 'orange');
      return;
    } const jsonData = JSON.stringify(numericCodes, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'CODIGOS.json');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify?.(`${numericCodes.length} códigos numéricos exportados exitosamente`, 'green');
  }, [history, notify]);

  // Handle keyboard navigation for image modal
  React.useEffect(() => {
    if (!showImageModal) return;

    // Disable body scroll when modal is open
    document.body.style.overflow = 'hidden';

    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          handleCloseImageModal();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePreviousImage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNextImage();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      // Re-enable body scroll when modal is closed
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [showImageModal, handleCloseImageModal, handlePreviousImage, handleNextImage]);

  // Handle ESC key for main images modal
  React.useEffect(() => {
    if (!showImagesModal) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle ESC if individual image modal is not open
      if (e.key === 'Escape' && !showImageModal) {
        handleCloseImagesModal();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showImagesModal, showImageModal, handleCloseImagesModal]);

  if (history.length === 0) {
    return (
      <div className="p-4 rounded-lg shadow bg-[var(--card-bg)] text-[var(--tab-text)]">
        No hay escaneos aún
      </div>
    );
  }
  return (<div className="space-y-6 p-4 md:p-6 rounded-3xl shadow-2xl bg-[var(--card-bg)] dark:bg-[var(--card-bg)] border border-[var(--input-border)] scan-history-container backdrop-blur-xl w-full overflow-x-auto">
    <div className="flex items-center justify-between mb-6 md:mb-8">
      <h3 className="text-lg font-bold text-center flex-1 text-indigo-700 dark:text-indigo-200">Historial de Escaneos</h3>
      <div className="flex gap-2 ml-2">
        <button
          className="p-1 rounded-full bg-green-100 hover:bg-green-200 text-green-600 transition-colors w-8 h-8 flex items-center justify-center border border-green-200 dark:border-green-700"
          title="Exportar códigos"
          onClick={handleExport}
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          className="p-1 rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors w-8 h-8 flex items-center justify-center border border-red-200 dark:border-red-700"
          title="Limpiar historial"
          onClick={() => {
            if (window.confirm('¿Seguro que deseas borrar todo el historial de escaneos?')) {
              if (typeof onDelete === 'function') {
                history.forEach(entry => onDelete(entry.code));
              }
              notify?.('Historial borrado', 'red');
            }
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div >
    <div className="flex flex-col gap-4">
      {history.map((entry, idx) => (
        <ScanHistoryRow
          key={`${entry.code}-${idx}`}
          entry={entry}
          idx={idx}
          editingIdx={editingIdx}
          editValue={editValue}
          setEditingIdx={setEditingIdx}
          setEditValue={setEditValue}
          onRename={handleRename}
          onRemoveLeadingZero={handleRemoveLeadingZero}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onShowImages={handleShowImages}
          notify={notify}
        />
      ))}
    </div>

    {/* Images Modal */}
    {showImagesModal && (
      <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center p-4 z-50">
        <div className="bg-[var(--card-bg)] rounded-lg w-full h-full max-w-none max-h-none overflow-hidden flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
            <h3 className="text-xl font-semibold text-[var(--foreground)]">
              📷 Imágenes del Código
            </h3>
            <button
              onClick={handleCloseImagesModal}
              className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Current Code Display */}
          <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              Código: <span className="font-mono bg-[var(--input-bg)] px-3 py-1 rounded text-base">{currentImageCode}</span>
            </p>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-auto p-6">
            {loadingImages ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <span className="text-lg text-gray-600 dark:text-gray-300">Cargando imágenes...</span>
                </div>
              </div>
            ) : imageLoadError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg text-gray-600 dark:text-gray-300">{imageLoadError}</p>
                </div>
              </div>
            ) : codeImages.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 h-fit">
                {codeImages.map((imageUrl, index) => (
                  <div key={index} className="relative group">
                    <Image
                      src={imageUrl}
                      alt={`Imagen ${index + 1} del código ${currentImageCode}`}
                      width={400}
                      height={300}
                      className="w-full h-auto max-h-96 object-contain rounded-lg border border-gray-200 dark:border-gray-600 shadow-lg transition-transform group-hover:scale-105 cursor-pointer"
                      onClick={() => handleOpenImageModal(imageUrl, index)}
                      title="Clic para ver en pantalla completa"
                      onError={(e) => {
                        console.error(`Error loading image ${index + 1}:`, e);
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute top-3 left-3 bg-black bg-opacity-80 text-white px-3 py-1 rounded-full text-sm font-medium">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg text-gray-600 dark:text-gray-300">No hay imágenes disponibles</p>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-600 flex-shrink-0">
            <button
              onClick={handleCloseImagesModal}
              className="w-full bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 px-6 py-3 rounded-lg text-white font-medium text-lg transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Individual Image Modal - 90% Screen */}
    {showImageModal && typeof window !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center p-4 z-[9999]"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          isolation: 'isolate'
        }}
      >
        <div className="relative w-[90%] h-[90%] flex items-center justify-center">
          {/* Close Button */}
          <button
            onClick={handleCloseImageModal}
            className="absolute top-4 right-4 z-10 p-3 rounded-full bg-black bg-opacity-70 hover:bg-opacity-90 transition-all duration-200"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Image Counter */}
          {codeImages.length > 1 && (
            <div className="absolute top-4 left-4 z-10 px-4 py-2 rounded-full bg-black bg-opacity-70 text-white text-sm font-medium">
              {selectedImageIndex + 1} de {codeImages.length}
            </div>
          )}

          {/* Previous Button */}
          {codeImages.length > 1 && (
            <button
              onClick={handlePreviousImage}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 p-3 rounded-full bg-black bg-opacity-70 hover:bg-opacity-90 transition-all duration-200"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
          )}

          {/* Next Button */}
          {codeImages.length > 1 && (
            <button
              onClick={handleNextImage}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 p-3 rounded-full bg-black bg-opacity-70 hover:bg-opacity-90 transition-all duration-200"
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          )}

          {/* Main Image */}
          <Image
            src={selectedImageUrl}
            alt={`Imagen ${selectedImageIndex + 1} del código ${currentImageCode}`}
            width={1200}
            height={800}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onError={(e) => {
              console.error(`Error loading selected image:`, e);
            }}
          />

          {/* Image Info */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-black bg-opacity-70 text-white text-sm">
            Código: {currentImageCode} • Imagen {selectedImageIndex + 1} de {codeImages.length}
          </div>
        </div>
      </div>,
      document.body
    )}
  </div >
  );
}
