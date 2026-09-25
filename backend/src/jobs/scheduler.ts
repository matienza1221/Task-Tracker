import { env } from '../config/env';
import { logger } from '../lib/logger';
import { runDueReminders } from '../modules/notifications/service';

const FIRST_RUN_DELAY_MS = 15_000;

/**
 * Background reminder sweep (due-soon and overdue tasks). Runs inside the API
 * process for a single-instance deployment; the dedupe key on notifications
 * makes it safe to run from more than one worker. Move it to a dedicated
 * worker container when the deployment scales out.
 */
export function startScheduler(): () => void {
  if (!env.SCHEDULER_ENABLED) {
    logger.info('Reminder scheduler disabled (SCHEDULER_ENABLED=false)');
    return () => undefined;
  }

  const run = async (): Promise<void> => {
    try {
      const result = await runDueReminders();
      if (result.dueSoon + result.overdue > 0) {
        logger.info(result, 'Reminder sweep dispatched notifications');
      }
    } catch (error) {
      logger.error({ err: error }, 'Reminder sweep failed');
    }
  };

  const firstRun = setTimeout(run, FIRST_RUN_DELAY_MS);
  const interval = setInterval(run, env.SCHEDULER_INTERVAL_MINUTES * 60_000);
  firstRun.unref();
  interval.unref();

  logger.info({ intervalMinutes: env.SCHEDULER_INTERVAL_MINUTES, dueSoonDays: env.DUE_SOON_DAYS }, 'Reminder scheduler started');

  return () => {
    clearTimeout(firstRun);
    clearInterval(interval);
  };
}
