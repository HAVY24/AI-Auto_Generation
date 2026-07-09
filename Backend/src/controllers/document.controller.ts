import { Request, Response } from 'express';
import path from 'path';
import prisma from '../prisma/client';
import aiService from '../services/ai.service';

class DocumentController {
    /**
     * POST /api/documents/upload
     * Multer saves the file first, then we index it in ChromaDB and save to DB.
     */
    async upload(req: Request, res: Response) {
        const userId = (req as any).user?.id;

        if (!req.file) {
            return res.status(400).json({ message: 'Không có file được upload' });
        }

        const { filename, originalname, path: filePath, mimetype, size } = req.file;

        try {
            // 1. Save document record to DB
            const document = await prisma.document.create({
                data: {
                    filename: originalname,
                    path: filePath,
                    mimetype,
                    size,
                    userId,
                },
            });

            // 2. Index PDF into ChromaDB (fire & forget with status)
            let chunks = 0;
            try {
                const result = await aiService.ingestDocument(filePath, originalname);
                chunks = result.chunks;
            } catch (aiErr: any) {
                console.warn('AI ingest failed (document saved to DB):', aiErr.message);
            }

            return res.status(201).json({
                message: 'Upload thành công',
                document,
                indexed_chunks: chunks,
            });
        } catch (error: any) {
            console.error('Upload error:', error.message);
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * GET /api/documents
     */
    async list(req: Request, res: Response) {
        const userId = (req as any).user?.id;
        try {
            const documents = await prisma.document.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                include: { _count: { select: { exams: true } } },
            });
            return res.json(documents);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * GET /api/documents/:id
     */
    async getById(req: Request, res: Response) {
        const { id } = req.params;
        const userId = (req as any).user?.id;
        try {
            const document = await prisma.document.findUnique({
                where: { id },
                include: { exams: { orderBy: { createdAt: 'desc' } } },
            });
            if (!document || document.userId !== userId) {
                return res.status(404).json({ message: 'Tài liệu không tồn tại' });
            }
            return res.json(document);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * DELETE /api/documents/:id
     */
    async remove(req: Request, res: Response) {
        const { id } = req.params;
        const userId = (req as any).user?.id;
        try {
            const document = await prisma.document.findUnique({ where: { id } });
            if (!document || document.userId !== userId) {
                return res.status(404).json({ message: 'Tài liệu không tồn tại' });
            }

            // Delete related exams first (cascade)
            await prisma.exam.deleteMany({ where: { documentId: id } });
            await prisma.document.delete({ where: { id } });

            return res.json({ message: 'Đã xóa tài liệu' });
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }
}

export default new DocumentController();
