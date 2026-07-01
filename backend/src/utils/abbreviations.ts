/**
 * Enterprise naming abbreviations.
 *
 * The dictionary maps a full English word (or short phrase) to its canonical
 * abbreviation. Two generators are derived from it:
 *
 *   generateTableName(entityLogicalName)
 *     "Employee Sales Fact"            -> "Emp_Sls_Fct"
 *     "Primary Key Identifier"         -> "PK_Id"      (multi-word phrase wins)
 *
 *   generateEntityLogicalName(tableName)
 *     "Emp_Sls_Fct"                    -> "Employee Sales Fact"
 *     "PK_Id"                          -> "Primary Key Identifier"
 *
 * Both functions are pure. The dictionary is the only source of truth — adding
 * a new term in one place changes generation in both directions.
 *
 * Why a module variable instead of a const map: the dictionary is intentionally
 * mutable through `setAbbreviationDictionary` so a future admin endpoint can
 * push a runtime override without restarting the API.
 */

export interface AbbreviationEntry {
    /** Full term, e.g. "Employee" or "Primary Key". Spaces preserved for phrases. */
    full: string;
    /** Abbreviated form, e.g. "Emp" or "PK". Treated as a single token in table names. */
    abbreviation: string;
}

const DEFAULT_DICTIONARY: AbbreviationEntry[] = [
    { full: 'Employee', abbreviation: 'Emp' },
    { full: 'Sales', abbreviation: 'Sls' },
    { full: 'Identifier', abbreviation: 'Id' },
    { full: 'Salary', abbreviation: 'Salry' },
    { full: 'Date', abbreviation: 'Dt' },
    { full: 'Join', abbreviation: 'Join' },
    { full: 'Name', abbreviation: 'Nm' },
    { full: 'Month', abbreviation: 'Mth' },
    { full: 'Calendar', abbreviation: 'Cal' },
    { full: 'Dimension', abbreviation: 'Dim' },
    { full: 'Fact', abbreviation: 'Fct' },
    { full: 'Cancel', abbreviation: 'Cncl' },
    { full: 'Connect', abbreviation: 'Conn' },
    { full: 'Department', abbreviation: 'Dept' },
    { full: 'Customer', abbreviation: 'Cust' },
    { full: 'Product', abbreviation: 'Prd' },
    { full: 'Address', abbreviation: 'Addr' },
    { full: 'Table', abbreviation: 'Tbl' },
    { full: 'Surrogate Key', abbreviation: 'SK' },
    { full: 'Primary Key', abbreviation: 'PK' },
];

let dictionary: AbbreviationEntry[] = [...DEFAULT_DICTIONARY];

/* ── lookup maps (rebuilt whenever the dictionary changes) ───────────────── */

let fullToAbbrev = new Map<string, string>();
let abbrevToFull = new Map<string, string>();
/** Multi-word entries sorted longest-first so greedy matching consumes them
 *  before any shorter single-word entry. */
let multiWordEntries: AbbreviationEntry[] = [];

const rebuildIndexes = () => {
    fullToAbbrev = new Map();
    abbrevToFull = new Map();
    multiWordEntries = [];
    for (const entry of dictionary) {
        fullToAbbrev.set(entry.full.toLowerCase(), entry.abbreviation);
        abbrevToFull.set(entry.abbreviation.toLowerCase(), entry.full);
        if (entry.full.includes(' ')) multiWordEntries.push(entry);
    }
    multiWordEntries.sort((a, b) => b.full.length - a.full.length);
};
rebuildIndexes();

/* ── public dictionary mutators ──────────────────────────────────────────── */

export const getAbbreviationDictionary = (): AbbreviationEntry[] =>
    dictionary.map((e) => ({ ...e }));

/** Replace the dictionary wholesale. Used by an admin endpoint or tests. */
export const setAbbreviationDictionary = (entries: AbbreviationEntry[]): void => {
    dictionary = entries
        .filter((e) => e && e.full && e.abbreviation)
        .map((e) => ({ full: e.full.trim(), abbreviation: e.abbreviation.trim() }));
    rebuildIndexes();
};

/* ── generators ──────────────────────────────────────────────────────────── */

/**
 * Fallback abbreviation for words not in the dictionary: take the first
 * three letters and title-case them ("Lookup" -> "Loo", "REFERENCE" -> "Ref").
 * Words shorter than three letters are returned in title case as-is.
 */
const firstThreeLettersAbbrev = (word: string): string => {
    const letters = word.replace(/[^A-Za-z]/g, '');
    if (!letters) return word.replace(/[^A-Za-z0-9]/g, '');
    const head = letters.slice(0, 3);
    return head.charAt(0).toUpperCase() + head.slice(1).toLowerCase();
};

/**
 * Convert a human-readable entity logical name into a SQL-identifier-safe
 * table name using the abbreviation dictionary.
 *
 * Algorithm:
 *   1. Normalize whitespace.
 *   2. Greedily consume the longest matching multi-word phrase ("Primary Key").
 *   3. Abbreviate any remaining single words via the dictionary; unknown words
 *      fall back to their first three letters, title-cased.
 *   4. Sanitize each emitted token to letters/digits only.
 *   5. Join with underscores.
 *
 * Returns "" when given empty or whitespace-only input.
 */
export const generateTableName = (entityLogicalName: string): string => {
    if (!entityLogicalName) return '';
    let remaining = entityLogicalName.trim().replace(/\s+/g, ' ');
    if (!remaining) return '';

    const tokens: string[] = [];

    // Phase 1 — greedy multi-word phrase matching. We work through the input
    // left-to-right; at each cursor position we try the longest phrase first.
    outer: while (remaining.length > 0) {
        for (const entry of multiWordEntries) {
            const phraseLen = entry.full.length;
            if (
                remaining.length >= phraseLen &&
                remaining.slice(0, phraseLen).toLowerCase() === entry.full.toLowerCase() &&
                // Ensure we matched a whole phrase, not a prefix of a longer word.
                (remaining.length === phraseLen || remaining[phraseLen] === ' ')
            ) {
                tokens.push(entry.abbreviation);
                remaining = remaining.slice(phraseLen).trimStart();
                continue outer;
            }
        }
        // Phase 2 — no phrase match, consume one word.
        const spaceIdx = remaining.indexOf(' ');
        const word = spaceIdx === -1 ? remaining : remaining.slice(0, spaceIdx);
        remaining = spaceIdx === -1 ? '' : remaining.slice(spaceIdx + 1);
        const lower = word.toLowerCase();
        const abbrev = fullToAbbrev.get(lower);
        tokens.push(abbrev ?? firstThreeLettersAbbrev(word));
    }

    return tokens
        .map((t) => t.replace(/[^A-Za-z0-9]/g, ''))
        .filter(Boolean)
        .join('_');
};

/**
 * Reverse direction: expand an abbreviated, underscore-separated table name
 * back into a human-readable entity logical name.
 *
 * Each `_`-separated token is looked up in the reverse map. Hits expand to the
 * full term (which may contain spaces — e.g. "PK" -> "Primary Key"). Misses
 * are kept verbatim but Title-Cased so the result still reads as a label.
 */
export const generateEntityLogicalName = (tableName: string): string => {
    if (!tableName) return '';
    const tokens = tableName.trim().split(/[_\s]+/).filter(Boolean);
    if (tokens.length === 0) return '';
    return tokens
        .map((token) => {
            const full = abbrevToFull.get(token.toLowerCase());
            if (full) return full;
            // Unknown token: title-case so "fact" -> "Fact" rather than leaving it lowercase.
            return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
        })
        .join(' ');
};
