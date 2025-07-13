import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import * as path from 'path';
import * as fs from 'fs';
import { pool } from '../config/database'; // Adjust import path as needed
import { AuthenticatedRequest, ApiResponse } from '../types'; // 

// ============= TICKETS CATEGORIES CRUD =============

// GET all ticket categories
export const getTicketCategories = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const connection = await pool.getConnection();

        try {
            const [categories] = await connection.query<RowDataPacket[]>(
                `SELECT *
                 FROM tickets_categories
                 WHERE users_id = ?
                 ORDER BY created_at DESC`,
                [userId]
            );

            connection.release();

            return res.status(200).json({
                message: 'Ticket categories retrieved successfully',
                data: categories
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Get ticket categories error:', error);
        return res.status(500).json({
            message: 'Server error retrieving ticket categories'
        });
    }
};

// GET single ticket category by ID
export const getTicketCategoryById = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const connection = await pool.getConnection();

        try {
            const [categories] = await connection.query<RowDataPacket[]>(
                `SELECT id, name 
                 FROM tickets_categories 
                 WHERE id = ? AND users_id = ?`,
                [id, userId]
            );

            connection.release();

            if (categories.length === 0) {
                return res.status(404).json({
                    message: 'Ticket category not found'
                });
            }

            return res.status(200).json({
                message: 'Ticket category retrieved successfully',
                data: categories[0]
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Get ticket category by ID error:', error);
        return res.status(500).json({
            message: 'Server error retrieving ticket category'
        });
    }
};

// CREATE new ticket category
export const createTicketCategory = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                message: 'Category name is required'
            });
        }

        const connection = await pool.getConnection();

        try {
            const [result] = await connection.query<ResultSetHeader>(
                `INSERT INTO tickets_categories (name, users_id) 
                 VALUES (?, ?)`,
                [name, userId]
            );

            // Get the created category
            const [createdCategory] = await connection.query<RowDataPacket[]>(
                `SELECT * 
                 FROM tickets_categories 
                 WHERE id = ?`,
                [result.insertId]
            );

            connection.release();

            return res.status(201).json({
                message: 'Ticket category created successfully',
                data: createdCategory[0]
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Create ticket category error:', error);
        return res.status(500).json({
            message: 'Server error creating ticket category'
        });
    }
};

// UPDATE ticket category
export const updateTicketCategory = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                message: 'Category name is required'
            });
        }

        const connection = await pool.getConnection();

        try {
            const [result] = await connection.query<ResultSetHeader>(
                `UPDATE tickets_categories 
                 SET name = ?, updated_at = NOW() 
                 WHERE id = ? AND users_id = ?`,
                [name, id, userId]
            );

            if (result.affectedRows === 0) {
                connection.release();
                return res.status(404).json({
                    message: 'Ticket category not found'
                });
            }

            // Get the updated category
            const [updatedCategory] = await connection.query<RowDataPacket[]>(
                `SELECT *
                 FROM tickets_categories 
                 WHERE id = ? AND users_id = ?`,
                [id, userId]
            );

            connection.release();

            return res.status(200).json({
                message: 'Ticket category updated successfully',
                data: updatedCategory[0]
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Update ticket category error:', error);
        return res.status(500).json({
            message: 'Server error updating ticket category'
        });
    }
};

// DELETE ticket category
export const deleteTicketCategory = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const connection = await pool.getConnection();

        try {
            // Check if category has associated tickets
            const [tickets] = await connection.query<RowDataPacket[]>(
                `SELECT COUNT(*) as count FROM tickets WHERE tickets_categories_id = ? AND users_id = ?`,
                [id, userId]
            );

            if (tickets[0].count > 0) {
                connection.release();
                return res.status(400).json({
                    message: 'Cannot delete category with associated tickets'
                });
            }

            const [result] = await connection.query<ResultSetHeader>(
                `DELETE FROM tickets_categories WHERE id = ? AND users_id = ?`,
                [id, userId]
            );

            connection.release();

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: 'Ticket category not found'
                });
            }

            return res.status(200).json({
                message: 'Ticket category deleted successfully'
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Delete ticket category error:', error);
        return res.status(500).json({
            message: 'Server error deleting ticket category'
        });
    }
};

