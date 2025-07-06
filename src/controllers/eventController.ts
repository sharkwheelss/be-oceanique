import { Response } from 'express';
import { pool } from '../config/database';
import { validationResult } from "express-validator";
import * as path from 'path';
import * as fs from 'fs';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
    ApiResponse,
    AuthenticatedRequest,
    EventDetail,
    EventDetailWithTickets,
} from '../types';

const getEventStatus = (startDate: string, endDate: string, startTime: string, endTime: string): EventDetail['status'] => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (now < start) {
        return 'upcoming';
    }

    if (now > end) {
        return 'ended';
    }

    // If we're within the date range
    if (now >= start && now <= end) {
        // Check if it's ending soon (within 3 days of end date)
        const daysUntilEnd = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilEnd <= 3) {
            return 'ended soon';
        }
        return 'ongoing';
    }

    return 'upcoming';
};

export const getAllEvents = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<EventDetail>>
): Promise<Response> => {
    try {
        const connection = await pool.getConnection();

        const [events] = await connection.query<RowDataPacket[]>(
            `SELECT 
                e.id, 
                e.name, 
                e.description, 
                e.is_active, 
                e.start_date, 
                e.end_date, 
                e.start_time, 
                e.end_time, 
                e.jenis, 
                e.beaches_id, 
                e.users_id,
                b.beach_name,
                p.name as province,
                kk.name as city,
                k.name as subdistrict,
                c.path
            FROM events e 
            LEFT JOIN beaches b ON b.id = e.beaches_id
            LEFT JOIN kecamatans k ON k.id = b.kecamatans_id
            LEFT JOIN kabupatens_kotas kk ON kk.id = k.kabupatens_id
            LEFT JOIN provinsis p ON p.id = kk.provinsis_id
            LEFT JOIN contents c ON c.events_id = e.id;
        `
        );
        connection.release();

        if (events.length === 0) {
            return res.status(404).json({ message: 'No events found' });
        }

        // Process events and determine status
        let processedEvents: EventDetail[] = events.map(event => {
            const eventStatus = getEventStatus(event.start_date, event.end_date, event.start_time, event.end_time);

            return {
                ...(event as EventDetail),
                status: eventStatus,
                img_path: event.path ? `${req.protocol}://${req.get('host')}/uploads/contents/${event.path}` : undefined
            };
        });

        return res.status(200).json({
            message: 'Events retrieved successfully',
            data: processedEvents
        });

    } catch (error) {
        console.error('Get events error:', error);
        return res.status(500).json({
            message: 'Server error retrieving events'
        });
    }
};

