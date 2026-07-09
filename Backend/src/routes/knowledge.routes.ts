import { Router } from 'express';
import { getSubjects } from '../controllers/knowledge.controller';

const router = Router();

router.get('/subjects', getSubjects);

export default router;
