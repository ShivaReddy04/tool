import { Router } from 'express';
import { saveTableDefinition, getTableDefinition, listTableDefinitions, dryRunTableDefinition, removeTableDefinition, getTableDefinitionByCompositeKey, listMyDrafts } from '../controllers/table_definition.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { saveTableDefinitionBody, dryRunTableBody } from '../schemas/tableDefinition';

const router = Router();

router.use(authenticate);

router.post('/', authorize('developer', 'admin', 'architect'), validate(saveTableDefinitionBody), saveTableDefinition);
router.post('/dry-run', authorize('developer', 'admin', 'architect'), validate(dryRunTableBody), dryRunTableDefinition);
router.get('/', listTableDefinitions);
// Must be registered before "/:id" so the by-key path isn't shadowed.
router.get('/by-key', getTableDefinitionByCompositeKey);
router.get('/drafts/me', listMyDrafts);
router.get('/:id', getTableDefinition);
router.delete('/:id', authorize('developer', 'admin', 'architect'), removeTableDefinition);

export default router;
