import { Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import * as fs from 'fs';
import * as path from 'path';
import {
    ApiResponse,
    AuthenticatedRequest,
    BeachDetail,
    ReviewContent,
    OptionVote,
    UserProfile,
    ReviewDetail,
    BeachReviewsResponse,
    Option,
    ReviewEditData
} from '../types';

export const getAllBeaches = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<BeachDetail>>
): Promise<Response> => {
    try {
        const connection = await pool.getConnection();
        const [beaches] = await connection.query<RowDataPacket[]>(
            `SELECT b.id, b.beach_name, b.descriptions, b.cp_name, b.official_website, b.rating_average, 
            b.estimate_price, b.latitude, b.longitude, k.name as kecamatan, kk.name as kota, p.name as province, c.path
            FROM beaches b INNER JOIN kecamatans k ON k.id = b.kecamatans_id
            INNER JOIN kabupatens_kotas kk ON kk.id = k.kabupatens_id
            INNER JOIN provinsis p ON p.id = kk.provinsis_id
            LEFT JOIN contents c ON c.beaches_id = b.id
            WHERE c.reviews_id IS NULL
            ORDER BY b.id ASC;`
        );

        const [eventAvail] = await connection.query<RowDataPacket[]>(
            `SELECT b.id, COUNT(e.id) as event_count 
            FROM beaches b LEFT JOIN events e 
            ON e.beaches_id = b.id 
            GROUP BY b.id;`
        );

        connection.release();

        if (beaches.length === 0) {
            return res.status(404).json({ message: 'No beaches found' });
        }

        // Map event counts to beaches
        const beachesWithEvents = beaches.map(beach => {
            const event = eventAvail.find(e => e.id === beach.id);
            return {
                ...beach,
                event_count: event?.event_count || 0
            };
        });

        // Add image paths and ensure proper typing
        const imgBeach: BeachDetail[] = beachesWithEvents.map(beach => ({
            ...(beach as BeachDetail),
            img_path: `${req.protocol}://${req.get('host')}/uploads/contents/${beach.path}`
        }));

        return res.status(200).json({
            message: 'Beaches retrieved successfully',
            data: imgBeach
        });
    } catch (error) {
        console.error('Get beaches error:', error);
        return res.status(500).json({
            message: 'Server error retrieving beaches'
        });
    }
}

export const getBeachDetails = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<BeachDetail>>
): Promise<Response> => {
    try {
        const { id } = req.params; // Get beach ID from request parameters

        const connection = await pool.getConnection();

        // Main beach details query
        const [beachDetails] = await connection.query<RowDataPacket[]>(
            `SELECT b.id, b.beach_name, b.descriptions, b.cp_name, b.official_website, b.rating_average, 
            b.estimate_price, b.latitude, b.longitude, k.name as kecamatan, kk.name as kota, p.name as province, c.path
            FROM beaches b 
            INNER JOIN kecamatans k ON k.id = b.kecamatans_id
            INNER JOIN kabupatens_kotas kk ON kk.id = k.kabupatens_id
            INNER JOIN provinsis p ON p.id = kk.provinsis_id
            LEFT JOIN contents c ON c.beaches_id = b.id
            WHERE b.id = ?
            ORDER BY b.id ASC;`,
            [id]
        );


        if (!beachDetails.length) {
            connection.release();
            return res.status(404).json({ message: 'Beach not found' });
        }

        // Beach activities query
        const [activities] = await connection.query<RowDataPacket[]>(
            `SELECT bdo.*, o.name FROM beaches_default_options bdo
            INNER JOIN options o ON o.id = bdo.options_id
            WHERE bdo.beaches_id = ? AND o.preference_categories_id = 2;`,
            [id]
        );

        // Beach facilities query
        const [facilities] = await connection.query<RowDataPacket[]>(
            `SELECT id, facility_name, facility_category_id, beaches_id 
            FROM facilities 
            WHERE beaches_id = ?;`,
            [id]
        );

        // Beach contents query
        const [contents] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM contents 
            WHERE beaches_id = ? AND reviews_id IS NOT NULL;`,
            [id]
        );

        // Beach reviews query
        const [reviews] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM reviews r
            INNER JOIN option_votes ov ON ov.reviews_id = r.id
            WHERE beaches_id = ?;`,
            [id]
        );

        const [countReviews] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM reviews WHERE beaches_id = ?;`,
            [id]
        );

        connection.release();

        // Structure the response with grouped sections
        const beach = {
            ...(beachDetails[0] as BeachDetail),
            img_path: `${req.protocol}://${req.get('host')}/uploads/contents/${beachDetails[0].path}`,
            count_reviews: countReviews.length,
            activities: activities.map(activity => ({
                id: activity.id,
                option_id: activity.options_id,
                beach_id: activity.beaches_id,
                name: activity.name
            })),
            facilities: facilities.map(facility => ({
                id: facility.id,
                facility_name: facility.facility_name,
                facility_category_id: facility.facility_category_id,
                beaches_id: facility.beaches_id
            })),
            contents: contents.map(content => ({
                id: content.id,
                path: content.path,
                beaches_id: content.beaches_id,
                reviews_id: content.reviews_id,
                // Add full image path for contents if needed
                img_path: content.path ? `${req.protocol}://${req.get('host')}/uploads/contents/${content.path}` : null
            })),
            reviews: reviews.map(review => ({
                id: review.id,
                rating: review.rating,
                comment: review.comment,
                beaches_id: review.beaches_id,
                users_id: review.users_id,
                created_at: review.created_at,
                updated_at: review.updated_at,
                // Include option votes data
                option_vote_id: review.option_vote_id || review.id,
                votes: review.votes || review.rating
            }))
        };

        return res.status(200).json({
            message: 'Beach details retrieved successfully',
            data: [beach]
        });
    } catch (error) {
        console.error('Get beach details error:', error);
        return res.status(500).json({
            message: 'Server error retrieving beach details'
        });
    }
};

