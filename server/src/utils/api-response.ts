class ApiResponse<T> {
  readonly statusCode: number;
  readonly message: string;
  readonly data: T;
  readonly success: boolean;

  constructor(statusCode: number, message = 'success', data: T) {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.success = statusCode < 400;
  }
}

export { ApiResponse };

export interface ErrorResponse {
  status: 'error';
  code: string;
  message: string;
}
