/**
 * Workflow timing, working days, and delay calculation pure functions.
 * Offsets and logic emulate Excel WORKDAY.INTL(date, n, "0000001") with Sunday off.
 */

export const DEFAULT_OFFSETS = {
  visit: null,      // Form based, no fixed offset
  running: 7,       // Start date + 7 working days
  call: -3,         // Expected shutdown date - 3 working days
  shutdown: 0,      // Shutdown date itself (N + 0)
  restart: 2        // Shutdown date + 2 working days
};

/**
 * Returns today's ISO date string (YYYY-MM-DD).
 */
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formats ISO date string to Indian locale (e.g., "12 Nov 2026").
 */
export function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const [y, m, d] = isoStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
  } catch {
    return isoStr;
  }
}

/**
 * Calculates calendar day difference (to - from).
 * Positive means 'to' is after 'from'.
 */
export function calendarDaysDiff(from, to) {
  if (!from || !to) return 0;
  const d1 = Date.parse(`${from}T00:00:00Z`);
  const d2 = Date.parse(`${to}T00:00:00Z`);
  return Math.round((d2 - d1) / 86400000);
}

/**
 * Checks if a given ISO date falls on a Sunday.
 */
export function isSunday(isoDate) {
  if (!isoDate) return false;
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCDay() === 0;
}

/**
 * Adds or subtracts working days, skipping Sundays.
 * Matches Excel WORKDAY.INTL(date, n, "0000001").
 * - If n === 0, returns the date itself.
 * - If n > 0, steps forward skipping Sundays.
 * - If n < 0, steps backward skipping Sundays.
 */
export function addWorkingDays(isoDate, n) {
  if (!isoDate) return '';
  const numDays = Number(n);
  if (isNaN(numDays) || numDays === 0) return isoDate;

  const [y, m, d] = isoDate.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));

  if (numDays > 0) {
    let added = 0;
    while (added < numDays) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      if (cur.getUTCDay() !== 0) { // Not Sunday
        added++;
      }
    }
  } else {
    const needed = Math.abs(numDays);
    let subtracted = 0;
    while (subtracted < needed) {
      cur.setUTCDate(cur.getUTCDate() - 1);
      if (cur.getUTCDay() !== 0) { // Not Sunday
        subtracted++;
      }
    }
  }

  const outY = cur.getUTCFullYear();
  const outM = String(cur.getUTCMonth() + 1).padStart(2, '0');
  const outD = String(cur.getUTCDate()).padStart(2, '0');
  return `${outY}-${outM}-${outD}`;
}

/**
 * Legacy alias for calendar day additions (when strict calendar days are needed).
 */
export function addCalendarDays(isoDate, days) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d + Number(days)));
  return cur.toISOString().slice(0, 10);
}

/**
 * Delay calculation rules:
 * - If task is done or has actualDate: delay = actual - planned, only if actual > planned.
 * - If task is pending: delay = today - planned, only if planned has passed (today > planned).
 * - Early or on-time tasks have delay = 0.
 */
export function getTaskDelay(task, today = todayISO()) {
  if (!task || !task.plannedDate) return 0;

  if (task.status === 'done' || task.actualDate) {
    if (!task.actualDate) return Number(task.delayDays || 0);
    const diff = calendarDaysDiff(task.plannedDate, task.actualDate);
    return diff > 0 ? diff : 0;
  }

  const diff = calendarDaysDiff(task.plannedDate, today);
  return diff > 0 ? diff : 0;
}

/**
 * Calculates live average of numeric readings.
 * Ignores empty strings, null, undefined, or non-numeric entries.
 * Rounds to 1 decimal place.
 */
export function avg(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const nums = values
    .map(v => (typeof v === 'string' ? v.trim() : v))
    .filter(v => v !== '' && v !== null && v !== undefined && !isNaN(Number(v)))
    .map(Number);

  if (nums.length === 0) return 0;
  const sum = nums.reduce((acc, curr) => acc + curr, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

/**
 * Determines whether a step can be submitted.
 * Prevents submitting a step that is already completed for an order.
 */
export function canSubmitStep(orderNo, stepKey, existingTasks) {
  if (!orderNo || !stepKey || !Array.isArray(existingTasks)) return false;
  const existing = existingTasks.find(
    t => t.serviceOrderNo === orderNo && t.step === stepKey && t.status === 'done'
  );
  return !existing;
}

/**
 * Calculates next planned date based on the completed step and configured offsets.
 */
export function getNextStepPlan(stepKey, sourceDate, offsets = DEFAULT_OFFSETS) {
  if (!sourceDate) return null;
  switch (stepKey) {
    case 'visit':
      // Next is running: start date + running offset (default +7 working days)
      return {
        nextStep: 'running',
        owner: 'Sanjay',
        plannedDate: addWorkingDays(sourceDate, offsets.running ?? 7)
      };
    case 'running':
      // SourceDate is expectedShutdownDate. Next is call: expected shutdown date - 3 working days
      return {
        nextStep: 'call',
        owner: 'Sanjay',
        plannedDate: addWorkingDays(sourceDate, offsets.call ?? -3)
      };
    case 'shutdown':
      // Next is restart: shutdown date + 2 working days
      return {
        nextStep: 'restart',
        owner: 'CRM',
        plannedDate: addWorkingDays(sourceDate, offsets.restart ?? 2)
      };
    default:
      return null;
  }
}
