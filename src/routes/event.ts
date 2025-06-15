import { Router } from 'express';
import {
    isAuthenticated,
} from '../middleware/auth';
import {
    getAllEvents,
    getEventDetails
} from '../controllers/eventController';

const router: Router = Router();

router.get('/all', isAuthenticated, getAllEvents);


router.get('/:eventId', isAuthenticated, getEventDetails);


export default router;