import { Response } from 'express';
import { pool } from '../config/database';
import {
    AuthenticatedRequest,
    UserPersonality,
    ApiResponse,
    User, PreferenceCategory,
    Questions,
    BeachMatch
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

export const getAllQuestions = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<Questions>>
): Promise<Response> => {
    try {
        const connection = await pool.getConnection();

        const [rows] = await connection.query<RowDataPacket[]>(`
            SELECT 
                q.id,
                q.question_text,
                q.question_type,
                q.preference_categories_id,
                pc.name as category_name,
                o.id as option_id,
                o.name as option_text
            FROM questions q
            LEFT JOIN preference_categories pc ON q.preference_categories_id = pc.id
            LEFT JOIN options o ON pc.id = o.preference_categories_id
            ORDER BY q.id , o.id;
        `);

        const questionsMap = new Map<number, Questions>();

        rows.forEach((row: RowDataPacket) => {
            if (!questionsMap.has(row.id)) {
                questionsMap.set(row.id, {
                    id: row.id,
                    question: row.question_text,
                    question_type: row.question_type,
                    category: row.category_name,
                    options: []
                });
            }

            // Add option only if exists (in case of LEFT JOIN with null options)
            if (row.option_id && row.option_text) {
                questionsMap.get(row.id)?.options.push({
                    id: row.option_id,
                    option_text: row.option_text,
                    option_value: row.option_text.toLowerCase().replace(/\s+/g, '_')
                });
            }
        });

        connection.release();

        const questionsArray = Array.from(questionsMap.values());

        if (questionsArray.length === 0) {
            return res.status(404).json({
                message: 'No questions found'
            });
        }

        return res.status(200).json({
            message: 'Questions retrieved successfully',
            data: questionsArray
        });
    } catch (error) {
        console.error('Get questions error:', error);
        return res.status(500).json({
            message: 'Server error retrieving questions'
        });
    }
}

