import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  create,
  createCluster,
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

const router = Router();

router.use(authenticate);

// CRUD
router.post('/', createCluster);
router.get('/', list);
router.get('/:id', getById);
router.put('/:id', update);
router.delete('/:id', remove);

// Connection testing
router.post('/test', testDirect);
router.post('/:id/test', testById);

// Introspection
router.get('/:id/data-types', getDataTypesForCluster);
router.get('/:id/databases', getDatabases);
router.get('/:id/schemas', getSchemas);
router.get('/:id/tables', getTables);
router.get('/:id/columns', getColumns);
router.get('/:id/data', getTableData);
router.post('/:id/data', updateTableData);

export default router;
