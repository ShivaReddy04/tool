/**
 * Shared input validators. Kept tiny and dependency-free so they can run on
 * both the request boundary (controllers) and lower-level model helpers.
 */

// Standard SQL-identifier rule: must start with a letter or underscore and
// then contain only letters, digits, and underscores. Length is bounded by
// the varchar(100) column it lands in.
const SCHEMA_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface SchemaNameValidationResult {
    valid: boolean;
    sanitized: string;
    error?: string;
}

export const validateSchemaName = (raw: unknown): SchemaNameValidationResult => {
    if (typeof raw !== 'string') {
        return { valid: false, sanitized: '', error: 'Schema name must be a string' };
    }
    const sanitized = raw.trim();
    if (!sanitized) {
        return { valid: false, sanitized, error: 'Schema name is required' };
    }
    if (sanitized.length > 100) {
        return { valid: false, sanitized, error: 'Schema name must be 100 characters or fewer' };
    }
    if (!SCHEMA_NAME_RE.test(sanitized)) {
        return {
            valid: false,
            sanitized,
            error: 'Schema name may contain only letters, digits, and underscores, and must not start with a digit',
        };
    }
    return { valid: true, sanitized };
};

/**
 * Generic SQL-identifier validator used for table_name and column_name.
 * Same character rules as `validateSchemaName`, but bounded to 255 chars
 * (matches the varchar(255) columns) and accepts a `label` so the returned
 * error message names the offending field.
 */
export const validateIdentifier = (raw: unknown, label = 'Identifier'): SchemaNameValidationResult => {
    if (typeof raw !== 'string') {
        return { valid: false, sanitized: '', error: `${label} must be a string` };
    }
    const sanitized = raw.trim();
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

/* ── default-value validation ────────────────────────────────────────────────
 * Column DEFAULT values land in DDL verbatim (see utils/ddl_generator.ts).
 * That means a typo like `DEFAULT AI` on a DATE column gets emitted as-is and
 * Postgres rejects it at apply time with an opaque cast error. Validating up
 * front catches the common foot-guns and gives the developer an actionable
 * message before the architect ever sees the submission.
 *
 * The validator is intentionally permissive: any known SQL function
 * (CURRENT_DATE, NOW(), etc.) and NULL are allowed for every type; only
 * obviously-wrong combinations (raw text on a DATE, identifier on VARCHAR
 * that the DDL would treat as a column reference) are rejected.
 */

export interface DefaultValueValidationResult {
    valid: boolean;
    sanitized: string;
    error?: string;
}

// Defaults that are valid for any column type and pass through unmodified.
const SQL_DEFAULT_KEYWORDS = new Set([
    'NULL',
    'CURRENT_DATE',
    'CURRENT_TIMESTAMP',
    'CURRENT_TIME',
    'CURRENT_USER',
    'SESSION_USER',
    'LOCALTIMESTAMP',
    'LOCALTIME',
    'NOW()',
    'GETDATE()',
    'SYSDATE',
    'TRUE',
    'FALSE',
]);

const NUMERIC_TYPES = new Set([
    'SMALLINT', 'INT2',
    'INTEGER', 'INT', 'INT4',
    'BIGINT', 'INT8',
    'DECIMAL', 'NUMERIC',
    'REAL', 'FLOAT4',
    'DOUBLE PRECISION', 'FLOAT8',
]);

const isQuotedString = (s: string): boolean =>
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2) ||
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2);

const isNumericLiteral = (s: string): boolean => /^-?\d+(\.\d+)?$/.test(s);

const stripQuotes = (s: string): string => s.slice(1, -1);

const looksLikeDate = (inner: string): boolean => {
    // Accept anything Date.parse handles plus YYYY-MM-DD which it sometimes
    // mishandles (treating as UTC). Be liberal — we just want to catch
    // obvious garbage like "AI", not enforce SQL date grammar exactly.
    if (/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}(:\d{2})?)?$/.test(inner)) return true;
    const t = Date.parse(inner);
    return !Number.isNaN(t);
};

/**
 * Validate that a DEFAULT value is compatible with the column data type.
 * Returns the original string unmodified on success (DDL emits verbatim).
 */
export const validateColumnDefault = (
    rawValue: unknown,
    rawType: unknown,
    columnLabel = 'Column',
): DefaultValueValidationResult => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    // Empty → no DEFAULT clause. Always fine.
    if (!value) return { valid: true, sanitized: '' };

    if (SQL_DEFAULT_KEYWORDS.has(value.toUpperCase())) {
        return { valid: true, sanitized: value };
    }

    const type = typeof rawType === 'string' ? rawType.trim().toUpperCase() : '';
    // Strip a parenthesized length/precision: "VARCHAR(255)" → "VARCHAR".
    const baseType = type.replace(/\s*\([^)]*\)\s*$/, '').trim();

    if (baseType === 'DATE' || baseType.startsWith('TIMESTAMP')) {
        if (!isQuotedString(value)) {
            return {
                valid: false,
                sanitized: value,
                error: `${columnLabel}: default for ${baseType || 'date'} must be a quoted date like '2026-01-01' or a SQL function like CURRENT_DATE`,
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

    if (baseType === 'BOOLEAN' || baseType === 'BOOL') {
        const v = value.toUpperCase();
        if (!['TRUE', 'FALSE', '0', '1'].includes(v)) {
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

    // Text/char types — a bare identifier like `unknown` would be parsed as a
    // column reference by Postgres and break the DDL. Require quotes.
    if (
        baseType === 'CHAR' || baseType === 'CHARACTER' ||
        baseType === 'VARCHAR' || baseType === 'CHARACTER VARYING' ||
        baseType === 'TEXT' || baseType === 'STRING'
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

    // Unknown / dialect-specific types (e.g. SUPER, JSONB): pass through.
    // We can't predict what's valid, and we don't want to block legitimate
    // expressions we don't know about.
    return { valid: true, sanitized: value };
};
