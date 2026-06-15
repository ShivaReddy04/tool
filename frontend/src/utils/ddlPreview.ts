import type { ColumnDefinition, DbType } from "../types";

/**
 * Client-side mirror of the backend CREATE-TABLE generator
 * (backend/src/utils/ddl_generator.ts → buildCreateTableDDL) so the table
 * builder can show a live DDL preview that matches what the approval pipeline
 * will actually run. Keep the quoting, column spec, and the Redshift
 * DISTSTYLE/DISTKEY/SORTKEY rules aligned with the backend.
 *
 * Preview only — the real DDL is always generated server-side at submit/apply
 * time from the persisted snapshot.
 */

function quoteIdent(dbType: DbType, ident: string): string {
  if (dbType === "mysql") return `\`${ident.replace(/`/g, "``")}\``;
  if (dbType === "mssql") return `[${ident.replace(/]/g, "]]")}]`;
  // postgresql / redshift
  return `"${ident.replace(/"/g, '""')}"`;
}

function colSpec(dbType: DbType, c: ColumnDefinition): string {
  const nullPart = c.isNullable === false ? " NOT NULL" : "";
  const def = c.defaultValue;
  const defaultPart =
    def !== undefined && def !== null && def !== "" ? ` DEFAULT ${def}` : "";
  return `${quoteIdent(dbType, c.columnName)} ${c.dataType}${nullPart}${defaultPart}`;
}

export interface DDLPreviewInput {
  dbType: DbType;
  schema: string;
  table: string;
  distributionStyle?: string | null;
  columns: ColumnDefinition[];
}

export function generateCreateTableDDL({
  dbType,
  schema,
  table,
  distributionStyle,
  columns,
}: DDLPreviewInput): string {
  const included = columns.filter((c) => c.action !== "Drop" && c.columnName.trim());
  if (!table.trim() || included.length === 0) return "";

  const defs = included.map((c) => colSpec(dbType, c));

  const pk = included
    .filter((c) => c.isPrimaryKey)
    .map((c) => quoteIdent(dbType, c.columnName));
  if (pk.length > 0) defs.push(`PRIMARY KEY (${pk.join(", ")})`);

  const qualified = `${quoteIdent(dbType, schema || "public")}.${quoteIdent(dbType, table)}`;
  let ddl = `CREATE TABLE ${qualified} (\n  ${defs.join(",\n  ")}\n)`;

  // DISTSTYLE / DISTKEY / SORTKEY are Redshift-only — other engines reject them.
  if (dbType === "redshift") {
    const clauses: string[] = [];
    const style = (distributionStyle || "").toUpperCase();
    if (style === "KEY" || style === "EVEN" || style === "ALL" || style === "AUTO") {
      clauses.push(`DISTSTYLE ${style}`);
    }
    // DISTKEY is only valid with DISTSTYLE KEY; Redshift permits exactly one.
    if (style === "KEY") {
      const distKeyCol = included.find((c) => c.isDistKey);
      if (distKeyCol) clauses.push(`DISTKEY(${quoteIdent(dbType, distKeyCol.columnName)})`);
    }
    const sortKeyCols = included
      .filter((c) => c.isSortKey)
      .map((c) => quoteIdent(dbType, c.columnName));
    if (sortKeyCols.length > 0) clauses.push(`SORTKEY(${sortKeyCols.join(", ")})`);

    if (clauses.length > 0) ddl += `\n${clauses.join("\n")}`;
  }

  return `${ddl};`;
}
