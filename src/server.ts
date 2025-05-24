/**
 * Main server file
 * Sets up Express app, middleware, and starts the server
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MySQLStore from 'express-mysql-session';
import dotenv from 'dotenv';
import { initDatabase, dbConfig } from './config/database';
import authRoutes from './routes/auth';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '5000');

// Create MySQL session store
const MySQLSessionStore = MySQLStore(session);

// Middleware setup
app.use(express.json());
app.use(cookieParser());

// CORS configuration for frontend access
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

// Session store setup using MySQL
const sessionStore = new MySQLSessionStore(dbConfig);

// Session middleware configuration
app.use(session({
    key: 'auth_session',
    secret: process.env.SESSION_SECRET || 'your_secure_session_secret',
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