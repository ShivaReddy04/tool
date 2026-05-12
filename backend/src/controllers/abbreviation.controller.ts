import { Request, Response } from 'express';
import {
    getAbbreviationDictionary,
    setAbbreviationDictionary,
    generateTableName,
    generateEntityLogicalName,
    AbbreviationEntry,
} from '../utils/abbreviations';

export const listAbbreviations = (_req: Request, res: Response): void => {
    res.json({ entries: getAbbreviationDictionary() });
};

/**
 * Replace the in-memory dictionary. Admin-only. Persistence to disk / DB is
 * deferred — when an admin UI ships we'll point this at a `abbreviations`
 * table instead of the module-scope array.
 */
export const replaceAbbreviations = (req: Request, res: Response): void => {
    const entries: unknown = req.body?.entries;
    if (!Array.isArray(entries)) {
        res.status(400).json({ error: '`entries` must be an array of {full, abbreviation}' });
        return;
    }
    const cleaned: AbbreviationEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
        const e: any = entries[i];
        if (!e || typeof e.full !== 'string' || typeof e.abbreviation !== 'string') {
            res.status(400).json({ error: `Entry #${i + 1} requires string \`full\` and \`abbreviation\`` });
            return;
        }
        const full = e.full.trim();
        const abbreviation = e.abbreviation.trim();
        if (!full || !abbreviation) {
            res.status(400).json({ error: `Entry #${i + 1} cannot have empty full or abbreviation` });
            return;
        }
        if (!/^[A-Za-z0-9]+$/.test(abbreviation)) {
            res.status(400).json({
                error: `Entry #${i + 1} abbreviation "${abbreviation}" must be alphanumeric (it lands in a SQL identifier)`,
            });
            return;
        }
        cleaned.push({ full, abbreviation });
    }
    setAbbreviationDictionary(cleaned);
    res.json({ entries: getAbbreviationDictionary() });
};

/**
 * Convenience endpoint so the UI can request a server-rendered preview when
 * the dictionary is large or contains overrides not yet reflected on disk.
 * Body: { entityLogicalName?: string, tableName?: string }
 */
export const previewNaming = (req: Request, res: Response): void => {
    const { entityLogicalName, tableName } = req.body || {};
    res.json({
        tableNameFromLogical:
            typeof entityLogicalName === 'string' ? generateTableName(entityLogicalName) : null,
        entityLogicalNameFromTable:
            typeof tableName === 'string' ? generateEntityLogicalName(tableName) : null,
    });
};