export const getEventDetails = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<EventDetailWithTickets>>
): Promise<Response> => {
    try {
        const { eventId } = req.params;

        if (!eventId) {
            return res.status(400).json({ message: 'Event ID is required' });
        }

        const connection = await pool.getConnection();

        // Get event details with location information
        const [eventResults] = await connection.query<RowDataPacket[]>(
            `SELECT 
                e.id, 
                e.name, 
                e.description, 
                e.is_active, 
                e.start_date, 
                e.end_date, 
                e.start_time, 
                e.end_time, 
                e.jenis, 
                e.beaches_id, 
                e.users_id,
                u.username as held_by,
                b.beach_name,
                p.name as province,
                kk.name as city,
                k.name as subdistrict,
                c.path
            FROM events e 
            LEFT JOIN beaches b ON b.id = e.beaches_id
            LEFT JOIN kecamatans k ON k.id = b.kecamatans_id
            LEFT JOIN kabupatens_kotas kk ON kk.id = k.kabupatens_id
            LEFT JOIN provinsis p ON p.id = kk.provinsis_id
            LEFT JOIN contents c ON c.events_id = e.id
            LEFT JOIN users u on u.id = e.users_id
            WHERE e.id = ?`,
            [eventId]
        );

        if (eventResults.length === 0) {
            connection.release();
            return res.status(404).json({ message: 'Event not found' });
        }

        const event = eventResults[0];

        // Get available tickets for this event with booking information
        const [ticketResults] = await connection.query<RowDataPacket[]>(
            `SELECT 
                t.id,
                t.name,
                t.description,
                t.date,
                t.quota,
                t.price,
                t.private_code,
                t.events_id,
                tc.id as category_id,
                tc.name as category_name,
                tc.users_id as category_users_id,
                -- Calculate booked tickets from bookings table
                COALESCE(booked_tickets.booked_count, 0) as booked_count,
                -- Calculate remaining tickets
                (t.quota - COALESCE(booked_tickets.booked_count, 0)) as remaining_tickets
            FROM tickets t
            LEFT JOIN tickets_categories tc ON tc.id = t.tickets_categories_id
            LEFT JOIN (
                SELECT 
                    tickets_id,
                    COUNT(*) as booked_count
                FROM bookings b
                WHERE b.status IN ('approved', 'pending', 'rejected')
                GROUP BY tickets_id
            ) booked_tickets ON booked_tickets.tickets_id = t.id
            WHERE t.events_id = ?
            ORDER BY t.price ASC`,
            [eventId]
        );

        const [bankAccount] = await connection.query<RowDataPacket[]>(
            `SELECT bank_name, account_number, account_name FROM users WHERE id = ?;`,
            [event.users_id]
        );

        connection.release();

        // Determine event status
        const eventStatus = getEventStatus(event.start_date, event.end_date, event.is_active);

        // Process tickets based on event status
        const processedTickets = ticketResults.map(ticket => {
            const isAvailable = eventStatus !== 'ended' &&
                ticket.remaining_tickets > 0 &&
                event.is_active;

            return {
                id: ticket.id,
                name: ticket.name,
                description: ticket.description,
                date: ticket.date,
                quota: ticket.quota,
                price: ticket.price,
                private_code: ticket.private_code !== null,
                events_id: ticket.events_id,
                tickets_categories_id: ticket.category_id,
                category: ticket.category_id ? {
                    id: ticket.category_id,
                    name: ticket.category_name,
                    users_id: ticket.category_users_id
                } : null,
                booked_count: ticket.booked_count,
                remaining_tickets: ticket.remaining_tickets,
                is_available: isAvailable,
                is_sold_out: ticket.remaining_tickets <= 0
            };
        });

        // Build response
        const eventDetail: EventDetailWithTickets = {
            id: event.id,
            name: event.name,
            description: event.description,
            is_active: event.is_active,
            start_date: event.start_date,
            end_date: event.end_date,
            start_time: event.start_time,
            end_time: event.end_time,
            jenis: event.jenis,
            beaches_id: event.beaches_id,
            held_by: event.held_by,
            beach_name: event.beach_name,
            province: event.province,
            city: event.city,
            subdistrict: event.subdistrict,
            status: eventStatus,
            img_path: event.path ? `${req.protocol}://${req.get('host')}/uploads/contents/${event.path}` : undefined,
            tickets: processedTickets,
            can_purchase: eventStatus !== 'ended' && event.is_active && processedTickets.some(t => t.is_available),
            bank_name: bankAccount[0].bank_name,
            account_number: bankAccount[0].account_number,
            account_name: bankAccount[0].account_name
        };

        return res.status(200).json({
            message: 'Event details retrieved successfully',
            data: [eventDetail]
        });

    } catch (error) {
        console.error('Get event details error:', error);
        return res.status(500).json({
            message: 'Server error retrieving event details'
        });
    }
};

