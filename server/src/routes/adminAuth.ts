import type { FastifyInstance } from 'fastify';

import {
  clearedSessionCookie,
  closeSession,
  login,
  requireSession,
  sessionCookie,
} from '../auth.js';
import { loginRequestSchema } from '../schemas.js';

/** Вход и выход из кабинета (С6): кука session выдаётся при входе (Q2). */
export function adminAuthRoutes(app: FastifyInstance): void {
  app.post('/admin/login', async (request, reply) => {
    const body = loginRequestSchema.parse(request.body);
    const token = login(app.db, body.login, body.password);
    return reply.header('set-cookie', sessionCookie(token)).send({});
  });

  app.post('/admin/logout', async (request, reply) => {
    requireSession(app.db, request.headers.cookie);
    const token = readToken(request.headers.cookie);
    closeSession(app.db, token);
    return reply.header('set-cookie', clearedSessionCookie()).code(204).send();
  });
}

function readToken(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'session' && rest.length > 0) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}

