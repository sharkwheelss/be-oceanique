/**
 * Validation utilities
 * Contains validation rules for different endpoints
 */

import { body, ValidationChain } from 'express-validator';

/**
 * Validation rules for user registration
 */
export const validateSignup: ValidationChain[] = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .isAlphanumeric()
        .withMessage('Username must contain only letters and numbers'),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    body('password'),
    //     .isLength({ min: 8 })
    //     .withMessage('Password must be at least 8 characters long')
    //     .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])/)
    //     .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    body('confirmPassword')
        .custom((value: string, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
];

/**
 * Validation rules for user login
 */
export const validateSignin: ValidationChain[] = [
    body('login')
        .trim()
        .notEmpty()
        .withMessage('Email or username is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];