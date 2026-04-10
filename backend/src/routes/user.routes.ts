import { Router } from 'express';
import { listUsers, changeUserRole } from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize('admin'), listUsers);
router.patch('/:id/role', authenticate, authorize('admin'), changeUserRole);

export default router;
