import { describe, expect, it } from 'vitest';
import { normalizeSheetDate, buildAppDataFromSheetRows } from '../services/googleSheets';

describe('Google Sheets Data Synchronization', () => {
  it('normalizes sheet date formats properly', () => {
    expect(normalizeSheetDate('')).toBe('');
    expect(normalizeSheetDate(null)).toBe('');
    expect(normalizeSheetDate('—')).toBe('');
    expect(normalizeSheetDate('17/11/2026')).toBe('2026-11-17');
    expect(normalizeSheetDate('17-11-2026')).toBe('2026-11-17');
    expect(normalizeSheetDate('2026-11-17')).toBe('2026-11-17');
    expect(normalizeSheetDate('2026-11-17T00:00:00.000Z')).toBe('2026-11-17');
    expect(normalizeSheetDate(new Date(2026, 10, 17))).toBe('2026-11-17');
  });

  it('buildAppDataFromSheetRows returns completely empty database when sheet has 0 rows (no seed orders)', () => {
    const emptyResult = buildAppDataFromSheetRows([]);
    expect(emptyResult.orders).toEqual([]);
    expect(emptyResult.visits).toEqual([]);
    expect(emptyResult.runningInspections).toEqual([]);
    expect(emptyResult.shutdownInspections).toEqual([]);
    expect(emptyResult.callLogs).toEqual([]);
    expect(emptyResult.stepTasks).toEqual([]);
    expect(emptyResult.isSyncedFromSheet).toBe(true);
  });

  it('buildAppDataFromSheetRows populates orders accurately from Google Sheet rows and cleans status prefixes', () => {
    const sampleRows = [
      {
        row: 7,
        serviceOrderNo: 'CN-13',
        companyName: 'Sarda Energy',
        campaignStartDate: '17/11/2026',
        campaignNo: '67',
        kilnSize: '150 TPD',
        kilnNo: 3,
        inspectionIncharge: 'Ahitesh',
        timestamp: '17/11/2026 09:30:00',
        avgTemp: '960',
        step2Actual: '18/11/2026',
        step2Delay: 0,
        expectedShutdownDate: '20/12/2026',
        step3Status: '1. Yes Shutdown date taken'
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows);
    expect(result.orders.length).toBe(1);
    expect(result.orders[0].serviceOrderNo).toBe('CN-13');
    expect(result.orders[0].companyName).toBe('Sarda Energy');
    expect(result.orders[0].campaignStartDate).toBe('2026-11-17');
    expect(result.orders[0].expectedShutdownDate).toBe('2026-12-20');
    // Status prefix "1. " must be cleaned
    expect(result.orders[0].callFollowupStatus).toBe('Yes Shutdown date taken');

    expect(result.visits.length).toBe(1);
    expect(result.visits[0].serviceOrderNo).toBe('CN-13');
    expect(result.visits[0].inspectionIncharge).toBe('Ahitesh');

    expect(result.runningInspections.length).toBe(1);
    expect(result.runningInspections[0].avgTemp).toBe('960');

    expect(result.stepTasks.length).toBe(5);
    const visitTask = result.stepTasks.find((t) => t.step === 'visit');
    expect(visitTask.status).toBe('done');
    const runningTask = result.stepTasks.find((t) => t.step === 'running');
    expect(runningTask.status).toBe('done');
  });

  it('validates user page-level access control permissions properly', async () => {
    const { hasPageAccess, formatAccessString } = await import('../services/auth');

    const admin = { userId: 'admin', role: 'Admin', access: 'All' };
    expect(hasPageAccess(admin, 'dashboard')).toBe(true);
    expect(hasPageAccess(admin, 'visit')).toBe(true);
    expect(hasPageAccess(admin, 'access')).toBe(true);

    const inspector = {
      userId: 'sanjay',
      role: 'Inspector',
      access: 'dashboard, running, take-shutdown-date, shutdown-inspection'
    };
    expect(hasPageAccess(inspector, 'running')).toBe(true);
    expect(hasPageAccess(inspector, 'shutdown-inspection')).toBe(true);
    expect(hasPageAccess(inspector, 'visit')).toBe(false);
    expect(hasPageAccess(inspector, 'masters')).toBe(false);
    expect(hasPageAccess(inspector, 'access')).toBe(false);

    expect(formatAccessString(['running', 'shutdown-inspection'])).toBe('running, shutdown-inspection');
    expect(formatAccessString(null)).toBe('All');
    expect(formatAccessString([])).toBe('');
  });
});
