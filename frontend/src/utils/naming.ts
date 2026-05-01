/**
 * Naming utilities for translating between human-readable labels and
 * machine-friendly identifiers used across the data modeling UI.
 */

/**
 * Convert any string into a normalized snake_case identifier.
 *
 * Rules:
 *  - Lowercase
 *  - Trim surrounding whitespace
 *  - Any run of non-alphanumeric characters collapses to a single underscore
 *  - No leading or trailing underscores
 *
 * Examples:
 *   "Financial Transactions"      -> "financial_transactions"
 *   "  User  Profile  Data  "     -> "user_profile_data"
 *   "user@email.com"              -> "user_email_com"
 *   "table--v2"                   -> "table_v2"
 */
export const toSnakeCase = (input: string): string => {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

/**
 * Convert a snake_case / kebab-case / space-separated string into Title Case.
 *
 * Rules:
 *  - Trim surrounding whitespace
 *  - Treat any non-alphanumeric run as a word separator
 *  - Capitalize the first letter of each word, lowercase the rest
 *
 * Examples:
 *   "fact_table"            -> "Fact Table"
 *   "user_account_details"  -> "User Account Details"
 *   "user-profile-data"     -> "User Profile Data"
 *   "table_v2"              -> "Table V2"
 */
export const toTitleCase = (input: string): string => {
  if (!input) return "";
  return input
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};
