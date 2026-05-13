import { Router } from 'express';
import { saveTableDefinition, getTableDefinition, listTableDefinitions, dryRunTableDefinition, removeTableDefinition, getTableDefinitionByCompositeKey } from '../controllers/table_definition.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', authorize('developer', 'admin', 'architect'), saveTableDefinition);
router.post('/dry-run', authorize('developer', 'admin', 'architect'), dryRunTableDefinition);
router.get('/', listTableDefinitions);
// Must be registered before "/:id" so the by-key path isn't shadowed.
router.get('/by-key', getTableDefinitionByCompositeKey);
router.get('/:id', getTableDefinition);
router.delete('/:id', authorize('developer', 'admin', 'architect'), removeTableDefinition);

export default router;
