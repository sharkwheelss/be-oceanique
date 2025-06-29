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
