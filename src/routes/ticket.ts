import { Router } from 'express';
import {
    isAuthenticated,
} from '../middleware/auth';
import {
    getTicketCategories,
    getTicketCategoryById,
    createTicketCategory,
    updateTicketCategory,
    deleteTicketCategory,
    getTickets,
    getTicketById,
    createTicket,
    updateTicket,
    deleteTicket,
    getBookingsList,
    getBookingDetails,
    updateBookingStatus
} from '../controllers/adminTicketController'

const router: Router = Router();

router.get('/admin/ticket-categories', isAuthenticated, getTicketCategories);
router.get('/admin/ticket', isAuthenticated, getTickets);
router.get('/admin/transaction-report', isAuthenticated, getBookingsList);

router.get('/admin/ticket-categories/:id', isAuthenticated, getTicketCategoryById);
router.get('/admin/ticket/:id', isAuthenticated, getTicketById);
router.get('/admin/transaction-report/:id', isAuthenticated, getBookingDetails);

router.post('/admin/ticket-categories/create', isAuthenticated, createTicketCategory);
router.post('/admin/ticket/create', isAuthenticated, createTicket);

router.put('/admin/ticket-categories/:id/edit', isAuthenticated, updateTicketCategory);
router.put('/admin/ticket/:id/edit', isAuthenticated, updateTicket);
router.put('/admin/transaction-report/:id/edit', isAuthenticated, updateBookingStatus);

router.delete('/admin/ticket-categories/:id/delete', isAuthenticated, deleteTicketCategory);
router.delete('/admin/ticket/:id/delete', isAuthenticated, deleteTicket);

export default router;