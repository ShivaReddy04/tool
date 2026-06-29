/**
 * Shared abbreviation engine
 * Used for:
 *  - Entity Logical Name <-> Table Name
 *  - Attribute Name <-> Column Name
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
  { full: "Table", abbreviation: "Tbl" },
  { full: "Customer", abbreviation: "Cust" },
  { full: "Product", abbreviation: "Prd" },
  { full: "Address", abbreviation: "Addr" },
  { full: "Department", abbreviation: "Dept" },
  { full: "Cancel", abbreviation: "Cncl" },
  { full: "Connect", abbreviation: "Conn" },
  { full: "Primary Key", abbreviation: "PK" },
  { full: "Surrogate Key", abbreviation: "SK" },
];

let dictionary: AbbreviationEntry[] = [...DEFAULT_DICTIONARY];

let fullMap = new Map<string, string>();
let abbrevMap = new Map<string, string>();

function rebuildIndexes() {
  fullMap.clear();
  abbrevMap.clear();

  dictionary.forEach((item) => {
    fullMap.set(item.full.toLowerCase(), item.abbreviation.toLowerCase());
    abbrevMap.set(item.abbreviation.toLowerCase(), item.full);
  });
}

rebuildIndexes();

export function setAbbreviationDictionary(entries: AbbreviationEntry[]) {
  if (!entries || entries.length === 0) return;

  dictionary = entries.map((e) => ({
    full: e.full.trim(),
    abbreviation: e.abbreviation.trim(),
  }));

  rebuildIndexes();
}

function firstThree(word: string) {
  const clean = word.replace(/[^A-Za-z0-9]/g, "");

  if (clean.length <= 3)
    return clean.toLowerCase();

  return clean.substring(0, 3).toLowerCase();
}

/*----------------------------------------------------
  Employee Sales Fact Table
  ->
  empslsfcttbl
----------------------------------------------------*/
export function generateTableName(name: string): string {
  if (!name) return "";

  const words = name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ");

  let result = "";

  let i = 0;

  while (i < words.length) {
    // try 2-word abbreviation first
    if (i + 1 < words.length) {
      const two = `${words[i]} ${words[i + 1]}`.toLowerCase();

      if (fullMap.has(two)) {
        result += fullMap.get(two);
        i += 2;
        continue;
      }
    }

    const one = words[i].toLowerCase();

    if (fullMap.has(one))
      result += fullMap.get(one);
    else
      result += firstThree(one);

    i++;
  }

  return result.toLowerCase();
}

/*----------------------------------------------------
  empslsfcttbl
  ->
  Employee Sales Fact Table
----------------------------------------------------*/
export function generateEntityLogicalName(name: string): string {
  if (!name) return "";

  const input = name
    .replace(/_/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

  const abbreviations = [...abbrevMap.entries()]
    .sort((a, b) => b[0].length - a[0].length);

  let remaining = input;

  const words: string[] = [];

  while (remaining.length > 0) {

    let matched = false;

    for (const [abbr, full] of abbreviations) {

      if (remaining.startsWith(abbr)) {

        words.push(full);

        remaining = remaining.substring(abbr.length);

        matched = true;

        break;
      }
    }

    if (!matched) {

      words.push(
        remaining.charAt(0).toUpperCase() +
        remaining.substring(1)
      );

      break;
    }
  }

  return words.join(" ");
}

/*----------------------------------------------------
 Attribute Name -> Column Name
----------------------------------------------------*/
export function generateColumnName(attribute: string) {
  return generateTableName(attribute);
}

/*----------------------------------------------------
 Column Name -> Attribute Name
----------------------------------------------------*/
export function generateAttributeName(column: string) {
  return generateEntityLogicalName(column);
}