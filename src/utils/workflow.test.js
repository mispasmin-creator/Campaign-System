import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFSETS,
  addWorkingDays,
  calendarDaysDiff,
  isSunday,
  getTaskDelay,
  avg,
  canSubmitStep,
  getNextStepPlan
} from './workflow';

describe('Workflow Working Days (Sunday Skipped)', () => {
  it('n = 0 returns the exact same date', () => {
    expect(addWorkingDays('2026-11-10', 0)).toBe('2026-11-10');
    expect(addWorkingDays('2026-11-08', 0)).toBe('2026-11-08'); // Sunday input unchanged for n=0
  });

  it('skips a single Sunday when stepping forward', () => {
    // 2026-11-07 is Saturday
    // 1 working day forward should skip 2026-11-08 (Sunday) and land on 2026-11-09 (Monday)
    expect(isSunday('2026-11-08')).toBe(true);
    expect(addWorkingDays('2026-11-07', 1)).toBe('2026-11-09');
  });

  it('skips multiple Sundays correctly for 7 working days (+7 offset)', () => {
    // 2026-11-07 (Sat) + 7 working days:
    // Sun 8 (skip)
    // Mon 9 (1), Tue 10 (2), Wed 11 (3), Thu 12 (4), Fri 13 (5), Sat 14 (6)
    // Sun 15 (skip)
    // Mon 16 (7)
    expect(addWorkingDays('2026-11-07', 7)).toBe('2026-11-16');
  });

  it('skips Sunday when stepping backward (-3 offset for call step)', () => {
    // 2026-11-10 (Tuesday) - 3 working days:
    // Mon 9 (1)
    // Sun 8 (skip)
    // Sat 7 (2)
    // Fri 6 (3)
    expect(addWorkingDays('2026-11-10', -3)).toBe('2026-11-06');
  });

  it('skips Sunday when starting from Sunday backward', () => {
    // 2026-11-08 is Sunday. -1 working day:
    // Step back to Sat 7 (1 working day)
    expect(addWorkingDays('2026-11-08', -1)).toBe('2026-11-07');
  });

  it('handles negative offsets spanning multiple Sundays', () => {
    // 2026-11-17 (Tue) - 7 working days:
    // Mon 16 (1)
    // Sun 15 (skip)
    // Sat 14 (2), Fri 13 (3), Thu 12 (4), Wed 11 (5), Tue 10 (6), Mon 9 (7)
    expect(addWorkingDays('2026-11-17', -7)).toBe('2026-11-09');
  });
});

describe('Delay Calculation Rules', () => {
  it('returns 0 delay when actual date is earlier than or equal to planned date', () => {
    // On-time
    expect(getTaskDelay({ status: 'done', plannedDate: '2026-11-10', actualDate: '2026-11-10' })).toBe(0);
    // Early
    expect(getTaskDelay({ status: 'done', plannedDate: '2026-11-10', actualDate: '2026-11-08' })).toBe(0);
  });

  it('returns exact days delayed when actual date is after planned date', () => {
    expect(getTaskDelay({ status: 'done', plannedDate: '2026-11-10', actualDate: '2026-11-14' })).toBe(4);
  });

  it('calculates delay for pending task only if today is after planned date', () => {
    const today = '2026-11-15';
    // Planned in the past
    expect(getTaskDelay({ status: 'pending', plannedDate: '2026-11-10' }, today)).toBe(5);
    // Planned today
    expect(getTaskDelay({ status: 'pending', plannedDate: '2026-11-15' }, today)).toBe(0);
    // Planned in the future
    expect(getTaskDelay({ status: 'pending', plannedDate: '2026-11-20' }, today)).toBe(0);
  });
});

describe('Live Average Calculation', () => {
  it('averages only populated numeric values', () => {
    expect(avg(['150', '', '160', null, undefined, '170'])).toBe(160);
    expect(avg(['900', '950', '925'])).toBe(925);
  });

  it('returns 0 for empty or all-blank inputs', () => {
    expect(avg([])).toBe(0);
    expect(avg(['', ' ', null])).toBe(0);
  });

  it('rounds to 1 decimal place', () => {
    expect(avg(['100', '105', '110', '112'])).toBe(106.8);
  });
});

describe('Double-Submission Guard & Next Step Planning', () => {
  it('prevents submitting a step that is already marked done', () => {
    const tasks = [
      { serviceOrderNo: 'CN-01', step: 'running', status: 'done' },
      { serviceOrderNo: 'CN-01', step: 'call', status: 'pending' }
    ];
    expect(canSubmitStep('CN-01', 'running', tasks)).toBe(false);
    expect(canSubmitStep('CN-01', 'call', tasks)).toBe(true);
    expect(canSubmitStep('CN-01', 'shutdown', tasks)).toBe(true);
  });

  it('calculates next step plan using configured offsets', () => {
    // Visit completion -> schedules running (+7 working days)
    const runPlan = getNextStepPlan('visit', '2026-11-07', DEFAULT_OFFSETS);
    expect(runPlan.nextStep).toBe('running');
    expect(runPlan.owner).toBe('Sanjay');
    expect(runPlan.plannedDate).toBe('2026-11-16');

    // Running completion -> schedules call (-3 working days from expected shutdown)
    const callPlan = getNextStepPlan('running', '2026-11-10', DEFAULT_OFFSETS);
    expect(callPlan.nextStep).toBe('call');
    expect(callPlan.owner).toBe('Sanjay');
    expect(callPlan.plannedDate).toBe('2026-11-06');

    // Shutdown completion -> schedules restart (+2 working days from shutdown date)
    // 2026-11-07 (Sat) + 2 working days: Sun 8 skip, Mon 9 (1), Tue 10 (2)
    const restartPlan = getNextStepPlan('shutdown', '2026-11-07', DEFAULT_OFFSETS);
    expect(restartPlan.nextStep).toBe('restart');
    expect(restartPlan.owner).toBe('CRM');
    expect(restartPlan.plannedDate).toBe('2026-11-10');
  });
});
