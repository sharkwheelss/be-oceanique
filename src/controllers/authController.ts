/**
 * Authentication controllers
 * Contains all the business logic for authentication endpoints
 */

import { Response } from 'express';
import bcrypt from 'bcrypt';
import { validationResult } from 'express-validator';
import { pool } from '../config/database';
import {
    AuthenticatedRequest,
    User,
    UserResponse,
    SignupRequest,
    SigninRequest,
    ApiResponse,
    AuthResponse
} from '../types';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import * as fs from 'fs';
import * as path from 'path';

/**
 * User registration controller
 * Handles user signup with validation and password hashing
 */
export const signup = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<UserResponse>>
): Promise<Response> => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, email, password, userTypesId }: SignupRequest = req.body;

        // Check if the username or email already exists
        const connection = await pool.getConnection();
        const [existingUsers] = await connection.query<RowDataPacket[]>(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUsers.length > 0) {
            connection.release();
            return res.status(409).json({
                message: 'Username or email already exists'
            });
        }

        // Hash the password
        const saltRounds = 10;
        const hashedPassword: string = await bcrypt.hash(password, saltRounds);

        // Validate user type is within allowed range
        if (![1, 2, 3].includes(userTypesId)) {
            return res.status(400).json({
                message: 'Invalid user type specified'
            });
        }

        const [result] = await connection.query<ResultSetHeader>(
            'INSERT INTO users (username, email, password, user_types_id) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, userTypesId]
        );

        connection.release();

        // Return success response (without sensitive information)
        return res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: result.insertId,
                username,
                email,
                user_types_id: userTypesId,
            }
        });
    } catch (error) {
        console.error('Sign up error:', error);
        return res.status(500).json({
            message: 'Server error during registration'
        });
    }
};

/**
 * User authentication controller
 * Handles user login with credential validation
 */
export const signin = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<UserResponse>>
): Promise<Response> => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { login, password }: SigninRequest = req.body;

        // Find user by email or username
        const connection = await pool.getConnection();
        const [users] = await connection.query<RowDataPacket[]>(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [login, login]
        );

        const [imgProfile] = await connection.query<RowDataPacket[]>(
            'SELECT * FROM contents WHERE profile_id = ?',
            [users[0]?.id]
        );

        connection.release();

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = users[0] as User;

        // Compare the provided password with the hashed password in the database
        const isPasswordValid: boolean = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const profileImgPath =
            imgProfile.length > 0 && imgProfile[0].path
                ? `${req.protocol}://${req.get('host')}/uploads/contents/${imgProfile[0].path}`
                : `${req.protocol}://${req.get('host')}/uploads/contents/placeholder-profile.png`;

        // Create a session for the authenticated user
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.email = user.email;
        req.session.userTypesId = user.user_types_id;
        req.session.userPersonalityId = user.user_personality_id;
        req.session.imgProfile = profileImgPath;

        // Create a simple session identifier as token
        const token = req.session.id;
        res.cookie('token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax'
        });

        // Return success response (without sensitive information)
        return res.status(200).json({
            message: 'Authentication successful',
            // token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                user_types_id: user.user_types_id,
                user_personality_id: user.user_personality_id,
                imgProfile: profileImgPath
            }
        });
    } catch (error) {
        console.error('Sign in error:', error);
        return res.status(500).json({
            message: 'Server error during authentication'
        });
    }
};

/**
 * Get current user controller
 * Returns user data for the currently logged-in user
 */
export const getCurrentUser = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<UserResponse>>
): Promise<Response> => {
    try {
        const connection = await pool.getConnection();
        const [users] = await connection.query<RowDataPacket[]>(
            'SELECT * FROM users WHERE id = ?',
            [req.session.userId]
        );

        connection.release();

        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({
            message: 'User retrieved successfully',
            user: users[0] as UserResponse
        });
    } catch (error) {
        console.error('Get user error:', error);
        return res.status(500).json({
            message: 'Server error retrieving user data'
        });
    }
};

/**
 * Logout controller
 * Destroys the session and clears the cookie
 */
export const logout = (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>
): void => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Error during logout' });
        }

        // Clear the session cookie
        res.clearCookie('auth_session');
        return res.status(200).json({ message: 'Logout successful' });
    });
};


/**
 * Check authentication status controller
 * Returns whether the user is authenticated
 */
export const checkAuth = (
    req: AuthenticatedRequest,
    res: Response<AuthResponse>
): Response => {
    if (req.session && req.session.userId) {
        return res.status(200).json({
            authenticated: true,
            user: {
                id: req.session.userId,
                username: req.session.username || '',
                email: req.session.email || '',
                address: req.session.address || '',
                user_types_id: req.session.userTypesId || 1,
                user_personality_id: req.session.userPersonalityId || null,
                imgProfile: req.session.imgProfile || null
            }
        });
    }

    return res.status(200).json({
        authenticated: false
    });
};

