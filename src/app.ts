import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import examRoutes from './routes/exam.routes';
import catRoutes from './routes/cat.routes';
import knowledgeRoutes from './routes/knowledge.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ────────────────────────────────────────────────────────────
// Custom CORS middleware to guarantee it works in development
app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files as static assets
app.use('/uploads', express.static('uploads'));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/cat', catRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Global Error:', err.stack);
    require('fs').appendFileSync('global_error.log', new Date().toISOString() + ' - ' + (err.message || 'Error') + '\n' + err.stack + '\n\n');
    res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend running at http://localhost:${PORT}`);
});

export default app;
