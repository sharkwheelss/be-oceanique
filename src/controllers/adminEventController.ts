import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import * as path from 'path';
import * as fs from 'fs';
import { pool } from '../config/database'; // Adjust import path as needed
import { AuthenticatedRequest, ApiResponse } from '../types'; // Adjust import path as needed

// Create Event API
export const createEvent = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const {
            name,
            description,
            start_date,
            start_time,
            end_date,
            end_time,
            jenis,
            beaches_id
        } = req.body;

        // Handle uploaded files
        const files = req.files as Express.Multer.File[] | undefined;

        if (!userId || !name || !start_date || !start_time || !end_date || !end_time || !jenis || !beaches_id) {
            return res.status(400).json({
                message: 'Invalid request data: name, start_date, start_time, end_date, end_time, jenis, and beaches_id are required'
            });
        }
        if (!files || files.length === 0) {
            return res.status(400).json({
                message: 'At least one photo is required'
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Insert new event
            const [eventResult] = await connection.query<ResultSetHeader>(
                `INSERT INTO events (name, description, start_date, start_time, end_date, end_time, jenis, beaches_id, users_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, description, start_date, start_time, end_date, end_time, jenis, beaches_id, userId]
            );

            const eventId = eventResult.insertId;

            // Handle file uploads and save to contents table
            if (files && files.length > 0) {
                for (const file of files) {
                    const fileType = file.mimetype.startsWith('image/') ? 'photo' :
                        file.mimetype.startsWith('video/') ? 'video' : 'other';

                    // Step 1: Insert initial row with empty path
                    const [contentResult] = await connection.query<ResultSetHeader>(
                        `INSERT INTO contents (path, type, events_id) 
                        VALUES (?, ?, ?)`,
                        ['', fileType, eventId]
                    );

                    const contentId = contentResult.insertId;
                    const extension = path.extname(file.originalname); // e.g., .jpg
                    const newFilename = `${contentId}${extension}`;

                    // Step 2: Rename the uploaded file in the filesystem
                    const uploadDir = path.resolve(__dirname, '../../uploads/contents');

                    const oldPath = path.join(uploadDir, file.filename);
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
                }
            }

            await connection.commit();
            connection.release();

            return res.status(201).json({
                success: true,
                message: 'Event created successfully',
                data: { id: eventId }
            });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Create event error:', error);
        return res.status(500).json({
            message: 'Server error creating event'
        });
    }
};

// Get Events List API (Admin)
export const getEventsList = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const connection = await pool.getConnection();

        try {
            const [events] = await connection.query<RowDataPacket[]>(
                `SELECT e.id, e.name, CONCAT(e.start_date,' ', e.start_time) as start_datetime, 
                        CONCAT(e.end_date,' ', e.end_time) as end_datetime, e.jenis, b.beach_name
                 FROM events e 
                 INNER JOIN beaches b ON e.beaches_id = b.id
                 WHERE e.users_id = ?
                 ORDER BY e.start_date DESC, e.start_time DESC`,
                [userId]
            );

            connection.release();

            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            const eventStatus = events.map(event => {
                const start = new Date(event.start_datetime);
                const end = new Date(event.end_datetime);

                const status =
                    start <= now && end >= now
                        ? 'ongoing'
                        : start > now && start <= tomorrow
                            ? 'ended soon'
                            : end < now
                                ? 'ended'
                                : 'upcoming';

                return { ...event, status };
            });

            return res.status(200).json({
                message: 'Events retrieved successfully',
                data: eventStatus
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Get events list error:', error);
        return res.status(500).json({
            message: 'Server error retrieving events'
        });
    }
};

// Get Event Detail API
export const getEventDetail = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const { eventId } = req.params;

        if (!eventId) {
            return res.status(400).json({
                message: 'Event ID is required'
            });
        }

        const connection = await pool.getConnection();

        try {
            // Get event details with beach info
            const [eventDetails] = await connection.query<RowDataPacket[]>(
                `SELECT e.id, e.name, e.description, e.start_date, e.start_time, e.end_date, e.end_time,
                        e.jenis, b.id as beach_id, b.beach_name, c.path
                 FROM events e 
                 INNER JOIN beaches b ON e.beaches_id = b.id
                 LEFT JOIN contents c ON e.id = c.events_id
                 WHERE e.id = ?`,
                [eventId]
            );

            if (eventDetails.length === 0) {
                connection.release();
                return res.status(404).json({
                    message: 'Event not found'
                });
            }

            connection.release();

            const imgEvent = eventDetails.map(events => ({
                ...(events),
                path: `${req.protocol}://${req.get('host')}/uploads/contents/${events.path}`
            }));

            return res.status(200).json({
                message: 'Event detail retrieved successfully',
                data: imgEvent
            });
        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Get event detail error:', error);
        return res.status(500).json({
            message: 'Server error retrieving event detail'
        });
    }
};

