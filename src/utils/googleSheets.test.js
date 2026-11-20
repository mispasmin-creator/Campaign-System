import { describe, expect, it } from 'vitest';
import {
  normalizeSheetDate,
  normalizeTimestampToISO,
  buildAppDataFromSheetRows,
  parseGvizResponse,
  getGvizCellValue
} from '../services/googleSheets';

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

  it('safely handles null or undefined values in cleanCallStatus without crashing', () => {
    const cleanCallStatus = (status = '') => String(status || '').replace(/^\d+\.\s*/, '');
    expect(cleanCallStatus(null)).toBe('');
    expect(cleanCallStatus(undefined)).toBe('');
    expect(cleanCallStatus('')).toBe('');
    expect(cleanCallStatus('1. Yes Shutdown date taken')).toBe('Yes Shutdown date taken');
    expect(cleanCallStatus('No shutdown date not taken')).toBe('No shutdown date not taken');
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
        step3Status: '1. Yes Shutdown date taken',
        step5Planned: '24/12/2026'
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows);
    expect(result.orders.length).toBe(1);
    expect(result.orders[0].serviceOrderNo).toBe('CN-13');
    expect(result.orders[0].companyName).toBe('Sarda Energy');
    expect(result.orders[0].campaignStartDate).toBe('2026-11-17');
    expect(result.orders[0].expectedShutdownDate).toBe('2026-12-20');
    expect(result.orders[0].restartPlannedDate).toBe('2026-12-24');
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
    const { hasPageAccess, formatAccessString, normalizeUserRole } = await import('../services/auth');

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
    expect(normalizeUserRole('Admin')).toBe('Admin');
    expect(normalizeUserRole('Inspector')).toBe('User');
    expect(normalizeUserRole('Sales Co-ordinator')).toBe('User');
  });

  it('rebuilds restart history from completed FMS Step 5 rows after sheet refresh', () => {
    const sampleRows = [
      {
        serviceOrderNo: 'CN-02',
        companyName: 'Action Ispat',
        campaignStartDate: '20/11/2026',
        campaignNo: '2',
        kilnSize: '120 TPD',
        kilnNo: 2,
        step3Status: 'Forget to taken',
        step5Planned: '23/11/2026',
        step5Actual: '24/11/2026 10:30:00',
        step5Status: 'Restarted -> ReCN-02'
      },
      {
        serviceOrderNo: 'ReCN-02',
        companyName: 'Action Ispat',
        campaignStartDate: '24/11/2026',
        campaignNo: '3',
        kilnSize: '120 TPD',
        kilnNo: 2,
        inspectionIncharge: 'Demo'
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows);
    expect(result.orders.find((order) => order.serviceOrderNo === 'CN-02')?.status).toBe('closed');
    expect(result.stepTasks.find((task) => task.serviceOrderNo === 'CN-02' && task.step === 'restart')?.status).toBe('done');
    expect(result.restartProcesses).toHaveLength(1);
    expect(result.restartProcesses[0]).toMatchObject({
      serviceOrderNo: 'ReCN-02',
      sourceServiceOrderNo: 'CN-02',
      campaignNo: '3',
      campaignStartDate: '2026-11-24'
    });
  });

  it('buildAppDataFromSheetRows integrates runningDetails from Running Kiln Inspection tab and preserves innerTemp, slip, photo, and 9 zones', () => {
    const sampleRows = [
      {
        row: 7,
        serviceOrderNo: 'CN-01',
        companyName: 'ArcelorMittal Nippon Steel',
        campaignStartDate: '19/11/2026',
        campaignNo: '2',
        kilnSize: '80 TPD',
        kilnNo: 1,
        inspectionIncharge: 'Ahitesh',
        timestamp: '19/11/2026 11:46:32',
        avgTemp: '36',
        step2Actual: '19/11/2026',
        expectedShutdownDate: '20/11/2026',
        runningDetails: {
          innerTemp: 980,
          innerTempPhoto: 'https://drive.google.com/file/d/1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8/view',
          campaignLifeFormatSlip: 'https://drive.google.com/file/d/slip123/view',
          zoneTemps: [35, 36, 37, 36, 35, 36, 37, 38, 36],
          avgTemp: '36',
          daysSinceStart: 0,
          expectedShutdownDate: '20/11/2026',
          inspector: 'Ahitesh'
        }
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows);
    expect(result.runningInspections.length).toBe(1);
    const ins = result.runningInspections[0];
    expect(ins.serviceOrderNo).toBe('CN-01');
    expect(ins.partyName).toBe('ArcelorMittal Nippon Steel');
    expect(ins.innerTemp).toBe(980);
    expect(ins.innerTempPhoto).toBe('https://drive.google.com/file/d/1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8/view');
    expect(ins.campaignLifeFormatSlip).toBe('https://drive.google.com/file/d/slip123/view');
    expect(ins.zoneTemps).toEqual([35, 36, 37, 36, 35, 36, 37, 38, 36]);
    expect(ins.zones).toEqual([35, 36, 37, 36, 35, 36, 37, 38, 36]);
    expect(ins.daysSinceStart).toBe(0);
    expect(ins.avgTemp).toBe('36');
  });

  it('getDriveImagePreview converts Google Drive file links to high-res thumbnail previews', async () => {
    const { getDriveImagePreview } = await import('../components/DetailModal');
    const driveUrl = 'https://drive.google.com/file/d/1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8/view?usp=drivesdk';
    const preview = getDriveImagePreview(driveUrl);
    expect(preview).toBe('https://drive.google.com/thumbnail?id=1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8&sz=w1000');

    // Base64 returns as-is
    expect(getDriveImagePreview('data:image/png;base64,12345')).toBe('data:image/png;base64,12345');
  });

  it('buildAppDataFromSheetRows populates callLogs accurately from dedicated Followup for Shutdown tab rows', () => {
    const sampleRows = [
      {
        row: 7,
        serviceOrderNo: 'CN-01',
        companyName: 'ArcelorMittal Nippon Steel',
        campaignStartDate: '19/11/2026',
        campaignNo: '2',
        kilnSize: '80 TPD',
        kilnNo: 1,
        inspectionIncharge: 'Ahitesh',
        timestamp: '19/11/2026 11:46:32'
      }
    ];

    const followupRows = [
      {
        row: 2,
        serviceOrderNo: 'CN-01',
        partyName: 'ArcelorMittal Nippon Steel',
        personCalled: 'Ajay',
        designation: 'Processor',
        mobile: '9885674612',
        shutdownDateGiven: 'Yes Shutdown date taken',
        expectedShutdownDate: '20/11/2026',
        nextCallDate: '',
        timestamp: '19/11/2026 05:30:00'
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows, {}, followupRows);
    expect(result.callLogs.length).toBe(1);
    const log = result.callLogs[0];
    expect(log.serviceOrderNo).toBe('CN-01');
    expect(log.partyName).toBe('ArcelorMittal Nippon Steel');
    expect(log.personCalled).toBe('Ajay');
    expect(log.designation).toBe('Processor');
    expect(log.mobile).toBe('9885674612');
    expect(log.shutdownDateGiven).toBe('Yes Shutdown date taken');
    expect(log.expectedShutdownDate).toBe('2026-11-20');
  });

  it('correctly filters empty, undefined, or space values from zone temperatures', () => {
    const formatZones = (zones) => {
      const valid = (zones || [])
        .map((v) => (v !== null && v !== undefined ? String(v).trim() : ''))
        .filter((v) => v !== '' && v !== '—' && v !== '-' && !isNaN(Number(v)));
      return valid.length === 0 ? '—' : valid.join(', ');
    };

    expect(formatZones([undefined, undefined, undefined])).toBe('—');
    expect(formatZones([' ', ' ', ' '])).toBe('—');
    expect(formatZones(['', null, ''])).toBe('—');
    expect(formatZones([33, 34, 35])).toBe('33, 34, 35');
    expect(formatZones([33, '', 35, null, ' '])).toBe('33, 35');
  });

  it('keeps Step 3 (Take Shutdown Date) in pending status when "No shutdown date not taken" is chosen', () => {
    const sampleRows = [
      {
        row: 7,
        serviceOrderNo: 'CN-01',
        companyName: 'Agrawal Sponge Pvt Ltd',
        campaignStartDate: '19/11/2026',
        campaignNo: '1',
        kilnSize: '100 TPD',
        kilnNo: 1,
        inspectionIncharge: 'Ahitesh',
        timestamp: '19/11/2026 10:00:00',
        step2Actual: '19/11/2026',
        step3Status: 'No shutdown date not taken'
      }
    ];

    const followupRows = [
      {
        row: 2,
        serviceOrderNo: 'CN-01',
        partyName: 'Agrawal Sponge Pvt Ltd',
        personCalled: 'Ahitesh',
        designation: 'Processor',
        mobile: '9876543567',
        shutdownDateGiven: 'No shutdown date not taken',
        nextCallDate: '25/11/2026',
        timestamp: '19/11/2026 10:30:00'
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows, {}, followupRows);
    
    // Step 3 Task must stay pending!
    const callTask = result.stepTasks.find((t) => t.step === 'call');
    expect(callTask).toBeDefined();
    expect(callTask.status).toBe('pending');
    expect(callTask.actualDate).toBeNull();
    expect(callTask.plannedDate).toBe('2026-11-25');

    // Call log must be recorded
    expect(result.callLogs.length).toBe(1);
    expect(result.callLogs[0].callLogNo).toBe('CN1Call-01');
    expect(result.callLogs[0].shutdownDateGiven).toBe('No shutdown date not taken');
    expect(result.callLogs[0].nextCallDate).toBe('2026-11-25');
  });

  it('maintains call log series (Call-01, Call-02) and stays pending until Yes or Forget is chosen', () => {
    const sampleRows = [
      {
        row: 7,
        serviceOrderNo: 'CN-01',
        companyName: 'Agrawal Sponge Pvt Ltd',
        campaignStartDate: '19/11/2026',
        campaignNo: '1',
        kilnSize: '100 TPD',
        kilnNo: 1,
        step2Actual: '19/11/2026',
        step3Status: 'No shutdown date not taken'
      }
    ];

    const followupRows = [
      {
        row: 2,
        serviceOrderNo: 'CN-01',
        partyName: 'Agrawal Sponge Pvt Ltd',
        personCalled: 'Ahitesh',
        designation: 'Processor',
        mobile: '9876543567',
        shutdownDateGiven: 'No shutdown date not taken',
        nextCallDate: '22/11/2026',
        timestamp: '19/11/2026 10:30:00'
      },
      {
        row: 3,
        serviceOrderNo: 'CN-01',
        partyName: 'Agrawal Sponge Pvt Ltd',
        personCalled: 'Ahitesh',
        designation: 'Processor',
        mobile: '9876543567',
        shutdownDateGiven: 'No shutdown date not taken',
        nextCallDate: '28/11/2026',
        timestamp: '22/11/2026 11:00:00'
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows, {}, followupRows);
    
    // Both calls must exist
    expect(result.callLogs.length).toBe(2);
    // Newest is at index 0
    expect(result.callLogs[0].callLogNo).toBe('CN1Call-02');
    expect(result.callLogs[0].nextCallDate).toBe('2026-11-28');
    expect(result.callLogs[1].callLogNo).toBe('CN1Call-01');

    // Step 3 must still be pending with latest nextCallDate
    const callTask = result.stepTasks.find((t) => t.step === 'call');
    expect(callTask.status).toBe('pending');
    expect(callTask.actualDate).toBeNull();
    expect(callTask.plannedDate).toBe('2026-11-28');
  });

  it('marks Step 2 (Running Inspection) task as done when runningDetails exist even if step2Actual in FMS is blank', () => {
    const sampleRows = [
      {
        row: 7,
        serviceOrderNo: 'CN-01',
        companyName: 'Agrawal Sponge Pvt Ltd',
        campaignStartDate: '19/11/2026',
        campaignNo: '2',
        kilnSize: '100 TPD',
        kilnNo: 3,
        inspectionIncharge: 'Ahitesh',
        step2Actual: '', // Blank in main FMS sheet
        runningDetails: {
          avgTemp: '36',
          innerTemp: 980,
          visitDate: '2026-11-19'
        }
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows);
    expect(result.runningInspections.length).toBe(1);
    const runningTask = result.stepTasks.find((t) => t.step === 'running');
    expect(runningTask.status).toBe('done');
    expect(runningTask.actualDate).toBe('2026-11-19');
  });

  it('reads nextCallDate from Column V in FMS row when present and keeps Step 3 task pending', () => {
    const sampleRows = [
      {
        row: 7,
        serviceOrderNo: 'CN-01',
        companyName: 'Agrawal Sponge Pvt Ltd',
        campaignStartDate: '19/11/2026',
        campaignNo: '2',
        kilnSize: '100 TPD',
        kilnNo: 3,
        inspectionIncharge: 'Ahitesh',
        step2Actual: '19/11/2026',
        step3Actual: '',
        step3Status: 'No shutdown date not taken',
        nextCallDate: '25/11/2026'
      }
    ];

    const result = buildAppDataFromSheetRows(sampleRows);
    expect(result.callLogs.length).toBe(1);
    expect(result.callLogs[0].nextCallDate).toBe('2026-11-25');
    expect(result.callLogs[0].shutdownDateGiven).toBe('No shutdown date not taken');

    const callTask = result.stepTasks.find((t) => t.step === 'call');
    expect(callTask.status).toBe('pending');
    expect(callTask.actualDate).toBeNull();
    expect(callTask.plannedDate).toBe('2026-11-25');
  });

  it('parseGvizResponse correctly extracts table rows from Google Visualization JSON format', () => {
    const rawGviz = `/*O_o*/\ngoogle.visualization.Query.setResponse({"version":"0.6","reqId":"0","status":"ok","table":{"cols":[{"id":"A"},{"id":"B"}],"rows":[{"c":[{"v":"Name Of The Company"},{"v":"Size Of Kiln"}]},{"c":[{"v":"Self"},{"v":"80 TPD"}]},{"c":[{"v":"Aarti Sponge & Power Ltd"},{"v":"100 TPD"}]}]}});`;
    const rows = parseGvizResponse(rawGviz);
    expect(rows.length).toBe(3);
    expect(rows[0].c[0].v).toBe('Name Of The Company');
    expect(rows[1].c[0].v).toBe('Self');
    expect(rows[1].c[1].v).toBe('80 TPD');
    expect(rows[2].c[0].v).toBe('Aarti Sponge & Power Ltd');
    expect(rows[2].c[1].v).toBe('100 TPD');

    expect(parseGvizResponse(null)).toEqual([]);
    expect(parseGvizResponse('')).toEqual([]);
    expect(parseGvizResponse('invalid')).toEqual([]);
  });

  it('buildAppDataFromSheetRows populates companies and kilnSizes from masterData accurately', () => {
    const sampleRows = [];
    const masterData = {
      companies: [
        'Self',
        'Aarti Sponge & Power Ltd',
        'Action Ispat And Power Private Limited',
        'ACTION ISSPAT AND POWER PVT LTD (AIAPPL)',
        'ADITHYA POWER REFRA. & INSULATION PVT LTD'
      ],
      kilnSizes: ['80 TPD', '100 TPD', '120 TPD', '150 TPD']
    };

    const result = buildAppDataFromSheetRows(sampleRows, {}, [], masterData);
    expect(result.companies.length).toBeGreaterThanOrEqual(5);
    expect(result.companies[0].name).toBe('Self');
    expect(result.companies[1].name).toBe('Aarti Sponge & Power Ltd');
    expect(result.companies[2].name).toBe('Action Ispat And Power Private Limited');
    expect(result.companies[3].name).toBe('ACTION ISSPAT AND POWER PVT LTD (AIAPPL)');
    expect(result.companies[4].name).toBe('ADITHYA POWER REFRA. & INSULATION PVT LTD');

    expect(result.kilnSizes).toEqual(['80 TPD', '100 TPD', '120 TPD', '150 TPD']);
  });

  it('normalizes GViz Date(yyyy,m,d) strings in normalizeSheetDate and normalizeTimestampToISO', () => {
    // Month in GViz Date(...) is 0-indexed, so 10 is November
    expect(normalizeSheetDate('Date(2026,10,19)')).toBe('2026-11-19');
    expect(normalizeSheetDate('Date(2026,0,5)')).toBe('2026-01-05');

    const iso = normalizeTimestampToISO('Date(2026,10,19,14,30,48)');
    expect(iso).toBeTruthy();
    expect(iso).toContain('2026-11-19');
  });

  it('getGvizCellValue extracts values from cell objects with formatted text and Date values', () => {
    expect(getGvizCellValue(null)).toBe('');
    expect(getGvizCellValue({})).toBe('');
    expect(getGvizCellValue({ v: 'CN-01' })).toBe('CN-01');
    expect(getGvizCellValue({ v: 1234 })).toBe('1234');
    expect(getGvizCellValue({ f: '19/11/2026', v: 'Date(2026,10,19)' })).toBe('19/11/2026');
    expect(getGvizCellValue({ v: 'Date(2026,10,19)' })).toBe('19/11/2026');
    expect(getGvizCellValue({ v: 'Date(2026,10,19,14,30,48)' })).toBe('19/11/2026 14:30:48');
  });
});
