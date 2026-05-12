/**
 * Frontend mirror of `backend/src/utils/abbreviations.ts`.
 *
 * The default dictionary ships with the bundle so the Create Table drawer
 * has instant offline UX. On app load the drawer calls GET /api/abbreviations
 * once and replaces the dictionary if the backend has overrides — the UI
 * stays in sync without redeploying the frontend.
 *
 * Keep the algorithm here byte-for-byte equivalent to the backend so a
 * server-rendered preview never disagrees with what the user sees inline.
 */

export interface AbbreviationEntry {
  full: string;
  abbreviation: string;
}

const DEFAULT_DICTIONARY: AbbreviationEntry[] = [
  { full: "Employee", abbreviation: "Emp" },
  { full: "Sales", abbreviation: "Sls" },
  { full: "Identifier", abbreviation: "Id" },
  { full: "Salary", abbreviation: "Salry" },
  { full: "Date", abbreviation: "Dt" },
  { full: "Join", abbreviation: "Join" },
  { full: "Name", abbreviation: "Nm" },
  { full: "Month", abbreviation: "Mth" },
  { full: "Calendar", abbreviation: "Cal" },
  { full: "Dimension", abbreviation: "Dim" },
  { full: "Fact", abbreviation: "Fct" },
  { full: "Cancel", abbreviation: "Cncl" },
  { full: "Connect", abbreviation: "Conn" },
  { full: "Department", abbreviation: "Dept" },
  { full: "Surrogate Key", abbreviation: "SK" },
  { full: "Primary Key", abbreviation: "PK" },
];

let dictionary: AbbreviationEntry[] = [...DEFAULT_DICTIONARY];
let fullToAbbrev = new Map<string, string>();
let abbrevToFull = new Map<string, string>();
let multiWordEntries: AbbreviationEntry[] = [];

const rebuildIndexes = () => {
  fullToAbbrev = new Map();
  abbrevToFull = new Map();
  multiWordEntries = [];
  for (const entry of dictionary) {
    fullToAbbrev.set(entry.full.toLowerCase(), entry.abbreviation);
    abbrevToFull.set(entry.abbreviation.toLowerCase(), entry.full);
    if (entry.full.includes(" ")) multiWordEntries.push(entry);
  }
  multiWordEntries.sort((a, b) => b.full.length - a.full.length);
};
rebuildIndexes();

export const getAbbreviationDictionary = (): AbbreviationEntry[] =>
  dictionary.map((e) => ({ ...e }));

export const setAbbreviationDictionary = (entries: AbbreviationEntry[]): void => {
  dictionary = entries
    .filter((e) => e && e.full && e.abbreviation)
    .map((e) => ({ full: e.full.trim(), abbreviation: e.abbreviation.trim() }));
  rebuildIndexes();
};

/**
 * "Employee Sales Fact"            -> "Emp_Sls_Fct"
 * "Primary Key Identifier"         -> "PK_Id"
 * "Lookup Reference Table"         -> "Lookup_Reference_Table"   (unknown words pass through)
 */
export const generateTableName = (entityLogicalName: string): string => {
  if (!entityLogicalName) return "";
  let remaining = entityLogicalName.trim().replace(/\s+/g, " ");
  if (!remaining) return "";

  const tokens: string[] = [];

  outer: while (remaining.length > 0) {
    for (const entry of multiWordEntries) {
      const phraseLen = entry.full.length;
      if (
        remaining.length >= phraseLen &&
        remaining.slice(0, phraseLen).toLowerCase() === entry.full.toLowerCase() &&
        (remaining.length === phraseLen || remaining[phraseLen] === " ")
      ) {
        tokens.push(entry.abbreviation);
        remaining = remaining.slice(phraseLen).trimStart();
        continue outer;
      }
    }
    const spaceIdx = remaining.indexOf(" ");
    const word = spaceIdx === -1 ? remaining : remaining.slice(0, spaceIdx);
    remaining = spaceIdx === -1 ? "" : remaining.slice(spaceIdx + 1);
    const abbrev = fullToAbbrev.get(word.toLowerCase());
    tokens.push(abbrev ?? word);
  }

  return tokens
    .map((t) => t.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean)
    .join("_");
};

/**
 * "Emp_Sls_Fct"                    -> "Employee Sales Fact"
 * "PK_Id"                          -> "Primary Key Identifier"
 * "report_2024"                    -> "Report 2024"               (unknown tokens title-cased)
 */
export const generateEntityLogicalName = (tableName: string): string => {
  if (!tableName) return "";
  const tokens = tableName.trim().split(/[_\s]+/).filter(Boolean);
  if (tokens.length === 0) return "";
  return tokens
    .map((token) => {
      const full = abbrevToFull.get(token.toLowerCase());
      if (full) return full;
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
};
