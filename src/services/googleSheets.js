/**
 * Google Sheets Integration Service for Campaign Life FMS
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1-bRJ23ObGsU0mftvXsMUtfXLKGK8J-PL7kp6BrOsY8g/edit?gid=0#gid=0
 * 
 * Rules:
 * 1. "Planned" and "Delay" columns are NEVER overwritten.
 * 2. When a step is submitted, that step's "Actual" column receives a live timestamp (DD/MM/YYYY HH:mm:ss).
 * 3. Completely non-blocking and dynamic (optimistic UI update, async background sync).
 * 4. Google Sheet is the single source of truth: if sheet is empty, app is empty.
 */

import { SEED_COMPANIES, SEED_KILNS } from './storage';
import { addWorkingDays } from '../utils/workflow';

const STORAGE_SCRIPT_KEY = 'campaign_fms_google_script_url';
export const SPREADSHEET_ID = '1-bRJ23ObGsU0mftvXsMUtfXLKGK8J-PL7kp6BrOsY8g';
export const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=0#gid=0`;
export const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxIVPnIDnFUW24BoePkYUqq_AISp66egDyRX95Oj_nUIgpXW8VwERGZQtx0HvsCK53f/exec';

/**
 * Normalizes various sheet date/time formats into standard ISO YYYY-MM-DD
 */
export function normalizeSheetDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (!s || s === '—' || s === '-') return '';
  
  // ISO format or contains 'T' (e.g. "2026-11-12T00:00:00.000Z")
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (e.g. "12/11/2026" or "12/11/2026 00:00:00")
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD (e.g. "2026-11-12")
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return s;
}

/**
 * Returns currently configured Google Apps Script Web App URL
 */
export function getGoogleScriptUrl() {
  try {
    const saved = localStorage.getItem(STORAGE_SCRIPT_KEY);
    return saved && saved.trim() ? saved.trim() : DEFAULT_SCRIPT_URL;
  } catch {
    return DEFAULT_SCRIPT_URL;
  }
}

/**
 * Saves Google Apps Script Web App URL
 */
export function setGoogleScriptUrl(url) {
  try {
    localStorage.setItem(STORAGE_SCRIPT_KEY, (url || '').trim());
  } catch (e) {
    console.error('Failed to save script URL in localStorage', e);
  }
}

/**
 * Helper to format current date/time as DD/MM/YYYY HH:mm:ss
 */
export function getCurrentTimestamp() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
}

/**
 * Asynchronously syncs a workflow step to Google Sheet in the background.
 * Returns a promise but caller does not need to block.
 */
export async function syncStepToGoogleSheet(step, serviceOrderNo, data = {}) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) {
    console.log('[GoogleSheets] No Apps Script URL configured yet. Skipping cloud sync.');
    return { status: 'skipped', reason: 'No script URL' };
  }

  // Clean any number series prefix (e.g. "1. Yes Shutdown date taken" -> "Yes Shutdown date taken")
  const sanitizedData = { ...data };
  if (sanitizedData.status) {
    sanitizedData.status = String(sanitizedData.status).replace(/^\d+\.\s*/, '').trim();
  }
  if (sanitizedData.statusStep3) {
    sanitizedData.statusStep3 = String(sanitizedData.statusStep3).replace(/^\d+\.\s*/, '').trim();
  }
  if (sanitizedData.shutdownDateGiven) {
    sanitizedData.shutdownDateGiven = String(sanitizedData.shutdownDateGiven).replace(/^\d+\.\s*/, '').trim();
  }

  const payload = {
    step,
    serviceOrderNo,
    timestamp: getCurrentTimestamp(),
    data: sanitizedData
  };

  try {
    // Send using fetch with mode: 'no-cors' to avoid CORS/redirect blockages in browser
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    console.log(`[GoogleSheets] Step ${step} synced for ${serviceOrderNo}`);
    return { status: 'success' };
  } catch (err) {
    console.warn(`[GoogleSheets] Sync error for Step ${step} (${serviceOrderNo}):`, err.message);
    return { status: 'error', error: err.message };
  }
}

/**
 * Fetch targeted data for a specific step only (No broad SELECT *)
 */
export async function fetchStepDataFromGoogleSheet(step) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) return { status: 'skipped', rows: [] };

  try {
    const url = `${scriptUrl}?step=${encodeURIComponent(step)}&t=${Date.now()}`;
    const res = await fetch(url);
    const json = await res.json();
    return json && json.status === 'success' ? json : { status: 'error', rows: [] };
  } catch (err) {
    console.warn(`[GoogleSheets] Fetch error for Step ${step}:`, err.message);
    return { status: 'error', error: err.message, rows: [] };
  }
}

/**
 * Two-way smart sync: Pulls changes from Google Sheet for the active step,
 * identifies exact modified or deleted rows, and updates only those specific records.
 */
export async function syncStepChangesFromSheet(step, currentData) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl || !currentData) return { changed: 0, message: 'No script URL or data' };

  try {
    const json = await fetchStepDataFromGoogleSheet(step);
    if (!json || json.status !== 'success' || !Array.isArray(json.rows)) {
      return { changed: 0, message: 'No valid data returned' };
    }

    let changedCount = 0;
    const nextData = {
      ...currentData,
      orders: [...(currentData.orders || [])],
      visits: [...(currentData.visits || [])],
      runningInspections: [...(currentData.runningInspections || [])],
      shutdownInspections: [...(currentData.shutdownInspections || [])]
    };

    const sheetRows = json.rows;

    for (const row of sheetRows) {
      const orderNo = String(row.serviceOrderNo || '').trim().toUpperCase();
      if (!orderNo) continue;

      const order = nextData.orders.find((o) => o.serviceOrderNo.toUpperCase() === orderNo);
      if (!order) continue;

      if (step == 1 || step === 'visit') {
        const visit = nextData.visits.find((v) => v.serviceOrderNo.toUpperCase() === orderNo);
        if (visit) {
          if (row.inspectionIncharge && row.inspectionIncharge !== visit.inspectionIncharge) {
            visit.inspectionIncharge = row.inspectionIncharge;
            order.inspectionIncharge = row.inspectionIncharge;
            changedCount++;
          }
          if (row.campaignNo && String(row.campaignNo) !== String(visit.campaignNo)) {
            visit.campaignNo = String(row.campaignNo);
            order.campaignNo = String(row.campaignNo);
            changedCount++;
          }
        }
      } else if (step == 2 || step === 'running') {
        const running = nextData.runningInspections.find((r) => r.serviceOrderNo.toUpperCase() === orderNo);
        if (running) {
          if (row.avgTemp && String(row.avgTemp) !== String(running.avgTemp)) {
            running.avgTemp = String(row.avgTemp);
            changedCount++;
          }
          if (row.inspector && row.inspector !== running.inspector) {
            running.inspector = row.inspector;
            changedCount++;
          }
        }
      } else if (step == 3 || step === 'call') {
        if (row.shutdownDate && row.shutdownDate !== order.expectedShutdownDate) {
          order.expectedShutdownDate = row.shutdownDate;
          changedCount++;
        }
      } else if (step == 4 || step === 'shutdown') {
        const shutdown = nextData.shutdownInspections.find((s) => s.serviceOrderNo.toUpperCase() === orderNo);
        if (shutdown) {
          if (row.avgThickness && String(row.avgThickness) !== String(shutdown.avgThickness)) {
            shutdown.avgThickness = String(row.avgThickness);
            changedCount++;
          }
          if (row.inspector && row.inspector !== shutdown.inspector) {
            shutdown.inspector = row.inspector;
            changedCount++;
          }
        }
      }
    }

    return { changed: changedCount, nextData };
  } catch (err) {
    console.warn('[GoogleSheets] syncStepChangesFromSheet error:', err.message);
    return { changed: 0, error: err.message };
  }
}

