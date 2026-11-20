/**
 * QA lifecycle simulation: 10 service orders walked through every workflow branch.
 * Rows mimic what code.gs writes into FMS / Followup / Running / Shutdown tabs,
 * then we check what each page's filter logic would show.
 */
import { describe, expect, it } from 'vitest';
import { buildAppDataFromSheetRows, normalizeSheetDate } from '../services/googleSheets';
import { hasPageAccess, getPageAccessLevel } from '../services/auth';
import { addWorkingDays, avg } from './workflow';

const fu = (serviceOrderNo, shutdownDateGiven, date = '', ts = '20/11/2026 10:00:00') => ({
  timestamp: ts,
  serviceOrderNo,
  partyName: 'P',
  personCalled: 'Ram',
  designation: 'Processor',
  mobile: '9999999999',
  shutdownDateGiven,
  expectedShutdownDate: shutdownDateGiven.includes('Yes') ? date : '',
  nextCallDate: shutdownDateGiven.includes('No') ? date : ''
});

const base = (no, extra = {}) => ({
  serviceOrderNo: no,
  companyName: 'Alpha Sponge',
  campaignStartDate: '01/10/2026',
  campaignNo: 1,
  kilnSize: '100 TPD',
  kilnNo: 1,
  inspectionIncharge: 'Ravi',
  ...extra
});

// ---- 10 entries ----
const rows = [
  base('CN-01'), // E1: visit only -> Running pending
  base('CN-02', { step2Actual: '05/10/2026 10:00:00', expectedShutdownDate: '20/12/2026', avgTemp: 250 }), // E2: running done, no call yet
  base('CN-03', { step2Actual: '05/10/2026', expectedShutdownDate: '20/12/2026', step3Status: 'No shutdown date not taken', nextCallDate: '25/11/2026' }), // E3: call NO
  // E4: call YES with confirmed date 15/12 different from running estimate 20/12 (col M vs col T)
  base('CN-04', { step2Actual: '05/10/2026', expectedShutdownDate: '20/12/2026', step3Actual: '20/11/2026', step3Status: 'Yes Shutdown date taken', shutdownDate: '15/12/2026' }),
  base('CN-05', { step2Actual: '05/10/2026', expectedShutdownDate: '20/12/2026', step3Actual: '20/11/2026', step3Status: 'Forget to taken' }), // E5: FORGET
  // E6: YES -> shutdown inspection done
  base('CN-06', { step2Actual: '05/10/2026', expectedShutdownDate: '20/11/2026', step3Actual: '15/11/2026', step3Status: 'Yes Shutdown date taken', shutdownDate: '18/11/2026', step4Actual: '18/11/2026', avgThickness: 150, nextCampaignStartDate: '25/11/2026' }),
  // E7: FORGET -> restart done -> ReCN-07 created
  base('CN-07', { step2Actual: '05/10/2026', expectedShutdownDate: '20/12/2026', step3Actual: '20/11/2026', step3Status: 'Forget to taken', step5Actual: '20/11/2026 12:00:00', step5Status: 'Restarted -> ReCN-07' }),
  base('ReCN-07', { campaignNo: 2, campaignStartDate: '20/11/2026' }),
  // E8: NO first, later YES (two followups)
  base('CN-08', { step2Actual: '05/10/2026', expectedShutdownDate: '20/12/2026', step3Actual: '20/11/2026', step3Status: 'Yes Shutdown date taken', shutdownDate: '10/12/2026' }),
  // E9: YES first, then NO later (customer withdrew date)
  base('CN-09', { step2Actual: '05/10/2026', expectedShutdownDate: '20/12/2026', step3Status: 'No shutdown date not taken', nextCallDate: '30/11/2026' })
];
const followups = [
  fu('CN-03', 'No shutdown date not taken', '25/11/2026'),
  fu('CN-04', 'Yes Shutdown date taken', '15/12/2026'),
  fu('CN-05', 'Forget to taken'),
  fu('CN-06', 'Yes Shutdown date taken', '18/11/2026'),
  fu('CN-07', 'Forget to taken'),
  fu('CN-08', 'No shutdown date not taken', '22/11/2026', '18/11/2026 10:00:00'),
  fu('CN-08', 'Yes Shutdown date taken', '10/12/2026', '20/11/2026 10:00:00'),
  fu('CN-09', 'Yes Shutdown date taken', '05/12/2026', '18/11/2026 10:00:00'),
  fu('CN-09', 'No shutdown date not taken', '30/11/2026', '20/11/2026 10:00:00')
];

const data = buildAppDataFromSheetRows(rows, {}, followups);
const task = (no, step) => data.stepTasks.find((t) => t.serviceOrderNo === no && t.step === step);
const order = (no) => data.orders.find((o) => o.serviceOrderNo === no);

