import { Request, Response } from 'express';
import { createOrUpdateTableDefinition, getTableDefinitionDetails, getAllTableDefinitions } from '../models/table_definition.model';
import { bulkUpsertColumnDefinitions, getColumnDefinitionsByTableId } from '../models/column_definition.model';

export const saveTableDefinition = async (req: Request, res: Response): Promise<void> => {
    try {
        const { table, columns } = req.body;
        if (!table || !table.connection_id || !table.database_name || !table.schema_name || !table.table_name) {
            res.status(400).json({ error: 'Required table definition parameters missing' });
            return;
        }

        // Save Table 
        const savedTable = await createOrUpdateTableDefinition(table);

        // Save Columns
        if (columns && Array.isArray(columns) && columns.length > 0) {
            await bulkUpsertColumnDefinitions(savedTable.id, columns);
        }

        const savedColumns = await getColumnDefinitionsByTableId(savedTable.id);
        res.status(200).json({ table: savedTable, columns: savedColumns });
    } catch (err) {
        console.error('Save table definition error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getTableDefinition = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const table = await getTableDefinitionDetails(id);
        if (!table) {
            res.status(404).json({ error: 'Table definition not found' });
            return;
        }
        const columns = await getColumnDefinitionsByTableId(id);
        res.status(200).json({ table, columns });
    } catch (err) {
        console.error('Get table definition error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const listTableDefinitions = async (req: Request, res: Response): Promise<void> => {
    try {
        const { connectionId, schemaName } = req.query;
        if (!connectionId || !schemaName) {
            res.status(400).json({ error: 'connectionId and schemaName query parameters are required' });
            return;
        }
        const tables = await getAllTableDefinitions(connectionId as string, schemaName as string);
        res.status(200).json(tables);
    } catch (err) {
        console.error('List table definitions error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
