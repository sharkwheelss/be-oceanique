import { Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import {
    ApiResponse,
    AuthenticatedRequest,
    BeachDetail,
    ReviewContent,
    OptionVote,
    UserProfile,
    ReviewDetail,
    BeachReviewsResponse
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
            INNER JOIN contents c ON c.beaches_id = b.id
            WHERE c.reviews_id IS NULL
            ORDER BY b.id ASC;`
        );

        connection.release();

        if (beaches.length === 0) {
            return res.status(404).json({ message: 'No beaches found' });
        }

        const imgBeach: BeachDetail[] = beaches.map(beach => ({
            ...(beach as BeachDetail),
            img_path: `${req.protocol}://${req.get('host')}/uploads/contents/${beach.path}`
        }));

        return res.status(200).json({
            message: 'Beaches retrieved successfully',
            data: imgBeach as BeachDetail[]
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
            INNER JOIN contents c ON c.beaches_id = b.id
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

        connection.release();

        // Structure the response with grouped sections
        const beach = {
            ...(beachDetails[0] as BeachDetail),
            img_path: `${req.protocol}://${req.get('host')}/uploads/contents/${beachDetails[0].path}`,
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
                option_vote_id: review.option_vote_id || review.id, // Adjust based on your schema
                votes: review.votes || review.rating // Adjust based on your option_votes structure
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
        console.log(beachId)
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
            `SELECT r.id as review_id, u.id as user_id, u.username, 
            YEAR(u.created_at) as join_date, r.rating,
            r.user_review, DATE_FORMAT(r.created_at, '%d %M %Y') as posted,
            COUNT(b.id) as experience
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