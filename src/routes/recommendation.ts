import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import {
    getAllPersonalities,
    updateUserPersonality,
    getUserPersonality,
    getPreferenceCategories,
    updateUserPreferences,
    getAllQuestions
} from '../controllers/recommendationController';

const router: Router = Router();

// Protected route
router.get('/personality', isAuthenticated, getAllPersonalities);
router.get('/personality/user', isAuthenticated, getUserPersonality);
router.post('/personality/update', isAuthenticated, updateUserPersonality);
router.get('/preferences/categories', isAuthenticated, getPreferenceCategories);
router.post('/preferences/update', isAuthenticated, updateUserPreferences);
router.get('/questions', isAuthenticated, getAllQuestions)

export default router;