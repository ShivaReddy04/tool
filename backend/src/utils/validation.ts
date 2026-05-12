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
