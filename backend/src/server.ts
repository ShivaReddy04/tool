import app from './app';
import { initializeDatabase } from './config/initDb';

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`DART API server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
