/**
 * Authentication routes
 * Defines all the authentication-related API endpoints
 */

import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { validateSignup, validateSignin } from '../utils/validation';
import {
    signup,
    signin,
    getCurrentUser,
    logout,
    checkAuth,
} from '../controllers/authController';


const router: Router = Router();

// Public routes
router.post('/signup', validateSignup, signup);
router.post('/signin', validateSignin, signin);
router.get('/check', checkAuth);

// Protected routes
router.get('/me', isAuthenticated, getCurrentUser);
router.post('/logout', logout);

export default router;