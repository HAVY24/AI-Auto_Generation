import { Request, Response } from 'express';
import prisma from '../prisma/client';
import axios from 'axios';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

export const startQuizSession = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { subjectId } = req.body;
        // 1. Tạo session mới trong DB
        const session = await prisma.quizSession.create({
            data: {
                userId,
                subjectId,
                thetaEstimate: 0, // Giá trị ban đầu (trung bình)
                sem: 999 // Độ bất định cao nhất
            }
        });

        // Fetch candidates
        const allQuestions = await prisma.question.findMany({
            where: { topic: { majorTopic: { subjectId } }, isArchived: false }
        });

        // Lấy danh sách câu hỏi đã làm trong quá khứ để tránh lặp lại ngay từ câu đầu tiên
        const pastResponses = await prisma.quizResponse.findMany({
            where: { session: { userId, subjectId } },
            select: { questionId: true }
        });
        const answeredIds = new Set(pastResponses.map(r => r.questionId));

        let availableQuestions = allQuestions.filter(q => !answeredIds.has(q.id));
        if (availableQuestions.length === 0) {
            // Hết câu hỏi mới -> Lấy lại câu cũ (random)
            availableQuestions = [...allQuestions].sort(() => Math.random() - 0.5);
        }

        const candidates = availableQuestions.map(q => ({
            id: q.id,
            topicId: q.topicId,
            a: q.discriminationA,
            b: q.difficultyB,
            c: q.guessingC,
            questionType: q.questionType
        }));

        // 2. Gọi sang AI Service để lấy câu hỏi đầu tiên (Rule R1: b thuộc [-1.5, -0.5])
        const response = await axios.post(`${AI_SERVICE_URL}/api/cat/next-question`, {
            sessionId: session.id,
            subjectId,
            currentTheta: session.thetaEstimate,
            answerHistory: [],
            candidates
        });

        const questionId = response.data.questionId;
        let question = null;
        if (questionId) {
            question = await prisma.question.findUnique({ where: { id: questionId } });
        }

        // 3. Get history for visualization
        const history = await prisma.quizSession.findMany({
            where: { userId, subjectId, completedAt: { not: null } },
            orderBy: { startedAt: 'asc' },
            select: { thetaEstimate: true }
        });

        res.status(200).json({
            session_id: session.id,
            theta: session.thetaEstimate || 0,
            sem: session.sem || 999,
            answered_count: 0,
            max_questions: 30,
            is_completed: false,
            applied_rules: ["Khởi tạo phiên thi CAT"],
            theta_history: history.map(h => h.thetaEstimate || 0),
            question
        });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