/**
 * Fetches all order rows from the Google Sheet across all steps.
 * Compatible with both updated GAS script (step=all) and older version (merges steps 1-5).
 */
export async function fetchFullSheetData() {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) return null;

  try {
    // Attempt 1: Fetch with step=all
    const res = await fetch(`${scriptUrl}?step=all&t=${Date.now()}`);
    const json = await res.json();
    if (json && json.status === 'success' && Array.isArray(json.rows)) {
      if (json.rows.length === 0) {
        return []; // Truly empty sheet!
      }
      // If deployed GAS already returns full campaign details
      if (json.rows[0].campaignStartDate !== undefined) {
        return json.rows;
      }
    }

    // Attempt 2: Concurrently query all 5 steps to assemble complete rows (backward compatible with currently deployed GAS)
    const [r1, r2, r3, r4, r5] = await Promise.all([
      fetchStepDataFromGoogleSheet(1),
      fetchStepDataFromGoogleSheet(2),
      fetchStepDataFromGoogleSheet(3),
      fetchStepDataFromGoogleSheet(4),
      fetchStepDataFromGoogleSheet(5)
    ]);

    const s1Rows = (r1 && r1.rows) || [];
    const s2Rows = (r2 && r2.rows) || [];
    const s3Rows = (r3 && r3.rows) || [];
    const s4Rows = (r4 && r4.rows) || [];
    const s5Rows = (r5 && r5.rows) || [];

    if (s1Rows.length === 0) {
      return [];
    }

    const merged = s1Rows.map((s1) => {
      const orderNo = String(s1.serviceOrderNo || '').trim().toUpperCase();
      const s2 = s2Rows.find((r) => String(r.serviceOrderNo || '').trim().toUpperCase() === orderNo) || {};
      const s3 = s3Rows.find((r) => String(r.serviceOrderNo || '').trim().toUpperCase() === orderNo) || {};
      const s4 = s4Rows.find((r) => String(r.serviceOrderNo || '').trim().toUpperCase() === orderNo) || {};
      const s5 = s5Rows.find((r) => String(r.serviceOrderNo || '').trim().toUpperCase() === orderNo) || {};

      return {
        row: s1.row,
        serviceOrderNo: s1.serviceOrderNo,
        companyName: s1.companyName,
        campaignStartDate: s1.campaignStartDate,
        campaignNo: s1.campaignNo,
        kilnSize: s1.kilnSize,
        kilnNo: s1.kilnNo,
        inspectionIncharge: s1.inspectionIncharge,
        timestamp: s1.timestamp,

        avgTemp: s2.avgTemp,
        avgThickness: s2.avgThickness || s4.avgThickness,
        step2Planned: s2.planned,
        step2Actual: s2.actual,
        step2Delay: s2.delay,
        daysSinceStart: s2.daysSinceStart,
        expectedShutdownDate: s2.expectedShutdownDate || s3.shutdownDate,
        step2Inspector: s2.inspector,

        step3Planned: s3.planned,
        step3Actual: s3.actual,
        step3Delay: s3.delay,
        shutdownDate: s3.shutdownDate,
        step3Status: s3.status,

        step4Planned: s4.planned,
        step4Actual: s4.actual,
        step4Delay: s4.delay,
        step4Inspector: s4.inspector,
        nextCampaignStartDate: s4.nextCampaignStartDate,

        step5Planned: s5.planned,
        step5Actual: s5.actual,
        step5Status: s5.status,
        step5Delay: s5.delay
      };
    });

    return merged;
  } catch (err) {
    console.warn('[GoogleSheets] fetchFullSheetData error:', err.message);
    return null;
  }
}

/**
 * Builds clean app database exclusively from Google Sheet rows.
 * If sheetRows is empty, returns completely empty collections (0 orders).
 */