// New Bookings API
export const newBookings = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const {
            paymentMethod,
            status,
            totalPayment,
            tickets
        } = req.body;

        // Handle uploaded payment evidence file
        const files = req.files as Express.Multer.File[] | undefined;

        if (!userId) {
            return res.status(400).json({
                message: 'Invalid request data: userId is required'
            });
        }
        let ticketsData = tickets;

        if (typeof ticketsData === 'string') {
            try {
                ticketsData = JSON.parse(ticketsData);
            } catch {
                return res.status(400).json({ message: 'Invalid tickets JSON' });
            }
        }

        if (!ticketsData || !Array.isArray(ticketsData) || ticketsData.length === 0) {
            return res.status(400).json({
                message: 'Tickets array is required and must contain at least one ticket'
            });
        }

        if (!files || files.length === 0) {
            return res.status(400).json({
                message: 'Payment evidence file is required'
            });
        }

        // Validate that only one file is uploaded (payment evidence)
        if (files.length > 1) {
            return res.status(400).json({
                message: 'Only one payment evidence file is allowed'
            });
        }

        const paymentFile = files[0];

        // Validate file type (should be image for payment evidence)
        if (!paymentFile.mimetype.startsWith('image/')) {
            return res.status(400).json({
                message: 'Payment evidence must be an image file'
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Generate unique booking ID using current timestamp
            const groupBookingId = Date.now().toString();

            // Insert individual booking records for each ticket
            for (const ticket of ticketsData) {
                const { ticketId, quantity, subTotal } = ticket;

                await connection.query(
                    `INSERT INTO bookings (
            group_booking_id,
            total_tickets,
            subtotal,
            status,
            payment_method,
            total_payment,
            users_id,
            tickets_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        groupBookingId,
                        quantity,           // total quantity for this ticketId
                        subTotal,
                        status,
                        paymentMethod,
                        totalPayment,
                        userId,
                        ticketId
                    ]
                );
            }

            // Handle payment evidence file upload (one per booking, not per ticket)
            const fileType = 'photo'; // Payment evidence is always a photo

            // Step 1: Insert initial row with empty path in contents table
            const [contentResult] = await connection.query<ResultSetHeader>(
                `INSERT INTO contents (path, type, group_booking_id) 
                VALUES (?, ?, ?)`,
                ['', fileType, groupBookingId]
            );

            const contentId = contentResult.insertId;
            const extension = path.extname(paymentFile.originalname); // e.g., .jpg
            const newFilename = `${contentId}${extension}`;

            // Step 2: Rename the uploaded file in the filesystem
            const uploadDir = path.resolve(__dirname, '../../uploads/contents');

            const oldPath = path.join(uploadDir, paymentFile.filename);
            const newPath = path.join(uploadDir, newFilename);

            // Ensure directory exists (in case not created yet)
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            fs.renameSync(oldPath, newPath); // rename file to match contentId

            // Step 3: Update contents table with the correct path
            await connection.query(
                `UPDATE contents SET path = ? WHERE id = ?`,
                [newFilename, contentId]
            );

            // get the inserted booking
            const [bookingResult] = await connection.query<RowDataPacket[]>(
                `SELECT * FROM bookings WHERE group_booking_id = ?`,
                [groupBookingId]
            );

            await connection.commit();
            connection.release();

            // Calculate total tickets for response
            const totalTickets = ticketsData.reduce((sum, ticket) => sum + ticket.quantity, 0);

            return res.status(201).json({
                message: `Booking created successfully with ${totalTickets} tickets and payment evidence`,
                data: {
                    groupBookingId: groupBookingId,
                    bookingResult: bookingResult,
                }
            });

        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }

    } catch (error) {
        console.error('New booking error:', error);
        return res.status(500).json({
            message: 'Server error creating booking'
        });
    }
};

export const getAllTransactions = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({
                message: 'User not authenticated'
            });
        }

        const connection = await pool.getConnection();

        const [transactions] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM bookings WHERE users_id = ?`,
            [userId]
        );

        connection.release();

        if (transactions.length === 0) {
            return res.status(404).json({
                message: 'No transactions found'
            });
        }

        return res.status(200).json({
            message: 'Transactions retrieved successfully',
            data: transactions
        });

    } catch (error) {
        console.error('Get transactions error:', error);
        return res.status(500).json({
            message: 'Server error retrieving transactions'
        });
    }
};

export const verifyPrivateCode = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: "Validation failed",
                errors: errors.array(),
            });
        }
        const { privateCode, ticketId } = req.body;

        const connection = await pool.getConnection();
        const [results] = await connection.query<RowDataPacket[]>(
            "SELECT * FROM tickets WHERE private_code = ? AND id = ?",
            [privateCode.trim(), ticketId]
        );
        connection.release();

        if (results.length === 0) {
            return res.status(404).json({ message: "Invalid private code" });
        }
        else {
            return res.status(200).json({
                message: "Private code is valid",
            });
        }
    } catch (error) {
        console.error("Error verifying private code:", error);
        return res.status(500).json({ message: "Server error verifying private code" });
    }
};