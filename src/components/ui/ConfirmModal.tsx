import React from "react";
import { CheckCircle2, Trash2, AlertTriangle, XCircle } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  actionType?: "assign" | "delete" | "change";
  // If true, render a single button that calls onCancel. Useful for informational modals.
  singleButton?: boolean;
  singleButtonText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = "Confirmar acción",
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  loading = false,
  onConfirm,
  onCancel,
  actionType = "assign",
  singleButton = false,
  singleButtonText,
}) => {
  if (!open) return null;

  let icon = <CheckCircle2 className="h-5 w-5 text-[var(--foreground)]" />;
  let confirmIcon = (
    <CheckCircle2 className="h-4 w-4 text-[var(--foreground)]" />
  );
  const cancelIcon = <XCircle className="h-4 w-4 text-[var(--foreground)]" />;
  if (actionType === "delete") {
    icon = <Trash2 className="h-5 w-5 text-[var(--foreground)]" />;
    confirmIcon = <Trash2 className="h-4 w-4 text-[var(--foreground)]" />;
  }
  if (actionType === "change") {
    icon = <AlertTriangle className="h-5 w-5 text-[var(--foreground)]" />;
    confirmIcon = (
      <AlertTriangle className="h-4 w-4 text-[var(--foreground)]" />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 dark:bg-black/80"
      style={{ pointerEvents: "auto" }}
      onClick={e => e.stopPropagation()}
    >
      <div
        className="bg-[var(--card-bg)] text-[var(--foreground)] rounded-lg shadow-2xl p-4 sm:p-6 w-full max-w-xs sm:max-w-sm border border-[var(--input-border)] flex flex-col items-center mx-2 relative"
        style={{ zIndex: 100000 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col sm:flex-row items-center gap-2 mb-2 justify-center w-full">
          <span className="flex-shrink-0 flex items-center justify-center mb-1 sm:mb-0">
            {icon}
          </span>
          <h2 className="text-lg font-bold text-center w-full">{title}</h2>
        </div>
        <div className="mb-4 text-sm sm:text-base text-center w-full break-words whitespace-pre-line">
          {message}
        </div>
        <div className="flex flex-col sm:flex-row justify-center gap-2 mt-4 w-full">
          {/** Single-button informational modal */}
          {singleButton ? (
            <button
              className="px-4 py-2 rounded bg-[var(--button-bg)] text-[var(--button-text)] hover:bg-[var(--button-hover)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 justify-center w-full sm:w-auto"
              onClick={onCancel}
              disabled={loading}
              type="button"
            >
              {cancelIcon}
              {singleButtonText || "Cerrar"}
            </button>
          ) : (
            <>
              <button
                className="px-4 py-2 rounded bg-[var(--button-bg)] text-[var(--button-text)] hover:bg-[var(--button-hover)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 justify-center w-full sm:w-auto"
                onClick={onCancel}
                disabled={loading}
                type="button"
              >
                {cancelIcon}
                {cancelText}
              </button>
              <button
                className={`px-4 py-2 rounded text-white flex items-center gap-2 justify-center w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed ${
                  actionType === "delete"
                    ? "bg-red-600 hover:bg-red-700"
                    : actionType === "change"
                    ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
                onClick={onConfirm}
                disabled={loading}
                type="button"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-4 w-4 mr-1 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                ) : (
                  confirmIcon
                )}
                {confirmText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
