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

  const abbreviations = Array.from(abbrevMap.entries()).sort(
  (a, b) => b[0].length - a[0].length
);

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
 Abbreviates a human-readable attribute into a physical
 identifier: "Employee Name" -> "empnm".
----------------------------------------------------*/
export function generateColumnName(attribute: string) {
  return generateTableName(attribute);
}

/*----------------------------------------------------
 Sanitize a physical column name the user typed directly
 (e.g. "empnm", "emp_nm", "Employee Id"). Unlike
 generateColumnName this does NOT abbreviate — it only
 collapses to a single continuous identifier so the user
 can type the physical name verbatim without it being
 truncated by the abbreviation engine.
   "emp_nm"      -> "empnm"
   "Phone No"    -> "phoneno"
----------------------------------------------------*/
export function sanitizeColumnName(raw: string) {
  return raw.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

/*======================================================================
  Column Name -> Attribute Name
  ----------------------------------------------------------------------
  The physical column name is a terse, run-together identifier
  ("empnm", "emailid", "phoneno"). The Attribute Name is its
  human-readable label ("Employee Name", "Email ID", "Phone Number").

  The entity/table dictionary above is tuned for whole-phrase table
  naming and (deliberately) expands "id" -> "Identifier", which is wrong
  for column labels. Column expansion therefore has its own curated
  dictionary and a greedy longest-match parser.

  To teach the parser a new abbreviation, add ONE entry to
  COLUMN_ABBREVIATIONS below — nothing else needs to change. Keys are
  matched case-insensitively; the value is emitted verbatim, so it may
  contain spaces and its own casing ("Date of Birth").
======================================================================*/

const COLUMN_ABBREVIATIONS: Record<string, string> = {
  // people / org
  employee: "Employee",
  emp: "Employee",
  department: "Department",
  dept: "Department",
  customer: "Customer",
  cust: "Customer",
  manager: "Manager",
  mgr: "Manager",
  organization: "Organization",
  org: "Organization",
  // identity / naming
  name: "Name",
  nm: "Name",
  identifier: "Identifier",
  id: "ID",
  code: "Code",
  cd: "Code",
  // contact
  email: "Email",
  phone: "Phone",
  mobile: "Mobile",
  number: "Number",
  num: "Number",
  no: "Number",
  address: "Address",
  addr: "Address",
  // dates (multi-word expansions)
  dob: "Date of Birth",
  doj: "Date of Joining",
  date: "Date",
  dt: "Date",
  // money / quantity
  salary: "Salary",
  salry: "Salary",
  amount: "Amount",
  amt: "Amount",
  price: "Price",
  quantity: "Quantity",
  qty: "Quantity",
  count: "Count",
  cnt: "Count",
  total: "Total",
  // descriptive
  description: "Description",
  desc: "Description",
  status: "Status",
  type: "Type",
  flag: "Flag",
  // geo
  city: "City",
  state: "State",
  country: "Country",
  // legacy table-dictionary abbreviations kept so existing column names
  // (e.g. "empslsfct") still expand the way they used to.
  sls: "Sales",
  fct: "Fact",
  dim: "Dimension",
  tbl: "Table",
  cal: "Calendar",
  mth: "Month",
  prd: "Product",
  product: "Product",
};

/** Abbreviation keys sorted longest-first so greedy matching consumes the
 *  most specific token available ("number" before "num" before "no"). */
const SORTED_COLUMN_ABBREVS: [string, string][] = Object.entries(
  COLUMN_ABBREVIATIONS
).sort((a, b) => b[0].length - a[0].length);

/** Break input into word-ish segments, splitting camelCase, letter/digit
 *  boundaries and any non-alphanumeric separators (spaces, underscores…). */
function splitColumnSegments(input: string): string[] {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase / PascalCase
    .replace(/([A-Za-z])([0-9])/g, "$1 $2") // letter -> digit
    .replace(/([0-9])([A-Za-z])/g, "$1 $2") // digit -> letter
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/** Greedily expand a single run-together segment via the dictionary. Any
 *  leftover the dictionary can't recognise is title-cased and kept as-is. */
function expandColumnSegment(segment: string): string[] {
  let remaining = segment.toLowerCase();
  const words: string[] = [];

  while (remaining.length > 0) {
    let matched = false;

    for (const [abbr, full] of SORTED_COLUMN_ABBREVS) {
      if (remaining.startsWith(abbr)) {
        words.push(full);
        remaining = remaining.slice(abbr.length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      words.push(remaining.charAt(0).toUpperCase() + remaining.slice(1));
      break;
    }
  }

  return words;
}

/**
 * Expand a physical column name into a human-readable Attribute Name.
 *   "empnm"        -> "Employee Name"
 *   "emailid"      -> "Email ID"
 *   "mobilenumber" -> "Mobile Number"
 *   "dob"          -> "Date of Birth"
 */
export function generateAttributeName(column: string): string {
  if (!column) return "";

  const words: string[] = [];
  for (const segment of splitColumnSegments(column)) {
    words.push(...expandColumnSegment(segment));
  }
  return words.join(" ").replace(/\s+/g, " ").trim();
}