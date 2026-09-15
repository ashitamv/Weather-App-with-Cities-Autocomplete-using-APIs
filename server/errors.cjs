class ApiError extends Error {
  constructor(status, code, message, { transient = false, retryAfter } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.transient = transient;
    this.retryAfter = retryAfter;
  }
}

module.exports = { ApiError };
