"use client";

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { SolicitudesService } from "@/services/solicitudes";
import CameraScanner from "../scanner/CameraScanner";
import { useBarcodeScanner } from "../../hooks/useBarcodeScanner";
import { ScanningService } from "@/services/scanning";
import { storage } from "@/config/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  // keep onSave optional for API compatibility, but unused here
  onSave?: (payload: {
    title: string;
    description: string;
  }) => Promise<void> | void;
}

export default function NotificationModal({
  isOpen,
  onClose,
}: NotificationModalProps) {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedSolicitud, setSelectedSolicitud] = useState<any>(null);
  const [scannedCode, setScannedCode] = useState<string>("");
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [uploadedImagesCount, setUploadedImagesCount] = useState<number>(0);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string>("");
  const [manualCodeError, setManualCodeError] = useState<string | null>(null);
  const manualOverrideRef = useRef(false);

  const {
    code: detectedCode,
    error: scannerError,
    cameraActive,
    liveStreamRef,
    toggleCamera,
    handleClear: clearScanner,
    handleCopyCode,
    detectionMethod,
  } = useBarcodeScanner((foundCode) => {
    // If user submitted a manual code, ignore auto-detections.
    if (manualOverrideRef.current) return;
    setScannedCode(foundCode);
    setShowScanner(false);
    setShowVerificationModal(true);
  });

  useEffect(() => {
    if (!showScanner) return;
    // Reset manual override each time scanner opens.
    manualOverrideRef.current = false;
    setManualCode("");
    setManualCodeError(null);
  }, [showScanner]);

  useEffect(() => {
    if (!isOpen) return;

    const load = async () => {
      setLoading(true);
      try {
        const company =
          (user as any)?.ownercompanie || (user as any)?.ownerCompanie || "";
        if (!company) {
          setSolicitudes([]);
          return;
        }
        const rows = await SolicitudesService.getSolicitudesByEmpresa(
          company,
          200
        );
        // Only show solicitudes that are not marked 'listo'
        const visible = (rows || []).filter((r: any) => !r?.listo);
        setSolicitudes(visible);
      } catch (err) {
        console.error("Error loading solicitudes for notification modal:", err);
        setSolicitudes([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isOpen, user]);

  useEffect(() => {
    if (!showVerificationModal || !scannedCode?.trim()) return;

    setUploadError(null);
    setNotes("");

    let cancelled = false;

    const loadExistingImageCount = async () => {
      try {
        const count = await ScanningService.getImageCountForCode(
          scannedCode.trim()
        );
        if (!cancelled) setUploadedImagesCount(count);
      } catch {
        if (!cancelled) setUploadedImagesCount(0);
      }
    };

    loadExistingImageCount();
    return () => {
      cancelled = true;
    };
  }, [showVerificationModal, scannedCode]);

  const handleAddImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!scannedCode?.trim()) {
      setUploadError("No hay código para asociar la imagen.");
      return;
    }

    setUploadError(null);
    setUploadingImages(true);

    const codeToUse = scannedCode.trim();

    try {
      // Ensure we start from current known count to avoid overwriting.
      let nextIndex = uploadedImagesCount;

      for (const file of Array.from(files)) {
        const fileName =
          nextIndex === 0
            ? `${codeToUse}.jpg`
            : `${codeToUse}(${nextIndex + 1}).jpg`;
        const storageRef = ref(storage, `barcode-images/${fileName}`);

        await uploadBytes(storageRef, file, {
          contentType: file.type || "image/jpeg",
        });

        // Touch download URL so upload is verifiably complete; ignore value.
        await getDownloadURL(storageRef);

        nextIndex += 1;
        setUploadedImagesCount(nextIndex);
      }
    } catch (err) {
      console.error("Error uploading images:", err);
      setUploadError("Error al subir la imagen. Inténtalo de nuevo.");
    } finally {
      setUploadingImages(false);
    }
  };

  const submitManualCode = () => {
    const codeToSend = manualCode.trim();
    if (!codeToSend) {
      setManualCodeError("Ingresa un código.");
      return;
    }

    manualOverrideRef.current = true;
    setManualCodeError(null);

    try {
      // Stop/clear scanner to avoid background detections overriding manual input.
      if (cameraActive) {
        toggleCamera();
      }
      clearScanner();
    } catch {
      // ignore
    }

    setScannedCode(codeToSend);
    setShowScanner(false);
    setShowVerificationModal(true);
  };

  if (!isOpen) return null;

  const formatDate = (v: any) => {
    try {
      if (!v) return "";
      const d = v.seconds ? new Date(v.seconds * 1000) : new Date(v);
      return d.toLocaleString();
    } catch {
      return "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      {showScanner ? (
        <div className="bg-[var(--background)] rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Escanear Código para{" "}
                {selectedSolicitud?.productName || "Producto"}
              </h2>
              <button
                onClick={() => {
                  setShowScanner(false);
                  setSelectedSolicitud(null);
                }}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label="Cerrar escáner"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <CameraScanner
              code={detectedCode}
              error={scannerError}
              detectionMethod={detectionMethod}
              cameraActive={cameraActive}
              liveStreamRef={liveStreamRef}
              toggleCamera={toggleCamera}
              handleClear={clearScanner}
              handleCopyCode={handleCopyCode}
              onRemoveLeadingZero={() => { }}
            />

            <div className="mt-4 pt-4 border-t border-[var(--input-border)]">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Agregar código manualmente
              </label>
              <div className="flex gap-2">
                <input
                  value={manualCode}
                  onChange={(e) => {
                    setManualCode(e.target.value);
                    if (manualCodeError) setManualCodeError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitManualCode();
                    }
                  }}
                  placeholder="Escribe o pega el código"
                  className="flex-1 px-3 py-2 rounded border border-[var(--input-border)] bg-[var(--card-bg)] text-[var(--foreground)]"
                />
                <button
                  type="button"
                  onClick={submitManualCode}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Agregar
                </button>
              </div>
              {manualCodeError ? (
                <div className="mt-2 text-sm text-red-600">{manualCodeError}</div>
              ) : (
                <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                  El código manual tiene prioridad sobre el escaneado.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : showVerificationModal ? (
        <div className="bg-[var(--background)] rounded-lg shadow-xl w-full sm:max-w-md">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
              Verificar Código Escaneado
            </h2>
            <div className="mb-4">
              <p className="text-[var(--foreground)]">
                <strong>Producto:</strong>{" "}
                {selectedSolicitud?.productName || "Sin nombre"}
              </p>
              <p className="text-[var(--foreground)]">
                <strong>Código:</strong> {scannedCode}
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Notas (opcional)
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: caja dañada, falta etiqueta, etc."
                className="w-full px-3 py-2 rounded border border-[var(--input-border)] bg-[var(--card-bg)] text-[var(--foreground)]"
              />
              {notes.trim() ? (
                <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Se enviará como parte del nombre del producto.
                </div>
              ) : null}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-[var(--foreground)]">
                  Imágenes: <span className="font-semibold">{uploadedImagesCount}</span>
                </div>

                <label className={`px-3 py-2 rounded text-sm text-white ${uploadingImages ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"} cursor-pointer`}>
                  {uploadingImages ? "Subiendo..." : "Agregar imagen"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    disabled={uploadingImages}
                    onChange={(e) => {
                      void handleAddImages(e.target.files);
                      // Allow selecting the same file again
                      e.currentTarget.value = "";
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              {uploadError ? (
                <div className="mt-2 text-sm text-red-600">{uploadError}</div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowVerificationModal(false);
                  setSelectedSolicitud(null);
                  setScannedCode("");
                  setNotes("");
                  setUploadedImagesCount(0);
                  setUploadError(null);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                disabled={uploadingImages}
                onClick={async () => {
                  try {
                    if (uploadingImages) return;
                    const baseName = selectedSolicitud?.productName || "";
                    const trimmedNotes = notes.trim();
                    const productNameToSend = trimmedNotes
                      ? (baseName ? `${baseName} - ${trimmedNotes}` : trimmedNotes)
                      : baseName;

                    await ScanningService.addScan({
                      code: scannedCode,
                      productName: productNameToSend,
                      source: "web",
                      userName: user?.name || "Usuario",
                      processed: false,
                      ownercompanie: user?.ownercompanie,
                    });
                    // Mark the solicitud as listo
                    await SolicitudesService.setListo(
                      selectedSolicitud.id,
                      true
                    );
                    // Remove from local list
                    setSolicitudes((prev) =>
                      prev.filter((s) => s.id !== selectedSolicitud.id)
                    );
                    // Close modal and reset states
                    setShowVerificationModal(false);
                    setSelectedSolicitud(null);
                    setScannedCode("");
                    setNotes("");
                    setUploadedImagesCount(0);
                    setUploadError(null);
                  } catch (err) {
                    console.error("Error enviando código:", err);
                  }
                }}
                className={`px-4 py-2 text-white rounded ${uploadingImages ? "bg-gray-400 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"}`}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--background)] rounded-lg shadow-xl w-full sm:max-w-md md:max-w-lg max-h-[80vh] overflow-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Solicitudes de tu empresa
              </h2>
              <button
                onClick={onClose}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loading ? (
              <div className="text-[var(--muted-foreground)]">
                Cargando solicitudes...
              </div>
            ) : !user ? (
              <div className="text-[var(--muted-foreground)]">
                Inicia sesión para ver las solicitudes.
              </div>
            ) : solicitudes.length === 0 ? (
              <div className="p-4 bg-[var(--card-bg)] border border-[var(--input-border)] rounded">
                No hay solicitudes para {user.ownercompanie || "tu empresa"}.
              </div>
            ) : (
              <div className="space-y-3">
                {solicitudes.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 border border-[var(--input-border)] rounded bg-[var(--card-bg)]"
                  >
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                        <div className="font-semibold text-[var(--foreground)] break-words">
                          {s.productName || s.name || "Sin nombre"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {formatDate(s.createdAt)}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedSolicitud(s);
                            setShowScanner(true);
                          }}
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                        >
                          Abrir Escáner
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[var(--hover-bg)] text-[var(--foreground)] rounded hover:bg-[var(--muted)]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
