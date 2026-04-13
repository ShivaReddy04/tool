import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import clusterRoutes from './routes/cluster.routes';
import schemaRoutes from './routes/schema.routes';
import businessAreaRoutes from './routes/business_area.routes';
import tableDefinitionRoutes from './routes/table_definition.routes';
import submissionRoutes from './routes/submission.routes';

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/schemas', schemaRoutes);
app.use('/api/business-areas', businessAreaRoutes);
app.use('/api/table-definitions', tableDefinitionRoutes);
app.use('/api/submissions', submissionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'DART API' });
});

export default app;
