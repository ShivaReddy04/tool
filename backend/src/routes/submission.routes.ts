import { Router } from 'express';
import { submitTableForReview, listPendingSubmissions, handleReviewAndSync } from '../controllers/submission.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { submitForReviewBody, reviewSubmissionBody } from '../schemas/submission';

const router = Router();

router.use(authenticate);

router.post('/', authorize('developer', 'admin', 'architect'), validate(submitForReviewBody), submitTableForReview);
router.get('/pending', authorize('architect', 'admin'), listPendingSubmissions);
router.post('/:id/review', authorize('architect', 'admin'), validate(reviewSubmissionBody), handleReviewAndSync);

export default router;
