import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { create, list, approve, reject } from '../controllers/change_request.controller';
import { createChangeRequestBody } from '../schemas/changeRequest';

const router = Router();

router.use(authenticate);

router.post('/', validate(createChangeRequestBody), create);
router.get('/', list);
router.put('/:id/approve', approve);
router.put('/:id/reject', reject);

export default router;
