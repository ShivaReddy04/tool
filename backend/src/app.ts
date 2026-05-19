import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import clusterRoutes from './routes/cluster.routes';
import schemaRoutes from './routes/schema.routes';
import tableDefinitionRoutes from './routes/table_definition.routes';
import submissionRoutes from './routes/submission.routes';
import architectRoutes from './routes/architect.routes';
import changeRequestRoutes from './routes/change_request.routes';
import abbreviationRoutes from './routes/abbreviation.routes';

dotenv.config();

const app = express();

// Render terminates TLS at a proxy and forwards via X-Forwarded-For. Without
// trust proxy, express-rate-limit sees one upstream IP and rate-limits the
// whole platform together. Limit to a single hop so we still reject spoofed
// XFF headers from clients.
app.set('trust proxy', 1);

// Middleware
app.use(helmet());

// CORS allow-list. Source from CORS_ORIGINS env (comma-separated) so deploys
// can swap frontend URLs without a backend code change — Render PR previews
// and rename'd services would otherwise silently produce 401s on every call
// because the refresh-token response would be blocked from JS, `accessToken`
// would never land in localStorage, and the interceptor would send Bearer-less
// requests that the API rejects.
const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'https://tool-1-9t7t.onrender.com',
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

app.use(cors({
  origin: (origin, callback) => {
    // Non-browser callers (curl, health checks) send no Origin header — allow.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    // Return false instead of throwing so the response just lacks the
    // Allow-Origin header (the standard CORS reject); the cors middleware
    // would otherwise surface it as an Express error.
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Auth endpoints are the highest-value brute-force target — gate them with a
// per-IP rate limit. Keep it generous enough for normal logins/signups and
// the silent refresh-token call on app load, but tight enough to make a
// credential-stuffing run noisy. Limit is per IP per window.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later' },
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/schemas', schemaRoutes);
app.use('/api/table-definitions', tableDefinitionRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/architect', architectRoutes);
app.use('/api/change-requests', changeRequestRoutes);
app.use('/api/abbreviations', abbreviationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'DART API' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('DART API is running 🚀');
});

// Error handler (last middleware)
import { errorHandler } from './middleware/errorHandler';
app.use(errorHandler);

export default app;
