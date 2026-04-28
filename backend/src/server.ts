import app from './app';
import { initializeDatabase } from './config/initDb';

const PORT = process.env.PORT || 5000;

const start = async () => {
  // Start the server immediately without waiting for database
  const server = app.listen(PORT, () => {
    console.log(`DART API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });

  // Try to initialize database in background (non-blocking)
  initializeDatabase()
    .then(() => {
      console.log('✓ Database connection verified and ready');
    })
    .catch((err) => {
      console.error('✗ Database connection failed. Server is running but database features will not work:', err);
      console.error('Please configure DATABASE_URL or database environment variables and restart.');
    });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
};

start();