export function buildAppDataFromSheetRows(sheetRows, currentData = {}) {
  const companies = [...(currentData.companies || SEED_COMPANIES)];
  const kilns = [...(currentData.kilns || SEED_KILNS)];

  // If sheet is empty, return clean empty data (NO MOCK / SEED ORDERS!)
  if (!sheetRows || sheetRows.length === 0) {
    return {
      companies,
      kilns,
      orders: [],
      visits: [],
      runningInspections: [],
      callLogs: [],
      shutdownInspections: [],
      stepTasks: [],
      historicalCampaigns: [],
      settings: currentData.settings || { offsets: { running: 7, call: -3, shutdown: 0, restart: 2 } },
      isSyncedFromSheet: true
    };
  }

  const orders = [];
  const visits = [];
  const runningInspections = [];
  const callLogs = [];
  const shutdownInspections = [];
  const stepTasks = [];

  for (const row of sheetRows) {
    const orderNo = String(row.serviceOrderNo || '').trim();
    if (!orderNo) continue;

    const companyName = String(row.companyName || 'Unknown Plant').trim();
    let company = companies.find((c) => c.name.toLowerCase() === companyName.toLowerCase());
    if (!company) {
      company = {
        id: `c-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: companyName,
        kycNo: 'KYC-001',
        siteIncharge: row.inspectionIncharge || 'Site Incharge',
        mobile: '9876543210'
      };
      companies.push(company);
    }

    const kilnNum = Number(row.kilnNo) || 1;
    const kilnSize = String(row.kilnSize || '100 TPD').trim();
    let kiln = kilns.find((k) => k.companyId === company.id && k.kilnNo === kilnNum);
    if (!kiln) {
      kiln = {
        id: `k-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        companyId: company.id,
        kilnNo: kilnNum,
        size: kilnSize
      };
      kilns.push(kiln);
    }

    const campaignStart = normalizeSheetDate(row.campaignStartDate);
    const expectedShutdown = normalizeSheetDate(row.expectedShutdownDate || row.shutdownDate || '');
    const cleanStatus = String(row.step3Status || '').replace(/^\d+\.\s*/, '').trim();

    const order = {
      serviceOrderNo: orderNo,
      companyId: company.id,
      companyName: companyName,
      kilnId: kiln.id,
      campaignNo: String(row.campaignNo || '1'),
      campaignStartDate: campaignStart,
      expectedShutdownDate: expectedShutdown || '',
      callFollowupStatus: cleanStatus || null,
      inspectionIncharge: row.inspectionIncharge || '',
      status: (row.step5Actual || row.step5Status === 'Closed / Restarted') ? 'closed' : 'open'
    };
    orders.push(order);

    // 1. Visit record
    const existingVisit = (currentData.visits || []).find((v) => v.serviceOrderNo === orderNo);
    visits.push({
      id: existingVisit?.id || `v-${orderNo}`,
      serviceOrderNo: orderNo,
      companyName,
      kilnNo: kilnNum,
      kilnSize,
      campaignNo: String(row.campaignNo || '1'),
      campaignStartDate: campaignStart,
      inspectionIncharge: row.inspectionIncharge || '',
      timestamp: row.timestamp || (campaignStart ? `${campaignStart} 09:00:00` : new Date().toISOString())
    });

    // 2. Running Inspection record
    const existingRunning = (currentData.runningInspections || []).find((r) => r.serviceOrderNo === orderNo);
    if (row.step2Actual || row.avgTemp || row.step2Inspector || existingRunning) {
      runningInspections.push({
        id: existingRunning?.id || `r-${orderNo}`,
        serviceOrderNo: orderNo,
        visitDate: normalizeSheetDate(row.step2Actual) || campaignStart,
        avgTemp: row.avgTemp || existingRunning?.avgTemp || '',
        avgThickness: row.avgThickness || existingRunning?.avgThickness || '',
        daysSinceStart: row.daysSinceStart || existingRunning?.daysSinceStart || '',
        expectedShutdownDate: expectedShutdown || existingRunning?.expectedShutdownDate || '',
        inspector: row.step2Inspector || row.inspectionIncharge || existingRunning?.inspector || '',
        plannedRunningDate: normalizeSheetDate(row.step2Planned) || campaignStart,
        delayDays: Number(row.step2Delay) || 0,
        zones: existingRunning?.zones || [175, 175, 175, 175, 175, 175, 175, 175, 175],
        photos: existingRunning?.photos || {}
      });
    }

    // 3. Call Log record
    const existingCall = (currentData.callLogs || []).find((c) => c.serviceOrderNo === orderNo);
    if (row.step3Actual || cleanStatus || row.shutdownDate || existingCall) {
      callLogs.push({
        callLogNo: existingCall?.callLogNo || `${orderNo} Call-01`,
        timestamp: row.step3Actual ? normalizeSheetDate(row.step3Actual) : (existingCall?.timestamp || new Date().toISOString()),
        serviceOrderNo: orderNo,
        partyName: companyName,
        personCalled: existingCall?.personCalled || company.siteIncharge || 'Site Incharge',
        designation: existingCall?.designation || 'Processor',
        mobile: existingCall?.mobile || company.mobile || '',
        shutdownDateGiven: cleanStatus || existingCall?.shutdownDateGiven || 'Yes Shutdown date taken',
        expectedShutdownDate: cleanStatus.includes('Yes') ? (expectedShutdown || existingCall?.expectedShutdownDate) : null,
        nextCallDate: existingCall?.nextCallDate || null
      });
    }

    // 4. Shutdown Inspection record
    const existingShutdown = (currentData.shutdownInspections || []).find((s) => s.serviceOrderNo === orderNo);
    if (row.step4Actual || row.step4Inspector || row.nextCampaignStartDate || existingShutdown) {
      shutdownInspections.push({
        id: existingShutdown?.id || `s-${orderNo}`,
        serviceOrderNo: orderNo,
        inspectionDate: normalizeSheetDate(row.step4Actual) || existingShutdown?.inspectionDate || '',
        avgThickness: row.avgThickness || existingShutdown?.avgThickness || '',
        inspector: row.step4Inspector || row.inspectionIncharge || existingShutdown?.inspector || '',
        nextCampaignStartDate: normalizeSheetDate(row.nextCampaignStartDate) || existingShutdown?.nextCampaignStartDate || '',
        plannedShutdownDate: normalizeSheetDate(row.step4Planned) || existingShutdown?.plannedShutdownDate || '',
        delayDays: Number(row.step4Delay) || 0,
        photos: existingShutdown?.photos || {}
      });
    }

    // 5. Step Tasks (workflow)
    const step2Actual = normalizeSheetDate(row.step2Actual);
    const step3Actual = normalizeSheetDate(row.step3Actual);
    const step4Actual = normalizeSheetDate(row.step4Actual);
    const step5Actual = normalizeSheetDate(row.step5Actual);

    // Step 1 Task (Done)
    stepTasks.push({
      id: `t-${orderNo}-visit`,
      serviceOrderNo: orderNo,
      step: 'visit',
      owner: 'Sales Co-ordinator',
      plannedDate: campaignStart,
      actualDate: campaignStart,
      delayDays: 0,
      status: 'done'
    });

    // Step 2 Task
    stepTasks.push({
      id: `t-${orderNo}-running`,
      serviceOrderNo: orderNo,
      step: 'running',
      owner: row.step2Inspector || row.inspectionIncharge || 'Sanjay',
      plannedDate: normalizeSheetDate(row.step2Planned) || campaignStart,
      actualDate: step2Actual || null,
      delayDays: Number(row.step2Delay) || 0,
      status: step2Actual ? 'done' : 'pending'
    });

    // Step 3 Task
    const isStep3Done = Boolean(step3Actual || cleanStatus.includes('Yes') || cleanStatus.includes('Forget'));
    stepTasks.push({
      id: `t-${orderNo}-call`,
      serviceOrderNo: orderNo,
      step: 'call',
      owner: 'Sanjay',
      plannedDate: normalizeSheetDate(row.step3Planned) || (expectedShutdown ? addWorkingDays(expectedShutdown, -3) : ''),
      actualDate: step3Actual || (isStep3Done ? (step2Actual || campaignStart) : null),
      delayDays: Number(row.step3Delay) || 0,
      status: isStep3Done ? 'done' : (step2Actual ? 'pending' : 'pending')
    });

    // Step 4 Task
    stepTasks.push({
      id: `t-${orderNo}-shutdown`,
      serviceOrderNo: orderNo,
      step: 'shutdown',
      owner: row.step4Inspector || 'Sanjay',
      plannedDate: normalizeSheetDate(row.step4Planned) || expectedShutdown,
      actualDate: step4Actual || null,
      delayDays: Number(row.step4Delay) || 0,
      status: step4Actual ? 'done' : 'pending'
    });

    // Step 5 Task
    stepTasks.push({
      id: `t-${orderNo}-restart`,
      serviceOrderNo: orderNo,
      step: 'restart',
      owner: 'Sales Co-ordinator',
      plannedDate: normalizeSheetDate(row.step5Planned) || (step4Actual ? addWorkingDays(step4Actual, 2) : ''),
      actualDate: step5Actual || null,
      delayDays: Number(row.step5Delay) || 0,
      status: (step5Actual || row.step5Status === 'Closed / Restarted') ? 'done' : 'pending'
    });
  }

  return {
    companies,
    kilns,
    orders,
    visits,
    runningInspections,
    callLogs,
    shutdownInspections,
    stepTasks,
    historicalCampaigns: currentData.historicalCampaigns || [],
    settings: currentData.settings || { offsets: { running: 7, call: -3, shutdown: 0, restart: 2 } },
    isSyncedFromSheet: true
  };
}

/**
 * Loads entire database from Google Sheet.
 * Updates local cache and returns the synchronized data structure.
 */
