import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { 
    getAllBeaches,
    getBeachDetails
 } from '../controllers/beachController'

const router: Router = Router();

router.get('/all', isAuthenticated, getAllBeaches);
router.get('/:id', isAuthenticated, getBeachDetails);

export default router;