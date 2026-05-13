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

/* ── default-value validation ──────────────────────────────────────────────
 * Mirror of backend/src/utils/validation.ts → validateColumnDefault.
 * Column DEFAULTs are inlined verbatim into DDL, so a typo (e.g. `AI` on a
 * DATE column) gets emitted as-is and the architect's approval blows up at
 * apply time. This is the developer-side guardrail. Keep the two
 * implementations in lock-step.
 */

const SQL_DEFAULT_KEYWORDS = new Set([
  "NULL",
  "CURRENT_DATE",
  "CURRENT_TIMESTAMP",
  "CURRENT_TIME",
  "CURRENT_USER",
  "SESSION_USER",
  "LOCALTIMESTAMP",
  "LOCALTIME",
  "NOW()",
  "GETDATE()",
  "SYSDATE",
  "TRUE",
  "FALSE",
]);

const NUMERIC_TYPES = new Set([
  "SMALLINT", "INT2",
  "INTEGER", "INT", "INT4",
  "BIGINT", "INT8",
  "DECIMAL", "NUMERIC",
  "REAL", "FLOAT4",
  "DOUBLE PRECISION", "FLOAT8",
]);

const isQuotedString = (s: string): boolean =>
  (s.startsWith("'") && s.endsWith("'") && s.length >= 2) ||
  (s.startsWith('"') && s.endsWith('"') && s.length >= 2);

const isNumericLiteral = (s: string): boolean => /^-?\d+(\.\d+)?$/.test(s);

const stripQuotes = (s: string): string => s.slice(1, -1);

const looksLikeDate = (inner: string): boolean => {
  if (/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}(:\d{2})?)?$/.test(inner)) return true;
  const t = Date.parse(inner);
  return !Number.isNaN(t);
};

export const validateColumnDefault = (
  rawValue: string,
  rawType: string,
  columnLabel = "Column"
): ValidationResult => {
  const value = (rawValue || "").trim();
  if (!value) return { valid: true, sanitized: "" };

  if (SQL_DEFAULT_KEYWORDS.has(value.toUpperCase())) {
    return { valid: true, sanitized: value };
  }

  const type = (rawType || "").trim().toUpperCase();
  const baseType = type.replace(/\s*\([^)]*\)\s*$/, "").trim();

  if (baseType === "DATE" || baseType.startsWith("TIMESTAMP")) {
    if (!isQuotedString(value)) {
      return {
        valid: false,
        sanitized: value,
        error: `${columnLabel}: default for ${baseType || "date"} must be a quoted date like '2026-01-01' or a SQL function like CURRENT_DATE`,
      };
    }
    if (!looksLikeDate(stripQuotes(value))) {
      return {
        valid: false,
        sanitized: value,
        error: `${columnLabel}: '${stripQuotes(value)}' is not a valid date`,
      };
    }
    return { valid: true, sanitized: value };
  }

  if (baseType === "BOOLEAN" || baseType === "BOOL") {
    const v = value.toUpperCase();
    if (!["TRUE", "FALSE", "0", "1"].includes(v)) {
      return {
        valid: false,
        sanitized: value,
        error: `${columnLabel}: default for BOOLEAN must be TRUE, FALSE, 0, or 1`,
      };
    }
    return { valid: true, sanitized: value };
  }

  if (NUMERIC_TYPES.has(baseType)) {
    if (!isNumericLiteral(value)) {
      return {
        valid: false,
        sanitized: value,
        error: `${columnLabel}: default for ${baseType} must be a number (e.g. 0 or -1.5)`,
      };
    }
    return { valid: true, sanitized: value };
  }

  if (
    baseType === "CHAR" || baseType === "CHARACTER" ||
    baseType === "VARCHAR" || baseType === "CHARACTER VARYING" ||
    baseType === "TEXT" || baseType === "STRING"
  ) {
    if (!isQuotedString(value)) {
      return {
        valid: false,
        sanitized: value,
        error: `${columnLabel}: default for ${baseType} must be a quoted string like 'value'`,
      };
    }
    return { valid: true, sanitized: value };
  }

  return { valid: true, sanitized: value };
};
