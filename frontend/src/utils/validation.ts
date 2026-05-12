/**
 * Lightweight, dependency-free validators shared across forms.
 * Mirrors the rules enforced by the backend in src/utils/validation.ts so
 * users see immediate feedback before a request is fired.
 */

const SCHEMA_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ValidationResult {
  valid: boolean;
  /** Whitespace-trimmed value safe to store. */
  sanitized: string;
  /** Human-readable error to display next to the field. */
  error?: string;
}

/**
 * Schema-name rule: starts with a letter or underscore, then letters /
 * digits / underscores only. Empty, all-whitespace, or > 100 chars are
 * rejected. Special characters other than `_` are forbidden so the value
 * is safe to embed directly in DDL.
 */
export const validateSchemaName = (raw: string): ValidationResult => {
  const sanitized = (raw || "").trim();
  if (!sanitized) {
    return { valid: false, sanitized, error: "Schema name is required" };
  }
  if (sanitized.length > 100) {
    return { valid: false, sanitized, error: "Schema name must be 100 characters or fewer" };
  }
  if (!SCHEMA_NAME_RE.test(sanitized)) {
    return {
      valid: false,
      sanitized,
      error: "Use letters, digits, and underscores only — must not start with a digit",
    };
  }
  return { valid: true, sanitized };
};

/**
 * Strip out every character that isn't valid in a schema name as the user
 * types, so paste / mistakes don't survive into form state. Spaces become
 * underscores; everything else is dropped.
 */
export const sanitizeSchemaInput = (raw: string): string => {
  if (!raw) return "";
  return raw
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "");
};

/**
 * Generic SQL-identifier validator for table and column names. Same character
 * rules as a schema name but allows up to 255 chars (matches the backend
 * `varchar(255)` columns) and accepts a `label` so the error message names
 * the offending field.
 */
export const validateIdentifier = (raw: string, label = "Identifier"): ValidationResult => {
  const sanitized = (raw || "").trim();
  if (!sanitized) {
    return { valid: false, sanitized, error: `${label} is required` };
  }
  if (sanitized.length > 255) {
    return { valid: false, sanitized, error: `${label} must be 255 characters or fewer` };
  }
  if (!SCHEMA_NAME_RE.test(sanitized)) {
    return {
      valid: false,
      sanitized,
      error: `${label} may contain only letters, digits, and underscores, and must not start with a digit`,
    };
  }
  return { valid: true, sanitized };
};
