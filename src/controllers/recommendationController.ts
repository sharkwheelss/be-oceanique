import { Response } from 'express';
import { pool } from '../config/database';
import {
    AuthenticatedRequest,
    UserPersonality,
    ApiResponse,
    User
} from '../types';
import { RowDataPacket } from 'mysql2';

export const getAllPersonalities = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<UserPersonality>>
): Promise<Response> => {
    try {
        const connection = await pool.getConnection();
        const [personalities] = await connection.query<RowDataPacket[]>(
            'SELECT * FROM user_personalities'
        );

        connection.release();

        if (personalities.length === 0) {
            return res.status(404).json({ message: 'No personalities found' });
        }

        const imgPersonalities: UserPersonality[] = personalities.map(personality => ({
            ...(personality as UserPersonality),
            img_path: `${req.protocol}://${req.get('host')}/uploads/personalities/${personality.img_path}`
        }));

        return res.status(200).json({
            message: 'Personalities retrieved successfully',
            data: imgPersonalities as UserPersonality[]
        });
    } catch (error) {
        console.error('Get personalities error:', error);
        return res.status(500).json({
            message: 'Server error retrieving personalities'
        });
    }
}