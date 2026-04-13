import { Router } from 'express';
import { submitTableForReview, listPendingSubmissions, handleReviewAndSync } from '../controllers/submission.controller';

const router = Router();

router.post('/', submitTableForReview);
router.get('/pending', listPendingSubmissions);
router.post('/:id/review', handleReviewAndSync);

export default router;