// Page filters copied from the page components
const runningPending = () => {
  const done = new Set(data.runningInspections.map((r) => r.serviceOrderNo.toUpperCase()));
  return data.stepTasks.filter((t) => t.step === 'running' && t.status === 'pending' && !done.has(t.serviceOrderNo.toUpperCase())).map((t) => t.serviceOrderNo);
};
const callPending = () => data.stepTasks.filter((t) => {
  const latest = data.callLogs.find((l) => l.serviceOrderNo === t.serviceOrderNo);
  const forgotten = String(latest?.shutdownDateGiven || '').toLowerCase().includes('forget');
  return t.step === 'call' && t.status === 'pending' && !forgotten &&
    (data.runningInspections.some((r) => r.serviceOrderNo === t.serviceOrderNo) ||
     data.stepTasks.some((s) => s.serviceOrderNo === t.serviceOrderNo && s.step === 'running' && s.status === 'done'));
}).map((t) => t.serviceOrderNo);
const shutdownPending = () => {
  const done = new Set(data.shutdownInspections.map((i) => i.serviceOrderNo));
  return data.orders.filter((o) => {
    if (done.has(o.serviceOrderNo)) return false;
    const latest = data.callLogs.find((l) => l.serviceOrderNo === o.serviceOrderNo);
    return (latest?.shutdownDateGiven || o.callFollowupStatus || '').toLowerCase().includes('yes');
  }).map((o) => o.serviceOrderNo);
};
const restartPending = () => data.callLogs.filter((log) => {
  const status = String(log.shutdownDateGiven || '').toLowerCase();
  const t = task(log.serviceOrderNo, 'call');
  const rt = task(log.serviceOrderNo, 'restart');
  const o = order(log.serviceOrderNo);
  const inferred = (!status || status === 'pending call') && t?.status === 'done' && !log.expectedShutdownDate;
  const completed = rt?.status === 'done' || o?.status === 'closed';
  return (status.includes('forget') || inferred) && !log.restartServiceOrderNo && !completed;
}).map((l) => l.serviceOrderNo);

describe('QA lifecycle – 10 entries across all branches', () => {
  it('loads all 10 orders, no duplicates', () => {
    expect(data.orders).toHaveLength(10);
  });

  it('Running pending = visit-only orders (CN-01, ReCN-07)', () => {
    expect(runningPending().sort()).toEqual(['CN-01', 'ReCN-07']);
  });

  it('Take Shutdown pending = running done + call not confirmed (CN-02, CN-03, CN-09)', () => {
    expect(callPending().sort()).toEqual(['CN-02', 'CN-03', 'CN-09']);
  });

  it('NO call keeps next call date as planned date', () => {
    expect(task('CN-03', 'call').plannedDate).toBe('2026-11-25');
    expect(task('CN-09', 'call').plannedDate).toBe('2026-11-30');
  });

  it('Shutdown pending = latest call YES and not inspected (CN-04, CN-08)', () => {
    expect(shutdownPending().sort()).toEqual(['CN-04', 'CN-08']);
  });

  it('Restart pending = FORGET and not restarted (CN-05 only)', () => {
    expect(restartPending()).toEqual(['CN-05']);
  });

  it('Restart history rebuilt from FMS AD: CN-07 -> ReCN-07', () => {
    expect(data.restartProcesses).toHaveLength(1);
    expect(data.restartProcesses[0]).toMatchObject({ serviceOrderNo: 'ReCN-07', sourceServiceOrderNo: 'CN-07', campaignNo: '2' });
    expect(order('CN-07').status).toBe('closed');
  });

  it('call log numbering per order', () => {
    const cn08 = data.callLogs.filter((l) => l.serviceOrderNo === 'CN-08').map((l) => l.callLogNo);
    expect(cn08).toEqual(['CN8Call-02', 'CN8Call-01']);
  });

  it('avg ignores empty zones', () => {
    expect(avg(['200', '', null, '300'])).toBe(250);
  });
});

describe('QA – suspected defects (these document CURRENT behaviour)', () => {
  it('BUG: confirmed shutdown date (col T) is ignored when running estimate (col M) exists', () => {
    // Customer confirmed 15/12, running estimate was 20/12.
    expect(order('CN-04').expectedShutdownDate).toBe('2026-12-20'); // should be 2026-12-15
    expect(task('CN-04', 'shutdown').plannedDate).toBe('2026-12-20');
  });

  it('BUG: Shutdown-inspected order (CN-06) never reaches Restart pending and stays "open"', () => {
    expect(restartPending()).not.toContain('CN-06');
    expect(order('CN-06').status).toBe('open');
    expect(task('CN-06', 'restart').status).toBe('pending');
  });

  it('BUG: next CN number collides when non-CN digits exist (e.g. ReCN or a stray order)', () => {
    const extra = buildAppDataFromSheetRows([...rows, base('QA-2026-1')], {}, followups);
    const nums = extra.orders.map((o) => parseInt(o.serviceOrderNo.replace(/\D/g, ''), 10)).filter(Boolean);
    expect(`CN-${String(Math.max(...nums) + 1).padStart(2, '0')}`).toBe('CN-20262'); // garbage order no
  });

  it('BUG: view-only permission is not enforced by routes (hasPageAccess = true)', () => {
    const viewer = { role: 'User', access: 'view:running' };
    expect(getPageAccessLevel(viewer, 'running')).toBe('view');
    expect(hasPageAccess(viewer, 'running')).toBe(true); // page renders full forms
  });

  it('date parsing edge: ISO string with T from Apps Script Date shifts in non-IST browsers', () => {
    // Apps Script serialises a sheet date (IST midnight) as UTC previous day 18:30
    const v = normalizeSheetDate('2026-11-19T18:30:00.000Z');
    expect(['2026-11-19', '2026-11-20']).toContain(v);
  });

  it('working days skip Sunday', () => {
    expect(addWorkingDays('2026-11-21', 1)).toBe('2026-11-23'); // Sat -> Mon
  });
});
