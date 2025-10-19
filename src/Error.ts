/**
 * ORM Error Codes
 */

export const ErrorCodes = {
  QUERY_ERROR: 1,
  NOT_FOUND: 2,
  NOT_DEFINED: 3,
  NO_SUPPORT: 4,
  MISSING_CALLBACK: 5,
  PARAM_MISMATCH: 6,
  CONNECTION_LOST: 10,
  BAD_MODEL: 15,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/**
 * Custom ORM Error class
 */
export class ORMError extends Error {
  public code?: number;
  public literalCode?: ErrorCode;
  public static codes = ErrorCodes;
  public static ErrorCodes = ErrorCodes;
  [key: string]: any;

  constructor(message: string, code?: ErrorCode, extras?: Record<string, any>) {
    super(message);
    
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
    
    this.name = 'ORMError';
    this.message = message;
    
    if (code) {
      this.code = ErrorCodes[code];
      this.literalCode = code;
      
      if (!this.code) {
        throw new Error(`Invalid error code: ${code}`);
      }
    }
    
    if (extras) {
      Object.assign(this, extras);
    }
  }

  toString(): string {
    return `[ORMError ${this.literalCode}: ${this.message}]`;
  }
}

export default ORMError;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ORMError;
  module.exports.ORMError = ORMError;
  module.exports.ErrorCodes = ErrorCodes;
  module.exports.codes = ErrorCodes;
  module.exports.default = ORMError;
}
