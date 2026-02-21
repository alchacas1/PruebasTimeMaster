"use client";

import React, { useState, useEffect } from "react";
import { Lock, User, Eye, EyeOff, Check, X, AlertCircle } from "lucide-react";
import type { User as UserType } from "@/types/firestore";
import { PasswordRecoveryModal } from "./PasswordRecoveryModal";
import Image from "next/image";
import { useVersion } from "@/hooks/useVersion";

interface LoginModalProps {
  isOpen: boolean;
  onLoginSuccess: (
    user: UserType,
    keepActive?: boolean,
    useTokens?: boolean
  ) => void; // Agregar parámetro para tokens
  onClose: () => void;
  title: string;
  canClose?: boolean; // Nueva prop para controlar si se puede cerrar
}

export default function LoginModal({
  isOpen,
  onLoginSuccess,
  onClose,
  title,
  canClose = true,
}: LoginModalProps) {
  const { version, isLocalNewer, dbVersion } = useVersion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSessionActive, setKeepSessionActive] = useState(false);
  const [useTokenAuth, setUseTokenAuth] = useState(false); // Nueva opción para tokens
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0); // Contador de intentos fallidos
  const [usernameValid, setUsernameValid] = useState<boolean | null>(null);
  const [passwordValid, setPasswordValid] = useState<boolean | null>(null);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [shakePassword, setShakePassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Mount animation
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setMounted(true), 10);
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Validate username format
  useEffect(() => {
    if (username.length === 0) {
      setUsernameValid(null);
    } else if (username.length >= 3) {
      setUsernameValid(true);
    } else {
      setUsernameValid(false);
    }
  }, [username]);

  // Validate password format
  useEffect(() => {
    if (password.length === 0) {
      setPasswordValid(null);
    } else if (password.length >= 4) {
      setPasswordValid(true);
    } else {
      setPasswordValid(false);
    }
  }, [password]);

  // Caps lock detection
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.getModifierState && e.getModifierState("CapsLock")) {
      setCapsLockOn(true);
    } else {
      setCapsLockOn(false);
    }
  };

  // Format date and time
  const formatDateTime = () => {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    };
    return currentTime.toLocaleDateString("es-ES", options);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Use server-side login endpoint that validates credentials and returns user
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const respJson = await response.json();
      const isSuperAdmin = respJson.isSuperAdmin; // Extraer la bandera
      if (!response.ok || !respJson.ok) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        setError(respJson?.error || "Credenciales incorrectas");

        // Trigger shake animation
        setShakePassword(true);
        setTimeout(() => setShakePassword(false), 500);

        if (newAttempts >= 4 && isSuperAdmin) {
          setShowRecoveryModal(true);
          setFailedAttempts(0);
        }

        setLoading(false);
        return;
      }

      const safeUser = respJson.user;
      if (safeUser) {
        onLoginSuccess(safeUser as UserType, keepSessionActive, useTokenAuth);
        // Limpiar formulario
        setUsername("");
        setPassword("");
        setKeepSessionActive(false);
        setUseTokenAuth(false);
        setFailedAttempts(0); // Resetear contador en login exitoso
      } else {
        setError("Credenciales invalidas");
      }
    } catch (error) {
      console.error("Error during login:", error);
      setError("Error al conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center px-4 pt-6 pb-8 sm:pt-10 transition-opacity duration-700 ease-out ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Date/Time Card */}
      <div
        className={`mb-4 bg-[var(--card-bg)] rounded-lg shadow-lg px-4 py-2 border border-gray-200/20 transition-all duration-500 delay-100 ${
          mounted ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        <p className="text-sm text-[var(--muted-foreground)] text-center">
          Hoy: {formatDateTime()}
        </p>
      </div>

      {/* Login modal siempre por encima, z-20 */}
      <div className="w-full flex flex-col items-center justify-center z-20 relative">
        <div
          className={`bg-[var(--card-bg)] rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-xs sm:max-w-md mx-2 sm:mx-4 transition-all duration-700 ease-out delay-200 ${
            mounted ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
          }`}
        >
          <div className="text-center mb-6">
            <div className="relative w-[120px] h-[120px] mx-auto mb-4">
              <Image
                src="/Logos/LogoBlanco.png"
                alt="Logo"
                fill
                sizes="120px"
                loading="eager"
                className="object-contain"
              />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Bienvenido</h2>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Nombre de Usuario
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg bg-[var(--input-bg)] text-[var(--foreground)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"
                  placeholder="Ingresa tu nombre de usuario"
                  required
                  disabled={loading}
                />
                {usernameValid !== null && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 transition-all duration-300">
                    {usernameValid ? (
                      <Check className="w-5 h-5 text-green-500 animate-in fade-in zoom-in duration-200" />
                    ) : (
                      <X className="w-5 h-5 text-red-500 animate-in fade-in zoom-in duration-200" />
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className={`w-full pl-10 pr-20 py-2 border border-gray-300 rounded-lg bg-[var(--input-bg)] text-[var(--foreground)] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] ${
                    shakePassword ? "animate-[shake_0.5s_ease-in-out]" : ""
                  }`}
                  placeholder="Ingresa tu contraseña"
                  required
                  disabled={loading}
                />
                {passwordValid !== null && (
                  <div className="absolute right-12 top-1/2 transform -translate-y-1/2 transition-all duration-300">
                    {passwordValid ? (
                      <Check className="w-5 h-5 text-green-500 animate-in fade-in zoom-in duration-200" />
                    ) : (
                      <X className="w-5 h-5 text-red-500 animate-in fade-in zoom-in duration-200" />
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-[0_0_8px_rgba(59,130,246,0.3)] rounded-full p-1"
                  disabled={loading}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {capsLockOn && (
                <div className="flex items-center gap-1 mt-2 text-amber-500 text-xs animate-in fade-in slide-in-from-top-1 duration-300">
                  <AlertCircle size={14} />
                  <span>Bloq Mayús activado</span>
                </div>
              )}
            </div>

            {/* Toggle para autenticación con tokens */}
            <div className="flex items-center justify-between">
              <label className="flex items-center cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={useTokenAuth}
                    onChange={(e) => {
                      setUseTokenAuth(e.target.checked);
                      if (e.target.checked) {
                        setKeepSessionActive(false); // Desactivar keepSessionActive si se activa tokens
                      }
                    }}
                    className="sr-only"
                    disabled={loading}
                  />
                  <div
                    className={`block w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                      useTokenAuth
                        ? "bg-green-600 shadow-lg"
                        : "bg-gray-300 dark:bg-gray-600"
                    } ${loading ? "opacity-50" : "group-hover:shadow-md"}`}
                  ></div>
                  <div
                    className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out shadow-sm ${
                      useTokenAuth ? "translate-x-5" : "translate-x-0"
                    }`}
                  ></div>
                </div>
                <div className="ml-3">
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    Mantener sesión activa
                  </span>
                  <div className="text-xs text-[var(--muted-foreground)] mt-1">
                    Autenticación más segura con renovación automática
                  </div>
                </div>
              </label>
            </div>
            {error && (
              <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
            <div className={`flex gap-3 ${canClose ? "" : "justify-center"}`}>
              {canClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  disabled={loading}
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                className={`py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 ${
                  canClose ? "flex-1" : "w-full"
                }`}
                disabled={loading}
              >
                {loading ? "Verificando..." : "Iniciar Sesión"}
              </button>
            </div>
          </form>

          {/* Version Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200/20">
            <div className="flex items-center justify-center gap-2 text-xs text-center text-[var(--muted-foreground)]">
              <span>v{version} – © Time Master</span>
              {isLocalNewer && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30"
                  title={`Nueva versión desplegada.`}
                >
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  NUEVA
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de recuperación de contraseña */}
      <PasswordRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
      />
    </div>
  );
}
