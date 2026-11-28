import React, { useEffect, useRef, useState } from 'react';
import { motion, type Transition, type Variants } from 'motion/react';

type ObserverCallback = () => void;

interface SharedObserverEntry {
  observer: IntersectionObserver;
  callbacks: WeakMap<Element, ObserverCallback>;
}

const sharedObservers = new Map<string, SharedObserverEntry>();

function getSharedObserver(rootMargin: string, threshold: number): SharedObserverEntry | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
    return null;
  }

  const key = `${rootMargin}|${threshold}`;
  const existing = sharedObservers.get(key);
  if (existing) return existing;

  const callbacks = new WeakMap<Element, ObserverCallback>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          const cb = callbacks.get(entry.target);
          if (cb) {
            callbacks.delete(entry.target);
            observer.unobserve(entry.target);
            cb();
          }
        }
      }
    },
    { rootMargin, threshold }
  );

  const created: SharedObserverEntry = { observer, callbacks };
  sharedObservers.set(key, created);
  return created;
}

export interface LazyThumbnailProps {
  src?: string;
  alt: string;
  className?: string;
  variants?: Variants;
  transition?: Transition;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  rootMargin?: string;
  fallback?: React.ReactNode;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

/**
 * IntersectionObserver-backed lazy thumbnail component.
 * Uses a single shared IntersectionObserver per rootMargin so off-screen media cards
 * do not fetch or decode poster images until entering the viewport, while preserving
 * Framer Motion hover-zoom animations via parent variant propagation.
 */
export const LazyThumbnail: React.FC<LazyThumbnailProps> = React.memo(({
  src,
  alt,
  className = 'w-full h-full object-cover',
  variants,
  transition,
  referrerPolicy = 'no-referrer',
  rootMargin = '180px 0px',
  fallback,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isInView, setIsInView] = useState<boolean>(() => {
    return typeof window === 'undefined' || typeof IntersectionObserver === 'undefined';
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [src]);

  useEffect(() => {
    if (isInView) return;
    const node = containerRef.current;
    if (!node) return;

    const shared = getSharedObserver(rootMargin, 0.01);
    if (!shared) {
      setIsInView(true);
      return;
    }

    shared.callbacks.set(node, () => {
      setIsInView(true);
    });
    shared.observer.observe(node);

    return () => {
      shared.callbacks.delete(node);
      shared.observer.unobserve(node);
    };
  }, [isInView, rootMargin]);

  return (
    <div ref={containerRef} className="w-full h-full relative" data-lazy-loaded={isInView ? 'true' : 'false'}>
      {!src || hasError ? (
        fallback || null
      ) : isInView ? (
        <>
          {!isLoaded && (
            <div className="absolute inset-0 bg-slate-900/90 animate-pulse pointer-events-none" />
          )}
          <motion.img
            src={src}
            alt={alt}
            decoding="async"
            referrerPolicy={referrerPolicy}
            onLoad={() => setIsLoaded(true)}
            onError={(e) => {
              setHasError(true);
              onError?.(e);
            }}
            variants={variants}
            transition={transition}
            className={className}
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950"
        />
      )}
    </div>
  );
});
