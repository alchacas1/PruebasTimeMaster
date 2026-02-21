"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useVersion } from "../../hooks/useVersion";
import delikorLogo from "../../../public/Logos/delikor.png";

export default function Footer() {
  const { version, isLocalNewer, releaseNotes } = useVersion();
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);

  // Handle ESC key to close any open modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (isGitHubModalOpen) setIsGitHubModalOpen(false);
      if (isAboutModalOpen) setIsAboutModalOpen(false);
      if (isNewsModalOpen) setIsNewsModalOpen(false);
    };

    if (isGitHubModalOpen || isAboutModalOpen || isNewsModalOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isGitHubModalOpen, isAboutModalOpen, isNewsModalOpen]);

  return (
    <footer className="w-full mt-auto">
      <div className="bg-[var(--card-bg)] text-[var(--foreground)] border-t border-[var(--input-border)] pt-2 sm:pt-3 flex flex-col items-center px-3 sm:px-0">
        {/* Social icons */}
        <div className="flex gap-4 sm:gap-6 mb-2 sm:mb-1 flex-wrap justify-center sm:flex-nowrap">
          <a
            href="https://facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity"
            aria-label="Visitar nuestra página de Facebook"
          >
            <svg
              className="w-6 h-6 sm:w-7 sm:h-7 fill-current text-black dark:text-white"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M18 2h-3a5 5 0 00-5 5v3H6v4h4v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
            </svg>
          </a>
          <button
            type="button"
            aria-label="GitHub"
            onClick={() => setIsGitHubModalOpen(true)}
            className="hover:opacity-70 transition-opacity"
          >
            <svg
              className="w-6 h-6 sm:w-7 sm:h-7 fill-current text-black dark:text-white"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.186 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.157-1.11-1.465-1.11-1.465-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.091-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.847-2.337 4.695-4.566 4.944.359.309.678.919.678 1.852 0 1.336-.012 2.417-.012 2.747 0 .267.18.577.688.48C19.138 20.203 22 16.447 22 12.021 22 6.484 17.523 2 12 2z" />
            </svg>
          </button>
          <a
            href="https://plus.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity"
            aria-label="Visitar nuestra página de Google Plus"
          >
            <svg
              className="w-6 h-6 sm:w-7 sm:h-7 fill-current text-black dark:text-white"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M21.8 10.02h-9.18v3.96h5.27c-.23 1.22-1.36 3.59-5.27 3.59-3.18 0-5.76-2.63-5.76-5.87s2.58-5.87 5.76-5.87c1.81 0 3.02.72 3.72 1.35l2.54-2.46C16.29 3.13 14.37 2 12 2 6.48 2 2 6.48 2 12s4.48 10 10 10c5.52 0 10-4.48 10-10 0-.68-.07-1.36-.2-1.98z" />
            </svg>
          </a>
          <button
            type="button"
            className="hover:opacity-70 transition-opacity"
            aria-label="Limpiar caché y recargar"
          >
            <svg
              className="w-6 h-6 sm:w-7 sm:h-7 fill-current text-black dark:text-white"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.95C18.88 4 12 4 12 4s-6.88 0-8.59.47A2.78 2.78 0 001.46 6.42C1 8.13 1 12 1 12s0 3.87.46 5.58a2.78 2.78 0 001.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 001.95-1.95C23 15.87 23 12 23 12s0-3.87-.46-5.58zM10 15.5V8.5l6 3.5-6 3.5z" />
            </svg>
          </button>
        </div>

        {/* GitHub Modal */}
        {isGitHubModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
            <div className="bg-[var(--card-bg)] rounded-lg shadow-lg p-6 max-w-md w-full relative animate-fade-in">
              <button
                className="absolute top-2 right-2 text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] text-2xl font-bold focus:outline-none"
                onClick={() => setIsGitHubModalOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
              <div className="flex flex-col items-center gap-4">
                <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">
                  Equipo de Desarrollo
                </h2>
                <p className="text-[var(--tab-text)] mb-6">
                  Conoce más sobre los desarrolladores del proyecto
                </p>
              </div>
              <div className="space-y-4">
                <a
                  href="https://github.com/FloresAnders/Price-Master"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center space-x-3 p-3 bg-[var(--input-bg)] hover:bg-[var(--input-border)] rounded-lg transition-colors cursor-pointer"
                  onClick={() => setIsGitHubModalOpen(false)}
                >
                  <svg
                    className="w-5 h-5 text-[var(--foreground)]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-[var(--foreground)] font-medium">
                    Anders Flores M
                  </span>
                </a>

                <a
                  href="https://github.com/alchacas1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center space-x-3 p-3 bg-[var(--input-bg)] hover:bg-[var(--input-border)] rounded-lg transition-colors cursor-pointer"
                  onClick={() => setIsGitHubModalOpen(false)}
                >
                  <svg
                    className="w-5 h-5 text-[var(--foreground)]"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-[var(--foreground)] font-medium">
                    Alvaro Chaves C
                  </span>
                </a>

                <button
                  onClick={() => setIsGitHubModalOpen(false)}
                  className="w-full bg-[var(--input-bg)] hover:bg-[var(--input-border)] text-[var(--foreground)] rounded-lg py-2 px-4 transition-colors duration-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Menu links */}
        <nav className="w-full max-w-7xl mx-auto mb-2 sm:mb-4 px-0 sm:px-4">
          <div className="flex sm:justify-center gap-3 sm:gap-8 overflow-x-auto sm:overflow-visible px-3 sm:px-0 py-1 sm:py-0 whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <a
            href="#"
            className="text-sm sm:text-base font-sans font-bold text-[var(--foreground)] hover:text-[var(--tab-hover-text)] transition-colors text-center py-1 px-2 rounded-md hover:bg-[var(--hover-bg)] flex-none"
          >
            Home
          </a>
          <button
            type="button"
            className="text-sm sm:text-base font-sans font-bold text-[var(--foreground)] hover:text-[var(--tab-hover-text)] transition-colors focus:outline-none text-center py-1 px-2 rounded-md hover:bg-[var(--hover-bg)] flex-none"
            onClick={() => setIsNewsModalOpen(true)}
          >
            News
          </button>
          <button
            type="button"
            className="text-sm sm:text-base font-sans font-bold text-[var(--foreground)] hover:text-[var(--tab-hover-text)] transition-colors focus:outline-none text-center py-1 px-2 rounded-md hover:bg-[var(--hover-bg)] flex-none"
            onClick={() => setIsAboutModalOpen(true)}
          >
            About
          </button>
          <a
            href="#"
            className="text-sm sm:text-base font-sans font-bold text-[var(--foreground)] hover:text-[var(--tab-hover-text)] transition-colors text-center py-1 px-2 rounded-md hover:bg-[var(--hover-bg)] flex-none"
          >
            Contact Us
          </a>
          <a
            href="#"
            className="text-sm sm:text-base font-sans font-bold text-[var(--foreground)] hover:text-[var(--tab-hover-text)] transition-colors text-center py-1 px-2 rounded-md hover:bg-[var(--hover-bg)] flex-none"
          >
            Our Team
          </a>
          </div>
        </nav>
        {/* News Modal */}
        {isNewsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
            <div className="bg-[var(--card-bg)] rounded-lg shadow-lg p-6 max-w-md w-full relative animate-fade-in max-h-[90vh] overflow-hidden">
              <button
                className="absolute top-1 right-2 text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] text-2xl font-bold focus:outline-none"
                onClick={() => setIsNewsModalOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
              <div className="flex flex-col items-center gap-4">
                <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">
                  Últimos Cambios
                </h2>
                <p className="text-[var(--tab-text)] -mt-2 mb-2 text-center">
                  Novedades de la versión <span className="font-semibold">v{version}</span>
                </p>

                <div className="w-full space-y-3 max-h-[55vh] overflow-y-auto overscroll-contain pr-1">
                  {releaseNotes.map((item, idx) => (
                    <div
                      key={`${idx}-${item.date}-${item.title}`}
                      className="rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-[var(--foreground)] font-semibold leading-snug">
                            {item.title}
                          </h3>
                          <p className="text-[12px] text-[var(--muted-foreground)] mt-0.5">
                            {item.date}
                          </p>
                        </div>
                      </div>
                      <p className="text-[var(--tab-text)] mt-2 text-sm leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setIsNewsModalOpen(false)}
                  className="w-full bg-[var(--input-bg)] hover:bg-[var(--input-border)] text-[var(--foreground)] rounded-lg py-2 px-4 transition-colors duration-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
        {/* About Modal */}
        {isAboutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
            <div className="bg-[var(--card-bg)] rounded-lg shadow-lg p-6 max-w-md w-full relative animate-fade-in">
              <button
                className="absolute top-2 right-2 text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] text-2xl font-bold focus:outline-none"
                onClick={() => setIsAboutModalOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
              <div className="flex flex-col items-center gap-4">
                <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">
                  Sobre el Proyecto
                </h2>
                <p className="text-[var(--tab-text)] mb-4 text-center">
                  Somos un grupo de programadores jóvenes y entusiastas que
                  creemos en el poder de la tecnología para mejorar la vida
                  diaria. Este proyecto nació de la pasión por aprender,
                  colaborar y crear soluciones útiles para la comunidad. Nos
                  motiva la innovación, el trabajo en equipo y el deseo de
                  aportar valor real a los usuarios. ¡Gracias por confiar en
                  nosotros y ser parte de esta aventura!
                </p>
                <button
                  onClick={() => setIsAboutModalOpen(false)}
                  className="w-full bg-[var(--input-bg)] hover:bg-[var(--input-border)] text-[var(--foreground)] rounded-lg py-2 px-4 transition-colors duration-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Copyright + Logo */}
        <div className="w-full text-[11px] sm:text-xs text-[var(--foreground)] opacity-80 border-t border-[var(--input-border)] pt-2 pb-2 sm:pb-1">
          <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 sm:gap-3">
            <div className="text-center">
              <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-center sm:gap-2 sm:flex-nowrap">
                <span className="sm:whitespace-nowrap">
                  Copyright ©{new Date().getFullYear()}; Designed by{" "}
                  <span className="font-semibold tracking-wide">
                    Time Master
                  </span>
                </span>
                <span className="hidden sm:inline opacity-60">|</span>
                <span className="opacity-90 flex items-center justify-center gap-2 sm:whitespace-nowrap">
                  <span>v{version}</span>
                  {isLocalNewer && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30"
                      title={`Cambios desplegados.`}
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
                      PENDIENTE
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div
              className="hidden sm:block h-6 w-px bg-[var(--input-border)] opacity-60"
              aria-hidden="true"
            />
            <div
              className="sm:hidden w-full h-px bg-[var(--input-border)] opacity-60"
              aria-hidden="true"
            />

            <div className="flex flex-col items-center justify-center">
              <span className="text-[11px] sm:text-xs text-[var(--muted-foreground)]">Sponsored by</span>
              <Image
                src={delikorLogo}
                alt="Delikor"
                width={140}
                height={36}
                sizes="(min-width: 640px) 180px, 140px"
                className="h-7 sm:h-9 w-auto object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
