/**
 * Authentication middleware
 * Contains middleware functions for protecting routes
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import multer from 'multer';
import * as path from 'path';


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

export const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/contents/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, uniqueSuffix + extension);
    }
});

export const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed!') as unknown as null, false);

        }
    }
});
