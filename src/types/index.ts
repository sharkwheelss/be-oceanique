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
    option_name: string;
    preference_categories_id: number;
}

export interface Questions {
    id: number;
    question: string;
    question_type: string;
    category: string;
    options: Option[];
}

export interface BeachMatch {
    beach_id: number;
    match_percentage: number;
}

export interface UserPreference {
    name: string;
    rank: number;
}

export interface BeachOption {
    beaches_id: number;
    options_id: number;
    source: string;
}

export interface BeachDetail extends BeachMatch {
    id: number;
    beach_name: string;
    descriptions: string;
    cp_name?: string;
    official_website?: string;
    rating_average?: number;
    estimate_price: number;
    latitude?: number;
    longitude?: number;
    kecamatan: string;
    kota: string;
    province: string;
}

export interface ReviewContent {
    id: number;
    path: string;
    img_path?: string;
}

export interface OptionVote {
    id: number;
    option_name: string;
    reviews_id: number;
}

export interface UserProfile {
    id: number;
    path: string;
    img_path?: string;
}

export interface ReviewDetail {
    review_id: number;
    user_id: number;
    username: string;
    join_date: number;
    rating: number;
    user_review: string;
    posted: string;
    experience: number;
    contents: ReviewContent[];
    option_votes: OptionVote[];
    user_profile?: UserProfile;
}

export interface ReviewEditData {
    id: number;
    rating: number;
    beaches_id: number;
    beaches_name: string;
    option_votes: string;
    path: string;
}

export interface BeachReviewsResponse {
    users_vote: number;
    rating_average: number;
    reviews: ReviewDetail[];
}

export interface EventDetail {
    id: number;
    name: string;
    description: string;
    is_active: number;
    start_date: string;
    end_date: string;
    start_time: string;
    end_time: string;
    jenis: string;
    private_code?: number | null;
    beaches_id: number;
    users_id: number;
    beach_name?: string;
    province?: string;
    city?: string;
    subdistrict?: string;
    status: 'ongoing' | 'ended soon' | 'ended' | 'upcoming';
    img_path?: string;
}

export interface EventDetailWithTickets extends EventDetail {
    tickets: TicketWithAvailability[];
    can_purchase: boolean;
}

export interface TicketWithAvailability {
    id: number;
    name: string;
    description: string;
    quota: number;
    price: number;
    createat: Date;
    updateat: Date;
    promo_code: string | null;
    events_id: number;
    tickets_categories_id: number | null;
    category: {
        id: number;
        name: string;
        createat: Date;
        updateat: Date;
        users_id: number;
    } | null;
    booked_count: number;
    remaining_tickets: number;
    is_available: boolean;
    is_sold_out: boolean;
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