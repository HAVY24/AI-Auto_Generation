import { Router } from 'express';
import { startQuizSession, submitAnswer, startBatchExam, submitBatchExam, getSessionResults } from '../controllers/cat.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// All CAT routes require authentication
router.use(authMiddleware);

// /api/cat/start
router.post('/start', startQuizSession);

// /api/cat/answer
router.post('/answer', submitAnswer);

// /api/cat/start-batch
router.post('/start-batch', startBatchExam);

// /api/cat/submit-batch
router.post('/submit-batch', submitBatchExam);

// /api/cat/session/:id
router.get('/session/:id', getSessionResults);

export default router;
