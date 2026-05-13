/**
 * Dialect-aware DDL generation for the approval pipeline.
 *
 * Input is a snapshot of column_definitions rows (DB shape, snake_case) plus
 * the column action ('Add' | 'Modify' | 'Drop' | 'No Change'). Output is one
 * CREATE TABLE statement (when the physical table doesn't exist) or a list of
 * ALTER statements ordered as Add → Modify → Drop.
 */

export type DbType = 'postgresql' | 'redshift' | 'mysql' | 'mssql';

export interface DDLColumn {
    column_name: string;
    data_type: string;
    is_nullable?: boolean;
    is_primary_key?: boolean;
    default_value?: string | null;
    action?: 'No Change' | 'Modify' | 'Add' | 'Drop';
}

function quoteIdent(dbType: DbType, ident: string): string {
    if (dbType === 'mysql') return `\`${ident.replace(/`/g, '``')}\``;
    if (dbType === 'mssql') return `[${ident.replace(/]/g, ']]')}]`;
    // postgresql / redshift
    return `"${ident.replace(/"/g, '""')}"`;
}

function qualified(dbType: DbType, schema: string, table: string): string {
    if (dbType === 'mysql') {
        // MySQL: schema is the database; table reference is `schema`.`table`
        return `${quoteIdent(dbType, schema)}.${quoteIdent(dbType, table)}`;
    }
    return `${quoteIdent(dbType, schema)}.${quoteIdent(dbType, table)}`;
}

function colSpec(dbType: DbType, col: DDLColumn): string {
    const nullPart = col.is_nullable === false ? ' NOT NULL' : '';
    const defaultPart =
        col.default_value !== undefined && col.default_value !== null && col.default_value !== ''
            ? ` DEFAULT ${col.default_value}`
            : '';
    return `${quoteIdent(dbType, col.column_name)} ${col.data_type}${nullPart}${defaultPart}`;
}

export function buildCreateTableDDL(
    dbType: DbType,
    schema: string,
    table: string,
    columns: DDLColumn[]
): string | null {
    const included = columns.filter((c) => c.action !== 'Drop');
    if (included.length === 0) return null;

    const columnDefs = included.map((c) => colSpec(dbType, c));

    const pkCols = included.filter((c) => c.is_primary_key).map((c) => quoteIdent(dbType, c.column_name));
    if (pkCols.length > 0) {
        columnDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`);
    }

    return `CREATE TABLE ${qualified(dbType, schema, table)} (${columnDefs.join(', ')})`;
}

/**
 * Generate ALTER statements for an existing table. Modify gets expanded into
 * separate statements per dialect because Postgres/Redshift can't change type +
 * nullability + default in a single ALTER COLUMN clause.
 */
export function buildAlterDDL(
    dbType: DbType,
    schema: string,
    table: string,
    columns: DDLColumn[]
): string[] {
    const target = qualified(dbType, schema, table);
    const stmts: string[] = [];

    // Add
    for (const c of columns.filter((x) => x.action === 'Add')) {
        stmts.push(`ALTER TABLE ${target} ADD COLUMN ${colSpec(dbType, c)}`);
    }

    // Modify — dialect-specific
    for (const c of columns.filter((x) => x.action === 'Modify')) {
        const colName = quoteIdent(dbType, c.column_name);

        if (dbType === 'postgresql' || dbType === 'redshift') {
            stmts.push(`ALTER TABLE ${target} ALTER COLUMN ${colName} TYPE ${c.data_type}`);
            if (c.is_nullable === false) {
                stmts.push(`ALTER TABLE ${target} ALTER COLUMN ${colName} SET NOT NULL`);
            } else if (c.is_nullable === true) {
                stmts.push(`ALTER TABLE ${target} ALTER COLUMN ${colName} DROP NOT NULL`);
            }
            if (c.default_value !== undefined && c.default_value !== null && c.default_value !== '') {
                stmts.push(`ALTER TABLE ${target} ALTER COLUMN ${colName} SET DEFAULT ${c.default_value}`);
            } else {
                stmts.push(`ALTER TABLE ${target} ALTER COLUMN ${colName} DROP DEFAULT`);
            }
        } else if (dbType === 'mysql') {
            // MySQL allows full redefinition in a single MODIFY COLUMN
            stmts.push(`ALTER TABLE ${target} MODIFY COLUMN ${colSpec(dbType, c)}`);
        } else if (dbType === 'mssql') {
            const nullPart = c.is_nullable === false ? ' NOT NULL' : ' NULL';
            stmts.push(`ALTER TABLE ${target} ALTER COLUMN ${colName} ${c.data_type}${nullPart}`);
            // MSSQL defaults live on a separate constraint — handle on a best-effort basis
            if (c.default_value !== undefined && c.default_value !== null && c.default_value !== '') {
                stmts.push(`ALTER TABLE ${target} ADD DEFAULT ${c.default_value} FOR ${colName}`);
            }
        }
    }

    // Drop (last so dependent ALTER MODIFYs above still see the columns)
    for (const c of columns.filter((x) => x.action === 'Drop')) {
        stmts.push(`ALTER TABLE ${target} DROP COLUMN ${quoteIdent(dbType, c.column_name)}`);
    }

    return stmts;
}

export function hasPendingChanges(columns: DDLColumn[]): boolean {
    return columns.some((c) => c.action && c.action !== 'No Change');
}
