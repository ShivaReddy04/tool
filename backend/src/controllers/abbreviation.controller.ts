import { Request, Response } from 'express';
import {
  getAbbreviationDictionary,
  setAbbreviationDictionary,
  generateTableName,
  generateEntityLogicalName,
} from '../utils/abbreviations';
import type { ReplaceAbbreviationsInput, PreviewNamingInput } from '../schemas/abbreviation';

export const listAbbreviations = (_req: Request, res: Response): void => {
  res.json({ entries: getAbbreviationDictionary() });
};

// Replace the in-memory dictionary. Admin-only. Persistence to disk / DB is
// deferred — when an admin UI ships we'll point this at an `abbreviations`
// table instead of the module-scope array.
export const replaceAbbreviations = (req: Request, res: Response): void => {
  const { entries } = req.body as ReplaceAbbreviationsInput;
  setAbbreviationDictionary(entries);
  res.json({ entries: getAbbreviationDictionary() });
};

// Server-rendered preview, useful for very long inputs or for clients without
// the frontend rule engine in scope (e.g. a CLI).
export const previewNaming = (req: Request, res: Response): void => {
  const { entityLogicalName, tableName } = req.body as PreviewNamingInput;
  res.json({
    tableNameFromLogical: entityLogicalName ? generateTableName(entityLogicalName) : null,
    entityLogicalNameFromTable: tableName ? generateEntityLogicalName(tableName) : null,
  });
};
