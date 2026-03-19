/**
 * Secure Error Handling Utility
 *
 * This module provides consistent, secure error handling across the platform.
 * It prevents internal error details from being exposed to end users while
 * ensuring developers have access to detailed debugging information.
 */

export interface SecureErrorOptions {
  /** Generic user-friendly message to display */
  userMessage: string;
  /** Whether to show toast notification (default: false) */
  showToast?: boolean;
  /** Toast function if showToast is true */
  toastFn?: (message: string) => void;
  /** Whether to log to console (default: true) */
  logToConsole?: boolean;
  /** Additional context for debugging */
  context?: Record<string, any>;
}

/**
 * Parse error response safely without exposing internal details
 */
export async function parseErrorResponse(
  response: Response,
  fallbackMessage: string = 'An error occurred'
): Promise<Error> {
  try {
    const errorData = await response.json();
    // Only use the error message if it exists, otherwise use fallback
    const message = errorData?.error?.message || fallbackMessage;
    return new Error(message);
  } catch {
    // If JSON parsing fails, return fallback
    return new Error(fallbackMessage);
  }
}

/**
 * Handle API errors securely
 *
 * @example
 * ```typescript
 * try {
 *   const response = await fetch('/api/endpoint');
 *   if (!response.ok) {
 *     throw await parseErrorResponse(response, 'Failed to fetch data');
 *   }
 *   const data = await response.json();
 * } catch (error) {
 *   handleSecureError(error, {
 *     userMessage: 'Unable to load data. Please try again.',
 *     showToast: true,
 *     toastFn: toast.error,
 *     context: { endpoint: '/api/endpoint' }
 *   });
 * }
 * ```
 */
export function handleSecureError(
  error: unknown,
  options: SecureErrorOptions
): void {
  const {
    userMessage,
    showToast = false,
    toastFn,
    logToConsole = true,
    context = {},
  } = options;

  // Log detailed error for developers
  if (logToConsole) {
    console.error('Error occurred:', {
      error,
      userMessage,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  // Show generic user-friendly message
  if (showToast && toastFn) {
    toastFn(userMessage);
  }
}

/**
 * Wrapper for fetch requests with built-in secure error handling
 *
 * @example
 * ```typescript
 * const data = await secureFetch('/api/endpoint', {
 *   userMessage: 'Failed to load data',
 *   showToast: true,
 *   toastFn: toast.error
 * });
 * ```
 */
export async function secureFetch<T = any>(
  url: string,
  options: SecureErrorOptions & RequestInit = { userMessage: 'Request failed' }
): Promise<T> {
  const {
    userMessage,
    showToast,
    toastFn,
    logToConsole,
    context,
    ...fetchOptions
  } = options;

  try {
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw await parseErrorResponse(response, userMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    handleSecureError(error, {
      userMessage,
      showToast,
      toastFn,
      logToConsole,
      context: { ...context, url, method: fetchOptions.method || 'GET' },
    });
    throw error;
  }
}

/**
 * Secure error handler for form submissions
 */
export function handleFormError(
  error: unknown,
  toastFn: (message: string) => void,
  defaultMessage: string = 'Unable to submit form. Please try again.'
): void {
  handleSecureError(error, {
    userMessage: defaultMessage,
    showToast: true,
    toastFn,
  });
}

/**
 * Secure error handler for data fetching (silent failures for polling)
 */
export function handleFetchError(
  error: unknown,
  context?: Record<string, any>
): void {
  handleSecureError(error, {
    userMessage: 'Failed to fetch data',
    showToast: false,
    logToConsole: true,
    context,
  });
}
