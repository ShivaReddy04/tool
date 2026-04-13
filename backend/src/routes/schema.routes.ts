import { Router } from 'express';
import { addSchema, listSchemas, removeSchema } from '../controllers/schema.controller';

const router = Router();

router.post('/', addSchema);
router.get('/cluster/:clusterId', listSchemas);
router.delete('/:id', removeSchema);

export default router;
