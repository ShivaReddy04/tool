import { Router } from 'express';
import { addSchema, listSchemas, removeSchema } from '../controllers/schema.controller';
import { validate } from '../middleware/validate';
import { addSchemaBody } from '../schemas/schema';

const router = Router();

router.post('/', validate(addSchemaBody), addSchema);
router.get('/cluster/:clusterId', listSchemas);
router.delete('/:id', removeSchema);

export default router;