export async function loadDataFromGoogleSheet() {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) return null;

  try {
    const rawCached = localStorage.getItem('campaign-life-fms-v1');
    const currentData = rawCached ? JSON.parse(rawCached) : {};

    const sheetRows = await fetchFullSheetData();
    if (sheetRows === null) {
      // Fetch failed or network error
      return null;
    }

    const appData = buildAppDataFromSheetRows(sheetRows, currentData);
    localStorage.setItem('campaign-life-fms-v1', JSON.stringify(appData));
    return appData;
  } catch (err) {
    console.warn('[GoogleSheets] loadDataFromGoogleSheet error:', err.message);
    return null;
  }
}

/**
 * Fetches all registered users from the "Login" tab in Google Sheet.
 */
export async function fetchUsersFromGoogleSheet() {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) return null;

  try {
    const res = await fetch(`${scriptUrl}?sheet=login&t=${Date.now()}`);
    const json = await res.json();
    if (json && json.status === 'success' && Array.isArray(json.users)) {
      return json.users;
    }
    return null;
  } catch (err) {
    console.warn('[GoogleSheets] fetchUsersFromGoogleSheet error:', err.message);
    return null;
  }
}

/**
 * Updates "Last Login" timestamp in Google Sheet for the logged in user
 */
export async function recordUserLoginToGoogleSheet(userId, userName) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) return;

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'recordLogin',
        userId: userId || '',
        name: userName || '',
        timestamp: getCurrentTimestamp()
      })
    });
    console.log(`[GoogleSheets] Login recorded for ${userId || userName}`);
  } catch (err) {
    console.warn('[GoogleSheets] recordUserLoginToGoogleSheet error:', err.message);
  }
}

/**
 * Adds a new user to the "Login" tab in Google Sheet
 */
export async function addUserToGoogleSheet(userData) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) return { status: 'error', message: 'No Google Apps Script URL configured' };

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'addUser',
        userData
      })
    });
    return { status: 'success' };
  } catch (err) {
    console.warn('[GoogleSheets] addUserToGoogleSheet error:', err.message);
    return { status: 'error', message: err.message };
  }
}

/**
 * Updates full user profile details (Name, Password, Role, Status, Access) in Google Sheet "Login" tab
 */
export async function updateUserToGoogleSheet(userData) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) return { status: 'error', message: 'No Google Apps Script URL configured' };

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateUser',
        userId: userData.userId || '',
        name: userData.name || '',
        password: userData.password !== undefined ? userData.password : '',
        role: userData.role || '',
        status: userData.status || 'Active',
        access: userData.access || 'All',
        timestamp: getCurrentTimestamp()
      })
    });
    return { status: 'success' };
  } catch (err) {
    console.warn('[GoogleSheets] updateUserToGoogleSheet error:', err.message);
    return { status: 'error', message: err.message };
  }
}

/**
 * Updates page access permissions for a specific user in Google Sheet "Login" tab
 */
export async function updateUserAccessToGoogleSheet(userId, accessString) {
  return updateUserToGoogleSheet({ userId, access: accessString });
}

/**
 * Delete a specific order from Google Sheet
 */
export async function deleteOrderFromGoogleSheet(serviceOrderNo) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl || !serviceOrderNo) return;

  const payload = {
    action: 'delete',
    serviceOrderNo: serviceOrderNo.trim()
  };

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    console.log(`[GoogleSheets] Delete dispatched for ${serviceOrderNo}`);
  } catch (err) {
    console.warn(`[GoogleSheets] Delete error for ${serviceOrderNo}:`, err.message);
  }
}

/**
 * Sync entire order state across all steps
 */
export async function syncFullOrderToGoogleSheet(order, fullData) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl || !order?.serviceOrderNo) return;

  const visit = (fullData.visits || []).find((v) => v.serviceOrderNo === order.serviceOrderNo);
  const company = (fullData.companies || []).find((c) => c.id === order.companyId);
  const kiln = (fullData.kilns || []).find((k) => k.id === order.kilnId);
  const running = (fullData.runningInspections || []).find((r) => r.serviceOrderNo === order.serviceOrderNo);
  const calls = (fullData.callLogs || []).filter((c) => c.serviceOrderNo === order.serviceOrderNo);
  const lastCall = calls[0];
  const shutdown = (fullData.shutdownInspections || []).find((s) => s.serviceOrderNo === order.serviceOrderNo);

  const payload = {
    step: 'full',
    serviceOrderNo: order.serviceOrderNo,
    timestamp: getCurrentTimestamp(),
    data: {
      serviceOrderNo: order.serviceOrderNo,
      companyName: visit?.companyName || company?.name || 'Unknown Plant',
      campaignStartDate: order.campaignStartDate,
      campaignNo: order.campaignNo,
      kilnSize: kiln?.size || visit?.kilnSize || '',
      kilnNo: kiln?.kilnNo || visit?.kilnNo || '',
      inspectionIncharge: visit?.inspectionIncharge || order.inspectionIncharge || '',
      
      // Step 2
      avgTemp: running?.avgTemp || '',
      daysSinceStart: running?.daysSinceStart || '',
      expectedShutdownDate: order.expectedShutdownDate || running?.expectedShutdownDate || '',
      inspectorStep2: running?.inspector || '',
      actualStep2: running ? (running.visitDate || getCurrentTimestamp()) : '',
      
      // Step 3
      shutdownDate: lastCall?.expectedShutdownDate || (lastCall?.shutdownDateGiven?.includes('Yes') ? order.expectedShutdownDate : ''),
      statusStep3: (lastCall?.shutdownDateGiven || order.callFollowupStatus || '').replace(/^\d+\.\s*/, '').trim(),
      actualStep3: lastCall?.timestamp ? new Date(lastCall.timestamp).toLocaleDateString('en-GB') : '',
      
      // Step 4
      avgThickness: shutdown?.avgThickness || '',
      inspectorStep4: shutdown?.inspector || '',
      nextCampaignStartDate: shutdown?.nextCampaignStartDate || '',
      actualStep4: shutdown?.inspectionDate || '',
      
      // Step 5
      statusStep5: order.status === 'closed' ? 'Closed / Restarted' : 'Active'
    }
  };

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn(`[GoogleSheets] Full order sync error for ${order.serviceOrderNo}:`, err.message);
  }
}

/**
 * Google Apps Script Code to be pasted into the user's spreadsheet
 * Extensions > Apps Script
 */
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ============================================================================
 * Campaign Life FMS - Google Sheets Live Sync Automation
 * Spreadsheet ID: 1-bRJ23ObGsU0mftvXsMUtfXLKGK8J-PL7kp6BrOsY8g
 * ============================================================================
 * RULES ENFORCED:
 * 1. "Planned" and "Delay" columns are NEVER overwritten if they have any formula or existing value.
 * 2. When a step is submitted in the app, that step's "Actual" column is set as a genuine
 *    Google Sheets Date/Time object (formatted dd/MM/yyyy HH:mm:ss) so all formulas
 *    (=INT(Actual) - INT(Planned), Delay calculations, etc.) work without #VALUE! errors.
 * 3. Rows start strictly at Row 7 and fill sequentially (Row 7, Row 8, Row 9...).
 */