export const submitAnswer = async (req: Request, res: Response) => {
    try {
        const { sessionId, questionId, userAnswer, timeSpentSeconds } = req.body;

        // 1. Lấy thông tin câu hỏi để chấm điểm
        const question = await prisma.question.findUnique({ where: { id: questionId } });
        if (!question) throw new Error("Question not found");

        const isCorrect = question.correctAnswer.trim().toLowerCase() === String(userAnswer).trim().toLowerCase();

        const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
        if (!session) throw new Error("Session not found");
        const subjectId = session.subjectId;

        // 2. Lưu lịch sử trả lời
        await prisma.quizResponse.create({
            data: {
                sessionId,
                questionId,
                userAnswer,
                isCorrect,
                timeSpentSeconds,
                guessingFlag: isCorrect && (timeSpentSeconds || 0) < 10 && question.guessingC > 0.2 // Học hỏi Rule R7
            }
        });

        // 3. Lấy tất cả các câu đã trả lời trong session này để tính EAP
        const allResponses = await prisma.quizResponse.findMany({
            where: { sessionId },
            include: { question: true }
        });

        // Định dạng dữ liệu cho AI Service tính toán Bayesian EAP
        const answerHistory = allResponses.map(r => ({
            questionId: r.questionId,
            isCorrect: r.isCorrect,
            a: r.question.discriminationA,
            b: r.question.difficultyB,
            c: r.question.guessingC,
            topicId: r.question.topicId,
            timeSpent: r.timeSpentSeconds
        }));

        // Lấy tất cả câu hỏi của môn học này (chưa trả lời)
        const allQuestions = await prisma.question.findMany({
            where: { topic: { majorTopic: { subjectId } } }
        });

        const answeredQuestionIds = new Set(allResponses.map(r => r.questionId));
        const candidates = allQuestions
            .filter(q => !answeredQuestionIds.has(q.id))
            .map(q => ({
                id: q.id,
                topicId: q.topicId,
                a: q.discriminationA,
                b: q.difficultyB,
                c: q.guessingC,
                questionType: q.questionType
            }));

        // 4. Gọi sang AI Service tính toán theta mới và lấy câu tiếp theo bằng Max Fisher Information
        const response = await axios.post(`${AI_SERVICE_URL}/api/cat/next-question`, {
            sessionId,
            subjectId,
            answerHistory,
            candidates
        });

        const nextQuestionId = response.data.questionId;
        let nextQuestion = null;
        if (nextQuestionId) {
            nextQuestion = await prisma.question.findUnique({ where: { id: nextQuestionId } });
        }

        // 5. Cập nhật theta mới vào DB
        await prisma.quizSession.update({
            where: { id: sessionId },
            data: {
                thetaEstimate: response.data.newTheta,
                sem: response.data.newSem,
                totalQuestions: allResponses.length,
                correctAnswers: allResponses.filter(r => r.isCorrect).length
            }
        });

        // 6. Get theta history for this user and subject
        const history = await prisma.quizSession.findMany({
            where: { userId: (req as any).user.id, subjectId, completedAt: { not: null } },
            orderBy: { startedAt: 'asc' },
            select: { thetaEstimate: true }
        });
        const thetaHistory = history.map(h => h.thetaEstimate || 0);
        thetaHistory.push(response.data.newTheta);

        res.status(200).json({
            session_id: sessionId,
            theta: response.data.newTheta,
            sem: response.data.newSem,
            answered_count: allResponses.length,
            max_questions: 30, // Or whatever limit
            is_completed: response.data.isFinished,
            applied_rules: response.data.rules || [],
            theta_history: thetaHistory,
            question: nextQuestion,
            isCorrect,
            correctAnswer: question.correctAnswer,
            recommendations: [] // Implement if needed
        });

    } catch (error: any) {
        console.error("SUBMIT ANSWER ERROR:", error);
        require('fs').appendFileSync('error.log', new Date().toISOString() + ' - submitAnswer error: ' + (error.stack || error.message) + '\n');
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

export const startBatchExam = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { subjectId, numQuestions = 20, recognition_pct, comprehension_pct, application_pct } = req.body;

        // Find user's latest theta estimate for this subject
        const lastSession = await prisma.quizSession.findFirst({
            where: { userId, subjectId, completedAt: { not: null } },
            orderBy: { startedAt: 'desc' }
        });

        let initialTheta = 0.0;
        if (lastSession && lastSession.thetaEstimate !== null) {
            initialTheta = lastSession.thetaEstimate;
        }

        // Get all questions for the subject
        const allQuestions = await prisma.question.findMany({
            where: { topic: { majorTopic: { subjectId } }, isArchived: false },
            include: { topic: { include: { majorTopic: true } } }
        });

        // Lấy danh sách các câu hỏi đã từng làm trong quá khứ để không bị lặp lại
        const pastResponses = await prisma.quizResponse.findMany({
            where: { session: { userId, subjectId } },
            select: { questionId: true }
        });
        const answeredIds = new Set(pastResponses.map(r => r.questionId));

        // Ưu tiên chọn những câu chưa làm
        let availableQuestions = allQuestions.filter(q => !answeredIds.has(q.id));

        // Nếu số lượng câu chưa làm ít hơn số lượng yêu cầu, lấy thêm các câu đã làm (trộn lẫn)
        if (availableQuestions.length < numQuestions) {
            // Lấy thêm các câu đã làm để bù vào cho đủ
            const seenQuestions = allQuestions.filter(q => answeredIds.has(q.id));
            // Shuffle seenQuestions
            seenQuestions.sort(() => Math.random() - 0.5);
            const needed = numQuestions - availableQuestions.length;
            availableQuestions = [...availableQuestions, ...seenQuestions.slice(0, needed)];
        }

        const candidates = availableQuestions.map(q => ({
            id: q.id,
            topicId: q.topicId,
            a: q.discriminationA,
            b: q.difficultyB,
            c: q.guessingC,
            questionType: q.questionType
        }));

        // Call AI Service to select best N questions
        let aiResponse;
        try {
            aiResponse = await axios.post(`${AI_SERVICE_URL}/api/cat/generate-batch`, {
                subjectId,
                currentTheta: initialTheta,
                numQuestions,
                recognition_pct: recognition_pct || 0.3,
                comprehension_pct: comprehension_pct || 0.5,
                application_pct: application_pct || 0.2,
                candidates
            });
        } catch (aiError: any) {
            console.error('AI Service Error:', aiError.response?.data || aiError.message);
            throw new Error(`AI Service is currently unavailable or returned an error: ${aiError.message}`);
        }

        const questionIds = aiResponse.data.questionIds;

        // Filter out actual question objects in the exact order
        const selectedQuestions = questionIds.map((id: string) => allQuestions.find(q => q.id === id)).filter(Boolean);

        // Create a new session
        const session = await prisma.quizSession.create({
            data: {
                userId,
                subjectId,
                thetaEstimate: initialTheta,
                sem: 999,
                totalQuestions: selectedQuestions.length
            }
        });

        res.status(200).json({
            session,
            questions: selectedQuestions
        });

    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

export const submitBatchExam = async (req: Request, res: Response) => {
    try {
        const { sessionId, answers } = req.body;
        // answers: [{ questionId, userAnswer, timeSpentSeconds }]

        const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
        if (!session) throw new Error("Session not found");

        const answerHistory = [];
        let correctAnswers = 0;

        // Process all answers
        for (const ans of answers) {
            const question = await prisma.question.findUnique({ where: { id: ans.questionId } });
            if (!question) continue;

            const isCorrect = question.correctAnswer.trim().toLowerCase() === String(ans.userAnswer).trim().toLowerCase();
            if (isCorrect) correctAnswers++;

            await prisma.quizResponse.create({
                data: {
                    sessionId,
                    questionId: ans.questionId,
                    userAnswer: ans.userAnswer,
                    isCorrect,
                    timeSpentSeconds: ans.timeSpentSeconds,
                    guessingFlag: isCorrect && (ans.timeSpentSeconds || 0) < 10 && question.guessingC > 0.2
                }
            });

            answerHistory.push({
                questionId: question.id,
                isCorrect,
                a: question.discriminationA,
                b: question.difficultyB,
                c: question.guessingC,
                topicId: question.topicId,
                timeSpent: ans.timeSpentSeconds
            });
        }

        // Call AI Service to calculate new theta for the whole batch
        const aiResponse = await axios.post(`${AI_SERVICE_URL}/api/cat/score-batch`, {
            initialTheta: session.thetaEstimate || 0.0,
            answerHistory
        });

        const { newTheta, newSem } = aiResponse.data;

        // Update session
        const updatedSession = await prisma.quizSession.update({
            where: { id: sessionId },
            data: {
                completedAt: new Date(),
                thetaEstimate: newTheta,
                sem: newSem,
                correctAnswers,
                totalScore: (correctAnswers / (answerHistory.length || 1)) * 10
            }
        });

        // Also update UserTopicProgress for a general subject progress if needed
        // For now just returning the results

        res.status(200).json({
            session: updatedSession,
            correctAnswers,
            totalQuestions: answerHistory.length,
            newTheta,
            newSem
        });

    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};

export const getSessionResults = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const session = await prisma.quizSession.findUnique({
            where: { id },
            include: {
                responses: {
                    include: {
                        question: true
                    }
                },
                subject: true
            }
        });

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        res.status(200).json(session);
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
