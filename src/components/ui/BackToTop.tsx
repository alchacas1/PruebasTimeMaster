'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUp } from 'lucide-react';

type BackToTopProps = {
  /** Show button once scroll progress passes this value (0..1). Default: 0.5 */
  showAfterProgress?: number;
  /** Pixels from bottom/right edges. Default: 20 */
  offsetPx?: number;
  /** Bottom/right offset on small screens. Default: 80 */
  mobileOffsetPx?: number;
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export default function BackToTop({ showAfterProgress = 0.5, offsetPx = 20, mobileOffsetPx = 80 }: BackToTopProps) {
  const [visible, setVisible] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const threshold = useMemo(() => clamp01(showAfterProgress), [showAfterProgress]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setIsSmallScreen(media.matches);
    update();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }

    // Safari < 14
    // eslint-disable-next-line deprecation/deprecation
    media.addListener(update);
    // eslint-disable-next-line deprecation/deprecation
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    let rafId: number | null = null;

    const computeProgress = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY ?? doc.scrollTop ?? 0;
      const scrollHeight = doc.scrollHeight ?? 0;
      const viewportHeight = window.innerHeight ?? doc.clientHeight ?? 0;
      const scrollable = Math.max(0, scrollHeight - viewportHeight);

      const progress = scrollable === 0 ? 0 : scrollTop / scrollable;
      setVisible(progress >= threshold);
    };

    const onScrollOrResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        computeProgress();
      });
    };

    computeProgress();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [threshold]);

  const handleClick = () => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  const effectiveOffset = isSmallScreen ? mobileOffsetPx : offsetPx;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Volver arriba"
      title="Volver arriba"
      className={
        'fixed z-40 inline-flex items-center justify-center rounded-full shadow-lg touch-manipulation ' +
        'bg-[var(--primary)] text-white hover:opacity-95 active:opacity-90 ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black/10 ' +
        'transition-all duration-200 ' +
        (visible ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none translate-y-2')
      }
      style={{
        right: `calc(${effectiveOffset}px + env(safe-area-inset-right, 0px))`,
        bottom: `calc(${effectiveOffset}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <span className="h-11 w-11 inline-flex items-center justify-center">
        <ArrowUp className="h-5 w-5" aria-hidden="true" />
      </span>
    </button>
  );
}
