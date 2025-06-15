import { Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
    ApiResponse,
    AuthenticatedRequest,
    EventDetail
} from '../types';

const getEventStatus = (startDate: string, endDate: string, isActive: number): EventDetail['status'] => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    // If not active, it's ended
    if (isActive === 0) {
        return 'ended';
    }

    // If current date is before start date, it's upcoming
    if (now < start) {
        return 'upcoming';
    }

    // If current date is after end date, it should be ended (but check is_active)
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
            const eventStatus = getEventStatus(event.start_date, event.end_date, event.is_active);

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