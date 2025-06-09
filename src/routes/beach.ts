import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import {
    getAllBeaches,
    getBeachDetails,
    getBeachReviews
} from '../controllers/beachController'

const router: Router = Router();

router.get('/all', isAuthenticated, getAllBeaches);
router.get('/:id', isAuthenticated, getBeachDetails);
router.get('/reviews/:beachId', isAuthenticated, getBeachReviews);

export default router;