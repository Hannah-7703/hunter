'use client';

import { useEffect } from 'react';
import { warmApplicationData } from '@/lib/clientDataCache';

export default function DataPreloader() {
  useEffect(() => {
    const timer = window.setTimeout(warmApplicationData, 120);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
