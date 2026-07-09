import { Request, Response } from 'express';
import prisma from '../prisma/client';

export const getSubjects = async (req: Request, res: Response) => {
    try {
        const subjects = await prisma.subject.findMany({
            include: {
                _count: {
                    select: { majorTopics: true }
                }
            }
        });
        
        // Count questions manually or through relations
        const formattedSubjects = await Promise.all(subjects.map(async (subject) => {
            const questionCount = await prisma.question.count({
                where: { topic: { majorTopic: { subjectId: subject.id } } }
            });
            
            return {
                id: subject.id,
                name: subject.name,
                description: subject.description,
                total_questions: questionCount,
                total_topics: subject._count.majorTopics
            };
        }));

        res.status(200).json(formattedSubjects);
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
