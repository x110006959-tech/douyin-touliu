export type ApiResponse<T = unknown> =
  | { success: true; data: T; error: null }
  | {
      success: false;
      data: null;
      error: {
        code: string;
        message: string;
        requestId?: string;
        fieldErrors?: Record<string, string>;
      };
    };

export function success<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function failure(
  code: string,
  message: string,
  options: { requestId?: string; fieldErrors?: Record<string, string> } = {}
): ApiResponse<never> {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      ...(options.requestId ? { requestId: options.requestId } : {}),
      ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {})
    }
  };
}
