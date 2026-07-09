import { Router } from 'express';
import examController from '../controllers/exam.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/generate', examController.generate);
router.get('/', examController.list);
router.get('/:id', examController.getById);
router.patch('/:id', examController.update);
router.delete('/:id', examController.remove);

export default router;
