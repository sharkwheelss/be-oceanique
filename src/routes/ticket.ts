import { Router } from 'express';
import {
    isAuthenticated,
} from '../middleware/auth';
import {
    getTicketCategories,
    getTicketCategoryById,
    createTicketCategory,
    updateTicketCategory,
    deleteTicketCategory
} from '../controllers/adminTicketController'

const router: Router = Router();

router.get('/admin/ticket-categories', isAuthenticated, getTicketCategories);
router.get('/admin/ticket-categories/:id', isAuthenticated, getTicketCategoryById);

router.post('/admin/ticket-categories/create', isAuthenticated, createTicketCategory);
router.put('/admin/ticket-categories/:id/edit', isAuthenticated, updateTicketCategory);
router.delete('/admin/ticket-categories/:id/delete', isAuthenticated, deleteTicketCategory);

export default router;