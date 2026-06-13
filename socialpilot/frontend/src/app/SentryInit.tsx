'use client';

import { useEffect } from 'react';
import { initFrontendSentry } from '@/lib/sentry';

/**
 * Client-side Sentry initializer.
 * Must be a client component because it runs browser-side code.
 * Placed in the root layout to initialize as early as possible.
 */
export default function SentryInit() {
  useEffect(() => {
    initFrontendSentry();
  }, []);

  return null;
}