const START_ROW = 7;

// 1-Based Column Indexes matching Sheet Row 6 headings:
const COLS = {
  // Step 1: Company Visit
  TIMESTAMP: 1,           // Col A: Time Stamp
  SERVICE_ORDER_NO: 2,    // Col B: Service Order No.
  COMPANY_NAME: 3,        // Col C: Name Of The Company
  CAMPAIGN_START_DATE: 4, // Col D: Date Of Campaign Starting
  CAMPAIGN_NO: 5,         // Col E: Campaign No.
  KILN_SIZE: 6,           // Col F: Size Of Kiln
  KILN_NO: 7,             // Col G: Kiln No.
  INSPECTION_INCHARGE: 8, // Col H: Name of Inspection Incharge
  
  // Step 2: Running Kiln Inspection
  AVG_TEMP: 9,            // Col I: Avg. Temp. Of kiln
  AVG_THICKNESS: 10,      // Col J: Avg Thickness of kiln
  STEP2_PLANNED: 11,      // Col K: Planned (PROTECTED)
  STEP2_ACTUAL: 12,       // Col L: Actual (TIMESTAMP - Real Date Object)
  STEP2_DELAY: 13,        // Col M: Delay (PROTECTED)
  DAYS_SINCE_START: 14,   // Col N: No. of days since kiln start
  EXPECTED_SHUTDOWN: 15,  // Col O: Expected Shutdown date
  STEP2_INSPECTOR: 16,    // Col P: Inspector Incharge
  
  // Step 3: Take Shut Down date
  STEP3_PLANNED: 17,      // Col Q: Planned (PROTECTED)
  STEP3_ACTUAL: 18,       // Col R: Actual (TIMESTAMP - Real Date Object)
  STEP3_TIME_DELAY: 19,   // Col S: Time Delay (PROTECTED)
  SHUTDOWN_DATE_GIVEN: 20,// Col T: Shut Down Date
  STEP3_STATUS: 21,       // Col U: Status
  
  // Step 4: Shutdown Inspection
  STEP4_PLANNED: 22,      // Col V: Planned (PROTECTED)
  STEP4_ACTUAL: 23,       // Col W: Actual (TIMESTAMP - Real Date Object)
  STEP4_DELAY: 24,        // Col X: Delay (PROTECTED)
  STEP4_INSPECTOR: 25,    // Col Y: Inspector Incharge
  NEXT_START_DATE: 26,    // Col Z: Campaign Starting Date
  
  // Step 5: Restart the Process
  STEP5_PLANNED: 27,      // Col AA: Planned (PROTECTED)
  STEP5_ACTUAL: 28,       // Col AB: Actual (TIMESTAMP - Real Date Object)
  STEP5_STATUS: 29,       // Col AC: Status
  STEP5_DELAY: 30         // Col AD: Delay (PROTECTED)
};

// Parses multiple string formats into genuine JavaScript Date object
function parseToDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const s = val.trim();
    // 1. Check DD/MM/YYYY HH:mm:ss or DD-MM-YYYY HH:mm:ss
    const dmyTime = s.match(/^(\\d{1,2})[-\\/](\\d{1,2})[-\\/](\\d{4})\\s+(\\d{1,2}):(\\d{1,2}):?(\\d{1,2})?/);
    if (dmyTime) {
      return new Date(
        parseInt(dmyTime[3], 10),
        parseInt(dmyTime[2], 10) - 1,
        parseInt(dmyTime[1], 10),
        parseInt(dmyTime[4], 10),
        parseInt(dmyTime[5], 10),
        parseInt(dmyTime[6] || 0, 10)
      );
    }
    // 2. Check ISO format YYYY-MM-DD
    const isoDate = s.match(/^(\\d{4})[-\\/](\\d{1,2})[-\\/](\\d{1,2})/);
    if (isoDate) {
      return new Date(
        parseInt(isoDate[1], 10),
        parseInt(isoDate[2], 10) - 1,
        parseInt(isoDate[3], 10)
      );
    }
    // 3. Check DD/MM/YYYY or DD-MM-YYYY
    const dmyDate = s.match(/^(\\d{1,2})[-\\/](\\d{1,2})[-\\/](\\d{4})/);
    if (dmyDate) {
      return new Date(
        parseInt(dmyDate[3], 10),
        parseInt(dmyDate[2], 10) - 1,
        parseInt(dmyDate[1], 10)
      );
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Sets cell as a real Date/Time serial number so formulas like L7-K7 work smoothly
function setTimestampCell(sheet, row, col, val) {
  const dateObj = parseToDate(val) || new Date();
  const cell = sheet.getRange(row, col);
  cell.setValue(dateObj);
  cell.setNumberFormat("dd/MM/yyyy HH:mm:ss");
}

// Sets cell as a real Date serial number
function setDateCell(sheet, row, col, val) {
  if (!val) return;
  const dateObj = parseToDate(val);
  const cell = sheet.getRange(row, col);
  if (dateObj) {
    cell.setValue(dateObj);
    cell.setNumberFormat("dd/MM/yyyy");
  } else {
    cell.setValue(val);
  }
}

// Finds existing row for Service Order No within active range
function findRowByServiceOrder(sheet, serviceOrderNo) {
  const maxRows = Math.min(sheet.getMaxRows(), 500);
  const values = sheet.getRange(START_ROW, COLS.SERVICE_ORDER_NO, maxRows - START_ROW + 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    const val = String(values[i][0] || '').trim();
    if (val.toUpperCase() === String(serviceOrderNo).trim().toUpperCase()) {
      return START_ROW + i;
    }
  }
  return -1;
}

// Finds the first empty row starting from Row 7 downwards (or replaces temporary TEST-01)
function findFirstAvailableRow(sheet) {
  const maxRows = Math.min(sheet.getMaxRows(), 500);
  const values = sheet.getRange(START_ROW, COLS.SERVICE_ORDER_NO, maxRows - START_ROW + 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    const val = String(values[i][0] || '').trim();
    if (!val || val.toUpperCase() === 'TEST-01') {
      return START_ROW + i;
    }
  }
  return START_ROW + values.length;
}

// Cleans up any misplaced rows created at bottom (e.g. row 1000+)
function cleanupMisplacedRows(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow >= 1000) {
      for (let r = lastRow; r >= 1000; r--) {
        const order = String(sheet.getRange(r, COLS.SERVICE_ORDER_NO).getValue() || '').trim();
        if (order) {
          sheet.getRange(r, 1, 1, 30).clearContent();
        }
      }
    }
  } catch (err) {}
}

