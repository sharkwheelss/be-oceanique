import { Router } from 'express';
import {
    isAuthenticated,
} from '../middleware/auth';
import {
    getAllEvents,
} from '../controllers/eventController';

const router: Router = Router();

router.get('/all', isAuthenticated, getAllEvents);


export default router;