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

        const { username, email, password }: SignupRequest = req.body;

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

        // Insert the new user into the database
        // Get user_types_id from request body or determine it based on the registration endpoint
        const userTypesId = req.body.userTypesId || req.query.userType || 1; // Default to 1 if not specified

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

        // Create a session for the authenticated user
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.email = user.email;
        req.session.userTypesId = user.user_types_id;

        // Return success response (without sensitive information)
        return res.status(200).json({
            message: 'Authentication successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                user_types_id: user.user_types_id,
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
            'SELECT id, username, email, user_types_id, created_at FROM users WHERE id = ?',
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
                user_types_id: req.session.userTypesId || 1,
            }
        });
    }

    return res.status(200).json({
        authenticated: false
    });
};