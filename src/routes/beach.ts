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
    getListOptions,
    getReviewForEdit,
    getAllWishlist,
    addToWishlist,
    deleteFromWishlist
} from '../controllers/beachController'

const router: Router = Router();

router.get('/all', isAuthenticated, getAllBeaches);
router.get('/options', isAuthenticated, getListOptions);
router.get('/wishlist', isAuthenticated, getAllWishlist);

router.get('/:id', isAuthenticated, getBeachDetails);
router.get('/reviews/:beachId', isAuthenticated, getBeachReviews);
router.get('/reviews/:reviewId/edit', isAuthenticated, getReviewForEdit);

router.post('/reviews', upload.array('files'), addReview);
router.post('/wishlist', isAuthenticated, addToWishlist);

router.put('/reviews/:reviewId', upload.array('files'), editReview);
router.delete('/wishlist/:beaches_id', isAuthenticated, deleteFromWishlist);

export default router;