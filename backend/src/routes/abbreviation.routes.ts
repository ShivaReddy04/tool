import { Router } from 'express';
import {
    listAbbreviations,
    replaceAbbreviations,
    previewNaming,
} from '../controllers/abbreviation.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Read access for any authenticated user — the dictionary drives the
// Create Table drawer for both developers and architects.
router.get('/', listAbbreviations);

// Server-rendered name preview. Useful for very long inputs or for keeping
// the canonical rule in one place (e.g. a CLI / API client without JS).
router.post('/preview', previewNaming);

// Admin-only writes. The in-memory dictionary persists until process restart;
// disk/DB persistence will be added with the admin UI.
router.put('/', authorize('admin'), replaceAbbreviations);

export default router;
