// Error yang kita lempar sendiri. Ditangkap oleh middleware error dan dijadikan response JSON.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
