import { Router } from 'express';
import { addBusinessArea, listBusinessAreas } from '../controllers/business_area.controller';

const router = Router();

router.post('/', addBusinessArea);
router.get('/', listBusinessAreas);

export default router;
