'use client';

import { useEffect } from 'react';
import { initPostHogFrontend } from '@/lib/posthog-client';

/**
 * Client-side PostHog initializer.
 * Must be a client component because it runs browser-side code.
 * Placed in the root layout to initialize as early as possible.
 */
export default function PostHogInit() {
  useEffect(() => {
    initPostHogFrontend();
  }, []);

  return null;
}
