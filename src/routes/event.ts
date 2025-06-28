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
import {
    getEventsList,
    getEventDetail,
    createEvent,
    updateEvent,
    deleteEvent,
} from '../controllers/adminEventController'

const router: Router = Router();

router.get('/all', isAuthenticated, getAllEvents);
router.get('/transaction-history', isAuthenticated, getAllTransactions)


router.get('/:eventId', isAuthenticated, getEventDetails);

router.post('/booking', upload.array('files'), newBookings);
router.post('/verify-private-code', isAuthenticated, verifyPrivateCode);


// Admin routes
router.get('/admin/all', isAuthenticated, getEventsList);
router.get('/admin/:eventId', isAuthenticated, getEventDetail);

router.post('/admin/create', isAuthenticated, upload.array('files'), createEvent);
router.put('/admin/edit/:eventId', isAuthenticated, upload.array('files'), updateEvent);
router.delete('/admin/delete/:eventId', isAuthenticated, deleteEvent);

export default router;