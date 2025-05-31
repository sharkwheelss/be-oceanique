import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { getAllPersonalities } from '../controllers/recommendationController';

const router: Router = Router();

// Protected route
router.get('/personality', isAuthenticated, getAllPersonalities);

export default router;