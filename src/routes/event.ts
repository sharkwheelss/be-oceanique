import { Router } from 'express';
import {
    isAuthenticated,
    upload
} from '../middleware/auth';
import {
    getAllEvents,
    getEventDetails,
    newBookings,
    getAllTransactions,
    verifyPrivateCode
} from '../controllers/eventController';

const router: Router = Router();

router.get('/all', isAuthenticated, getAllEvents);
router.get('/transaction-history', isAuthenticated, getAllTransactions)


router.get('/:eventId', isAuthenticated, getEventDetails);

router.post('/booking', upload.array('files'), newBookings);
router.post('/verify-private-code', isAuthenticated, verifyPrivateCode);


export default router;