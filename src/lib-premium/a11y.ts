// WCAG AAA compliance helpers

export function focusTrap(element: HTMLElement | null, onEscape?: () => void) {
  if (!element) return;

  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onEscape?.();
      return;
    }

    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  };

  element.addEventListener('keydown', handler);
  firstElement?.focus();

  return () => element.removeEventListener('keydown', handler);
}

export function createAriaLiveRegion(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const region = document.createElement('div');
  region.setAttribute('aria-live', priority);
  region.setAttribute('aria-atomic', 'true');
  region.className = 'sr-only';
  region.textContent = message;
  document.body.appendChild(region);

  setTimeout(() => region.remove(), 3000);
}

export function announceToScreenReader(message: string) {
  createAriaLiveRegion(message, 'polite');
}

export function announceError(message: string) {
  createAriaLiveRegion(message, 'assertive');
}

export const SR_ONLY_CLASS = 'sr-only';
