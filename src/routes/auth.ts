/**
 * Authentication routes
 * Defines all the authentication-related API endpoints
 */

import { Router } from 'express';
import { isAuthenticated, upload } from '../middleware/auth';
import { validateSignup, validateSignin } from '../utils/validation';
import {
    signup,
    signin,
    logout,
    checkAuth,
    viewProfile,
    editProfile
} from '../controllers/authController';


const router: Router = Router();

// Public routes
router.post('/signup', validateSignup, signup);
router.post('/signin', validateSignin, signin);
router.get('/check', checkAuth);

// Protected routes
router.get('/profile', isAuthenticated, viewProfile);
router.post('/logout', logout);
router.put('/profile/edit', upload.array('files'), editProfile)

export default router;