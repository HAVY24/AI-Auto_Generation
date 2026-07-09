import { Router } from 'express';
import documentController from '../controllers/document.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import upload from '../middlewares/upload.middleware';

const router = Router();

// All document routes are protected
router.use(authMiddleware);

router.post('/upload', upload.single('file'), documentController.upload);
router.get('/', documentController.list);
router.get('/:id', documentController.getById);
router.delete('/:id', documentController.remove);

export default router;