export const getBeachReviews = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<BeachReviewsResponse>>
): Promise<Response> => {
    try {
        const { beachId } = req.params;

        if (!beachId || isNaN(Number(beachId))) {
            return res.status(400).json({
                message: 'Invalid beach ID provided'
            });
        }

        const connection = await pool.getConnection();

        // Get users vote count
        const [usersVoteResult] = await connection.query<RowDataPacket[]>(
            `SELECT COUNT(*) as users_vote FROM reviews WHERE beaches_id = ?`,
            [beachId]
        );

        // Get average rating
        const [ratingResult] = await connection.query<RowDataPacket[]>(
            `SELECT AVG(rating) as rating FROM reviews WHERE beaches_id = ?`,
            [beachId]
        );

        // Get all reviews with user details
        const [reviewsResult] = await connection.query<RowDataPacket[]>(
            `SELECT r.id as review_id, u.id as user_id, u.username, MIN(up.name) as personality, 
                YEAR(u.created_at) as join_date, r.rating,
                r.user_review, DATE_FORMAT(r.created_at, '%d %M %Y') as posted,
                SUM(CASE WHEN b.status = 'approved' THEN 1 ELSE 0 END) AS experience
            FROM reviews r
            INNER JOIN users u ON u.id = r.users_id
            INNER JOIN user_personalities up ON up.id = u.user_personality_id
            LEFT JOIN bookings b ON b.users_id = u.id
            WHERE r.beaches_id = ?
            GROUP BY u.id, r.id, u.username, r.rating, r.user_review, r.created_at
            ORDER BY r.created_at DESC`,
            [beachId]
        );

        if (reviewsResult.length === 0) {
            connection.release();
            return res.status(404).json({
                message: 'No reviews found for this beach',
                data: {
                    reviews: [],
                    rating_average: 0,
                    users_vote: 0
                }
            });
        }

        // Get all review IDs and user IDs for batch queries
        const reviewIds = reviewsResult.map(review => review.review_id);
        const userIds = [...new Set(reviewsResult.map(review => review.user_id))];

        // Get all review contents (photos/videos)
        const [contentsResult] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM contents c 
            WHERE c.beaches_id = ? AND c.reviews_id IN (${reviewIds.map(() => '?').join(',')})`,
            [beachId, ...reviewIds]
        );

        // Get all option votes for reviews
        const [optionVotesResult] = await connection.query<RowDataPacket[]>(
            `SELECT o.id, o.name, ov.reviews_id FROM option_votes ov
            INNER JOIN options o ON o.id = ov.options_id 
            WHERE reviews_id IN (${reviewIds.map(() => '?').join(',')})`,
            reviewIds
        );

        // Get user profiles
        const [userProfilesResult] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM contents c 
            WHERE c.profile_id IN (${userIds.map(() => '?').join(',')}) 
            AND c.reviews_id IS NULL`,
            userIds
        );

        connection.release();

        // Group contents by review_id
        const contentsByReview = contentsResult.reduce((acc: { [key: number]: ReviewContent[] }, content) => {
            if (!acc[content.reviews_id]) {
                acc[content.reviews_id] = [];
            }
            acc[content.reviews_id].push({
                id: content.id,
                path: content.path,
                img_path: `${req.protocol}://${req.get('host')}/uploads/contents/${content.path}`
            });
            return acc;
        }, {});

        // Group option votes by review_id
        const optionVotesByReview = optionVotesResult.reduce((acc: { [key: number]: OptionVote[] }, vote) => {
            if (!acc[vote.reviews_id]) {
                acc[vote.reviews_id] = [];
            }
            acc[vote.reviews_id].push({
                id: vote.id,
                option_name: vote.name,
                reviews_id: vote.reviews_id
            });
            return acc;
        }, {});

        // Group user profiles by user_id
        const profilesByUser = userProfilesResult.reduce((acc: { [key: number]: UserProfile }, profile) => {
            acc[profile.profile_id] = {
                id: profile.id,
                path: profile.path,
                img_path: `${req.protocol}://${req.get('host')}/uploads/contents/${profile.path}`
            };
            return acc;
        }, {});

        // Combine all data
        const reviews: ReviewDetail[] = reviewsResult.map(review => ({
            review_id: review.review_id,
            user_id: review.user_id,
            username: review.username,
            join_date: review.join_date,
            rating: review.rating,
            user_review: review.user_review,
            posted: review.posted,
            experience: review.experience,
            personality: review.personality,
            contents: contentsByReview[review.review_id] || [],
            option_votes: optionVotesByReview[review.review_id] || [],
            user_profile: profilesByUser[review.user_id] || undefined
        }));

        const responseData: BeachReviewsResponse = {
            users_vote: usersVoteResult[0]?.users_vote || 0,
            rating_average: parseFloat((parseFloat(ratingResult[0]?.rating ?? '0')).toFixed(1)),
            reviews: reviews
        };

        return res.status(200).json({
            message: 'Beach reviews retrieved successfully',
            data: [responseData]
        });

    } catch (error) {
        console.error('Get beach reviews error:', error);
        return res.status(500).json({
            message: 'Server error retrieving beach reviews'
        });
    }
};

