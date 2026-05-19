import { Router } from 'express';
import { listUsers, listArchitects, changeUserRole } from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { changeRoleBody } from '../schemas/user';

const router = Router();

router.get('/', authenticate, authorize('admin'), listUsers);

// Any authenticated user can look up architects to assign as a reviewer.
// The response only exposes safe profile fields (see controller).
router.get('/architects', authenticate, listArchitects);

router.patch('/:id/role', authenticate, authorize('admin'), validate(changeRoleBody), changeUserRole);

export default router;
