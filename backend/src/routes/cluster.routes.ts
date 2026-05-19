import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  create,
  list,
  getById,
  update,
  remove,
  testById,
  testDirect,
  getDataTypesForCluster,
  getDatabases,
  getSchemas,
  getTables,
  getColumns,
  getTableData,
  updateTableData,
} from '../controllers/cluster.controller';
import { createClusterBody, updateClusterBody, testConnectionBody, updateRowBody } from '../schemas/cluster';

const router = Router();

router.use(authenticate);

// CRUD
router.post('/', validate(createClusterBody), create);
router.get('/', list);
router.get('/:id', getById);
router.put('/:id', validate(updateClusterBody), update);
router.delete('/:id', remove);

// Connection testing
router.post('/test', validate(testConnectionBody), testDirect);
router.post('/:id/test', testById);

// Introspection
router.get('/:id/data-types', getDataTypesForCluster);
router.get('/:id/databases', getDatabases);
router.get('/:id/schemas', getSchemas);
router.get('/:id/tables', getTables);
router.get('/:id/columns', getColumns);
router.get('/:id/data', getTableData);
router.post('/:id/data', validate(updateRowBody), updateTableData);

export default router;
