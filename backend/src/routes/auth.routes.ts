import { Router } from 'express';
import { signup, signupDeveloper, signupArchitect, login, loginDeveloper, loginArchitect, refreshToken, logout, getProfile } from '../controllers/auth.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { signupBody, loginBody, refreshTokenBody, logoutBody } from '../schemas/auth';

const router = Router();

router.post('/signup', validate(signupBody), signup);
router.post('/signup/developer', validate(signupBody), signupDeveloper);
// Architect provisioning is an admin-only operation — privileged accounts
// must never be self-served via a public endpoint.
router.post('/signup/architect', authenticate, authorize('admin'), validate(signupBody), signupArchitect);
router.post('/login', validate(loginBody), login);
router.post('/login/developer', validate(loginBody), loginDeveloper);
router.post('/login/architect', validate(loginBody), loginArchitect);
router.post('/refresh-token', validate(refreshTokenBody), refreshToken);
router.post('/logout', authenticate, validate(logoutBody), logout);
router.get('/profile', authenticate, getProfile);

export default router;