export const getReviewForEdit = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<ReviewEditData>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { reviewId } = req.params;

        const connection = await pool.getConnection();

        // Get review details with current option votes and files
        const [review] = await connection.query<RowDataPacket[]>(
            `SELECT r.id, r.rating, r.user_review, r.beaches_id,
                    b.beach_name,
                    GROUP_CONCAT(DISTINCT ov.options_id) as option_votes,
                    GROUP_CONCAT(DISTINCT c.path) as path
             FROM reviews r
             JOIN beaches b ON r.beaches_id = b.id
             LEFT JOIN option_votes ov ON r.id = ov.reviews_id
             LEFT JOIN contents c ON r.id = c.reviews_id
             WHERE r.id = ? AND r.users_id = ?
             GROUP BY r.id;`,
            [reviewId, userId]
        );

        if (review.length === 0) {
            return res.status(404).json({
                message: 'Review not found or unauthorized'
            });
        }

        connection.release();
        return res.status(200).json({
            message: 'Review details retrieved successfully',
            data: review[0]
        });
    } catch (error) {
        console.error('Get review for edit error:', error);
        return res.status(500).json({
            message: 'Server error retrieving review'
        });
    }
};

// Add Review API
export const addReview = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const {
            beachId,
            rating,
            comment,
            optionVotes
        } = req.body;

        // console.log(optionVotes.optionId)
        // Handle uploaded files
        const files = req.files as Express.Multer.File[] | undefined;

        if (!userId || !beachId || !rating) {
            return res.status(400).json({
                message: 'Invalid request data: userId, beachId, and rating are required'
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Insert new review
            const [reviewResult] = await connection.query<ResultSetHeader>(
                `INSERT INTO reviews (users_id, beaches_id, rating, user_review) 
                 VALUES (?, ?, ?, ?)`,
                [userId, beachId, rating, comment]
            );

            const reviewId = reviewResult.insertId;

            // Insert option votes
            if (optionVotes && Array.isArray(optionVotes)) {
                for (const vote of optionVotes) {
                    await connection.query(
                        `INSERT INTO option_votes (reviews_id, options_id) 
                         VALUES (?, ?)`,
                        [reviewId, vote]
                    );
                }
            }

            // Handle file uploads and save to contents table
            if (files && files.length > 0) {
                for (const file of files) {
                    const fileType = file.mimetype.startsWith('image/') ? 'photo' :
                        file.mimetype.startsWith('video/') ? 'video' : 'other';

                    // Step 1: Insert initial row with empty path
                    const [contentResult] = await connection.query<ResultSetHeader>(
                        `INSERT INTO contents (path, type, beaches_id, reviews_id) 
                        VALUES (?, ?, ?, ?)`,
                        ['', fileType, beachId, reviewId]
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

            // Update review summary (delete previous data and recalculate)
            await updateReviewSummary(connection, beachId);

            // Update rating average in beaches table
            await updateBeachRatingAverage(connection, beachId);

            await connection.commit();
            connection.release();

            return res.status(201).json({
                message: 'Review added successfully'
            });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Add review error:', error);
        return res.status(500).json({
            message: 'Server error adding review'
        });
    }
};

// Edit Review API
export const editReview = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { reviewId } = req.params;
        const {
            rating,
            comment,
            optionVotes,
            keepExistingFiles
        } = req.body;

        // Handle uploaded files
        const files = req.files as Express.Multer.File[] | undefined;

        if (!userId || !reviewId || !rating) {
            return res.status(400).json({
                message: 'Invalid request data: userId, reviewId, and rating are required'
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Check if review exists and belongs to the user
            const [existingReview] = await connection.query<RowDataPacket[]>(
                'SELECT beaches_id FROM reviews WHERE id = ? AND users_id = ?',
                [reviewId, userId]
            );

            if (existingReview.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({
                    message: 'Review not found or unauthorized'
                });
            }

            const beachId = existingReview[0].beaches_id;

            // Update review
            await connection.query(
                `UPDATE reviews SET 
                 rating = ?, 
                 user_review = ?,
                 updated_at = NOW()
                 WHERE id = ? AND users_id = ?`,
                [rating, comment || null, reviewId, userId]
            );

            // Delete existing option votes for this review
            await connection.query(
                'DELETE FROM option_votes WHERE reviews_id = ?',
                [reviewId]
            );

            // Insert new option votes if provided
            if (optionVotes && Array.isArray(optionVotes)) {
                for (const vote of optionVotes) {
                    await connection.query(
                        `INSERT INTO option_votes (reviews_id, options_id) 
                         VALUES (?, ?)`,
                        [reviewId, vote]
                    );
                }
            }

            // Handle file management - FIXED: Only delete if explicitly told not to keep existing files
            if (keepExistingFiles === 'false' || keepExistingFiles === false) {
                // Only delete existing files if user explicitly chose not to keep them
                const [existingContents] = await connection.query<RowDataPacket[]>(
                    'SELECT path FROM contents WHERE reviews_id = ?',
                    [reviewId]
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

                // Delete content records
                await connection.query(
                    'DELETE FROM contents WHERE reviews_id = ?',
                    [reviewId]
                );
            }

            // Handle new file uploads - Always add new files if provided
            if (files && files.length > 0) {
                for (const file of files) {
                    const fileType = file.mimetype.startsWith('image/') ? 'photo' :
                        file.mimetype.startsWith('video/') ? 'video' : 'other';

                    // Step 1: Insert initial row with empty path
                    const [contentResult] = await connection.query<ResultSetHeader>(
                        `INSERT INTO contents (path, type, beaches_id, reviews_id) 
                        VALUES (?, ?, ?, ?)`,
                        ['', fileType, beachId, reviewId]
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

            // Update review summary (delete previous data and recalculate)
            await updateReviewSummary(connection, beachId);

            // Update rating average in beaches table
            await updateBeachRatingAverage(connection, beachId);

            await connection.commit();
            connection.release();

            return res.status(200).json({
                message: 'Review updated successfully'
            });
        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Edit review error:', error);
        return res.status(500).json({
            message: 'Server error updating review'
        });
    }
};

// Helper function to update review summary
const updateReviewSummary = async (connection: any, beachId: number): Promise<void> => {
    // Delete existing summary data for this beach
    await connection.query(
        'DELETE FROM review_summary WHERE beaches_id = ?',
        [beachId]
    );

    // Recalculate and insert new summary data
    const [optionSummary] = await connection.query(
        `SELECT 
        r.beaches_id, ov.options_id,
        COUNT(*) as total_votes
        FROM option_votes ov
        INNER JOIN reviews r on r.id = ov.reviews_id
        WHERE r.beaches_id = ?
        GROUP BY r.beaches_id, ov.options_id;`,
        [beachId]
    );

    // Insert option votes summary
    for (const option of optionSummary) {
        await connection.query(
            `INSERT INTO review_summary (beaches_id, options_id, total_votes) 
             VALUES (?, ?, ?)`,
            [option.beaches_id, option.options_id, option.total_votes]
        );
    }
};

// Helper function to update beach rating average
const updateBeachRatingAverage = async (connection: any, beachId: number): Promise<void> => {
    const [avgResult] = await connection.query(
        'SELECT AVG(rating) as avg_rating FROM reviews WHERE beaches_id = ?',
        [beachId]
    );

    const avgRating = avgResult.length > 0 ? avgResult[0].avg_rating : 0;

    await connection.query(
        'UPDATE beaches SET rating_average = ? WHERE id = ?',
        [avgRating || 0, beachId]
    );
};

export const getListOptions = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<Option>>
): Promise<Response> => {
    try {
        const connection = await pool.getConnection();
        const [optionData] = await connection.query<RowDataPacket[]>(
            `SELECT id, name, preference_categories_id FROM options;`
        );

        connection.release();

        if (optionData.length === 0) {
            return res.status(404).json({ message: 'No options found' });
        }

        return res.status(200).json({
            message: 'Options retrieved successfully',
            data: optionData as Option[]
        });
    } catch (error) {
        console.error('Get options error:', error);
        return res.status(500).json({
            message: 'Server error retrieving beaches'
        });
    }
}

export const getAllWishlist = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;

        const connection = await pool.getConnection();

        // Get all wishlists for the user with beach details
        const [wishlists] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM wishlists w
            INNER JOIN beaches b ON w.beaches_id = b.id
            LEFT JOIN contents c ON c.beaches_id = b.id
            WHERE w.users_id = ? AND c.reviews_id IS NULL;`,
            [userId]
        );

        connection.release();

        const imgBeach = wishlists.map(beach => ({
            ...(beach as BeachDetail),
            img_path: `${req.protocol}://${req.get('host')}/uploads/contents/${beach.path}`
        }));

        return res.status(200).json({
            message: 'Wishlists retrieved successfully',
            data: imgBeach
        });
    } catch (error) {
        console.error('Get all wishlists error:', error);
        return res.status(500).json({
            message: 'Server error retrieving wishlists'
        });
    }
};

// Add to wishlist
export const addToWishlist = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { beaches_id } = req.body;

        // Validate required fields
        if (!beaches_id) {
            return res.status(400).json({
                message: 'Beach ID is required'
            });
        }

        const connection = await pool.getConnection();

        // Check if the wishlist item already exists
        const [existingWishlist] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM wishlists WHERE users_id = ? AND beaches_id = ?`,
            [userId, beaches_id]
        );

        if (existingWishlist.length > 0) {
            connection.release();
            return res.status(409).json({
                message: 'Beach is already in your wishlist'
            });
        }

        // Check if beach exists
        const [beach] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM beaches WHERE id = ?`,
            [beaches_id]
        );

        if (beach.length === 0) {
            connection.release();
            return res.status(404).json({
                message: 'Beach not found'
            });
        }

        // Add to wishlist
        const [result] = await connection.query<ResultSetHeader>(
            `INSERT INTO wishlists (users_id, beaches_id, created_at) VALUES (?, ?, NOW())`,
            [userId, beaches_id]
        );

        // Get the added wishlist with beach details
        const [addedWishlist] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM wishlists
            ORDER BY created_at DESC`,
            [result.insertId]
        );

        connection.release();

        return res.status(201).json({
            message: 'Beach added to wishlist successfully',
            data: addedWishlist[0]
        });
    } catch (error) {
        console.error('Add to wishlist error:', error);
        return res.status(500).json({
            message: 'Server error adding to wishlist'
        });
    }
};

// Delete from wishlist
export const deleteFromWishlist = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const { beaches_id } = req.params;

        // Validate required fields
        if (!beaches_id) {
            return res.status(400).json({
                message: 'Beach ID is required'
            });
        }

        const connection = await pool.getConnection();

        // Check if the wishlist item exists for this user
        const [existingWishlist] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM wishlists WHERE users_id = ? AND beaches_id = ?`,
            [userId, beaches_id]
        );

        if (existingWishlist.length === 0) {
            connection.release();
            return res.status(404).json({
                message: 'Beach not found in your wishlist'
            });
        }

        // Delete from wishlist
        await connection.query(
            `DELETE FROM wishlists WHERE users_id = ? AND beaches_id = ?`,
            [userId, beaches_id]
        );

        connection.release();

        return res.status(200).json({
            message: 'Beach removed from wishlist successfully'
        });
    } catch (error) {
        console.error('Delete from wishlist error:', error);
        return res.status(500).json({
            message: 'Server error removing from wishlist'
        });
    }
};