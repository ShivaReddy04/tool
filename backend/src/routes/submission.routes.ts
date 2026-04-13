import { Router } from 'express';
import { submitTableForReview, listPendingSubmissions, handleReviewAndSync } from '../controllers/submission.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', authorize('developer', 'admin', 'architect'), submitTableForReview);
router.get('/pending', authorize('architect', 'admin'), listPendingSubmissions);
router.post('/:id/review', authorize('architect', 'admin'), handleReviewAndSync);

export default router;
