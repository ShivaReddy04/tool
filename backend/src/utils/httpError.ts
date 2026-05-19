export class HttpError extends Error {
  status: number;
  details?: any;
  exposeDetails: boolean;
  constructor(status: number, message: string, details?: any, exposeDetails = false) {
    super(message);
    this.status = status;
    this.details = details;
    this.exposeDetails = exposeDetails;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}
