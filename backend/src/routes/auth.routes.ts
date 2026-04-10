import { Router } from 'express';
import { signup, login, refreshToken, logout, getProfile } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', authenticate, logout);
router.get('/profile', authenticate, getProfile);

export default router;
