/**
 * Main server file
 * Sets up Express app, middleware, and starts the server
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import { initDatabase, dbConfig } from './config/database';
import authRoutes from './routes/auth';
import recommendationRoutes from './routes/recommendation';
import beachRoutes from './routes/beach';
import eventRoutes from './routes/event';
import path from 'path';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '5000');

// Create MySQL session store
const MySQLStore = require('express-mysql-session')(session);

// Middleware setup
app.use(express.json());
app.use(cookieParser());

// CORS configuration for frontend access
app.use(cors({
    origin: process.env.FRONTEND_URL || '',
    credentials: true
}));

// Session store setup using MySQL
const sessionStore = new MySQLStore(dbConfig);

// Session middleware configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'u7!@#9d$2kLz%8vN^pQw3&xZs*1BfGmT0rJcH',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/recommendations', recommendationRoutes)
app.use('/api/beaches', beachRoutes)
app.use('/api/events', eventRoutes)

// Serve static files from the 'public' directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({ message: 'Server is running' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

/**
 * Start the server and initialize the database
 */
async function startServer(): Promise<void> {
    try {
        console.log('Initializing database...');
        await initDatabase();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;