import { Response } from 'express';
import { pool } from '../config/database';
import {
    AuthenticatedRequest,
    UserPersonality,
    ApiResponse,
    User, PreferenceCategory
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

        const imgPersonalities: UserPersonality[] = rows.map((personality: RowDataPacket) => ({
            ...(personality as UserPersonality),
            img_path: `${req.protocol}://${req.get('host')}/uploads/personalities/${personality.img_path}`
        }));

        return res.status(200).json({
            message: 'User personality retrieved successfully',
            data: imgPersonalities as UserPersonality[]
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

export const getPreferenceCategories = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<PreferenceCategory>>
): Promise<Response> => {
    try {
        const connection = await pool.getConnection();

        // First check user_preferences table
        const [userPreferences] = await connection.query<RowDataPacket[]>(`
            SELECT 
            pc.id, 
            pc.name,
            pc.information,
            up.score as default_score
            FROM user_preferences up
            INNER JOIN preference_categories pc ON up.preference_categories_id = pc.id 
            WHERE up.users_id = ?
        `, [req.session.userId]);

        // If user preferences exist, return them
        if (userPreferences.length > 0) {
            connection.release();
            return res.status(200).json({
                message: 'User preference categories retrieved successfully',
                data: userPreferences as PreferenceCategory[]
            });
        }

        // If no user preferences, fall back to default preferences
        const [userPersonality] = await connection.query<RowDataPacket[]>(
            'SELECT user_personality_id FROM users WHERE id = ?',
            [req.session.userId]
        );

        if (!userPersonality[0]?.user_personality_id) {
            connection.release();
            return res.status(404).json({
                message: 'User personality not found'
            });
        }

        const [categories] = await connection.query<RowDataPacket[]>(`
            SELECT 
            pc.id, 
            pc.name,
            pc.information,
            dp.default_score 
            FROM default_preferences dp 
            INNER JOIN preference_categories pc ON dp.preference_categories_id = pc.id 
            WHERE dp.user_personalites_id = ?
        `,
            [userPersonality[0].user_personality_id]
        );

        connection.release();

        if (categories.length === 0) {
            return res.status(404).json({
                message: 'No preference categories found'
            });
        }

        return res.status(200).json({
            message: 'Default preference categories retrieved successfully',
            data: categories as PreferenceCategory[]
        });

    } catch (error) {
        console.error('Get preference categories error:', error);
        return res.status(500).json({
            message: 'Server error retrieving preference categories'
        });
    }
};

export const updateUserPreferences = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { preferenceScores } = req.body;

        if (!userId || !preferenceScores || !Array.isArray(preferenceScores)) {
            return res.status(400).json({
                message: 'Invalid request data'
            });
        }

        const connection = await pool.getConnection();

        let msg = '';

        for (const preference of preferenceScores) {
            // Check if preference exists
            const [existing] = await connection.query<RowDataPacket[]>(
                'SELECT id FROM user_preferences WHERE users_id = ? AND preference_categories_id = ?',
                [userId, preference.categoryId]
            );

            if (existing.length > 0) {
                // Update existing preference
                await connection.query(
                    'UPDATE user_preferences SET score = ? WHERE users_id = ? AND preference_categories_id = ?',
                    [preference.score, userId, preference.categoryId]
                );
                msg = 'User preferences updated successfully';
            } else {
                // Insert new preference
                await connection.query(
                    'INSERT INTO user_preferences (users_id, preference_categories_id, score) VALUES (?, ?, ?)',
                    [userId, preference.categoryId, preference.score]
                );
                msg = 'User preferences created successfully';
            }
        }

        connection.release();

        return res.status(200).json({
            message: msg
        });
    } catch (error) {
        console.error('Update user preferences error:', error);
        return res.status(500).json({
            message: 'Server error updating user preferences'
        });
    }
};