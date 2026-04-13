import { Router } from 'express';
import { saveTableDefinition, getTableDefinition, listTableDefinitions } from '../controllers/table_definition.controller';

const router = Router();

router.post('/', saveTableDefinition);
router.get('/', listTableDefinitions);
router.get('/:id', getTableDefinition);

export default router;
