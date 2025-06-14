import { Router } from 'express';
import {
    isAuthenticated,
    upload
} from '../middleware/auth';
import {
    getAllBeaches,
    getBeachDetails,
    getBeachReviews,
    addReview,
    editReview,
    getListOptions
} from '../controllers/beachController'

const router: Router = Router();

router.get('/all', isAuthenticated, getAllBeaches);
router.get('/options', isAuthenticated, getListOptions);

router.get('/:id', isAuthenticated, getBeachDetails);
router.get('/reviews/:beachId', isAuthenticated, getBeachReviews);

router.post('/reviews', upload.array('files'), addReview);
router.put('/reviews/:reviewId', upload.array('files'), editReview);

export default router;