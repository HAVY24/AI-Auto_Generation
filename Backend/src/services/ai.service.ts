import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

class AIService {
    private apiUrl: string;

    constructor() {
        this.apiUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    }

    /**
     * Upload a PDF file to the AI service for indexing into ChromaDB.
     */
    async ingestDocument(filePath: string, filename: string): Promise<{ chunks: number }> {
        try {
            const form = new FormData();
            form.append('file', fs.createReadStream(filePath), filename);

            const response = await axios.post(`${this.apiUrl}/ingest`, form, {
                headers: form.getHeaders(),
                timeout: 120000,
            });
            return response.data;
        } catch (error: any) {
            console.error('Error calling AI ingest:', error.message);
            throw new Error('Failed to ingest document into AI Service');
        }
    }

    /**
     * Generate exam questions from indexed documents via RAG.
     */
    async generateExam(query: string, options: { num_questions?: number; difficulty?: string; is_specific_topic?: boolean; filename?: string } = {}) {
        try {
            const response = await axios.post(
                `${this.apiUrl}/api/exams/generate`,
                {
                    query,
                    num_questions: options.num_questions ?? 10,
                    difficulty: options.difficulty ?? "mixed",
                    is_specific_topic: options.is_specific_topic ?? false,
                    filename: options.filename,
                },
                { timeout: 900000 }
            );
            return response.data?.exam ?? response.data;
        } catch (error: any) {
            console.error('Error calling AI generate:', error.message);
            throw new Error('Failed to generate exam from AI Service');
        }
    }

    /**
     * Health-check the AI service
     */
    async ping(): Promise<boolean> {
        try {
            await axios.get(`${this.apiUrl}/`, { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }
}

export default new AIService();