// Safely sets a cell value WITHOUT overwriting Planned or Delay if a formula or value exists
function setCellSafe(sheet, row, col, value, isProtected) {
  if (value === undefined || value === null || value === '') return;
  const cell = sheet.getRange(row, col);
  if (isProtected) {
    const formula = cell.getFormula();
    const existing = cell.getValue();
    if (formula || (existing !== '' && existing !== null && existing !== undefined)) {
      return; // NEVER OVERWRITE PLANNED OR DELAY
    }
  }
  cell.setValue(value);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ACTION: RECORD USER LOGIN IN "LOGIN" SHEET
    if (payload.action === 'recordLogin' || payload.action === 'login') {
      let loginSheet = ss.getSheetByName('Login Page') || ss.getSheetByName('Login') || ss.getSheetByName('login') || ss.getSheetByName('login page') || ss.getSheetByName('Users');
      if (loginSheet) {
        const lastRow = loginSheet.getLastRow();
        const lastCol = Math.max(loginSheet.getLastColumn(), 8);
        if (lastRow >= 2) {
          const data = loginSheet.getRange(1, 1, lastRow, lastCol).getValues();
          const headers = data[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
          const colUserId = headers.findIndex(function(h) { return h.indexOf('user') !== -1 || h.indexOf('id') !== -1 || h.indexOf('login') !== -1 || h.indexOf('username') !== -1; });
          const colName = headers.findIndex(function(h) { return h.indexOf('name') !== -1 || h.indexOf('incharge') !== -1; });
          let colLastLogin = headers.findIndex(function(h) { return h.indexOf('login') !== -1 && (h.indexOf('last') !== -1 || h.indexOf('time') !== -1 || h.indexOf('date') !== -1); });
          if (colLastLogin === -1) colLastLogin = 7;
          
          const target = String(payload.userId || payload.username || payload.name || '').trim().toLowerCase();
          const nowStr = Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy HH:mm:ss");
          
          for (let i = 1; i < data.length; i++) {
            const uId = String(data[i][colUserId !== -1 ? colUserId : 0] || '').trim().toLowerCase();
            const uName = String(data[i][colName !== -1 ? colName : 1] || '').trim().toLowerCase();
            if (uId === target || uName === target) {
              loginSheet.getRange(i + 1, colLastLogin + 1).setValue(nowStr);
              break;
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', action: 'login_recorded' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ACTION: ADD USER TO "LOGIN" SHEET
    if (payload.action === 'addUser') {
      let loginSheet = ss.getSheetByName('Login Page') || ss.getSheetByName('Login') || ss.getSheetByName('login') || ss.getSheetByName('login page') || ss.getSheetByName('Users');
      if (!loginSheet) {
        loginSheet = ss.insertSheet('Login');
        loginSheet.appendRow(['User ID', 'Name', 'Password', 'Role', 'Status', 'Access', 'Last Login']);
      }
      const u = payload.userData || payload;
      loginSheet.appendRow([
        String(u.userId || '').trim(),
        String(u.name || '').trim(),
        String(u.password || '').trim(),
        String(u.role || 'Inspector').trim(),
        String(u.status || 'Active').trim(),
        String(u.access || 'All').trim(),
        ''
      ]);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', action: 'user_added' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ACTION: UPDATE USER DETAILS (NAME, ROLE, PASSWORD, STATUS, ACCESS)
    if (payload.action === 'updateUser' || payload.action === 'updateUserAccess') {
      let loginSheet = ss.getSheetByName('Login Page') || ss.getSheetByName('Login') || ss.getSheetByName('login') || ss.getSheetByName('login page') || ss.getSheetByName('Users');
      if (loginSheet) {
        const lastRow = loginSheet.getLastRow();
        const lastCol = Math.max(loginSheet.getLastColumn(), 8);
        if (lastRow >= 1) {
          const data = loginSheet.getRange(1, 1, lastRow, lastCol).getValues();
          const headers = data[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
          const colUserId = headers.findIndex(function(h) { return h.indexOf('user') !== -1 || h.indexOf('id') !== -1 || h.indexOf('login') !== -1; });
          const colName = headers.findIndex(function(h) { return h.indexOf('name') !== -1; });
          const colPass = headers.findIndex(function(h) { return h.indexOf('pass') !== -1 || h.indexOf('pin') !== -1; });
          const colRole = headers.findIndex(function(h) { return h.indexOf('role') !== -1 || h.indexOf('type') !== -1; });
          const colStatus = headers.findIndex(function(h) { return h.indexOf('status') !== -1; });
          let colAccess = headers.findIndex(function(h) { return h.indexOf('access') !== -1 || h.indexOf('perm') !== -1 || h.indexOf('page') !== -1; });
          
          if (colAccess === -1) {
            colAccess = 5;
            loginSheet.getRange(1, colAccess + 1).setValue('Access');
          }
          
          const target = String(payload.userId || payload.name || '').trim().toLowerCase();
          
          for (let i = 1; i < data.length; i++) {
            const uId = String(data[i][colUserId !== -1 ? colUserId : 0] || '').trim().toLowerCase();
            const uName = String(data[i][colName !== -1 ? colName : 1] || '').trim().toLowerCase();
            if (uId === target || uName === target) {
              const r = i + 1;
              if (payload.name && colName !== -1) loginSheet.getRange(r, colName + 1).setValue(String(payload.name).trim());
              if (payload.password !== undefined && payload.password !== null && colPass !== -1) loginSheet.getRange(r, colPass + 1).setValue(String(payload.password).trim());
              if (payload.role && colRole !== -1) loginSheet.getRange(r, colRole + 1).setValue(String(payload.role).trim());
              if (payload.status && colStatus !== -1) loginSheet.getRange(r, colStatus + 1).setValue(String(payload.status).trim());
              if (payload.access !== undefined && payload.access !== null && colAccess !== -1) loginSheet.getRange(r, colAccess + 1).setValue(String(payload.access).trim());
              break;
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', action: 'user_updated' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const sheet = ss.getActiveSheet();
    
    // Clean up any row past 1000 from initial tests
    cleanupMisplacedRows(sheet);
    
    const step = payload.step;
    const data = payload.data || {};
    const serviceOrderNo = String(payload.serviceOrderNo || data.serviceOrderNo || '').trim();
    
    if (!serviceOrderNo) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'serviceOrderNo is required' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ACTION: DELETE ROW
    if (payload.action === 'delete') {
      const row = findRowByServiceOrder(sheet, serviceOrderNo);
      if (row !== -1) {
        sheet.getRange(row, 1, 1, 30).clearContent();
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          action: 'deleted',
          row: row,
          serviceOrderNo: serviceOrderNo
        })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Order not found to delete' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Find row: look for existing order first, or place on the first empty row starting at Row 7
    let row = findRowByServiceOrder(sheet, serviceOrderNo);
    if (row === -1) {
      row = findFirstAvailableRow(sheet);
      sheet.getRange(row, COLS.SERVICE_ORDER_NO).setValue(serviceOrderNo);
    }
    
    const now = new Date();
    
    // STEP 1: Company Visit
    if (step === 1 || step === 'visit' || step === 'full') {
      setTimestampCell(sheet, row, COLS.TIMESTAMP, payload.timestamp || now);
      setCellSafe(sheet, row, COLS.SERVICE_ORDER_NO, serviceOrderNo);
      setCellSafe(sheet, row, COLS.COMPANY_NAME, data.companyName);
      setDateCell(sheet, row, COLS.CAMPAIGN_START_DATE, data.campaignStartDate);
      setCellSafe(sheet, row, COLS.CAMPAIGN_NO, data.campaignNo);
      setCellSafe(sheet, row, COLS.KILN_SIZE, data.kilnSize);
      setCellSafe(sheet, row, COLS.KILN_NO, data.kilnNo);
      setCellSafe(sheet, row, COLS.INSPECTION_INCHARGE, data.inspectionIncharge);
      if (data.plannedRunningDate) {
        setDateCell(sheet, row, COLS.STEP2_PLANNED, data.plannedRunningDate);
      }
    }
    
    // STEP 2: Running Kiln Inspection
    if (step === 2 || step === 'running' || (step === 'full' && data.actualStep2)) {
      if (data.avgTemp) setCellSafe(sheet, row, COLS.AVG_TEMP, data.avgTemp);
      setTimestampCell(sheet, row, COLS.STEP2_ACTUAL, data.actualStep2 || now);
      if (data.daysSinceStart) setCellSafe(sheet, row, COLS.DAYS_SINCE_START, data.daysSinceStart);
      if (data.expectedShutdownDate) setDateCell(sheet, row, COLS.EXPECTED_SHUTDOWN, data.expectedShutdownDate);
      if (data.inspector || data.inspectorStep2) setCellSafe(sheet, row, COLS.STEP2_INSPECTOR, data.inspector || data.inspectorStep2);
      if (data.plannedCallDate) {
        setDateCell(sheet, row, COLS.STEP3_PLANNED, data.plannedCallDate);
      }
    }
    
    // STEP 3: Take Shut Down date
    if (step === 3 || step === 'call' || (step === 'full' && data.actualStep3)) {
      setTimestampCell(sheet, row, COLS.STEP3_ACTUAL, data.actualStep3 || now);
      if (data.expectedShutdownDate || data.shutdownDate) {
        setDateCell(sheet, row, COLS.SHUTDOWN_DATE_GIVEN, data.expectedShutdownDate || data.shutdownDate);
      }
      if (data.status || data.statusStep3 || data.shutdownDateGiven) {
        var rawStatus = String(data.status || data.statusStep3 || data.shutdownDateGiven || '');
        var cleanStatus = rawStatus.replace(/^\d+\.\s*/, '').trim();
        setCellSafe(sheet, row, COLS.STEP3_STATUS, cleanStatus);
      }
      if (data.plannedShutdownDate) {
        setDateCell(sheet, row, COLS.STEP4_PLANNED, data.plannedShutdownDate);
      }
    }
    
    // STEP 4: Shutdown Inspection
    if (step === 4 || step === 'shutdown' || (step === 'full' && data.actualStep4)) {
      if (data.avgThickness) setCellSafe(sheet, row, COLS.AVG_THICKNESS, data.avgThickness);
      setTimestampCell(sheet, row, COLS.STEP4_ACTUAL, data.actualStep4 || now);
      if (data.inspector || data.inspectorStep4) setCellSafe(sheet, row, COLS.STEP4_INSPECTOR, data.inspector || data.inspectorStep4);
      if (data.nextCampaignStartDate) setDateCell(sheet, row, COLS.NEXT_START_DATE, data.nextCampaignStartDate);
      if (data.plannedRestartDate) {
        setDateCell(sheet, row, COLS.STEP5_PLANNED, data.plannedRestartDate);
      }
    }
    
    // STEP 5: Restart the Process
    if (step === 5 || step === 'restart' || (step === 'full' && data.statusStep5)) {
      setTimestampCell(sheet, row, COLS.STEP5_ACTUAL, now);
      setCellSafe(sheet, row, COLS.STEP5_STATUS, data.status || data.statusStep5 || 'Completed');
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      row: row,
      serviceOrderNo: serviceOrderNo,
      timestamp: Utilities.formatDate(now, "Asia/Kolkata", "dd/MM/yyyy HH:mm:ss")
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. SUPPORT FOR LOGIN SHEET (tab name: "Login")
  const sheetParam = e && e.parameter ? (e.parameter.sheet || e.parameter.tab || '') : '';
  const actionParam = e && e.parameter ? e.parameter.action : '';
  
  if (sheetParam.toLowerCase() === 'login' || sheetParam.toLowerCase() === 'login page' || actionParam === 'getUsers') {
    let loginSheet = ss.getSheetByName('Login Page') || ss.getSheetByName('Login') || ss.getSheetByName('login') || ss.getSheetByName('login page') || ss.getSheetByName('Users');
    if (!loginSheet) {
      // Auto-create Login sheet with headers if not present
      loginSheet = ss.insertSheet('Login');
      const headers = ['User ID', 'Name', 'Password', 'Role', 'Status', 'Access', 'Last Login'];
      loginSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      loginSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E8F0FE');
      loginSheet.appendRow(['admin', 'Admin User', '123', 'Admin', 'Active', 'All', '']);
      loginSheet.appendRow(['sanjay', 'Sanjay Singh', '123', 'Inspector', 'Active', 'dashboard, running, take-shutdown-date, shutdown-inspection', '']);
      loginSheet.appendRow(['ahitesh', 'Ahitesh', '123', 'Sales Co-ordinator', 'Active', 'dashboard, visit, take-shutdown-date, restart-process, masters', '']);
    } else if (loginSheet.getLastRow() <= 1) {
      // If sheet exists with only header, populate initial users
      loginSheet.appendRow(['admin', 'Admin User', '123', 'Admin', 'Active', 'All', '']);
      loginSheet.appendRow(['sanjay', 'Sanjay Singh', '123', 'Inspector', 'Active', 'dashboard, running, take-shutdown-date, shutdown-inspection', '']);
      loginSheet.appendRow(['ahitesh', 'Ahitesh', '123', 'Sales Co-ordinator', 'Active', 'dashboard, visit, take-shutdown-date, restart-process, masters', '']);
    }
    
    const lastRow = loginSheet.getLastRow();
    const lastCol = Math.max(loginSheet.getLastColumn(), 7);
    const users = [];
    
    if (lastRow >= 2) {
      const data = loginSheet.getRange(1, 1, lastRow, lastCol).getValues();
      const headers = data[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
      
      const colUserId = headers.findIndex(function(h) { return h.indexOf('user') !== -1 || h.indexOf('id') !== -1 || h.indexOf('login') !== -1; });
      const colName = headers.findIndex(function(h) { return h.indexOf('name') !== -1; });
      const colPass = headers.findIndex(function(h) { return h.indexOf('pass') !== -1 || h.indexOf('pin') !== -1; });
      const colRole = headers.findIndex(function(h) { return h.indexOf('role') !== -1 || h.indexOf('designation') !== -1; });
      const colStatus = headers.findIndex(function(h) { return h.indexOf('status') !== -1 || h.indexOf('active') !== -1; });
      const colAccess = headers.findIndex(function(h) { return h.indexOf('access') !== -1 || h.indexOf('perm') !== -1 || h.indexOf('page') !== -1; });
      const colLastLogin = headers.findIndex(function(h) { return h.indexOf('login') !== -1 && (h.indexOf('last') !== -1 || h.indexOf('time') !== -1); });

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const uId = String(row[colUserId !== -1 ? colUserId : 0] || '').trim();
        const uName = String(row[colName !== -1 ? colName : 1] || '').trim();
        if (!uId && !uName) continue;
        
        const rawRole = String(row[colRole !== -1 ? colRole : 3] || 'Inspector').trim();
        const rawAccess = colAccess !== -1 ? String(row[colAccess] || '').trim() : '';

        users.push({
          row: i + 1,
          userId: uId || uName.toLowerCase().replace(/\s+/g, ''),
          name: uName || uId,
          password: String(row[colPass !== -1 ? colPass : 2] || '').trim(),
          role: rawRole,
          status: String(row[colStatus !== -1 ? colStatus : 4] || 'Active').trim(),
          access: rawAccess || (rawRole.toLowerCase().includes('admin') ? 'All' : ''),
          lastLogin: String(row[colLastLogin !== -1 ? colLastLogin : 6] || '').trim()
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      sheet: 'Login',
      total: users.length,
      users: users
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 2. FMS MAIN SHEET HANDLING
  const sheet = ss.getActiveSheet();
  const maxRows = Math.min(sheet.getMaxRows(), 500);
  const stepParam = e && e.parameter ? e.parameter.step : null;
  const orderParam = e && e.parameter ? e.parameter.orderNo : null;
  
  const result = [];
  if (maxRows >= START_ROW) {
    const data = sheet.getRange(START_ROW, 1, maxRows - START_ROW + 1, 30).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowNum = START_ROW + i;
      const order = String(data[i][COLS.SERVICE_ORDER_NO - 1] || '').trim();
      if (!order) continue;
      
      // Filter by orderNo if requested
      if (orderParam && order.toUpperCase() !== String(orderParam).trim().toUpperCase()) {
        continue;
      }
      
      // Granular step-targeted response (NO SELECT * OVERKILL)
      if (stepParam == '1' || stepParam === 'visit') {
        result.push({
          row: rowNum,
          serviceOrderNo: order,
          companyName: data[i][COLS.COMPANY_NAME - 1],
          campaignStartDate: data[i][COLS.CAMPAIGN_START_DATE - 1],
          campaignNo: data[i][COLS.CAMPAIGN_NO - 1],
          kilnSize: data[i][COLS.KILN_SIZE - 1],
          kilnNo: data[i][COLS.KILN_NO - 1],
          inspectionIncharge: data[i][COLS.INSPECTION_INCHARGE - 1],
          timestamp: data[i][COLS.TIMESTAMP - 1]
        });
      } else if (stepParam == '2' || stepParam === 'running') {
        result.push({
          row: rowNum,
          serviceOrderNo: order,
          inspectionIncharge: data[i][COLS.INSPECTION_INCHARGE - 1],
          avgTemp: data[i][COLS.AVG_TEMP - 1],
          avgThickness: data[i][COLS.AVG_THICKNESS - 1],
          planned: data[i][COLS.STEP2_PLANNED - 1],
          actual: data[i][COLS.STEP2_ACTUAL - 1],
          delay: data[i][COLS.STEP2_DELAY - 1],
          daysSinceStart: data[i][COLS.DAYS_SINCE_START - 1],
          expectedShutdownDate: data[i][COLS.EXPECTED_SHUTDOWN - 1],
          inspector: data[i][COLS.STEP2_INSPECTOR - 1]
        });
      } else if (stepParam == '3' || stepParam === 'call') {
        result.push({
          row: rowNum,
          serviceOrderNo: order,
          planned: data[i][COLS.STEP3_PLANNED - 1],
          actual: data[i][COLS.STEP3_ACTUAL - 1],
          delay: data[i][COLS.STEP3_TIME_DELAY - 1],
          shutdownDate: data[i][COLS.SHUTDOWN_DATE_GIVEN - 1],
          status: data[i][COLS.STEP3_STATUS - 1]
        });
      } else if (stepParam == '4' || stepParam === 'shutdown') {
        result.push({
          row: rowNum,
          serviceOrderNo: order,
          planned: data[i][COLS.STEP4_PLANNED - 1],
          actual: data[i][COLS.STEP4_ACTUAL - 1],
          delay: data[i][COLS.STEP4_DELAY - 1],
          inspector: data[i][COLS.STEP4_INSPECTOR - 1],
          nextCampaignStartDate: data[i][COLS.NEXT_START_DATE - 1]
        });
      } else if (stepParam == '5' || stepParam === 'restart') {
        result.push({
          row: rowNum,
          serviceOrderNo: order,
          planned: data[i][COLS.STEP5_PLANNED - 1],
          actual: data[i][COLS.STEP5_ACTUAL - 1],
          status: data[i][COLS.STEP5_STATUS - 1],
          delay: data[i][COLS.STEP5_DELAY - 1]
        });
      } else {
        result.push({
          row: rowNum,
          serviceOrderNo: order,
          companyName: data[i][COLS.COMPANY_NAME - 1],
          campaignStartDate: data[i][COLS.CAMPAIGN_START_DATE - 1],
          campaignNo: data[i][COLS.CAMPAIGN_NO - 1],
          kilnSize: data[i][COLS.KILN_SIZE - 1],
          kilnNo: data[i][COLS.KILN_NO - 1],
          inspectionIncharge: data[i][COLS.INSPECTION_INCHARGE - 1],
          timestamp: data[i][COLS.TIMESTAMP - 1],
          
          avgTemp: data[i][COLS.AVG_TEMP - 1],
          avgThickness: data[i][COLS.AVG_THICKNESS - 1],
          step2Planned: data[i][COLS.STEP2_PLANNED - 1],
          step2Actual: data[i][COLS.STEP2_ACTUAL - 1],
          step2Delay: data[i][COLS.STEP2_DELAY - 1],
          daysSinceStart: data[i][COLS.DAYS_SINCE_START - 1],
          expectedShutdownDate: data[i][COLS.EXPECTED_SHUTDOWN - 1],
          step2Inspector: data[i][COLS.STEP2_INSPECTOR - 1],
          
          step3Planned: data[i][COLS.STEP3_PLANNED - 1],
          step3Actual: data[i][COLS.STEP3_ACTUAL - 1],
          step3Delay: data[i][COLS.STEP3_TIME_DELAY - 1],
          shutdownDate: data[i][COLS.SHUTDOWN_DATE_GIVEN - 1],
          step3Status: String(data[i][COLS.STEP3_STATUS - 1] || '').replace(/^\d+\.\s*/, '').trim(),
          
          step4Planned: data[i][COLS.STEP4_PLANNED - 1],
          step4Actual: data[i][COLS.STEP4_ACTUAL - 1],
          step4Delay: data[i][COLS.STEP4_DELAY - 1],
          step4Inspector: data[i][COLS.STEP4_INSPECTOR - 1],
          nextCampaignStartDate: data[i][COLS.NEXT_START_DATE - 1],
          
          step5Planned: data[i][COLS.STEP5_PLANNED - 1],
          step5Actual: data[i][COLS.STEP5_ACTUAL - 1],
          step5Status: data[i][COLS.STEP5_STATUS - 1],
          step5Delay: data[i][COLS.STEP5_DELAY - 1]
        });
      }
    }
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    step: stepParam || 'all',
    total: result.length,
    rows: result
  })).setMimeType(ContentService.MimeType.JSON);
}
`;
