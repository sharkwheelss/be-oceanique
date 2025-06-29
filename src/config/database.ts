/**
 * Database configuration and initialization
 * Handles MySQL connection pool and table creation
 */

import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { DatabaseConfig } from '../types';

// Database configuration
export const dbConfig: DatabaseConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_oceanique',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
};

// Create the MySQL connection pool
export const pool: Pool = mysql.createPool(dbConfig);

export async function initDatabase(): Promise<void> {
    try {
        const connection: PoolConnection = await pool.getConnection();
        console.log('Database initialized successfully');
        connection.release();
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
}