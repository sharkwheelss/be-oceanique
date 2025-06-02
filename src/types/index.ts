/**
 * Type definitions for the authentication API
 * Contains interfaces and types used throughout the application
 */

import { Request } from 'express';
import { Session } from 'express-session';

// User related types
export interface User {
    id: number;
    username: string;
    email: string;
    password: string;
    user_types_id: number;
    user_personality_id: number;
    created_at: Date;
}

export interface UserResponse {
    id: number;
    username: string;
    email: string;
    address?: string;
    user_types_id: number;
    user_personality_id?: number | null;
}

export interface SignupRequest {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export interface SigninRequest {
    login: string; // Can be email or username
    password: string;
}

// Session types
export interface SessionData extends Session {
    userId?: number;
    username?: string;
    email?: string;
    address?: string;
    userTypesId?: number;
    userPersonalityId?: number;
}

// Extended Request interface with session
export interface AuthenticatedRequest extends Request {
    session: SessionData;
    isAuthenticated?: boolean;
    userId?: number;
    username?: string;
}

// Database configuration
export interface DatabaseConfig {
    host: string;
    user: string;
    password: string;
    database: string;
    waitForConnections: boolean;
    connectionLimit: number;
    queueLimit: number;
}

// API Response types
export interface ApiResponse<T = any> {
    message: string;
    token?: string;
    user?: T;
    errors?: any[];
    data?: T[];
}

export interface AuthResponse {
    authenticated: boolean;
    user?: UserResponse;
}

export interface UserPersonality {
    id: number;
    name: string;
    description: string;
}

export interface PreferenceCategory {
    id: number;
    name: string;
    default_score: number;
}

export interface Option {
    id: number;
    option_text: string;
    option_value: string;
}

export interface Questions {
    id: number;
    question: string;
    question_type: string;
    category: string;
    options: Option[];
}export const getAllQuestions = async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse<Questions[]>>
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
            LEFT JOIN options o ON pc.id = o.preference_categories_id;
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


// Environment variables
export interface EnvConfig {
    PORT: string;
    NODE_ENV: string;
    DB_HOST: string;
    DB_USER: string;
    DB_PASSWORD: string;
    DB_NAME: string;
    SESSION_SECRET: string;
    FRONTEND_URL: string;
}