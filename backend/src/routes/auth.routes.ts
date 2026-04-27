import { Router } from 'express';
import { signup, signupDeveloper, signupArchitect, login, loginDeveloper, loginArchitect, refreshToken, logout, getProfile } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/signup', signup);
router.post('/signup/developer', signupDeveloper);
router.post('/signup/architect', signupArchitect);
router.post('/login', login);
router.post('/login/developer', loginDeveloper);
router.post('/login/architect', loginArchitect);
router.post('/refresh-token', refreshToken);
router.post('/logout', authenticate, logout);
router.get('/profile', authenticate, getProfile);

export default router;
