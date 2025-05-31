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

export const getUserPersonality = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<UserPersonality>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;

        if (!userId) {
            return res.status(400).json({
                message: 'User ID is required'
            });
        }

        const connection = await pool.getConnection();
        const [rows] = await connection.query<RowDataPacket[]>(
            'SELECT up.* FROM user_personalities up INNER JOIN users u on u.user_personality_id = up.id WHERE u.id = ?',
            [userId]
        );

        connection.release();

        if (rows.length === 0) {
            return res.status(404).json({
                message: 'User personality not found'
            });
        }

        const personality = rows[0] as UserPersonality;

        return res.status(200).json({
            message: 'User personality retrieved successfully',
            data: [personality]
        });
    } catch (error) {
        console.error('Get user personality error:', error);
        return res.status(500).json({
            message: 'Server error retrieving user personality'
        });
    }
}

export const updateUserPersonality = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<User>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { personalityId } = req.body;

        if (!userId || !personalityId) {
            return res.status(400).json({
                message: 'Missing required fields'
            });
        }

        const connection = await pool.getConnection();
        await connection.query(
            'UPDATE users SET user_personality_id = ? WHERE id = ?',
            [personalityId, userId]
        );

        connection.release();

        return res.status(200).json({
            message: 'User personality updated successfully'
        });
    } catch (error) {
        console.error('Update user personality error:', error);
        return res.status(500).json({
            message: 'Server error updating user personality'
        });
    }
};