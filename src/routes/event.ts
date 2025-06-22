import { Router } from 'express';
import {
    isAuthenticated,
    upload
} from '../middleware/auth';
import {
    getAllEvents,
    getEventDetails,
    newBookings
} from '../controllers/eventController';

const router: Router = Router();

router.get('/all', isAuthenticated, getAllEvents);


router.get('/:eventId', isAuthenticated, getEventDetails);

router.post('/booking', upload.array('files'), newBookings);


export default router;