export const getBeachRecommendations = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<BeachMatch>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        // 1. Get user selected options from frontend (request body)
        const { userOptions } = req.body;

        if (!userOptions || !Array.isArray(userOptions) || userOptions.length === 0) {
            return res.status(400).json({ message: 'No user options provided' });
        }

        const connection = await pool.getConnection();

        // 2. Get user preferences (category weights) from user_preferences table
        const [userPreferences] = await connection.query<RowDataPacket[]>(`
            SELECT pc.name, up.score as 'rank'
            FROM user_preferences up INNER JOIN preference_categories pc 
            ON pc.id = up.preference_categories_id
            WHERE users_id = ?
        `, [userId]);

        console.log('userPreferences: ', userPreferences)

        // get the max rank
        const maxRank = userPreferences.reduce((sum, pref) => sum + pref.rank, 0);
        const weights: Record<string, number> = {};

        console.log('max rank: ', maxRank)

        userPreferences.forEach((pref: any) => {
            weights[pref.name] = pref.rank / maxRank;
        });

        console.log('after calculation of category weight: ', weights)

        // 3. Get option categories mapping
        const [optionCategories] = await connection.query<RowDataPacket[]>(`
            SELECT o.id, pc.name
            FROM options o
            JOIN preference_categories pc ON o.preference_categories_id = pc.id
        `);
        console.log('option category: ', optionCategories)

        const optionCategoryMap: Record<number, string> = {};
        optionCategories.forEach((row: any) => {
            optionCategoryMap[row.id] = row.name;
        });

        console.log('optionCategoryMap: ', optionCategoryMap)

        // 4. Get all beach options with priority logic
        // First check review_summary table, then fall back to beaches_default_options
        const [reviewSummaryBeaches] = await connection.query<RowDataPacket[]>(`
            SELECT DISTINCT beaches_id 
            FROM review_summary
        `);
        console.log('reviewSummaryBeaches: ', reviewSummaryBeaches)

        const reviewSummaryBeachIds = reviewSummaryBeaches.map((row: any) => row.beaches_id);
        console.log('reviewSummaryBeachIds: ', reviewSummaryBeachIds)

        let beachOptionsQuery = '';
        let queryParams: any[] = [];

        if (reviewSummaryBeachIds.length > 0) {
            // Get options from review_summary for beaches that have data there
            // and from beaches_default_options for beaches that don't
            console.log('using data inside review_summary')
            beachOptionsQuery = `
                SELECT beaches_id, options_id, 'review_summary' as source
                FROM (
                    SELECT beaches_id, options_id
                    FROM review_summary
                    WHERE beaches_id IN (${reviewSummaryBeachIds.map(() => '?').join(',')})
                ) rs
                UNION ALL
                SELECT beaches_id, options_id, 'default_options' as source
                FROM beaches_default_options bdo
                WHERE beaches_id NOT IN (${reviewSummaryBeachIds.map(() => '?').join(',')})
            `;
            queryParams = [...reviewSummaryBeachIds, ...reviewSummaryBeachIds];
        } else {
            // If no review_summary data exists, use only beaches_default_options
            console.log('using data inside default_options')
            beachOptionsQuery = `
                SELECT beaches_id, options_id, 'default_options' as source
                FROM beaches_default_options
            `;
        }

        const [beachOptions] = await connection.query<RowDataPacket[]>(beachOptionsQuery, queryParams);
        console.log('beachOptions', beachOptions)

        // 5. Group beach options by beach_id
        const beachMap: Record<number, Set<number>> = {};
        beachOptions.forEach((row: any) => {
            if (!beachMap[row.beaches_id]) {
                beachMap[row.beaches_id] = new Set();
            }
            beachMap[row.beaches_id].add(row.options_id);
        });
        console.log('beachMap:', beachMap)

        // 6. Compute Weighted Similarity Score
        const results: BeachMatch[] = [];
        for (const [beachIdStr, beachOptionSet] of Object.entries(beachMap)) {
            const beachId = parseInt(beachIdStr);

            console.log('beachIdStr: ', beachIdStr)
            console.log('beachOptionSet: ', beachOptionSet)

            // Calculate weighted score
            let totalWeightedScore = 0;
            let totalPossibleWeight = 0;

            // Group user options by category
            const userOptionsByCategory: Record<string, number[]> = {};
            userOptions.forEach((optionId: number) => {
                const category = optionCategoryMap[optionId];
                if (category) {
                    if (!userOptionsByCategory[category]) {
                        userOptionsByCategory[category] = [];
                    }
                    userOptionsByCategory[category].push(optionId);
                }
            });
            console.log('userOptions: ', userOptions)
            console.log('userOptionsByCategory: ', userOptionsByCategory)

            // Calculate score for each category
            for (const [category, categoryOptions] of Object.entries(userOptionsByCategory)) {
                const rankScore = weights[category];

                console.log('category: ', category)
                console.log('categoryOptions: ', categoryOptions)
                console.log('rankScore: ', rankScore)

                if (rankScore > 0) {
                    // Count matches in this category
                    const matchingOptions = categoryOptions.filter(opt => beachOptionSet.has(opt));
                    const categoryScore = matchingOptions.length / categoryOptions.length;

                    console.log('matchingOptions: ', matchingOptions)
                    console.log('categoryScore: ', categoryScore)

                    // main calculation
                    totalWeightedScore += categoryScore * rankScore;

                    // to make sure all the SUM of rankScore = 1
                    totalPossibleWeight += rankScore;

                    console.log('totalWeightedScore: ', totalWeightedScore)
                    console.log('totalPossibleWeight: ', totalPossibleWeight)
                    
                }
            }

            // Final similarity score (0-1)
            const similarity = totalPossibleWeight > 0 ? totalWeightedScore / totalPossibleWeight : 0;

            console.log(`Beach ${beachId}: weighted score = ${similarity}`);

            results.push({
                beach_id: beachId,
                match_percentage: Math.round(similarity * 100)
            });
        }

        connection.release();

        // Sort by highest match percentage
        results.sort((a, b) => b.match_percentage - a.match_percentage);

        return res.status(200).json({
            message: 'Beach recommendations generated successfully',
            data: results
        });

    } catch (error) {
        console.error('Get beach recommendations error:', error);
        return res.status(500).json({
            message: 'Server error generating recommendations'
        });
    }
};