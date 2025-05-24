/**
 * Authentication middleware
 * Contains middleware functions for protecting routes
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

/**
 * Authentication middleware
 * Verifies if user is authenticated before accessing protected routes
 */
export const isAuthenticated = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void | Response => {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ message: 'Unauthorized: Please log in' });
};

/**
 * Optional authentication middleware
 * Adds user info to request if authenticated but doesn't block access
 */
export const optionalAuth = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    if (req.session && req.session.userId) {
        req.isAuthenticated = true;
        req.userId = req.session.userId;
        req.username = req.session.username;
    } else {
        req.isAuthenticated = false;
    }
    next();
};