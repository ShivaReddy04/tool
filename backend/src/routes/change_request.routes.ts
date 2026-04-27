import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { create, list, approve, reject } from '../controllers/change_request.controller';

const router = Router();

router.use(authenticate);

router.post('/', create);
router.get('/', list);
router.put('/:id/approve', approve);
router.put('/:id/reject', reject);

export default router;
