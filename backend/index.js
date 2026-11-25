
import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import routes from './src/routes.js';
import { initSocket } from './src/socket.js';
import { connectDb } from './src/config/db.js';
import { errorHandler } from './src/middleware.js';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://plannix-web.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get('/health', (_q, s) => s.json({ ok: true }));

app.use('/api', routes);
app.use(errorHandler);

const server = http.createServer(app);

initSocket(server);

await connectDb();

server.listen(process.env.PORT || 5050, () => {
  console.log(`Plannix API running on port ${process.env.PORT || 5050}`);
});
