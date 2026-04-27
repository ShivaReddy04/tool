import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { checkRole } from '../middleware/roles';
import { listTemplates, getTemplate, approveTemplate, rejectTemplate, processTemplate } from '../controllers/architect.controller';

const router = Router();

router.get('/templates', authenticate, checkRole('ARCHITECT'), listTemplates);
router.get('/templates/:id', authenticate, checkRole('ARCHITECT'), getTemplate);
router.post('/templates/:id/approve', authenticate, checkRole('ARCHITECT'), approveTemplate);
router.post('/templates/:id/reject', authenticate, checkRole('ARCHITECT'), rejectTemplate);
router.post('/templates/:id/process', authenticate, checkRole('ARCHITECT'), processTemplate);

export default router;
