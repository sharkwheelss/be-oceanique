import { Response } from 'express';
import { pool } from '../config/database';
import {
    AuthenticatedRequest,
    UserPersonality,
    ApiResponse,
    User, PreferenceCategory,
    Questions, BeachMatch,
    UserPreference, BeachOption, BeachDetail

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

export const BeachRecommendations = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<BeachMatch>>
): Promise<Response> => {
    const connection = await pool.getConnection();

    try {
        const userId = req.session.userId || 0;
        const { userOptions } = req.body;

        // Validate input
        if (!userOptions || !Array.isArray(userOptions) || userOptions.length === 0) {
            return res.status(400).json({ message: 'No user options provided' });
        }

        // Get user preferences and calculate weights
        const weights = await getUserPreferenceWeights(connection, userId);
        if (Object.keys(weights).length === 0) {
            return res.status(400).json({ message: 'User preferences not found' });
        }

        // Get option-category mapping
        const optionCategoryMap = await getOptionCategoryMap(connection);

        // Get beach options with priority logic
        const beachOptions = await getBeachOptions(connection);
        const beachMap = groupBeachOptionsByBeachId(beachOptions);

        // Calculate weighted similarity scores
        const results = calculateBeachMatches(userOptions, beachMap, optionCategoryMap, weights);

        if (results.length === 0) {
            return res.status(200).json({
                message: 'No beach recommendations found',
                data: []
            });
        }

        // Get detailed beach information
        const detailedResults = await getDetailedBeachResults(connection, results);

        return res.status(200).json({
            message: 'Beach recommendations generated successfully',
            data: detailedResults
        });

    } catch (error) {
        console.error('Get beach recommendations error:', error);
        return res.status(500).json({
            message: 'Server error generating recommendations'
        });
    } finally {
        connection.release();
    }
};

// Helper function to get user preference weights
async function getUserPreferenceWeights(connection: any, userId: number): Promise<Record<string, number>> {
    const [userPreferences] = await connection.query(`
        SELECT pc.name, up.score as 'rank'
        FROM user_preferences up 
        INNER JOIN preference_categories pc ON pc.id = up.preference_categories_id
        WHERE users_id = ?
    `, [userId]);

    if (userPreferences.length === 0) {
        return {};
    }

    const maxRank = userPreferences.reduce((sum: number, pref: UserPreference) => sum + pref.rank, 0);
    const weights: Record<string, number> = {};

    userPreferences.forEach((pref: UserPreference) => {
        weights[pref.name] = pref.rank / maxRank;
    });

    return weights;
}

// Helper function to get option-category mapping
async function getOptionCategoryMap(connection: any): Promise<Record<number, string>> {
    const [optionCategories] = await connection.query(`
        SELECT o.id, pc.name
        FROM options o
        JOIN preference_categories pc ON o.preference_categories_id = pc.id
    `);

    const optionCategoryMap: Record<number, string> = {};
    optionCategories.forEach((row: any) => {
        optionCategoryMap[row.id] = row.name;
    });

    return optionCategoryMap;
}

// Helper function to get beach options with priority logic
async function getBeachOptions(connection: any): Promise<BeachOption[]> {
    // Get beaches that have review summary data
    const [reviewSummaryBeaches] = await connection.query(`
        SELECT DISTINCT beaches_id FROM review_summary
    `);

    const reviewSummaryBeachIds = reviewSummaryBeaches.map((row: any) => row.beaches_id);

    let beachOptionsQuery = '';
    let queryParams: any[] = [];

    if (reviewSummaryBeachIds.length > 0) {
        const placeholders = reviewSummaryBeachIds.map(() => '?').join(',');
        beachOptionsQuery = `
            SELECT beaches_id, options_id, 'review_summary' as source
            FROM review_summary
            WHERE beaches_id IN (${placeholders})
            UNION ALL
            SELECT beaches_id, options_id, 'default_options' as source
            FROM beaches_default_options bdo
            WHERE beaches_id NOT IN (${placeholders})
        `;
        queryParams = [...reviewSummaryBeachIds, ...reviewSummaryBeachIds];
    } else {
        beachOptionsQuery = `
            SELECT beaches_id, options_id, 'default_options' as source
            FROM beaches_default_options
        `;
    }

    const [beachOptions] = await connection.query(beachOptionsQuery, queryParams);
    return beachOptions as BeachOption[];
}

