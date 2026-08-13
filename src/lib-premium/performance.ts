// Performance monitoring and optimization utilities

export interface PerformanceMetrics {
  pageLoadTime: number;
  interactiveTime: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
}

export function captureWebVitals() {
  if (typeof window === 'undefined') return;

  const metrics: Partial<PerformanceMetrics> = {};

  // Page load time
  if (performance.timing) {
    metrics.pageLoadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
  }

  // Time to Interactive (approximate)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.name === 'first-input') {
            metrics.interactiveTime = entry.startTime;
          }
        });
      });

      observer.observe({ entryTypes: ['first-input', 'largest-contentful-paint'] });
    } catch (e) {
      console.warn('Failed to observe performance metrics', e);
    }
  }

  return metrics;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export const prefetchRoute = (href: string) => {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'fetch';
  link.href = href;
  document.head.appendChild(link);
};
