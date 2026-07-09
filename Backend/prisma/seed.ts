/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

function cleanDifficulty(val: any): number {
    const num = parseFloat(val);
    return isNaN(num) ? 0.0 : num;
}

function cleanAnswer(val: any): string {
    if (!val || typeof val !== 'string') return 'A';
    const cleaned = val.trim().toUpperCase();
    if (cleaned && 'ABCD'.includes(cleaned[0])) return cleaned[0];
    return 'A';
}

function cleanQuestionType(val: any): string {
    const validTypes = ['Nhận biết', 'Thông hiểu', 'Vận dụng'];
    if (typeof val === 'string' && validTypes.includes(val.trim())) return val.trim();
    return 'Nhận biết';
}

function parseTimeSeconds(val: any): number {
    const num = parseInt(val, 10);
    return isNaN(num) ? 60 : num;
}

function extractCode(name: string): string {
    const match = name.trim().match(/^(\d+\.?\d*)/);
    return match ? match[1] : '';
}

async function main() {
    const excelPath = path.resolve(__dirname, '../../kbs/MaTranKienThuc.xlsx');
    console.log(`Đang đọc file Excel từ: ${excelPath}`);

    const workbook = xlsx.readFile(excelPath);

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = xlsx.utils.sheet_to_json(sheet);

        if (rows.length === 0) continue;

        const subjectName = rows[0]['Môn học'] || sheetName;

        // Create or find Subject
        let subject = await prisma.subject.findUnique({ where: { name: subjectName } });
        if (!subject) {
            subject = await prisma.subject.create({
                data: {
                    name: subjectName,
                    description: `Imported from ${sheetName}`
                }
            });
            console.log(`Created subject: ${subjectName}`);
        }

        const majorTopicCache: Record<string, any> = {};
        const topicCache: Record<string, any> = {};

        for (const row of rows) {
            const mtName = (row['Chủ đề lớn'] || '').toString().trim();
            const tName = (row['Kiến thức liên quan'] || '').toString().trim();

            if (!mtName || mtName === 'nan') continue;

            // MajorTopic
            if (!majorTopicCache[mtName]) {
                let mt = await prisma.majorTopic.findFirst({
                    where: { subjectId: subject.id, name: mtName }
                });
                if (!mt) {
                    mt = await prisma.majorTopic.create({
                        data: {
                            subjectId: subject.id,
                            code: extractCode(mtName),
                            name: mtName,
                            orderIndex: Object.keys(majorTopicCache).length
                        }
                    });
                    console.log(`  Created major topic: ${mtName}`);
                }
                majorTopicCache[mtName] = mt;
            }
            const mt = majorTopicCache[mtName];

            // Topic
            const topicKey = `${mtName}::${tName}`;
            if (!topicCache[topicKey]) {
                let topic = await prisma.topic.findFirst({
                    where: { majorTopicId: mt.id, name: tName }
                });
                if (!topic) {
                    topic = await prisma.topic.create({
                        data: {
                            majorTopicId: mt.id,
                            code: extractCode(tName),
                            name: tName,
                            orderIndex: Object.keys(topicCache).length
                        }
                    });
                    console.log(`    Created topic: ${tName}`);
                }
                topicCache[topicKey] = topic;
            }
            const topic = topicCache[topicKey];

            // Question
            const extId = (row['ID'] || '').toString().trim();
            if (!extId || extId === 'nan') continue;

            const existingQuestion = await prisma.question.findUnique({
                where: { externalId: extId }
            });

            if (!existingQuestion) {
                await prisma.question.create({
                    data: {
                        externalId: extId,
                        topicId: topic.id,
                        stem: (row['Nội dung câu hỏi (Stem)'] || '').toString(),
                        optionA: (row['Đáp án A'] || '').toString(),
                        optionB: (row['Đáp án B'] || '').toString(),
                        optionC: (row['Đáp án C'] || '').toString(),
                        optionD: (row['Đáp án D'] || '').toString(),
                        correctAnswer: cleanAnswer(row['Đáp án đúng']),
                        difficultyB: cleanDifficulty(row['Độ khó (b)']),
                        discriminationA: cleanDifficulty(row['Độ phân biệt (a)']),
                        guessingC: cleanDifficulty(row['Đoán mò (c)']),
                        questionType: cleanQuestionType(row['Dạng câu hỏi']),
                        timeLimitSeconds: parseTimeSeconds(row['Thời gian dự kiến (giây)']),
                        timeDisplay: (row['Thời gian hiển thị (MM:SS)'] || '01:00').toString()
                    }
                });
            }
        }
        console.log(`Hoàn thành nạp dữ liệu cho sheet: ${sheetName}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
