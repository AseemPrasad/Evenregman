import { useCallback } from 'react';
import { useToast } from '@/providers-premium/toast-provider';

export function useErrorHandler() {
  const { addToast } = useToast();

  const handleError = useCallback((error: unknown, context?: string) => {
    const message = error instanceof Error ? error.message : 'An error occurred';
    const fullMessage = context ? `${context}: ${message}` : message;

    console.error(fullMessage, error);
    addToast(fullMessage, 'error', 5000);

    return {
      message,
      context,
      error,
    };
  }, [addToast]);

  const handleApiError = useCallback((status: number, message?: string) => {
    const errorMessages: Record<number, string> = {
      400: 'Invalid request',
      401: 'Not authorized',
      403: 'Forbidden',
      404: 'Not found',
      409: 'Conflict',
      500: 'Server error',
      503: 'Service unavailable',
    };

    const displayMessage = message || errorMessages[status] || 'Request failed';
    addToast(displayMessage, 'error', 5000);
  }, [addToast]);

  return { handleError, handleApiError };
}
