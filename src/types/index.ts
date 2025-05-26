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
    created_at: Date;
}

export interface UserResponse {
    id: number;
    username: string;
    email: string;
    user_types_id: number;
    created_at?: Date;
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
    userTypesId?: number;
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
}

export interface AuthResponse {
    authenticated: boolean;
    user?: UserResponse;
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