import { Request, Response } from 'express';
import aiService from '../services/ai.service';
import prisma from '../prisma/client';

class ExamController {
    /**
     * POST /api/exams/generate
     * Body: { documentId, title?, query?, num_questions?, difficulty? }
     */
    async generate(req: Request, res: Response) {
        const { documentId, title, subjectName, query, num_questions, difficulty } = req.body;
        const userId = (req as any).user?.id;

        if (!documentId) {
            return res.status(400).json({ message: 'documentId là bắt buộc' });
        }

        try {
            // 1. Verify document exists and belongs to user
            const document = await prisma.document.findUnique({ where: { id: documentId } });
            if (!document || document.userId !== userId) {
                return res.status(404).json({ message: 'Tài liệu không tồn tại' });
            }

            // 2. Call AI Service to generate exam via RAG
            const examContent = await aiService.generateExam(query || 'Tổng hợp kiến thức', {
                num_questions: num_questions ?? 10,
                difficulty,
                is_specific_topic: !!query,
                filename: document.filename,
            });

            if (!Array.isArray(examContent)) {
                console.error("AI Service returned invalid exam content:", examContent);
                return res.status(500).json({ message: (examContent as any)?.error || "AI Service failed to generate a valid exam format." });
            }

            // Sanitize answers to exactly match options
            if (Array.isArray(examContent)) {
                for (const item of examContent) {
                    if (item.options && Array.isArray(item.options) && item.options.length >= 4) {
                        item.options = item.options.slice(0, 4);
                        const [optA, optB, optC, optD] = item.options;
                        if (typeof item.answer === 'string') {
                            const ans = item.answer.trim().toUpperCase();
                            if (ans === 'A' || ans.startsWith('A.') || ans.startsWith('A)')) item.answer = optA;
                            else if (ans === 'B' || ans.startsWith('B.') || ans.startsWith('B)')) item.answer = optB;
                            else if (ans === 'C' || ans.startsWith('C.') || ans.startsWith('C)')) item.answer = optC;
                            else if (ans === 'D' || ans.startsWith('D.') || ans.startsWith('D)')) item.answer = optD;
                            else if (optA.includes(item.answer)) item.answer = optA;
                            else if (optB.includes(item.answer)) item.answer = optB;
                            else if (optC.includes(item.answer)) item.answer = optC;
                            else if (optD.includes(item.answer)) item.answer = optD;
                        }
                    }
                }
            }

            // 3. Save generated exam to database
            const exam = await prisma.exam.create({
                data: {
                    title: title || `Đề thi: ${document.filename}`,
                    content: examContent,
                    userId,
                    documentId: document.id,
                },
                include: { document: { select: { filename: true } } },
            });

            // 4. Integrate into Knowledge Base System (CAT)
            if (Array.isArray(examContent)) {
                // 4.1. Find or create Subject based on filename or user input
                const finalSubjectName = subjectName?.trim() || document.filename.replace(/\.[^/.]+$/, '').trim();
                let subject = await prisma.subject.findUnique({ where: { name: finalSubjectName } });
                if (!subject) {
                    subject = await prisma.subject.create({
                        data: { name: finalSubjectName, description: 'Môn học tạo tự động từ tài liệu sinh đề' }
                    });
                }

                // 4.2. Find or create MajorTopic
                let majorTopic = await prisma.majorTopic.findFirst({ where: { subjectId: subject.id, name: 'Chung' } });
                if (!majorTopic) {
                    majorTopic = await prisma.majorTopic.create({
                        data: { subjectId: subject.id, name: 'Chung' }
                    });
                }

                // Helper to generate Gaussian random distribution for IRT parameters
                const getGaussianRandom = (mean: number, std: number) => {
                    let u = 1 - Math.random();
                    let v = Math.random();
                    let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
                    return z * std + mean;
                };

                const baseDiff = difficulty === 'hard' ? 1.5 : (difficulty === 'easy' ? -1.5 : 0.0);
                
                for (const item of examContent) {
                    if (!item.question || !item.options || !Array.isArray(item.options) || item.options.length < 4) continue;
                    
                    // Find or create Topic
                    const topicName = item.topic ? item.topic.trim() : 'Tổng hợp';
                    let topic = await prisma.topic.findFirst({ 
                        where: { majorTopicId: majorTopic.id, name: topicName } 
                    });
                    if (!topic) {
                        topic = await prisma.topic.create({
                            data: { majorTopicId: majorTopic.id, name: topicName }
                        });
                    }

                    // Extract options
                    const optionA = item.options[0] || 'A';
                    const optionB = item.options[1] || 'B';
                    const optionC = item.options[2] || 'C';
                    const optionD = item.options[3] || 'D';

                    // Parse correct answer
                    let correctAnswer = optionA; // fallback
                    if (typeof item.answer === 'string') {
                        if (item.answer.startsWith('A')) correctAnswer = optionA;
                        else if (item.answer.startsWith('B')) correctAnswer = optionB;
                        else if (item.answer.startsWith('C')) correctAnswer = optionC;
                        else if (item.answer.startsWith('D')) correctAnswer = optionD;
                        else correctAnswer = item.answer; 
                    }

                    // Add explanation to stem if available
                    const stemWithExplanation = item.explanation ? `${item.question}\n\n[Giải thích: ${item.explanation}]` : item.question;

                    // Generate varied IRT parameters based on AI's difficulty assessment
                    let qDiff = 0.0;
                    if (typeof item.difficultyLevel === 'number' && item.difficultyLevel >= 1 && item.difficultyLevel <= 5) {
                        // Map AI level 1-5 to IRT scale -2.0 to 2.0
                        const diffMap: Record<number, number> = { 1: -2.0, 2: -1.0, 3: 0.0, 4: 1.0, 5: 2.0 };
                        const exactDiff = diffMap[item.difficultyLevel];
                        // Add a small jitter so questions of the same level aren't mathematically identical
                        qDiff = getGaussianRandom(exactDiff, 0.2); 
                    } else {
                        // Fallback to purely random if AI failed to provide level
                        qDiff = getGaussianRandom(baseDiff, 1.2); 
                    }
                    qDiff = Math.max(-3.0, Math.min(3.0, qDiff)); // Clamp [-3, 3]

                    let qDisc = getGaussianRandom(1.2, 0.4); 
                    qDisc = Math.max(0.4, Math.min(2.5, qDisc)); // Discrimination should be positive and meaningful

                    await prisma.question.create({
                        data: {
                            externalId: `Q-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
                            topicId: topic.id,
                            stem: stemWithExplanation,
                            optionA,
                            optionB,
                            optionC,
                            optionD,
                            correctAnswer,
                            difficultyB: parseFloat(qDiff.toFixed(2)),
                            discriminationA: parseFloat(qDisc.toFixed(2)),
                            guessingC: 0.25,
                            questionType: 'MCQ',
                            timeLimitSeconds: 60
                        }
                    });
                }
            }

            return res.status(201).json({ message: 'Sinh đề thi thành công', exam });
        } catch (error: any) {
            console.error('Exam Generation Error:', error.message);
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * GET /api/exams
     */
    async list(req: Request, res: Response) {
        const userId = (req as any).user?.id;
        try {
            const exams = await prisma.exam.findMany({
                where: { userId },
                include: { document: { select: { filename: true } } },
                orderBy: { createdAt: 'desc' },
            });
            return res.json(exams);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * GET /api/exams/:id
     */
    async getById(req: Request, res: Response) {
        const { id } = req.params;
        const userId = (req as any).user?.id;
        try {
            const exam = await prisma.exam.findUnique({
                where: { id },
                include: { document: true },
            });
            if (!exam || exam.userId !== userId) {
                return res.status(404).json({ message: 'Đề thi không tồn tại' });
            }
            return res.json(exam);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * PATCH /api/exams/:id
     * Body: { title?, content? }  — for manual editing questions
     */
    async update(req: Request, res: Response) {
        const { id } = req.params;
        const { title, content } = req.body;
        const userId = (req as any).user?.id;
        try {
            const exam = await prisma.exam.findUnique({ where: { id } });
            if (!exam || exam.userId !== userId) {
                return res.status(404).json({ message: 'Đề thi không tồn tại' });
            }

            // Strip undefined values which Prisma JSON fields reject
            const safeContent = content ? JSON.parse(JSON.stringify(content)) : undefined;

            const updated = await prisma.exam.update({
                where: { id },
                data: { 
                    ...(title && { title }), 
                    ...(safeContent && { content: safeContent }) 
                },
            });
            return res.json({ message: 'Cập nhật thành công', exam: updated });
        } catch (error: any) {
            console.error('Update Exam Error:', error);
            require('fs').appendFileSync('update_error.log', new Date().toISOString() + ' - ' + error.message + '\n' + error.stack + '\n\n');
            return res.status(500).json({ message: error.message });
        }
    }

    /**
     * DELETE /api/exams/:id
     */
    async remove(req: Request, res: Response) {
        const { id } = req.params;
        const userId = (req as any).user?.id;
        try {
            const exam = await prisma.exam.findUnique({ where: { id } });
            if (!exam || exam.userId !== userId) {
                return res.status(404).json({ message: 'Đề thi không tồn tại' });
            }
            await prisma.exam.delete({ where: { id } });
            return res.json({ message: 'Đã xóa đề thi' });
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }
}

export default new ExamController();
