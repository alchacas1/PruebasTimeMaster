'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { QrCode, Smartphone, Check, AlertCircle, Camera, Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { ScanningService } from '../../services/scanning';
import { useAuth } from '../../hooks/useAuth';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { CameraScanner } from '../../components/scanner';
import { storage } from '@/config/firebase';
import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';

// Force dynamic rendering for this page
export const dynamic = 'force-dynamic';

function MobileScanContent() {
  const [success, setSuccess] = useState<string | null>(null);


  // ...otros estados...




  // ...otros estados...




  // Funciones para navegación de imágenes en el modal (deben ir después de los estados relacionados)
  // Estas funciones deben ir después de la declaración de los estados codeImages y selectedImageIndex
  const { user } = useAuth();
  const searchParams = useSearchParams();
  // sessionId eliminado
  const requestProductNameParam = searchParams.get('requestProductName');
  const rpnParam = searchParams.get('rpn');

  const [code, setCode] = useState('');
  const [lastScanned, setLastScanned] = useState<{ code: string, productName?: string, ownercompanie?: string, hasImages?: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Eliminado: const [isOnline, setIsOnline] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [requestProductName, setRequestProductName] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingCode, setPendingCode] = useState<string>(''); const [productName, setProductName] = useState('');
  const [uploadedImagesCount, setUploadedImagesCount] = useState(0);
  // Numeric-only code extracted from photo (to be saved in DB as codeBU)
  const [pendingCodeBU, setPendingCodeBU] = useState<string | null>(null);
  // Flag to avoid showing codes detected from still images in the UI
  const [isDecodingImage, setIsDecodingImage] = useState(false);

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

  // Funciones para navegación de imágenes en el modal
  const handleNextImage = useCallback(() => {
    if (codeImages.length > 1) {
      setSelectedImageIndex((prev) => {
        const nextIndex = (prev + 1) % codeImages.length;
        setSelectedImageUrl(codeImages[nextIndex]);
        return nextIndex;
      });
    }
  }, [codeImages]);

  const handlePreviousImage = useCallback(() => {
    if (codeImages.length > 1) {
      setSelectedImageIndex((prev) => {
        const prevIndex = prev === 0 ? codeImages.length - 1 : prev - 1;
        setSelectedImageUrl(codeImages[prevIndex]);
        return prevIndex;
      });
    }
  }, [codeImages]);

  const {
    code: detectedCode,
    error: scannerError,
    cameraActive,
    liveStreamRef,
    toggleCamera, handleClear: clearScanner,
    handleCopyCode,
    detectionMethod,
  } = useBarcodeScanner((foundCode) => {
    // Only submit codes detected by the main camera scanner
    submitCode(foundCode);
  });
  // Check if we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Set requestProductName from URL parameter or rpn=t
  useEffect(() => {
    if (requestProductNameParam === 'true' || rpnParam === 't') {
      setRequestProductName(true);
    }
  }, [requestProductNameParam, rpnParam]);

  // Handle code parameter from URL (for direct barcode codes, not encoded sessions)
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam && isClient) {
      submitCode(codeParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isClient]);

  // Eliminado: lógica de estado online

  // Efecto para inicializar y mantener la sincronización de sesión
  // Eliminado: efecto de sincronización de sesión

  // Function to load images for a specific barcode from Firebase Storage
  const loadImagesForCode = useCallback(async (barcodeCode: string) => {
    setLoadingImages(true);
    setImageLoadError(null);
    try {
      const imagesRef = ref(storage, `barcode-images/`);
      const result = await listAll(imagesRef);
      const imageFiles = result.items.filter(item => item.name.startsWith(barcodeCode));
      const urls = await Promise.all(imageFiles.map(item => getDownloadURL(item)));
      setCodeImages(urls);
      setCurrentImageCode(barcodeCode);
      setShowImagesModal(true);
    } catch {
      setImageLoadError('No se pudieron cargar las imágenes.');
      setCodeImages([]);
    } finally {
      setLoadingImages(false);
    }
  }, []);

  // Función para mostrar imágenes de un código
  const handleShowImages = useCallback((barcodeCode: string) => {
    loadImagesForCode(barcodeCode);
  }, [loadImagesForCode]);

  // Función para abrir el modal de imagen individual
  const handleOpenImageModal = useCallback((imageUrl: string, index: number) => {
    setSelectedImageUrl(imageUrl);
    setSelectedImageIndex(index);
    setShowImageModal(true);
  }, []);

  // Función para cerrar el modal de imagen individual
  const handleCloseImageModal = useCallback(() => {
    setShowImageModal(false);
    setSelectedImageUrl('');
    setSelectedImageIndex(0);
  }, []);

  // Función para cerrar el modal de imágenes
  const handleCloseImagesModal = useCallback(() => {
    setShowImagesModal(false);
    setCodeImages([]);
    setCurrentImageCode('');
  }, []);

  // Función para verificar si un código tiene imágenes
  const checkCodeHasImages = useCallback(async (barcodeCode: string) => {
    try {
      const imagesRef = ref(storage, `barcode-images/`);
      const result = await listAll(imagesRef);
      return result.items.some(item => item.name.startsWith(barcodeCode));
    } catch {
      return false;
    }
  }, []);

  // Handle ESC key for main images modal
  useEffect(() => {
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

  // Camera capture function for uploading images
  // Allows users to take photos and upload them to Firebase Storage
  // Images are named with the barcode code and consecutive numbers if multiple images are taken
  const handleCameraCapture = useCallback(async () => {
    const codeToUse = pendingCode || code;
    if (!codeToUse.trim()) {
      setError('Ingresa un código antes de tomar una foto');
      return;
    }

    try {
      // Create input element for camera capture
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Use back camera on mobile

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          setError(null);
          setIsDecodingImage(true);

          // Generate filename with consecutive number
          const baseFileName = codeToUse.trim();
          const fileName = uploadedImagesCount === 0
            ? `${baseFileName}.jpg`
            : `${baseFileName}(${uploadedImagesCount + 1}).jpg`;

          // Create Firebase storage reference
          const storageRef = ref(storage, `barcode-images/${fileName}`);

          // Try to detect a barcode inside the taken photo using an isolated detection
          // This function is completely separate from the main scanner to avoid UI interference
          const detectedFromPhoto: string | null = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (ev) => {
              try {
                const dataUrl = ev.target?.result as string;

                // Create isolated image processing without affecting main scanner state
                const img = new window.Image();
                img.crossOrigin = 'anonymous';

                img.onload = async () => {
                  try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                      resolve(null);
                      return;
                    }

                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                    // Use ZBar for isolated detection
                    const { scanImageData } = await import('@undecaf/zbar-wasm');
                    const symbols = await scanImageData(imageData);

                    if (symbols && symbols.length > 0) {
                      const code = symbols[0].decode();
                      resolve(code || null);
                    } else {
                      resolve(null);
                    }
                  } catch {
                    resolve(null);
                  }
                };

                img.onerror = () => resolve(null);
                img.src = dataUrl;
              } catch {
                resolve(null);
              }
            };

            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          });

          // Only keep numeric-only value for codeBU, but ignore codes starting with "BASIC"
          // Only update if there's no previous codeBU (first valid image wins)
          const numericCodeBU = detectedFromPhoto &&
            !detectedFromPhoto.startsWith('BASIC') &&
            /^\d+$/.test(detectedFromPhoto)
            ? detectedFromPhoto
            : null;
          if (numericCodeBU && !pendingCodeBU) {
            setPendingCodeBU(numericCodeBU);
          }

          // Upload file to Firebase Storage
          await uploadBytes(storageRef, file, {
            contentType: file.type,
            ...(numericCodeBU ? { customMetadata: { codeBU: numericCodeBU } } : {})
          });

          // Get download URL (optional, for verification)
          const downloadURL = await getDownloadURL(storageRef);

          // Update images count
          setUploadedImagesCount(prev => prev + 1);

          setSuccess(`Imagen ${uploadedImagesCount + 1} subida correctamente`);
          setTimeout(() => setSuccess(null), 2000);

        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
          setError('Error al subir la imagen. Inténtalo de nuevo.');
        } finally {
          // Clean state after image processing
          setIsDecodingImage(false);
        }
      };

      // Trigger file selection
      input.click();

    } catch (error) {
      console.error('Error setting up camera capture:', error);
      setError('Error al acceder a la cámara');
    }
  }, [pendingCode, code, uploadedImagesCount, pendingCodeBU]);

  // Submit scanned code
  const submitCode = useCallback(async (scannedCode: string, nameForProduct?: string) => {
    if (!scannedCode.trim()) {
      setError('Código vacío');
      return;
    }

    // Check if already scanned recently
    if (lastScanned.some(scan => scan.code === scannedCode)) {
      setError('Este código ya fue escaneado recientemente');
      return;
    }



    // If requestProductName is enabled and no name provided, show modal
    if (requestProductName && !nameForProduct?.trim()) {
      setPendingCode(scannedCode);
      setShowNameModal(true);
      return;
    }

    // Usar siempre la empresa asignada del usuario logado
    const ownercompanieToSend = user?.ownercompanie ?? undefined;

    try {
      setError(null);
      // Create scan object without undefined values
      const scanData = {
        code: scannedCode,
        source: 'mobile' as const,
        userName: 'Móvil',
        processed: false,
        // sessionId eliminado
        ...(nameForProduct?.trim() && { productName: nameForProduct.trim() }),
        ...(ownercompanieToSend && { ownercompanie: ownercompanieToSend }),
        ...(pendingCodeBU && /^\d+$/.test(pendingCodeBU) && { codeBU: pendingCodeBU })
      };

      // Enviar al servicio de scanning y también a localStorage para sincronización con PC
      await ScanningService.addScan(scanData);

      // También guardar en localStorage para comunicación con PC
      // sessionId eliminado de localStorage

      // Create success message including location if present
      let message = `Código ${scannedCode}`;
      if (nameForProduct?.trim()) {
        message += ` (${nameForProduct.trim()})`;
      }
      if (ownercompanieToSend) {
        message += ` [${ownercompanieToSend}]`;
      }
      message += ' enviado correctamente';

      setSuccess(message);

      // Check if code has images and update lastScanned
      const hasImages = await checkCodeHasImages(scannedCode);
      setLastScanned(prev => [...prev.slice(-4), {
        code: scannedCode,
        ...(nameForProduct?.trim() && { productName: nameForProduct.trim() }),
        ...(ownercompanieToSend && { ownercompanie: ownercompanieToSend }),
        hasImages
      }]); // Keep last 5
      setCode('');
      setUploadedImagesCount(0); // Reset images count after successful submission
      setPendingCodeBU(null); // Reset pending codeBU after submit
      // Clear success message after 2 seconds
      setTimeout(() => setSuccess(null), 2000);
    } catch (error) {
      console.error('Error submitting code:', error);
      setError('Error al enviar el código. Inténtalo de nuevo.');
    }
  }, [lastScanned, requestProductName, user, checkCodeHasImages, pendingCodeBU]);
  // Handler para eliminar primer dígito
  const handleRemoveLeadingZero = useCallback(() => {
    if (detectedCode && detectedCode.length > 1 && detectedCode[0] === '0') {
      const newCode = detectedCode.slice(1);
      submitCode(newCode);
    }
  }, [detectedCode, submitCode]);  // Handle name modal submission
  const handleNameSubmit = useCallback(() => {
    if (pendingCode) {
      const trimmedName = productName.trim();
      submitCode(pendingCode, trimmedName || '');
      setShowNameModal(false);
      setPendingCode('');
      setProductName('');
    }
  }, [pendingCode, productName, submitCode]);

  // Handle name modal cancel
  const handleNameCancel = useCallback(() => {
    setShowNameModal(false);
    setPendingCode('');
    setProductName('');
  }, []);

  // Handle ESC key to close image modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedImageUrl) {
        handleCloseImageModal();
      }
    };

    if (selectedImageUrl) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [selectedImageUrl, handleCloseImageModal]);

  // Handle ESC key to close name modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showNameModal) {
        handleNameCancel();
      }
    };

    if (showNameModal) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showNameModal, handleNameCancel]);

  // Effect to check if existing codes in history have images
  useEffect(() => {
    if (!isClient || lastScanned.length === 0) return;

    const updateHistoryWithImages = async () => {
      const updatedScans = await Promise.all(
        lastScanned.map(async (scan) => {
          if (scan.hasImages === undefined) {
            const hasImages = await checkCodeHasImages(scan.code);
            return { ...scan, hasImages };
          }
          return scan;
        })
      );

      // Only update if there are changes
      const hasChanges = updatedScans.some((scan, index) =>
        scan.hasImages !== lastScanned[index]?.hasImages
      );

      if (hasChanges) {
        setLastScanned(updatedScans);
      }
    };

    updateHistoryWithImages();
  }, [isClient, checkCodeHasImages, lastScanned]); // Added lastScanned back as dependency

  // Handle manual code input
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCode(code);
  };

  // Reset uploaded images count when code changes
  useEffect(() => {
    setUploadedImagesCount(0);
  }, [code, pendingCode]);
  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Smartphone className="w-6 h-6 text-blue-400" />
          <h1 className="text-xl font-bold">Escáner Móvil</h1>
        </div>
        <div className="flex items-center gap-4"></div>
      </div>
      {/* Status Messages */}
      {(error || (cameraActive && !isDecodingImage && scannerError)) && (
        <div className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-600 rounded-lg p-3 mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-red-800 dark:text-red-200">{error || (cameraActive && !isDecodingImage ? scannerError : null)}</span>
        </div>
      )}
      {success && (
        <div className="bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-600 rounded-lg p-3 mb-4 flex items-center gap-2">
          <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          <span className="text-green-800 dark:text-green-200">{success}</span>
        </div>
      )}
      <div className="mb-6">
        <div className="bg-card-bg rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Escanear con Cámara</h2>
          </div>
          {/* Usar CameraScanner component */}
          {isClient && (
            <CameraScanner
              code={cameraActive && !isDecodingImage ? detectedCode : null}
              error={cameraActive && !isDecodingImage ? scannerError : null}
              detectionMethod={detectionMethod}
              cameraActive={cameraActive}
              liveStreamRef={liveStreamRef}
              toggleCamera={toggleCamera}
              handleClear={clearScanner}
              handleCopyCode={handleCopyCode}
              onRemoveLeadingZero={handleRemoveLeadingZero}
            />
          )}
          {/* Show loading message on server-side */}
          {!isClient && (
            <div className="relative bg-gray-900 dark:bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <QrCode className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">Cargando...</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="bg-card-bg rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4">Introducir Código Manualmente</h2>
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ingresa el código de barras"
            className="w-full bg-input-bg border border-input-border rounded-lg px-4 py-3 text-foreground placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-3 rounded-lg text-white font-semibold flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Enviar Código
          </button>
        </form>
      </div>
      {lastScanned.length > 0 && (
        <div className="bg-card-bg rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Códigos Enviados Recientemente</h2>
          <div className="space-y-2">
            {lastScanned.slice().reverse().map((scan, index) => (
              <div key={index} className="bg-input-bg rounded px-3 py-2 flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500 dark:text-green-400" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-mono text-sm">{scan.code}</span>
                  {scan.productName && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 truncate">
                      📝 {scan.productName}
                    </span>
                  )}
                </div>
                {/* Image icon - only show if code has images */}
                {scan.hasImages && (
                  <button
                    onClick={() => handleShowImages(scan.code)}
                    className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    title="Ver imágenes"
                  >
                    <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Product Name Modal */}
      {
        showNameModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-card-bg rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4 text-foreground">
                {requestProductName ? 'Nombre del Producto (Requerido)' : 'Nombre del Producto (Opcional)'}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
                Código: <span className="font-mono bg-input-bg px-2 py-1 rounded">{pendingCode}</span>
              </p>

              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder={requestProductName ? "Ingresa el nombre del producto (requerido)" : "Ingresa el nombre del producto (opcional)"}
                className="w-full bg-input-bg border border-input-border rounded-lg px-4 py-3 text-foreground placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (!requestProductName || productName.trim()) && !isDecodingImage) {
                    handleNameSubmit();
                  } else if (e.key === 'Escape') {
                    handleNameCancel();
                  }
                }}
              />

              {/* Camera Capture Button */}
              <button
                type="button"
                onClick={handleCameraCapture}
                // isOnline eliminado, botón siempre habilitado
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-3 rounded-lg text-white font-semibold flex items-center justify-center gap-2 mb-4"
              >
                <Camera className="w-4 h-4" />
                Agregar Imagen
              </button>

              {/* Images count display */}
              {uploadedImagesCount > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800 mb-4">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-blue-800 dark:text-blue-200 text-sm">
                      Se {uploadedImagesCount === 1 ? 'agregó' : 'agregaron'} {uploadedImagesCount} imagen{uploadedImagesCount > 1 ? 'es' : ''}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleNameCancel}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 px-4 py-2 rounded-lg text-white font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleNameSubmit}
                  disabled={(requestProductName && !productName.trim()) || isDecodingImage}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-white font-medium"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Images Modal */}
      {
        showImagesModal && (
          <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center p-4 z-50">
            <div className="bg-card-bg rounded-lg w-full h-full max-w-none max-h-none overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
                <h3 className="text-xl font-semibold text-foreground">
                  📷 Imágenes del Código
                </h3>
                <button
                  onClick={handleCloseImagesModal}
                  className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Cerrar modal"
                >
                  <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {/* Current Code Display */}
              <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Código: <span className="font-mono bg-input-bg px-3 py-1 rounded text-base">{currentImageCode}</span>
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
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 h-fit">
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
        )
      }

      {/* Individual Image Modal - 90% Screen */}
      {showImageModal && (
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
              Código: {currentImageCode}
            </div>
          </div>
        </div>
      )}
      {/* Footer info */}
      <div className="mt-6 text-center text-gray-500 dark:text-gray-400 text-sm">
        <p>Asegúrate de que tu PC esté conectado a la misma red</p>
        <p>Los códigos aparecerán automáticamente en tu computadora</p>
      </div>
    </div>
  );
}

export default function MobileScanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto mb-4"></div>
          <p>Cargando escáner...</p>
        </div>
      </div>
    }>
      <MobileScanContent />
    </Suspense>
  );
}
