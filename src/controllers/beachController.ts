import { Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import {
    ApiResponse,
    AuthenticatedRequest,
    BeachDetail,
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
            img_path: `${req.protocol}://${req.get('host')}/uploads/beaches/${beach.path}`
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
            img_path: `${req.protocol}://${req.get('host')}/uploads/beaches/${beachDetails[0].path}`,
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
                img_path: content.path ? `${req.protocol}://${req.get('host')}/uploads/beaches/${content.path}` : null
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