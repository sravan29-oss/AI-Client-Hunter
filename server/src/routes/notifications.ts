import { Router, Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notificationService';
import { listNotificationDeliveries } from '../services/notificationDelivery';
import { NotFoundError } from '../utils/errors';

const router = Router();

router.get('/deliveries', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await listNotificationDeliveries() });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications
 * Get paginated in-app notifications.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string, 10) || 50, 100));
    const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
    const unreadOnly = req.query.unreadOnly === 'true';

    const result = await notificationService.getNotifications(limit, offset, unreadOnly);
    res.json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notifications count.
 */
router.get('/unread-count', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await notificationService.getUnreadCount();
    res.json({
      success: true,
      data: { unreadCount: count },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read.
 */
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await notificationService.markAsRead(id);
    if (!updated) {
      throw new NotFoundError(`Notification with ID ${id} not found.`);
    }

    res.json({
      success: true,
      message: 'Notification marked as read.',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read.
 */
router.post('/mark-all-read', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await notificationService.markAllAsRead();
    res.json({
      success: true,
      message: 'All notifications marked as read.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification.
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deleted = await notificationService.deleteNotification(id);
    if (!deleted) {
      throw new NotFoundError(`Notification with ID ${id} not found.`);
    }

    res.json({
      success: true,
      message: 'Notification deleted.',
      data: deleted,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