// Update Event API
export const updateEvent = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { eventId } = req.params;
        const {
            name,
            description,
            start_date,
            start_time,
            end_date,
            end_time,
            jenis,
            beaches_id,
            keepExistingFiles
        } = req.body;

        // Handle uploaded files
        const files = req.files as Express.Multer.File[] | undefined;

        if (!userId || !eventId || !name || !start_date || !start_time || !end_date || !end_time || !beaches_id) {
            return res.status(400).json({
                message: 'Invalid request data: eventId, name, start_date, start_time, end_date, end_time, jenis, and beaches_id are required'
            });
        }

        if (keepExistingFiles === "false" && (!files || files.length === 0)) {
            return res.status(400).json({
                message: 'At least one photo is required'
            });
        }


        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Check if event exists
            const [existingEvent] = await connection.query<RowDataPacket[]>(
                'SELECT id, beaches_id FROM events WHERE id = ?',
                [eventId]
            );

            if (existingEvent.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({
                    message: 'Event not found'
                });
            }

            // Update event
            await connection.query(
                `UPDATE events SET 
                 name = ?,
                 description = ?,
                 jenis = ?,
                 start_date = ?,
                 start_time = ?,
                 end_date = ?,
                 end_time = ?,
                 beaches_id = ?
                 WHERE id = ?`,
                [name, description, jenis, start_date, start_time, end_date, end_time, beaches_id, eventId]
            );

            // Step 1: Remove existing file (if not keeping it)
            if (keepExistingFiles === 'false' || keepExistingFiles === false) {
                const [existingContents] = await connection.query<RowDataPacket[]>(
                    'SELECT path FROM contents WHERE events_id = ?',
                    [eventId]
                );

                if (existingContents.length > 0) {
                    const uploadDir = path.resolve(__dirname, '../../uploads/contents');

                    for (const content of existingContents) {
                        try {
                            const filePath = path.join(uploadDir, content.path);
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        } catch (err) {
                            console.warn('Failed to delete file:', content.path, err);
                        }
                    }

                    // Delete from DB
                    await connection.query(
                        'DELETE FROM contents WHERE events_id = ?',
                        [eventId]
                    );
                }
            }

            // Step 2: Insert only one new file (if provided)
            if (files && files.length > 0) {
                const file = files[0];
                const fileType = file.mimetype.startsWith('image/') ? 'photo' :
                    file.mimetype.startsWith('video/') ? 'video' : 'other';

                const [contentResult] = await connection.query<ResultSetHeader>(
                    `INSERT INTO contents (path, type, events_id)
                    VALUES (?, ?, ?)`,
                    ['', fileType, eventId]
                );

                const contentId = contentResult.insertId;
                const extension = path.extname(file.originalname);
                const newFilename = `${contentId}${extension}`;

                const uploadDir = path.resolve(__dirname, '../../uploads/contents');
                const oldPath = path.join(uploadDir, file.filename);
                const newPath = path.join(uploadDir, newFilename);

                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                fs.renameSync(oldPath, newPath);

                await connection.query(
                    `UPDATE contents SET path = ? WHERE id = ?`,
                    [newFilename, contentId]
                );
            }


            await connection.commit();
            connection.release();

            return res.status(200).json({
                success: true,
                message: 'Event updated successfully'
            });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Update event error:', error);
        return res.status(500).json({
            message: 'Server error updating event'
        });
    }
};

// Delete Event API
export const deleteEvent = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { eventId } = req.params;

        if (!userId || !eventId) {
            return res.status(400).json({
                message: 'Event ID is required'
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Check if event exists
            const [existingEvent] = await connection.query<RowDataPacket[]>(
                'SELECT id FROM events WHERE id = ?',
                [eventId]
            );

            if (existingEvent.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({
                    message: 'Event not found'
                });
            }

            // Get existing content files before deletion
            const [existingContents] = await connection.query<RowDataPacket[]>(
                'SELECT path FROM contents WHERE events_id = ?',
                [eventId]
            );

            // Delete physical files
            for (const content of existingContents) {
                try {
                    const uploadDir = path.resolve(__dirname, '../../uploads/contents');
                    const filePath = path.join(uploadDir, content.path);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (err) {
                    console.warn('Failed to delete file:', content.path, err);
                }
            }

            // Delete content records (this should cascade delete if foreign key is set up properly)
            await connection.query(
                'DELETE FROM contents WHERE events_id = ?',
                [eventId]
            );

            // Delete event
            await connection.query(
                'DELETE FROM events WHERE id = ?',
                [eventId]
            );

            await connection.commit();
            connection.release();

            return res.status(200).json({
                message: 'Event deleted successfully'
            });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Delete event error:', error);
        return res.status(500).json({
            message: 'Server error deleting event'
        });
    }
};