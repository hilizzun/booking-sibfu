import type { FastifyInstance } from 'fastify';

import { adminAuthRoutes } from './adminAuth.js';
import { adminBookingRoutes } from './adminBookings.js';
import { adminMeetingTypeRoutes } from './adminMeetingTypes.js';
import { bookingRoutes } from './bookings.js';
import { meetingTypeRoutes } from './meetingTypes.js';
import { slotRoutes } from './slots.js';

/**
 * Единая точка регистрации маршрутов. И приложение (app.ts), и тест
 * соответствия контракту (tests/contract.test.ts) ходят сюда, поэтому
 * список маршрутов не может разойтись в двух местах.
 */
export function registerRoutes(app: FastifyInstance): void {
  meetingTypeRoutes(app);
  slotRoutes(app);
  bookingRoutes(app);
  adminAuthRoutes(app);
  adminMeetingTypeRoutes(app);
  adminBookingRoutes(app);
}
