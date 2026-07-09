import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const SALT_ROUNDS = 10;

class AuthController {
    /**
     * POST /api/auth/register
     */
    async register(req: Request, res: Response) {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email và mật khẩu là bắt buộc' });
        }

        try {
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return res.status(409).json({ message: 'Email đã được sử dụng' });
            }

            const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

            const user = await prisma.user.create({
                data: { email, password: hashedPassword, name },
                select: { id: true, email: true, name: true, createdAt: true },
            });

            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
                expiresIn: '7d',
            });

            return res.status(201).json({ message: 'Đăng ký thành công', user, token });
        } catch (error: any) {
            console.error('Register error:', error.message);
            return res.status(500).json({ message: 'Lỗi server' });
        }
    }

    /**
     * POST /api/auth/login
     */
    async login(req: Request, res: Response) {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email và mật khẩu là bắt buộc' });
        }

        try {
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
            }

            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
            }

            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
                expiresIn: '7d',
            });

            return res.json({
                message: 'Đăng nhập thành công',
                user: { id: user.id, email: user.email, name: user.name },
                token,
            });
        } catch (error: any) {
            console.error('Login error:', error.message);
            return res.status(500).json({ message: 'Lỗi server' });
        }
    }

    /**
     * GET /api/auth/me  (requires auth middleware)
     */
    async me(req: Request, res: Response) {
        const userId = (req as any).user?.id;
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, name: true, createdAt: true },
            });
            if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
            return res.json(user);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }
}

export default new AuthController();