// Helper function to group beach options by beach ID
function groupBeachOptionsByBeachId(beachOptions: BeachOption[]): Record<number, Set<number>> {
    const beachMap: Record<number, Set<number>> = {};

    beachOptions.forEach((row) => {
        if (!beachMap[row.beaches_id]) {
            beachMap[row.beaches_id] = new Set();
        }
        beachMap[row.beaches_id].add(row.options_id);
    });

    return beachMap;
}

// Helper function to calculate beach matches
function calculateBeachMatches(
    userOptions: number[],
    beachMap: Record<number, Set<number>>,
    optionCategoryMap: Record<number, string>,
    weights: Record<string, number>
): BeachMatch[] {
    // Group user options by category
    const userOptionsByCategory: Record<string, number[]> = {};
    userOptions.forEach((optionId) => {
        const category = optionCategoryMap[optionId];
        if (category) {
            if (!userOptionsByCategory[category]) {
                userOptionsByCategory[category] = [];
            }
            userOptionsByCategory[category].push(optionId);
        }
    });

    const results: BeachMatch[] = [];

    for (const [beachIdStr, beachOptionSet] of Object.entries(beachMap)) {
        const beachId = parseInt(beachIdStr);
        let totalWeightedScore = 0;
        let totalPossibleWeight = 0;

        // Calculate score for each category
        for (const [category, categoryOptions] of Object.entries(userOptionsByCategory)) {
            const rankScore = weights[category];

            if (rankScore > 0) {
                const matchingOptions = categoryOptions.filter(opt => beachOptionSet.has(opt));
                const categoryScore = matchingOptions.length / categoryOptions.length;

                totalWeightedScore += categoryScore * rankScore;
                totalPossibleWeight += rankScore;
            }
        }

        // Calculate final similarity score (0-1)
        const similarity = totalPossibleWeight > 0 ? totalWeightedScore / totalPossibleWeight : 0;

        results.push({
            beach_id: beachId,
            match_percentage: Math.round(similarity * 100)
        });
    }

    // Sort by highest match percentage first
    return results.sort((a, b) => b.match_percentage - a.match_percentage);
}

// Helper function to get detailed beach results
async function getDetailedBeachResults(connection: any, results: BeachMatch[]): Promise<BeachDetail[]> {
    const beachIds = results.map(result => result.beach_id);
    const placeholders = beachIds.map(() => '?').join(',');

    const [beachDetails] = await connection.query(
        `SELECT b.id, b.beach_name, b.descriptions, b.cp_name, b.official_website, 
         b.rating_average, b.estimate_price, b.latitude, b.longitude, 
         k.name as kecamatan, kk.name as kota, p.name as province
         FROM beaches b 
         INNER JOIN kecamatans k ON k.id = b.kecamatans_id  
         INNER JOIN kabupatens_kotas kk ON kk.id = k.kabupatens_id 
         INNER JOIN provinsis p ON p.id = kk.provinsis_id 
         WHERE b.id IN (${placeholders})`,
        beachIds
    );

    // Create a map of beach details for easy lookup
    const beachDetailsMap: Record<number, BeachDetail> = {};
    beachDetails.forEach((beach: BeachDetail) => {
        beachDetailsMap[beach.id] = beach;
    });

    // Combine match results with beach details
    return results.map(result => {
        const beachDetail = beachDetailsMap[result.beach_id];
        return {
            beach_id: result.beach_id,
            match_percentage: result.match_percentage,
            id: beachDetail.id,
            beach_name: beachDetail.beach_name,
            descriptions: beachDetail.descriptions,
            cp_name: beachDetail?.cp_name || '-',
            official_website: beachDetail?.official_website || '-',
            rating_average: beachDetail?.rating_average || 0,
            estimate_price: beachDetail.estimate_price,
            latitude: beachDetail?.latitude || 0,
            longitude: beachDetail?.longitude || 0,
            kecamatan: beachDetail?.kecamatan || '',
            kota: beachDetail?.kota || '',
            province: beachDetail?.province || ''
        };
    });
}

// Function to get the details of the reviews