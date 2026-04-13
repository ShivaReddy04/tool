import { Router } from 'express';
import { saveTableDefinition, getTableDefinition, listTableDefinitions, dryRunTableDefinition } from '../controllers/table_definition.controller';

const router = Router();

router.post('/', saveTableDefinition);
router.post('/dry-run', dryRunTableDefinition);
router.get('/', listTableDefinitions);
router.get('/:id', getTableDefinition);

export default router;
