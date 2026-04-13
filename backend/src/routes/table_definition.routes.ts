import { Router } from 'express';
import { saveTableDefinition, getTableDefinition, listTableDefinitions, dryRunTableDefinition } from '../controllers/table_definition.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', authorize('developer', 'admin', 'architect'), saveTableDefinition);
router.post('/dry-run', authorize('developer', 'admin', 'architect'), dryRunTableDefinition);
router.get('/', listTableDefinitions);
router.get('/:id', getTableDefinition);

export default router;
