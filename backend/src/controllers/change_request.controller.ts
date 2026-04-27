import { Request, Response } from 'express';
import {
  createChangeRequest,
  getChangeRequests,
  getChangeRequestById,
  updateChangeRequestStatus,
  ChangeRequest
} from '../models/change_request.model';
import { getClusterConnectionConfig } from '../models/cluster.model';
import { getConnector } from '../services/connector';

// POST /api/change-requests
export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const { connection_id, database_name, schema_name, table_name, row_id, old_data, new_data } = req.body;

    if (!connection_id || !table_name || !row_id || !old_data || !new_data) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const cr: ChangeRequest = {
      connection_id,
      database_name,
      schema_name,
      table_name,
      row_id: String(row_id),
      old_data,
      new_data,
      submitted_by: req.user!.userId
    };

    const created = await createChangeRequest(cr);
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Create change request error:', err);
    res.status(500).json({ error: err.message || 'Failed to create change request' });
  }
};

// GET /api/change-requests
export const list = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string;
    const requests = await getChangeRequests(status);
    res.json(requests);
  } catch (err: any) {
    console.error('List change requests error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch change requests' });
  }
};

// PUT /api/change-requests/:id/approve
export const approve = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const cr = await getChangeRequestById(id);
    if (!cr) {
      res.status(404).json({ error: 'Change request not found' });
      return;
    }

    if (cr.status !== 'pending') {
      res.status(400).json({ error: `Cannot approve request with status ${cr.status}` });
      return;
    }

    const connConfig = await getClusterConnectionConfig(cr.connection_id);
    if (!connConfig) {
      res.status(404).json({ error: 'Connection configuration not found' });
      return;
    }

    const dbType = connConfig.cluster.db_type;
    const connector = getConnector(dbType);

    const originalRow = cr.old_data;
    const updatedRow = cr.new_data;

    const setKeys = Object.keys(updatedRow).filter(k => updatedRow[k] !== originalRow[k]);
    if (setKeys.length > 0) {
      let queryStr = "";
      const params: any[] = [];
      let paramCounter = 1;

      const schema = cr.schema_name || '';
      const table = cr.table_name;
      const database = cr.database_name || connConfig.config.database;

      if (dbType === "postgresql" || dbType === "redshift") {
        const setClauses = setKeys.map(k => {
          params.push(updatedRow[k]);
          return `"${k}" = $${paramCounter++}`;
        }).join(", ");
        
        const whereClauses = Object.keys(originalRow).map(k => {
          if (originalRow[k] === null) {
            return `"${k}" IS NULL`;
          } else {
            params.push(originalRow[k]);
            return `"${k}" = $${paramCounter++}`;
          }
        }).join(" AND ");
        
        queryStr = `UPDATE "${schema}"."${table}" SET ${setClauses} WHERE ${whereClauses}`;
      } else if (dbType === "mysql") {
        const setClauses = setKeys.map(k => {
          params.push(updatedRow[k]);
          return `\`${k}\` = ?`;
        }).join(", ");
        
        const whereClauses = Object.keys(originalRow).map(k => {
          if (originalRow[k] === null) {
            return `\`${k}\` IS NULL`;
          } else {
            params.push(originalRow[k]);
            return `\`${k}\` = ?`;
          }
        }).join(" AND ");
        
        queryStr = `UPDATE \`${schema}\`.\`${table}\` SET ${setClauses} WHERE ${whereClauses}`;
      } else if (dbType === "mssql") {
        const setClauses = setKeys.map(k => {
          params.push(updatedRow[k]);
          return `[${k}] = @p${paramCounter - 1}`;
        }).join(", ");
        
        const whereClauses = Object.keys(originalRow).map(k => {
          if (originalRow[k] === null) {
            return `[${k}] IS NULL`;
          } else {
            params.push(originalRow[k]);
            const paramName = `@p${paramCounter - 1 + setKeys.length}`;
            return `[${k}] = ${paramName}`;
          }
        }).join(" AND ");
        
        queryStr = `UPDATE [${schema}].[${table}] SET ${setClauses} WHERE ${whereClauses}`;
      }

      await connector.runQuery({ ...connConfig.config, database }, queryStr, params);
    }

    const updated = await updateChangeRequestStatus(id, 'approved', req.user!.userId);
    res.json(updated);
  } catch (err: any) {
    console.error('Approve change request error:', err);
    res.status(500).json({ error: err.message || 'Failed to approve change request' });
  }
};

// PUT /api/change-requests/:id/reject
export const reject = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const cr = await getChangeRequestById(id);
    if (!cr) {
      res.status(404).json({ error: 'Change request not found' });
      return;
    }

    if (cr.status !== 'pending') {
      res.status(400).json({ error: `Cannot reject request with status ${cr.status}` });
      return;
    }

    const updated = await updateChangeRequestStatus(id, 'rejected', req.user!.userId);
    res.json(updated);
  } catch (err: any) {
    console.error('Reject change request error:', err);
    res.status(500).json({ error: err.message || 'Failed to reject change request' });
  }
};