export const viewProfile = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<any>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;

        const connection = await pool.getConnection();

        try {
            // Get user data
            const [users] = await connection.query<RowDataPacket[]>(
                `SELECT * FROM users u
                LEFT JOIN user_personalities up
                ON up.id = u.user_personality_id
                LEFT JOIN contents c
                ON c.profile_id = u.id
                WHERE u.id = ?`,
                [userId]
            );

            if (users.length === 0) {
                connection.release();
                return res.status(404).json({
                    message: 'User not found'
                });
            }

            const user = users[0];

            const [preferenceRows] = await connection.query<RowDataPacket[]>(
                `SELECT name, score
                FROM user_preferences up
                INNER JOIN preference_categories pc ON pc.id = up.preference_categories_id
                WHERE users_id = ?`,
                [userId]
            );

            connection.release();

            // Convert array of { name, score } into object: { name1: score1, name2: score2, ... }
            const preferenceObject = preferenceRows.reduce((acc, row) => {
                acc[row.name] = row.score;
                return acc;
            }, {} as Record<string, number>);

            // Format response
            const profileData = {
                username: user.username,
                email: user.email,
                address: user.address,
                img: `${req.protocol}://${req.get('host')}/uploads/contents/${user.path || 'placeholder-profile.png'}`,
                created_at: user.created_at,
                updated_at: user.updated_at,
                user_personality_id: user.user_personality_id,
                user_types_id: user.user_types_id,
                personality: user.name,
                bank_name: user.bank_name,
                account_number: user.account_number,
                account_name: user.account_name,
                preference: preferenceObject
            };


            return res.status(200).json({
                message: 'Profile retrieved successfully',
                data: profileData
            });

        } catch (error) {
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('View profile error:', error);
        return res.status(500).json({
            message: 'Server error retrieving profile data'
        });
    }
};

// Edit Profile API
export const editProfile = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<null>>
): Promise<Response> => {
    try {
        const userId = req.session.userId;
        const {
            username,
            email,
            address,
            keepExistingProfilePicture,
            bank_name,
            account_number,
            account_name,
            password,
            currentPassword
        } = req.body;

        // console.log(req.body)
        // Handle uploaded profile picture files
        const files = req.files as Express.Multer.File[] | undefined;

        // Basic validation
        if (!username || !email) {
            return res.status(400).json({
                message: 'Username and email are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                message: 'Invalid email format'
            });
        }

        if (keepExistingProfilePicture === 'false' && (!files || files.length === 0)) {
            return res.status(400).json({
                message: 'Please provide a new picture'
            });
        }

        // Password validation if provided
        if (password) {
            if (!currentPassword) {
                return res.status(400).json({
                    message: 'Current password is required to update password'
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    message: 'New password must be at least 6 characters long'
                });
            }
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Check if user exists and get current password if needed
            const [existingUser] = await connection.query<RowDataPacket[]>(
                'SELECT * FROM users WHERE id = ?',
                [userId]
            );

            if (existingUser.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({
                    message: 'User not found'
                });
            }

            // Verify current password if user wants to update password
            if (password) {
                const isCurrentPasswordValid = await bcrypt.compare(
                    currentPassword,
                    existingUser[0].password
                );

                if (!isCurrentPasswordValid) {
                    await connection.rollback();
                    connection.release();
                    return res.status(401).json({
                        message: 'Current password is incorrect'
                    });
                }
            }

            // Check if username or email already exists (excluding current user)
            const [duplicateCheck] = await connection.query<RowDataPacket[]>(
                'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?',
                [username, email, userId]
            );

            if (duplicateCheck.length > 0) {
                await connection.rollback();
                connection.release();
                return res.status(409).json({
                    message: 'Username or email already exists'
                });
            }

            // Handle profile picture management - FIXED: Only delete if explicitly told not to keep existing files
            if (keepExistingProfilePicture === 'false' || keepExistingProfilePicture === false) {
                // Only delete existing profile pictures if user explicitly chose not to keep them
                const [existingContents] = await connection.query<RowDataPacket[]>(
                    'SELECT path FROM contents WHERE profile_id = ?',
                    [userId]
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
                        console.warn('Failed to delete profile picture file:', content.path, err);
                    }
                }

                // Delete content records
                await connection.query(
                    'DELETE FROM contents WHERE profile_id = ?',
                    [userId]
                );
            }

            // Handle new profile picture uploads - Always add new files if provided
            if (files && files.length > 0) {
                for (const file of files) {
                    // Validate file type - only allow images for profile pictures
                    if (!file.mimetype.startsWith('image/')) {
                        await connection.rollback();
                        connection.release();
                        return res.status(400).json({
                            message: 'Only image files are allowed for profile picture'
                        });
                    }

                    // Step 1: Insert initial row with empty path
                    const [contentResult] = await connection.query<ResultSetHeader>(
                        `INSERT INTO contents (path, type, profile_id) 
                        VALUES (?, ?, ?)`,
                        ['', 'photo', userId]
                    );

                    const contentId = contentResult.insertId;
                    const extension = path.extname(file.originalname); // e.g., .jpg
                    const newFilename = `profile_${contentId}${extension}`;

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

            // Prepare update query - conditionally include password
            let updateQuery = `UPDATE users SET 
                 username = ?, 
                 email = ?,
                 address = ?,
                 bank_name = ?,
                 account_number = ?,
                 account_name = ?`;

            let updateParams = [
                username,
                email,
                address || null,
                bank_name || null,
                account_number || null,
                account_name || null
            ];

            // Add password to update if provided
            if (password) {
                const saltRounds = 10;
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                updateQuery += `, password = ?`;
                updateParams.push(hashedPassword);
            }

            updateQuery += `, updated_at = NOW() WHERE id = ?`;
            updateParams.push(userId);

            // Update user data
            await connection.query(updateQuery, updateParams);

            await connection.commit();
            connection.release();

            return res.status(200).json({
                message: 'Profile updated successfully'
            });

        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Edit profile error:', error);
        return res.status(500).json({
            message: 'Server error updating profile'
        });
    }
};