// ============= TICKETS CRUD =============

// GET all tickets with category information
export const getTickets = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const connection = await pool.getConnection();

        try {
            // First check bank account status
            const [bankAccount] = await connection.query<RowDataPacket[]>(
                `SELECT bank_name, account_number, account_name 
                    FROM users
                    WHERE id = ?;`,
                [userId]
            );

            if (bankAccount.length === 0 || !bankAccount[0].bank_name || !bankAccount[0].account_number
                || !bankAccount[0].account_name
            ) {
                connection.release();
                return res.status(400).json({
                    message: 'Please set your bank account first'
                });
            }

            // If bank account is set, fetch tickets
            const [tickets] = await connection.query<RowDataPacket[]>(
                `SELECT t.id, t.name, t.description, t.quota, t.price, t.date, 
                        t.private_code, tc.name as category_name, e.name as event_name,
                (
                    SELECT COALESCE(SUM(b.total_tickets), 0) * 1
                    FROM bookings b
                    WHERE 
                        b.tickets_id = t.id 
                        AND b.status IN ('approved', 'pending')
                    ) AS sold
                 FROM tickets t
                 INNER JOIN tickets_categories tc ON t.tickets_categories_id = tc.id
                 INNER JOIN events e ON e.id = t.events_id
                 WHERE t.users_id = ?
                 ORDER BY t.id DESC;`,
                [userId]
            );

            connection.release();

            return res.status(200).json({
                message: 'Tickets retrieved successfully',
                data: tickets
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Get tickets error:', error);
        return res.status(500).json({
            message: 'Server error retrieving tickets'
        });
    }
};


// GET single ticket by ID
export const getTicketById = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const connection = await pool.getConnection();

        try {
            const [tickets] = await connection.query<RowDataPacket[]>(
                `SELECT 
                t.id, 
                t.name, 
                t.description, 
                t.quota, 
                t.price, 
                t.date, 
                t.private_code, 
                tc.name AS category_name, 
                e.name AS event_name,
                (
                    SELECT COALESCE(SUM(b.total_tickets), 0) * 1
                    FROM bookings b
                    WHERE 
                        b.tickets_id = t.id 
                        AND b.status IN ('approved', 'pending')
                    ) AS sold
                FROM tickets t
                INNER JOIN tickets_categories tc ON t.tickets_categories_id = tc.id
                INNER JOIN events e ON e.id = t.events_id
                WHERE t.id = ? AND t.users_id = ?
                ORDER BY t.id DESC;
                `,
                [id, userId]
            );

            connection.release();

            if (tickets.length === 0) {
                return res.status(404).json({
                    message: 'Ticket not found'
                });
            }

            return res.status(200).json({
                message: 'Ticket retrieved successfully',
                data: tickets[0]
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Get ticket by ID error:', error);
        return res.status(500).json({
            message: 'Server error retrieving ticket'
        });
    }
};

// CREATE new ticket
export const createTicket = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { name, description, quota, price, date, private_code, events_id, tickets_categories_id } = req.body;

        // Validation
        if (!name || !quota || !price || !date || !events_id) {
            return res.status(400).json({
                message: 'Name, quota, price, date, and event ID are required'
            });
        }

        const connection = await pool.getConnection();

        try {
            const [result] = await connection.query<ResultSetHeader>(
                `INSERT INTO tickets (name, description, quota, price, date, private_code, events_id, tickets_categories_id, users_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, description, quota, price, date, private_code, events_id, tickets_categories_id, userId]
            );

            // Get the created ticket with category info
            const [createdTicket] = await connection.query<RowDataPacket[]>(
                `SELECT t.id, t.name, t.description, t.quota, t.price, t.date, t.users_id,
                        t.private_code, e.name, tc.name as category_name
                 FROM tickets t
                 INNER JOIN tickets_categories tc ON t.tickets_categories_id = tc.id
                 INNER JOIN events e ON e.id = t.events_id
                 WHERE t.id = ?`,
                [result.insertId]
            );

            connection.release();

            return res.status(201).json({
                message: 'Ticket created successfully',
                data: createdTicket[0]
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Create ticket error:', error);
        return res.status(500).json({
            message: 'Server error creating ticket'
        });
    }
};

// UPDATE ticket
export const updateTicket = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const { name, description, quota, price, date, private_code, events_id, tickets_categories_id } = req.body;

        // Validation
        if (!name || !quota || !price || !date || !events_id) {
            return res.status(400).json({
                message: 'Name, quota, price, date, and event ID are required'
            });
        }

        const connection = await pool.getConnection();

        try {
            const [result] = await connection.query<ResultSetHeader>(
                `UPDATE tickets 
                 SET name = ?, description = ?, quota = ?, price = ?, date = ?, 
                     private_code = ?, events_id = ?, tickets_categories_id = ?
                 WHERE id = ? AND users_id = ?`,
                [name, description, quota, price, date, private_code, events_id, tickets_categories_id, id, userId]
            );

            if (result.affectedRows === 0) {
                connection.release();
                return res.status(404).json({
                    message: 'Ticket not found'
                });
            }

            // Get the updated ticket with category info
            const [updatedTicket] = await connection.query<RowDataPacket[]>(
                `SELECT t.id, t.name, t.description, t.quota, t.price, t.date, 
                        t.private_code, e.name, tc.name as category_name
                 FROM tickets t
                 INNER JOIN tickets_categories tc ON t.tickets_categories_id = tc.id
                 INNER JOIN events e ON e.id = t.events_id
                 WHERE t.id = ?`,
                [id]
            );

            connection.release();

            return res.status(200).json({
                message: 'Ticket updated successfully',
                data: updatedTicket[0]
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Update ticket error:', error);
        return res.status(500).json({
            message: 'Server error updating ticket'
        });
    }
};

// DELETE ticket
export const deleteTicket = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const connection = await pool.getConnection();

        try {
            const [result] = await connection.query<ResultSetHeader>(
                `DELETE FROM tickets WHERE id = ? AND users_id = ?`,
                [id, userId]
            );

            connection.release();

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: 'Ticket not found'
                });
            }

            return res.status(200).json({
                message: 'Ticket deleted successfully'
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Delete ticket error:', error);
        return res.status(500).json({
            message: 'Server error deleting ticket'
        });
    }
};

// TRANSACTION REPORT SECTION
// Get Bookings List
export const getBookingsList = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const connection = await pool.getConnection();

        const [bookings] = await connection.query<RowDataPacket[]>(
            `SELECT 
                b.group_booking_id,
                MIN(b.booked_at) AS booked_at,
                u.username AS booked_by,
                MIN(b.payment_method) AS payment_method,
                SUM(b.subtotal) AS total_payment,
                SUM(b.total_tickets) AS total_tickets,
                MIN(b.status) AS status
            FROM bookings b
            INNER JOIN tickets t ON t.id = b.tickets_id
            INNER JOIN users u ON u.id = b.users_id
            WHERE t.users_id = ?
            GROUP BY b.group_booking_id, u.username
            ORDER BY booked_at DESC;`,
            [userId]
        );

        connection.release();

        const bookingsList = bookings.map(booking => ({
            id: booking.id,
            group_booking_id: booking.group_booking_id,
            booked_at: booking.booked_at,
            booked_by: booking.booked_by,
            payment_method: booking.payment_method,
            total_payment: booking.total_payment,
            total_tickets: booking.total_tickets,
            status: booking.status,
        }));

        return res.status(200).json({
            message: 'Bookings list retrieved successfully',
            data: bookingsList
        });
    } catch (error) {
        console.error('Get bookings list error:', error);
        return res.status(500).json({
            message: 'Server error retrieving bookings list'
        });
    }
};

// Get Booking Details
export const getBookingDetails = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const { id } = req.params;

        const connection = await pool.getConnection();

        // Get main booking details
        const [bookingDetails] = await connection.query<RowDataPacket[]>(
            `SELECT 
                b.id,
                b.group_booking_id,
                b.booked_at,
                u.username as booked_by,
                b.payment_method,
                b.total_payment,
                b.total_tickets,
                b.status,
                b.rejection_reason,
                c.path as payment_evidence
            FROM bookings b
            LEFT JOIN contents c ON c.group_booking_id = b.group_booking_id
            INNER JOIN users u ON u.id = b.users_id
            WHERE b.group_booking_id = ?`,
            [id]
        );

        if (!bookingDetails.length) {
            connection.release();
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Get ticket details for this booking
        const [ticketDetails] = await connection.query<RowDataPacket[]>(
            `SELECT 
                b.id as booking_id,
                t.name as ticket_name,
                tc.name as category,
                t.price,
                b.total_tickets,
                (t.price * b.total_tickets) as subtotal
            FROM tickets t
            INNER JOIN tickets_categories tc ON tc.id = t.tickets_categories_id
            INNER JOIN bookings b ON b.tickets_id = t.id
            WHERE b.group_booking_id = ?`,
            [id]
        );

        connection.release();

        const booking = bookingDetails[0];

        // Structure the response
        const bookingDetail = {
            id: booking.id,
            group_booking_id: booking.group_booking_id,
            booked_at: booking.booked_at,
            booked_by: booking.booked_by,
            payment_method: booking.payment_method,
            total_payment: booking.total_payment,
            total_tickets: booking.total_tickets,
            status: booking.status,
            rejection_reason: booking.rejection_reason,
            payment_evidence_path: `${req.protocol}://${req.get('host')}/uploads/contents/${booking.payment_evidence}`,
            ticket_details: ticketDetails.map(ticket => ({
                booking_id: ticket.booking_id,
                ticket_name: ticket.ticket_name,
                category: ticket.category,
                price: ticket.price,
                total_tickets: ticket.total_tickets,
                subtotal: ticket.subtotal
            }))
        };

        return res.status(200).json({
            message: 'Booking details retrieved successfully',
            data: [bookingDetail]
        });
    } catch (error) {
        console.error('Get booking details error:', error);
        return res.status(500).json({
            message: 'Server error retrieving booking details'
        });
    }
};

// Update Booking Status
export const updateBookingStatus = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body;

        // Validate required fields
        if (!status) {
            return res.status(400).json({
                message: 'Status is required'
            });
        }

        // Validate status values
        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                message: 'Invalid status. Must be one of: pending, approved, rejected'
            });
        }

        // If status is Rejected, rejection_reason is required
        if (status === 'rejected' && !rejection_reason) {
            return res.status(400).json({
                message: 'Rejection reason is required when status is rejected'
            });
        }

        const connection = await pool.getConnection();

        // Check if booking exists
        const [existingBooking] = await connection.query<RowDataPacket[]>(
            `SELECT group_booking_id FROM bookings WHERE group_booking_id = ?`,
            [id]
        );

        if (!existingBooking.length) {
            connection.release();
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Update booking status
        const updateFields = ['status = ?'];
        const updateValues = [status];

        if (status === 'rejected' && rejection_reason) {
            updateFields.push('rejection_reason = ?');
            updateValues.push(rejection_reason);
        } else if (status !== 'rejected') {
            updateFields.push('rejection_reason = NULL');
        }

        // Add updated timestamp
        updateFields.push('updated_at = NOW()');
        updateValues.push(id);

        await connection.query(
            `UPDATE bookings SET ${updateFields.join(', ')} WHERE group_booking_id = ?`,
            updateValues
        );

        connection.release();

        return res.status(200).json({
            message: `Booking status updated to ${status} successfully`,
        });
    } catch (error) {
        console.error('Update booking status error:', error);
        return res.status(500).json({
            message: 'Server error updating booking status'
        });
    }
};

