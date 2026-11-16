import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, UserProfile } from './db.js';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

// In-memory token session store with expiration
interface SessionData {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

const sessions = new Map<string, SessionData>();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password.trim()).digest('hex');
}

export function createSession(userId: string): string {
  const token = `flq_${crypto.randomBytes(32).toString('hex')}`;
  const now = Date.now();
  sessions.set(token, {
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  return token;
}

export function verifySession(token: string): UserProfile | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  const user = db.getProfileById(session.userId);
  return user || null;
}

export function destroySession(token: string) {
  sessions.delete(token);
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  const user = verifySession(token);
  if (!user) {
    // If running in development and no token sent, we can fall back to the demo owner if explicitly requested or return 401
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid authentication session required. Please log in with your phone and password.',
    });
    return;
  }

  req.user = user;
  next();
}
