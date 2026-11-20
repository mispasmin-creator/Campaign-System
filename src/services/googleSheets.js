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

import { SEED_COMPANIES, SEED_KILNS } from './storage.js';
import { addWorkingDays } from '../utils/workflow.js';
import { normalizeUserRole } from './auth.js';

const STORAGE_SCRIPT_KEY = 'campaign_fms_google_script_url';
export const SPREADSHEET_ID = '1-bRJ23ObGsU0mftvXsMUtfXLKGK8J-PL7kp6BrOsY8g';
export const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=0#gid=0`;
const ENV_SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL;
export const DEFAULT_SCRIPT_URL = ENV_SCRIPT_URL?.trim() || 'https://script.google.com/macros/s/AKfycbxIVPnIDnFUW24BoePkYUqq_AISp66egDyRX95Oj_nUIgpXW8VwERGZQtx0HvsCK53f/exec';

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

  // Google Visualization format: Date(YYYY, MM, DD) where MM is 0-indexed
  const gvizDate = s.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/);
  if (gvizDate) {
    const year = gvizDate[1];
    const month = String(parseInt(gvizDate[2], 10) + 1).padStart(2, '0');
    const day = String(gvizDate[3]).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

function formatImportedCallLogNo(serviceOrderNo, rawCallLogNo, fallbackNo = 1) {
  const match = String(rawCallLogNo || '').match(/Call\s*-\s*(\d+)/i);
  const sequence = match ? Number(match[1]) : fallbackNo;
  const cleanOrder = String(serviceOrderNo || '').trim().replace(/\s+/g, '').replace(/^CN-0*(\d+)/i, 'CN$1');
  return `${cleanOrder}Call-${String(sequence).padStart(2, '0')}`;
}

function isSheetDateValue(value) {
  return /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/.test(String(value || '').trim());
}

/**
 * Normalizes any timestamp representation into a standard ISO-8601 string
 */
export function normalizeTimestampToISO(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  const s = String(val).trim();
  const gvizDate = s.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}))?)?\)/);
  if (gvizDate) {
    const d = new Date(
      parseInt(gvizDate[1], 10),
      parseInt(gvizDate[2], 10),
      parseInt(gvizDate[3], 10),
      parseInt(gvizDate[4] || 0, 10),
      parseInt(gvizDate[5] || 0, 10),
      parseInt(gvizDate[6] || 0, 10)
    );
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const dmyTime = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (dmyTime) {
    const d = new Date(
      parseInt(dmyTime[3], 10),
      parseInt(dmyTime[2], 10) - 1,
      parseInt(dmyTime[1], 10),
      parseInt(dmyTime[4], 10),
      parseInt(dmyTime[5], 10),
      parseInt(dmyTime[6] || 0, 10)
    );
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return s;
}

/**
 * Returns currently configured Google Apps Script Web App URL
 */
export function getGoogleScriptUrl() {
  try {
    const saved = localStorage.getItem(STORAGE_SCRIPT_KEY);
    return ENV_SCRIPT_URL?.trim() || (saved && saved.trim() ? saved.trim() : DEFAULT_SCRIPT_URL);
  } catch {
    return ENV_SCRIPT_URL?.trim() || DEFAULT_SCRIPT_URL;
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
  if (!currentData) return { changed: 0, message: 'No current data' };

  try {
    let sheetRows = [];
    const json = await fetchStepDataFromGoogleSheet(step);
    if (json && json.status === 'success' && Array.isArray(json.rows) && json.rows.length > 0) {
      sheetRows = json.rows;
    } else {
      const gvizRows = await fetchFullSheetDataViaGviz();
      if (Array.isArray(gvizRows)) {
        sheetRows = gvizRows;
      }
    }

    if (!Array.isArray(sheetRows) || sheetRows.length === 0) {
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
 * Fetches all order rows from the Google Sheet across all steps,
 * plus detailed records from the dedicated "Running Kiln Inspection" tab.
 */
export async function fetchFullSheetData() {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) return fetchFullSheetDataViaGviz();

  try {
    // Attempt 1: Concurrently query main sheet (step=all), "Running Kiln Inspection", and "Followup for Shutdown"
    const [resAll, resRunning, resFollowup, resShutdown] = await Promise.all([
      fetch(`${scriptUrl}?step=all&t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch(`${scriptUrl}?sheet=Running%20Kiln%20Inspection&t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch(`${scriptUrl}?sheet=Followup%20for%20Shutdown&t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch(`${scriptUrl}?sheet=Shutdown%20Inspection&t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    ]);

    const runningRows = (resRunning && resRunning.status === 'success' && Array.isArray(resRunning.rows))
      ? resRunning.rows
      : [];

    const followupRows = (resFollowup && resFollowup.status === 'success' && Array.isArray(resFollowup.rows))
      ? resFollowup.rows
      : [];

    const shutdownRows = (resShutdown && resShutdown.status === 'success' && Array.isArray(resShutdown.rows))
      ? resShutdown.rows
      : [];

    const mapRunningDetails = (rowOrder) => {
      const orderUpper = String(rowOrder || '').trim().toUpperCase();
      const rMatch = runningRows.find((x) => String(x.serviceOrderNo || '').trim().toUpperCase() === orderUpper);
      if (!rMatch) return null;
      const zoneTemps = Array.isArray(rMatch.zoneTemps) ? rMatch.zoneTemps : [
        rMatch.zone1, rMatch.zone2, rMatch.zone3,
        rMatch.zone4, rMatch.zone5, rMatch.zone6,
        rMatch.zone7, rMatch.zone8, rMatch.zone9
      ];
      return {
        ...rMatch,
        zoneTemps,
        innerTempPhoto: rMatch.innerTempPhoto || rMatch.photo || '',
        campaignLifeFormatSlip: rMatch.campaignLifeFormatSlip || rMatch.slip || ''
      };
    };

    const mapShutdownDetails = (rowOrder) => {
      const orderUpper = String(rowOrder || '').trim().toUpperCase();
      return shutdownRows.find(
        (item) => String(item.serviceOrderNo || '').trim().toUpperCase() === orderUpper
      ) || null;
    };

    if (resAll && resAll.status === 'success' && Array.isArray(resAll.rows)) {
      // The main FMS tab is authoritative for orders. If it is empty, do not
      // resurrect records from localStorage or detail tabs.
      if (resAll.rows.length === 0) {
        return []; // Valid, authoritative empty sheet.
      }
      
      const mergedRows = resAll.rows.map((r) => {
        const details = mapRunningDetails(r.serviceOrderNo);
        const shutdownDetails = mapShutdownDetails(r.serviceOrderNo);
        return {
          ...r,
          runningDetails: details || r.runningDetails || null,
          shutdownDetails: shutdownDetails || r.shutdownDetails || null
        };
      });

      if (mergedRows.length > 0 && mergedRows[0].campaignStartDate !== undefined) {
        mergedRows.followupRows = followupRows;
        return mergedRows;
      }
    }

    // Attempt 2: Concurrently query all 5 steps to assemble complete rows (backward compatible with older GAS deployments)
    const [r1, r2, r3, r4, r5] = await Promise.all([
      fetchStepDataFromGoogleSheet(1),
      fetchStepDataFromGoogleSheet(2),
      fetchStepDataFromGoogleSheet(3),
      fetchStepDataFromGoogleSheet(4),
      fetchStepDataFromGoogleSheet(5)
    ]);

    // If the Apps Script did not answer successfully at all (e.g. "Script function not found: doGet",
    // permission error, HTML error page), fall back to direct GViz endpoint
    const anyStepOk = [r1, r2, r3, r4, r5].some((r) => r && r.status === 'success');
    const allOk = resAll && resAll.status === 'success';
    if (!anyStepOk && !allOk) {
      console.warn('[GoogleSheets] Apps Script returned no valid JSON (check doGet deployment). Using direct GViz fallback...');
      const gvizRows = await fetchFullSheetDataViaGviz();
      if (gvizRows !== null) {
        return gvizRows;
      }
      return null;
    }

    const s1Rows = (r1 && r1.rows) || [];
    const s2Rows = (r2 && r2.rows) || [];
    const s3Rows = (r3 && r3.rows) || [];
    const s4Rows = (r4 && r4.rows) || [];
    const s5Rows = (r5 && r5.rows) || [];

    if (s1Rows.length === 0 && runningRows.length === 0) {
      const empty = [];
      empty.followupRows = followupRows;
      return empty;
    }

    const merged = s1Rows.map((s1) => {
      const orderNo = String(s1.serviceOrderNo || '').trim().toUpperCase();
      const s2 = s2Rows.find((r) => String(r.serviceOrderNo || '').trim().toUpperCase() === orderNo) || {};
      const s3 = s3Rows.find((r) => String(r.serviceOrderNo || '').trim().toUpperCase() === orderNo) || {};
      const s4 = s4Rows.find((r) => String(r.serviceOrderNo || '').trim().toUpperCase() === orderNo) || {};
      const s5 = s5Rows.find((r) => String(r.serviceOrderNo || '').trim().toUpperCase() === orderNo) || {};
      const runningDetails = mapRunningDetails(s1.serviceOrderNo);
      const shutdownDetails = mapShutdownDetails(s1.serviceOrderNo);

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

        avgTemp: (runningDetails && runningDetails.avgTemp) || s2.avgTemp,
        avgThickness: s2.avgThickness || s4.avgThickness,
        step2Planned: s2.planned,
        step2Actual: s2.actual,
        step2Delay: s2.delay,
        daysSinceStart: (runningDetails && runningDetails.daysSinceStart) || s2.daysSinceStart,
        expectedShutdownDate: (runningDetails && runningDetails.expectedShutdownDate) || s2.expectedShutdownDate || s3.shutdownDate,
        step2Inspector: (runningDetails && runningDetails.inspector) || s2.inspector,
        runningDetails,

        step3Planned: s3.planned,
        step3Actual: s3.actual,
        step3Delay: s3.delay,
        shutdownDate: s3.shutdownDate,
        step3Status: s3.status,
        nextCallDate: s3.nextCallDate,
        step3NextCallDate: s3.nextCallDate,

        step4Planned: s4.planned,
        step4Actual: s4.actual,
        step4Delay: s4.delay,
        step4Inspector: s4.inspector,
        nextCampaignStartDate: s4.nextCampaignStartDate,
        shutdownDetails,

        step5Planned: s5.planned,
        step5Actual: s5.actual,
        step5Status: s5.status,
        step5Delay: s5.delay
      };
    });

    merged.followupRows = followupRows;
    return merged;
  } catch (err) {
    console.warn('[GoogleSheets] fetchFullSheetData error:', err.message, 'Trying direct GViz fallback...');
    const gvizFallback = await fetchFullSheetDataViaGviz();
    if (gvizFallback !== null) return gvizFallback;
    return null;
  }
}

export const STORAGE_MASTER_KEY = 'campaign_fms_master_data';

/**
 * Parses Google Visualization API (GViz) response text into rows
 */
export function parseGvizResponse(text) {
  if (!text || typeof text !== 'string') return [];
  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) return [];
  try {
    const json = JSON.parse(text.substring(startIdx, endIdx + 1));
    return json?.table?.rows || [];
  } catch {
    return [];
  }
}

/**
 * Safely extracts string value from a Google Visualization cell object,
 * properly formatting Date(...) objects and formatted text.
 */
export function getGvizCellValue(cell) {
  if (!cell) return '';
  if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
  if (cell.v !== undefined && cell.v !== null) {
    const v = String(cell.v).trim();
    const m = v.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}),\s*(\d{1,2})(?:,\s*(\d{1,2}))?)?\)/);
    if (m) {
      const year = m[1];
      const month = String(parseInt(m[2], 10) + 1).padStart(2, '0');
      const day = String(m[3]).padStart(2, '0');
      if (m[4] !== undefined) {
        const hh = String(m[4]).padStart(2, '0');
        const mm = String(m[5] || 0).padStart(2, '0');
        const ss = String(m[6] || 0).padStart(2, '0');
        return `${day}/${month}/${year} ${hh}:${mm}:${ss}`;
      }
      return `${day}/${month}/${year}`;
    }
    return v;
  }
  return '';
}

/**
 * Direct Google Sheets reader fallback for "Login" tab using Google Visualization API (GViz).
 */
export async function fetchUsersViaGviz() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Login&t=${Date.now()}`;
    const res = await fetch(url);
    const text = await res.text();
    const rows = parseGvizResponse(text);
    if (!rows || rows.length === 0) return null;

    const users = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const valA = getGvizCellValue(r?.c?.[0]);
      const valB = getGvizCellValue(r?.c?.[1]);

      if (!valA && !valB) continue;
      if (valA.toLowerCase() === 'user id' || valB.toLowerCase() === 'name') continue;

      const rawRole = getGvizCellValue(r?.c?.[3]) || 'User';
      const rawAccess = getGvizCellValue(r?.c?.[5]);

      users.push({
        row: i + 1,
        userId: valA || valB.toLowerCase().replace(/\s+/g, ''),
        name: valB || valA,
        password: getGvizCellValue(r?.c?.[2]) || '',
        role: normalizeUserRole(rawRole),
        status: getGvizCellValue(r?.c?.[4]) || 'Active',
        access: rawAccess || (rawRole.toLowerCase().includes('admin') ? 'All' : ''),
        lastLogin: getGvizCellValue(r?.c?.[6]) || ''
      });
    }

    return users.length > 0 ? users : null;
  } catch (err) {
    console.warn('[GoogleSheets] fetchUsersViaGviz error:', err.message);
    return null;
  }
}

/**
 * Direct Google Sheets reader fallback using Google Visualization API (GViz).
 * Reads the live Google Sheet directly without depending on Google Apps Script doGet deployment.
 */
export async function fetchFullSheetDataViaGviz() {
  try {
    const [resMain, resRunning, resFollowup] = await Promise.all([
      fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&t=${Date.now()}`).then((r) => r.text()).catch(() => null),
      fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Running%20Kiln%20Inspection&t=${Date.now()}`).then((r) => r.text()).catch(() => null),
      fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Followup%20for%20Shutdown&t=${Date.now()}`).then((r) => r.text()).catch(() => null)
    ]);

    const rawMainRows = parseGvizResponse(resMain);
    const rawRunningRows = parseGvizResponse(resRunning);
    const rawFollowupRows = parseGvizResponse(resFollowup);

    if ((!rawMainRows || rawMainRows.length === 0) && (!rawRunningRows || rawRunningRows.length === 0)) {
      return null;
    }

    // 1. Process "Running Kiln Inspection" tab
    let runningDataRows = rawRunningRows || [];
    if (runningDataRows.length > 0) {
      const firstRowVals = (runningDataRows[0]?.c || []).map((cell) => getGvizCellValue(cell).toLowerCase());
      if (firstRowVals.some((h) => h.includes('service') || h.includes('order') || h.includes('party'))) {
        runningDataRows = runningDataRows.slice(1);
      }
    }

    const runningRecords = runningDataRows.map((r, i) => {
      const rOrder = String(getGvizCellValue(r?.c?.[0])).trim();
      if (!rOrder) return null;
      const zoneTemps = [
        getGvizCellValue(r?.c?.[11]), getGvizCellValue(r?.c?.[12]), getGvizCellValue(r?.c?.[13]),
        getGvizCellValue(r?.c?.[14]), getGvizCellValue(r?.c?.[15]), getGvizCellValue(r?.c?.[16]),
        getGvizCellValue(r?.c?.[17]), getGvizCellValue(r?.c?.[18]), getGvizCellValue(r?.c?.[19])
      ].map((z) => (z !== '' && !isNaN(Number(z)) ? Number(z) : (z || null)));

      return {
        row: i + 2,
        serviceOrderNo: rOrder,
        partyName: getGvizCellValue(r?.c?.[1]),
        kilnNoAndSize: getGvizCellValue(r?.c?.[2]),
        campaignNo: getGvizCellValue(r?.c?.[3]),
        campaignStartDate: getGvizCellValue(r?.c?.[4]),
        inspector: getGvizCellValue(r?.c?.[5]),
        innerTemp: getGvizCellValue(r?.c?.[6]),
        expectedShutdownDate: getGvizCellValue(r?.c?.[7]),
        daysSinceStart: getGvizCellValue(r?.c?.[8]),
        campaignLifeFormatSlip: getGvizCellValue(r?.c?.[9]),
        innerTempPhoto: getGvizCellValue(r?.c?.[10]),
        zoneTemps,
        avgTemp: getGvizCellValue(r?.c?.[20])
      };
    }).filter(Boolean);

    // 2. Process "Followup for Shutdown" tab
    let followupHeaders = [];
    let followupDataRows = rawFollowupRows || [];
    if (followupDataRows.length > 0) {
      const firstRowVals = (followupDataRows[0]?.c || []).map((cell) => getGvizCellValue(cell).toLowerCase());
      if (firstRowVals.some((h) => h.includes('order') || h.includes('party') || h.includes('date'))) {
        followupHeaders = firstRowVals;
        followupDataRows = followupDataRows.slice(1);
      }
    }

    const colDateTime = followupHeaders.findIndex((h) => (h.includes('date') && h.includes('time')) || h.includes('timestamp'));
    const colOrderNo = followupHeaders.findIndex((h) => h.includes('order') || h.includes('cn'));
    const colParty = followupHeaders.findIndex((h) => h.includes('party') || h.includes('company'));
    const colPerson = followupHeaders.findIndex((h) => h.includes('person') || h.includes('called'));
    const colDesig = followupHeaders.findIndex((h) => h.includes('designation'));
    const colMob = followupHeaders.findIndex((h) => h.includes('mobile') || h.includes('phone'));
    const colGiven = followupHeaders.findIndex((h) => h.includes('given') || (h.includes('status') && !h.includes('date')));
    const colNext = followupHeaders.findIndex((h) => !h.includes('given') && (h.includes('expected') || h.includes('next') || (h.includes('shut') && h.includes('date'))));

    const followupRecords = followupDataRows.map((r, i) => {
      const rOrder = String(getGvizCellValue(r?.c?.[colOrderNo !== -1 ? colOrderNo : 1])).trim();
      if (!rOrder) return null;
      let rawOutcome = getGvizCellValue(r?.c?.[colGiven !== -1 ? colGiven : 6]);
      let rawNextDate = getGvizCellValue(r?.c?.[colNext !== -1 ? colNext : 7]);
      // Older Followup sheets sometimes stored the next-call date in the status column.
      if (!rawNextDate && isSheetDateValue(rawOutcome)) {
        rawNextDate = rawOutcome;
        rawOutcome = 'No shutdown date not taken';
      }
      const isNo = rawOutcome.includes('No');
      const isYes = rawOutcome.includes('Yes');

      return {
        row: i + 2,
        timestamp: getGvizCellValue(r?.c?.[colDateTime !== -1 ? colDateTime : 0]),
        serviceOrderNo: rOrder,
        partyName: getGvizCellValue(r?.c?.[colParty !== -1 ? colParty : 2]),
        personCalled: getGvizCellValue(r?.c?.[colPerson !== -1 ? colPerson : 3]),
        designation: getGvizCellValue(r?.c?.[colDesig !== -1 ? colDesig : 4]) || 'Processor',
        mobile: String(getGvizCellValue(r?.c?.[colMob !== -1 ? colMob : 5])).replace(/^'/, ''),
        shutdownDateGiven: rawOutcome || (isNo ? 'No shutdown date not taken' : (isYes ? 'Yes Shutdown date taken' : 'Pending Call')),
        expectedShutdownDate: (isYes || (!rawOutcome && rawNextDate && !isNo)) ? rawNextDate : '',
        nextCallDate: isNo ? rawNextDate : ''
      };
    }).filter(Boolean);

    // 3. Process Main FMS tab (data starts at Row 7)
    let startDataIndex = 6;
    for (let i = 0; i < (rawMainRows || []).length; i++) {
      const c1 = getGvizCellValue(rawMainRows[i]?.c?.[1]).toLowerCase();
      if (c1.includes('service order') || c1.includes('order no')) {
        startDataIndex = i + 1;
        break;
      }
    }
    const dataRows = (rawMainRows || []).slice(startDataIndex);

    if (dataRows.length === 0 && runningRecords.length === 0) {
      const empty = [];
      empty.followupRows = followupRecords;
      return empty;
    }

    const merged = dataRows.map((r, i) => {
      const order = String(getGvizCellValue(r?.c?.[1])).trim();
      if (!order || order.toUpperCase() === 'TEST-01') return null;

      const orderUpper = order.toUpperCase();
      const rMatch = runningRecords.find((x) => x.serviceOrderNo.toUpperCase() === orderUpper);

      return {
        row: startDataIndex + 1 + i,
        serviceOrderNo: order,
        companyName: getGvizCellValue(r?.c?.[2]),
        campaignStartDate: getGvizCellValue(r?.c?.[3]),
        campaignNo: getGvizCellValue(r?.c?.[4]),
        kilnSize: getGvizCellValue(r?.c?.[5]),
        kilnNo: getGvizCellValue(r?.c?.[6]),
        inspectionIncharge: getGvizCellValue(r?.c?.[7]),
        timestamp: getGvizCellValue(r?.c?.[0]),

        step2Planned: getGvizCellValue(r?.c?.[8]),
        step2Actual: getGvizCellValue(r?.c?.[9]),
        step2Delay: getGvizCellValue(r?.c?.[10]),
        daysSinceStart: (rMatch && rMatch.daysSinceStart !== undefined && rMatch.daysSinceStart !== '') ? rMatch.daysSinceStart : getGvizCellValue(r?.c?.[11]),
        expectedShutdownDate: (rMatch && rMatch.expectedShutdownDate) || getGvizCellValue(r?.c?.[12]),
        step2Inspector: (rMatch && rMatch.inspector) || getGvizCellValue(r?.c?.[13]),
        avgTemp: (rMatch && rMatch.avgTemp) || getGvizCellValue(r?.c?.[14]),
        avgThickness: getGvizCellValue(r?.c?.[15]),
        runningDetails: rMatch || null,

        step3Planned: getGvizCellValue(r?.c?.[16]),
        step3Actual: getGvizCellValue(r?.c?.[17]),
        step3Delay: getGvizCellValue(r?.c?.[18]),
        shutdownDate: getGvizCellValue(r?.c?.[19]),
        step3Status: String(getGvizCellValue(r?.c?.[20])).replace(/^\d+\.\s*/, '').trim(),
        nextCallDate: getGvizCellValue(r?.c?.[21]),
        step3NextCallDate: getGvizCellValue(r?.c?.[21]),

        step4Planned: getGvizCellValue(r?.c?.[22]),
        step4Actual: getGvizCellValue(r?.c?.[23]),
        step4Delay: getGvizCellValue(r?.c?.[24]),
        step4Inspector: getGvizCellValue(r?.c?.[25]),
        nextCampaignStartDate: getGvizCellValue(r?.c?.[26]),

        step5Planned: getGvizCellValue(r?.c?.[27]),
        step5Actual: getGvizCellValue(r?.c?.[28]),
        step5Status: getGvizCellValue(r?.c?.[29]),
        step5Delay: getGvizCellValue(r?.c?.[30])
      };
    }).filter(Boolean);

    // Append any orders that were in Running Inspection tab but not yet in Main sheet
    for (const rRec of runningRecords) {
      if (!merged.some((m) => m.serviceOrderNo.toUpperCase() === rRec.serviceOrderNo.toUpperCase())) {
        merged.push({
          row: rRec.row,
          serviceOrderNo: rRec.serviceOrderNo,
          companyName: rRec.partyName,
          campaignStartDate: rRec.campaignStartDate,
          campaignNo: rRec.campaignNo,
          kilnSize: rRec.kilnNoAndSize,
          kilnNo: 1,
          inspectionIncharge: rRec.inspector,
          timestamp: '',
          avgTemp: rRec.avgTemp,
          avgThickness: '',
          step2Planned: '',
          step2Actual: rRec.campaignStartDate,
          step2Delay: 0,
          daysSinceStart: rRec.daysSinceStart,
          expectedShutdownDate: rRec.expectedShutdownDate,
          step2Inspector: rRec.inspector,
          runningDetails: rRec,
          step3Planned: '',
          step3Actual: '',
          step3Delay: 0,
          shutdownDate: '',
          step3Status: '',
          nextCallDate: '',
          step3NextCallDate: '',
          step4Planned: '',
          step4Actual: '',
          step4Delay: 0,
          step4Inspector: '',
          nextCampaignStartDate: '',
          step5Planned: '',
          step5Actual: '',
          step5Status: '',
          step5Delay: 0
        });
      }
    }

    merged.followupRows = followupRecords;
    return merged;
  } catch (err) {
    console.warn('[GoogleSheets] fetchFullSheetDataViaGviz error:', err.message);
    return null;
  }
}

/**
 * Fetches companies and kiln sizes from the "Master" tab in Google Sheets.
 * Queries Google Apps Script first, then falls back to direct GViz endpoint,
 * and caches results in localStorage for offline resilience.
 */
export async function fetchMasterSheetData() {
  const scriptUrl = getGoogleScriptUrl();

  // 1. Try Google Apps Script if available
  if (scriptUrl) {
    try {
      const res = await fetch(`${scriptUrl}?sheet=Master&t=${Date.now()}`);
      const json = await res.json();
      if (json && json.status === 'success' && Array.isArray(json.companies) && json.companies.length > 0) {
        const result = {
          companies: json.companies,
          kilnSizes: Array.isArray(json.kilnSizes) ? json.kilnSizes : []
        };
        try {
          localStorage.setItem(STORAGE_MASTER_KEY, JSON.stringify(result));
        } catch {}
        return result;
      }
    } catch {}
  }

  // 2. Fetch directly from Google Sheets GViz endpoint (CORS-friendly, public read, always up-to-date)
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Master&t=${Date.now()}`;
    const res = await fetch(url);
    const text = await res.text();
    const rows = parseGvizResponse(text);

    if (rows.length > 0) {
      const companies = [];
      const kilnSizes = [];

      for (const r of rows) {
        const valA = r.c && r.c[0] && r.c[0].v !== null && r.c[0].v !== undefined ? String(r.c[0].v).trim() : '';
        const valB = r.c && r.c[1] && r.c[1].v !== null && r.c[1].v !== undefined ? String(r.c[1].v).trim() : '';

        // Exclude header row if present
        if (valA && valA.toLowerCase() !== 'name of the company' && !companies.includes(valA)) {
          companies.push(valA);
        }
        if (valB && valB.toLowerCase() !== 'size of kiln' && !kilnSizes.includes(valB)) {
          kilnSizes.push(valB);
        }
      }

      if (companies.length > 0) {
        const result = { companies, kilnSizes };
        try {
          localStorage.setItem(STORAGE_MASTER_KEY, JSON.stringify(result));
        } catch {}
        return result;
      }
    }
  } catch (err) {
    console.warn('[GoogleSheets] fetchMasterSheetData error:', err.message);
  }

  // 3. Fallback to cached master data from localStorage
  try {
    const cached = localStorage.getItem(STORAGE_MASTER_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.companies) && parsed.companies.length > 0) {
        return parsed;
      }
    }
  } catch {}

  return { companies: [], kilnSizes: [] };
}

/**
 * Builds clean app database exclusively from Google Sheet rows.
 * If sheetRows is empty, returns completely empty collections (0 orders).
 */
export function buildAppDataFromSheetRows(sheetRows, currentData = {}, followupRows = [], masterData = null) {
  let companies = [];
  if (masterData && Array.isArray(masterData.companies) && masterData.companies.length > 0) {
    const existingList = [...(currentData.companies || SEED_COMPANIES)];
    const seenNames = new Set();

    // 1. Add companies from Master sheet in exact sheet order
    for (const rawName of masterData.companies) {
      const name = String(rawName || '').trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seenNames.has(lower)) continue;
      seenNames.add(lower);

      const existing = existingList.find((c) => c.name.toLowerCase() === lower);
      if (existing) {
        companies.push({ ...existing, name });
      } else {
        const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        companies.push({
          id: `c-${slug || Date.now()}`,
          name,
          kycNo: '',
          siteIncharge: '',
          mobile: ''
        });
      }
    }

    // 2. Preserve any existing companies in currentData that were not in Master sheet
    for (const c of existingList) {
      if (!seenNames.has(c.name.toLowerCase())) {
        companies.push(c);
        seenNames.add(c.name.toLowerCase());
      }
    }
  } else {
    companies = [...(currentData.companies || SEED_COMPANIES)];
  }

  const kilns = [...(currentData.kilns || SEED_KILNS)];
  const kilnSizes = (masterData && Array.isArray(masterData.kilnSizes) && masterData.kilnSizes.length > 0)
    ? masterData.kilnSizes
    : (currentData.kilnSizes && currentData.kilnSizes.length > 0
        ? currentData.kilnSizes
        : ['80 TPD', '100 TPD', '120 TPD', '150 TPD']);

  // If sheet is empty, return clean empty data (NO MOCK / SEED ORDERS!)
  if (!sheetRows || sheetRows.length === 0) {
    return {
      companies,
      kilns,
      kilnSizes,
      orders: [],
      visits: [],
      runningInspections: [],
      callLogs: [],
      shutdownInspections: [],
      restartProcesses: [],
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
  const restartProcesses = [];
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
    const step5Status = String(row.step5Status || '').trim();
    const isRestartComplete = Boolean(
      row.step5Actual || /restart|closed|complete/i.test(step5Status)
    );

    const order = {
      serviceOrderNo: orderNo,
      companyId: company.id,
      companyName: companyName,
      kilnId: kiln.id,
      campaignNo: String(row.campaignNo || '1'),
      campaignStartDate: campaignStart,
      expectedShutdownDate: expectedShutdown || '',
      restartPlannedDate: normalizeSheetDate(row.step5Planned) || '',
      callFollowupStatus: cleanStatus || null,
      inspectionIncharge: row.inspectionIncharge || '',
      status: isRestartComplete ? 'closed' : 'open'
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
    const runningDetail = row.runningDetails || row.runningInspection || {};
    if (row.step2Actual || row.avgTemp || row.step2Inspector || existingRunning || runningDetail.avgTemp || runningDetail.innerTemp !== undefined) {
      const innerTemp = (runningDetail.innerTemp !== undefined && runningDetail.innerTemp !== '')
        ? runningDetail.innerTemp
        : (existingRunning?.innerTemp !== undefined && existingRunning?.innerTemp !== null ? existingRunning.innerTemp : '');
      const innerTempPhoto = runningDetail.innerTempPhoto || existingRunning?.innerTempPhoto || '';
      const campaignLifeFormatSlip = runningDetail.campaignLifeFormatSlip || existingRunning?.campaignLifeFormatSlip || '';
      const campaignLifeFormatSlipName = runningDetail.campaignLifeFormatSlipName || existingRunning?.campaignLifeFormatSlipName || (campaignLifeFormatSlip ? 'View slip' : '');
      const rawZones = runningDetail.zoneTemps || existingRunning?.zoneTemps || existingRunning?.zones;
      const zoneTemps = (Array.isArray(rawZones) && rawZones.some((v) => v !== null && v !== ''))
        ? rawZones
        : (existingRunning?.zoneTemps || existingRunning?.zones || [175, 175, 175, 175, 175, 175, 175, 175, 175]);
      const daysSinceStart = (runningDetail.daysSinceStart !== undefined && runningDetail.daysSinceStart !== '')
        ? runningDetail.daysSinceStart
        : (row.daysSinceStart !== undefined && row.daysSinceStart !== ''
          ? row.daysSinceStart
          : (existingRunning?.daysSinceStart !== undefined && existingRunning?.daysSinceStart !== null ? existingRunning.daysSinceStart : ''));
      const visitDate = normalizeSheetDate(row.step2Actual) || existingRunning?.visitDate || campaignStart;

      runningInspections.push({
        id: existingRunning?.id || `r-${orderNo}`,
        serviceOrderNo: orderNo,
        partyName: companyName,
        kilnNo: kilnNum,
        kilnSize: kilnSize,
        campaignNo: String(row.campaignNo || existingRunning?.campaignNo || '1'),
        campaignStartDate: campaignStart || existingRunning?.campaignStartDate || null,
        visitDate,
        avgTemp: (runningDetail.avgTemp !== undefined && runningDetail.avgTemp !== '') ? runningDetail.avgTemp : (row.avgTemp || existingRunning?.avgTemp || ''),
        avgThickness: row.avgThickness || existingRunning?.avgThickness || '',
        daysSinceStart,
        expectedShutdownDate: (runningDetail.expectedShutdownDate ? normalizeSheetDate(runningDetail.expectedShutdownDate) : '') || expectedShutdown || existingRunning?.expectedShutdownDate || '',
        inspector: runningDetail.inspector || row.step2Inspector || row.inspectionIncharge || existingRunning?.inspector || '',
        plannedRunningDate: normalizeSheetDate(row.step2Planned) || campaignStart,
        delayDays: Number(row.step2Delay) || 0,
        innerTemp,
        innerTempPhoto,
        campaignLifeFormatSlip,
        campaignLifeFormatSlipName,
        zoneTemps,
        zones: zoneTemps,
        photos: existingRunning?.photos || {}
      });
    }

    // 3. Call Log record
    const existingCall = (currentData.callLogs || []).find((c) => c.serviceOrderNo === orderNo);
    const rawNextCall = row.nextCallDate || row.step3NextCallDate;
    if (row.step3Actual || cleanStatus || row.shutdownDate || existingCall || rawNextCall) {
      callLogs.push({
        callLogNo: formatImportedCallLogNo(orderNo, existingCall?.callLogNo, 1),
        timestamp: row.step3Actual ? normalizeSheetDate(row.step3Actual) : (existingCall?.timestamp || new Date().toISOString()),
        serviceOrderNo: orderNo,
        partyName: companyName,
        personCalled: existingCall?.personCalled || company.siteIncharge || 'Site Incharge',
        designation: existingCall?.designation || 'Processor',
        mobile: existingCall?.mobile || company.mobile || '',
        shutdownDateGiven: cleanStatus || existingCall?.shutdownDateGiven || 'Yes Shutdown date taken',
        expectedShutdownDate: cleanStatus.includes('Yes') ? (expectedShutdown || existingCall?.expectedShutdownDate) : null,
        nextCallDate: normalizeSheetDate(rawNextCall) || existingCall?.nextCallDate || null
      });
    }

    // 4. Shutdown Inspection record
    const existingShutdown = (currentData.shutdownInspections || []).find((s) => s.serviceOrderNo === orderNo);
    const shutdownDetail = row.shutdownDetails || null;
    if (row.step4Actual || row.step4Inspector || row.nextCampaignStartDate || existingShutdown || shutdownDetail) {
      shutdownInspections.push({
        id: existingShutdown?.id || `s-${orderNo}`,
        serviceOrderNo: orderNo,
        companyName: shutdownDetail?.companyName || companyName,
        what: shutdownDetail?.what || existingShutdown?.what || 'Done',
        inspectionDate: normalizeSheetDate(shutdownDetail?.inspectionDate) || normalizeSheetDate(row.step4Actual) || existingShutdown?.inspectionDate || '',
        avgThickness: row.avgThickness || existingShutdown?.avgThickness || '',
        inspector: shutdownDetail?.inspector || row.step4Inspector || row.inspectionIncharge || existingShutdown?.inspector || '',
        zoneThickness: shutdownDetail?.zoneThickness || shutdownDetail?.zoneDistances || existingShutdown?.zoneThickness || [],
        zoneDistances: shutdownDetail?.zoneDistances || shutdownDetail?.zoneThickness || existingShutdown?.zoneDistances || [],
        zonePhotos: shutdownDetail?.zonePhotos || existingShutdown?.zonePhotos || [],
        nextCampaignStartDate: normalizeSheetDate(shutdownDetail?.nextCampaignStartDate) || normalizeSheetDate(row.nextCampaignStartDate) || existingShutdown?.nextCampaignStartDate || '',
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
    const hasRunningInspection = Boolean(
      step2Actual ||
      (runningDetail && (runningDetail.avgTemp || runningDetail.innerTemp !== undefined || runningDetail.visitDate)) ||
      existingRunning
    );

    stepTasks.push({
      id: `t-${orderNo}-running`,
      serviceOrderNo: orderNo,
      step: 'running',
      owner: row.step2Inspector || row.inspectionIncharge || 'Sanjay',
      plannedDate: normalizeSheetDate(row.step2Planned) || campaignStart,
      actualDate: step2Actual || (hasRunningInspection ? (runningDetail?.visitDate || existingRunning?.visitDate || campaignStart) : null),
      delayDays: Number(row.step2Delay) || 0,
      status: hasRunningInspection ? 'done' : 'pending'
    });

    // Step 3 Task
    // Look up followups for this order from followupRows and currentData.callLogs
    const orderNoUpper = orderNo.toUpperCase();
    const orderFollowups = (Array.isArray(followupRows) ? followupRows : []).filter(
      (f) => String(f.serviceOrderNo || '').trim().toUpperCase() === orderNoUpper
    );
    const latestFollowup = orderFollowups.length > 0 ? orderFollowups[orderFollowups.length - 1] : null;

    const orderLocalCalls = (currentData.callLogs || []).filter(
      (c) => String(c.serviceOrderNo || '').trim().toUpperCase() === orderNoUpper
    );
    const latestLocalCall = orderLocalCalls.length > 0 ? orderLocalCalls[0] : null;

    const latestCall = latestFollowup || latestLocalCall;
    const latestOutcome = String(latestCall?.shutdownDateGiven || cleanStatus || '').trim();

    // CRITICAL LOGIC: If the outcome contains "No", Step 3 is NEVER done!
    // It must remain pending with plannedDate = nextCallDate until user selects "Yes" or "Forget".
    let isStep3Done = false;
    if (latestOutcome.includes('No')) {
      isStep3Done = false;
    } else if (latestOutcome.includes('Yes') || latestOutcome.includes('Forget')) {
      isStep3Done = true;
    } else if (step3Actual && !cleanStatus.includes('No')) {
      isStep3Done = true;
    } else {
      isStep3Done = false;
    }

    const nextCallPlanned = (latestCall?.nextCallDate ? normalizeSheetDate(latestCall.nextCallDate) : '') ||
      (row.nextCallDate ? normalizeSheetDate(row.nextCallDate) : '') ||
      (row.step3NextCallDate ? normalizeSheetDate(row.step3NextCallDate) : '');
    const step3PlannedDate = (!isStep3Done && nextCallPlanned)
      ? nextCallPlanned
      : (normalizeSheetDate(row.step3Planned) || (expectedShutdown ? addWorkingDays(expectedShutdown, -3) : ''));

    stepTasks.push({
      id: `t-${orderNo}-call`,
      serviceOrderNo: orderNo,
      step: 'call',
      owner: 'Sanjay',
      plannedDate: step3PlannedDate,
      actualDate: isStep3Done ? (step3Actual || (latestCall?.timestamp ? latestCall.timestamp.slice(0, 10) : (step2Actual || campaignStart))) : null,
      delayDays: Number(row.step3Delay) || 0,
      status: isStep3Done ? 'done' : 'pending'
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
      status: (step5Actual || isRestartComplete) ? 'done' : 'pending'
    });
  }

  // Rebuild Restart Process history from FMS Step 5 so a sheet refresh does not
  // move submitted records back to Pending. Step 5 status stores the new ReCN no.
  for (const sourceRow of sheetRows) {
    const sourceServiceOrderNo = String(sourceRow.serviceOrderNo || '').trim();
    const step5Status = String(sourceRow.step5Status || '').trim();
    const step5Actual = normalizeSheetDate(sourceRow.step5Actual);
    const isComplete = Boolean(step5Actual || /restart|closed|complete/i.test(step5Status));
    if (!sourceServiceOrderNo || !isComplete) continue;

    const linkedOrderMatch = step5Status.match(/->\s*(.+)$/);
    const linkedOrderNo = String(linkedOrderMatch?.[1] || `Re${sourceServiceOrderNo}`).trim();
    const newOrder = orders.find(
      (order) => order.serviceOrderNo.toUpperCase() === linkedOrderNo.toUpperCase()
    );
    const sourceOrder = orders.find(
      (order) => order.serviceOrderNo.toUpperCase() === sourceServiceOrderNo.toUpperCase()
    );
    const historyOrder = newOrder || sourceOrder;
    const historyKiln = kilns.find((kiln) => kiln.id === historyOrder?.kilnId);

    restartProcesses.push({
      serviceOrderNo: newOrder?.serviceOrderNo || linkedOrderNo,
      sourceServiceOrderNo,
      companyId: historyOrder?.companyId || '',
      companyName: historyOrder?.companyName || 'Unknown Plant',
      what: 'Restarting The Process',
      campaignNo: newOrder?.campaignNo || sourceOrder?.campaignNo || '',
      kilnNo: historyKiln?.kilnNo || '',
      kilnSize: historyKiln?.size || '',
      campaignStartDate: newOrder?.campaignStartDate || sourceOrder?.campaignStartDate || '',
      inspectionIncharge: newOrder?.inspectionIncharge || sourceOrder?.inspectionIncharge || '',
      date: step5Actual || '',
      actualDate: step5Actual || ''
    });
  }

  // If dedicated "Followup for Shutdown" tab rows exist, use them as primary source for callLogs
  if (Array.isArray(followupRows) && followupRows.length > 0) {
    callLogs.length = 0; // Clear fallback rows from FMS
    const counts = {};
    for (const fRow of followupRows) {
      const orderNo = String(fRow.serviceOrderNo || '').trim();
      if (!orderNo) continue;
      const orderUpper = orderNo.toUpperCase();
      counts[orderUpper] = (counts[orderUpper] || 0) + 1;
      const count = counts[orderUpper];
      const sourceRow = (sheetRows || []).find(
        (row) => String(row.serviceOrderNo || '').trim().toUpperCase() === orderUpper
      );
      const sourceCallTask = stepTasks.find(
        (task) => task.serviceOrderNo === orderNo && task.step === 'call'
      );
      const inferredStatus = fRow.shutdownDateGiven ||
        sourceRow?.step3Status ||
        (fRow.expectedShutdownDate ? 'Yes Shutdown date taken' :
          (sourceCallTask?.status === 'done' ? 'Forget to taken' : 'Pending Call'));

      const isNo = String(inferredStatus).includes('No');
      const isYes = String(inferredStatus).includes('Yes');

      // Unshift to put latest call first (index 0)
      callLogs.unshift({
        callLogNo: formatImportedCallLogNo(orderNo, `Call-${count}`),
        timestamp: normalizeTimestampToISO(fRow.timestamp),
        serviceOrderNo: orderNo,
        partyName: fRow.partyName || '',
        personCalled: fRow.personCalled || '',
        designation: fRow.designation || 'Processor',
        mobile: fRow.mobile || '',
        shutdownDateGiven: inferredStatus,
        expectedShutdownDate: (isYes || (!isNo && fRow.expectedShutdownDate)) ? normalizeSheetDate(fRow.expectedShutdownDate) : null,
        nextCallDate: isNo ? (fRow.nextCallDate ? normalizeSheetDate(fRow.nextCallDate) : normalizeSheetDate(fRow.expectedShutdownDate)) : (fRow.nextCallDate ? normalizeSheetDate(fRow.nextCallDate) : null)
      });
    }
  }

  // Preserve any local calls that haven't synced to sheet yet
  for (const localCall of (currentData.callLogs || [])) {
    const alreadyExists = callLogs.some(
      (c) => String(c.serviceOrderNo || '').trim().toUpperCase() === String(localCall.serviceOrderNo || '').trim().toUpperCase() &&
             (c.callLogNo === localCall.callLogNo || (c.timestamp && localCall.timestamp && c.timestamp.slice(0, 16) === localCall.timestamp.slice(0, 16)))
    );
    if (!alreadyExists && localCall.serviceOrderNo) {
      callLogs.unshift(localCall);
    }
  }

  return {
    companies,
    kilns,
    kilnSizes,
    orders,
    visits,
    runningInspections,
    callLogs,
    shutdownInspections,
    restartProcesses,
    stepTasks,
    historicalCampaigns: currentData.historicalCampaigns || [],
    settings: currentData.settings || { offsets: { running: 7, call: -3, shutdown: 0, restart: 2 } },
    isSyncedFromSheet: true
  };
}

/**
 * Loads entire database from Google Sheet.
 * Returns the synchronized data structure from Google Sheet only.
 */
export async function loadDataFromGoogleSheet() {
  try {
    // Google Sheet is the only source of truth. Do not read local data.
    const currentData = {};

    const [sheetRows, masterData] = await Promise.all([
      fetchFullSheetData(),
      fetchMasterSheetData()
    ]);

    if (sheetRows === null) return null;

    const followupRows = sheetRows.followupRows || [];
    const appData = buildAppDataFromSheetRows(sheetRows, currentData, followupRows, masterData);
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

  if (scriptUrl) {
    try {
      const res = await fetch(`${scriptUrl}?sheet=login&t=${Date.now()}`);
      const json = await res.json();
      if (json && json.status === 'success' && Array.isArray(json.users)) {
        return json.users.map((user) => ({
          ...user,
          role: normalizeUserRole(user.role)
        }));
      }
    } catch (err) {
      console.warn('[GoogleSheets] fetchUsersFromGoogleSheet error:', err.message);
    }
  }

  // Fallback to direct GViz query for "Login" tab
  try {
    const users = await fetchUsersViaGviz();
    if (Array.isArray(users) && users.length > 0) {
      return users;
    }
  } catch (gvizErr) {
    console.warn('[GoogleSheets] fetchUsersViaGviz error:', gvizErr.message);
  }

  return null;
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
 * Dispatches an individual phone call record directly to Google Sheet "Followup for Shutdown" tab
 */
export async function syncFollowupCallToGoogleSheet(callLog) {
  if (!callLog || !callLog.serviceOrderNo) return { status: 'skipped', reason: 'No order number' };
  return syncStepToGoogleSheet(3, callLog.serviceOrderNo, {
    partyName: callLog.partyName || '',
    personCalled: callLog.personCalled || '',
    designation: callLog.designation || 'Processor',
    mobile: callLog.mobile || '',
    shutdownDateGiven: callLog.shutdownDateGiven || '',
    expectedShutdownDate: callLog.expectedShutdownDate || '',
    nextCallDate: callLog.nextCallDate || '',
    status: callLog.shutdownDateGiven || '',
    timestamp: callLog.timestamp || new Date().toISOString()
  });
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
      statusStep3: String(lastCall?.shutdownDateGiven || order?.callFollowupStatus || '').replace(/^\d+\.\s*/, '').trim(),
      actualStep3: (lastCall?.shutdownDateGiven?.includes('Yes') || lastCall?.shutdownDateGiven?.includes('Forget'))
        ? (lastCall?.timestamp ? new Date(lastCall.timestamp).toLocaleDateString('en-GB') : '')
        : '',
      nextCallDate: lastCall?.nextCallDate || '',
      
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
const DRIVE_FOLDER_ID = '1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8';
const RUNNING_SHEET_NAME = 'Running Kiln Inspection';
const FOLLOWUP_SHEET_NAME = 'Followup for Shutdown';

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
  STEP2_PLANNED: 9,       // Col I: Planned (PROTECTED)
  STEP2_ACTUAL: 10,       // Col J: Actual (TIMESTAMP - Real Date Object)
  STEP2_DELAY: 11,        // Col K: Delay (PROTECTED)
  DAYS_SINCE_START: 12,   // Col L: No. of days since kiln start
  EXPECTED_SHUTDOWN: 13,  // Col M: Expected Shutdown date
  STEP2_INSPECTOR: 14,    // Col N: Inspector Incharge
  AVG_TEMP: 15,           // Col O: Avg. Temp. Of kiln
  AVG_THICKNESS: 16,      // Col P: Avg Thickness of kiln
  
  // Step 3: Take Shut Down date
  STEP3_PLANNED: 17,      // Col Q: Planned (PROTECTED)
  STEP3_ACTUAL: 18,       // Col R: Actual (TIMESTAMP - Real Date Object)
  STEP3_TIME_DELAY: 19,   // Col S: Time Delay (PROTECTED)
  SHUTDOWN_DATE_GIVEN: 20,// Col T: Shut Down Date
  STEP3_STATUS: 21,       // Col U: Status
  NEXT_CALL_DATE: 22,     // Col V: Next Call Date
  
  // Step 4: Shutdown Inspection
  STEP4_PLANNED: 23,      // Col W: Planned (PROTECTED)
  STEP4_ACTUAL: 24,       // Col X: Actual (TIMESTAMP - Real Date Object)
  STEP4_DELAY: 25,        // Col Y: Delay (PROTECTED)
  STEP4_INSPECTOR: 26,    // Col Z: Inspector Incharge
  NEXT_START_DATE: 27,    // Col AA: Campaign Starting Date
  
  // Step 5: Restart the Process
  STEP5_PLANNED: 28,      // Col AB: Planned (PROTECTED)
  STEP5_ACTUAL: 29,       // Col AC: Actual (TIMESTAMP - Real Date Object)
  STEP5_STATUS: 30,       // Col AD: Status
  STEP5_DELAY: 31         // Col AE: Delay (PROTECTED)
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

// Uploads a base64 encoded file directly to the user's Google Drive folder
function saveBase64ToDrive(base64Data, fileName, folderId) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  if (!base64Data.startsWith('data:')) {
    return base64Data; // Already a URL or link
  }
  try {
    const parts = base64Data.split(',');
    if (parts.length < 2) return '';
    const meta = parts[0];
    const raw = parts[1];
    
    let mimeType = 'image/jpeg';
    const mimeMatch = meta.match(/data:([^;]+);/);
    if (mimeMatch) mimeType = mimeMatch[1];
    
    const bytes = Utilities.base64Decode(raw);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId || DRIVE_FOLDER_ID);
    } catch (e) {
      folder = DriveApp.getRootFolder();
    }
    
    const file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}
    
    return file.getUrl();
  } catch (err) {
    Logger.log('Drive upload error: ' + err.toString());
    return '';
  }
}

// Gets or creates the dedicated "Running Kiln Inspection" tab with 21 columns
function getOrCreateRunningSheet(ss) {
  let sheet = ss.getSheetByName(RUNNING_SHEET_NAME) || ss.getSheetByName('running kiln inspection');
  if (!sheet) {
    sheet = ss.insertSheet(RUNNING_SHEET_NAME);
    const headers = [
      'Service Order',
      'Party Name',
      'Kiln No. & Size',
      'Campaign No.',
      'Campaign Start Date',
      'Name of Inspector Incharge',
      'Inner Temperature of Kiln (°C)',
      'Expected Shutdown Date',
      'No. of Days Since Kiln Start',
      'Campaign Life Format Slip',
      'Photo of Inner Temp Reading',
      'Zone 1',
      'Zone 2',
      'Zone 3',
      'Zone 4',
      'Zone 5',
      'Zone 6',
      'Zone 7',
      'Zone 8',
      'Zone 9',
      'Average Outer Shell Temperature'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E0F2FE');
  }
  return sheet;
}

// Finds existing row for Service Order No in "Running Kiln Inspection" sheet
function findRowInRunningSheet(sheet, serviceOrderNo) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const target = String(serviceOrderNo || '').trim().toUpperCase();
  for (let i = 0; i < values.length; i++) {
    const val = String(values[i][0] || '').trim().toUpperCase();
    if (val === target) {
      return i + 2; // 1-based row index (Row 1 is header)
    }
  }
  return -1;
}

// Saves full Running Kiln Inspection details (including 9 zones & Drive links) into dedicated tab
function saveRunningInspectionToDedicatedSheet(ss, serviceOrderNo, data, now) {
  const rSheet = getOrCreateRunningSheet(ss);
  let row = findRowInRunningSheet(rSheet, serviceOrderNo);
  const isNew = (row === -1);
  if (isNew) {
    row = rSheet.getLastRow() + 1;
    if (row < 2) row = 2;
  }
  
  // 1. Process files into Google Drive
  let innerPhotoUrl = data.innerTempPhoto || data.innerPhoto || '';
  if (innerPhotoUrl && innerPhotoUrl.startsWith('data:')) {
    const photoName = serviceOrderNo + '_InnerTemp_' + Utilities.formatDate(now, "Asia/Kolkata", "yyyyMMdd_HHmmss") + '.jpg';
    innerPhotoUrl = saveBase64ToDrive(innerPhotoUrl, photoName, DRIVE_FOLDER_ID);
  }
  
  let slipUrl = data.campaignLifeFormatSlip || data.campaignLifeSlip || '';
  if (slipUrl && slipUrl.startsWith('data:')) {
    const slipExt = data.campaignLifeFormatSlipName && data.campaignLifeFormatSlipName.indexOf('.') !== -1
      ? data.campaignLifeFormatSlipName.substring(data.campaignLifeFormatSlipName.lastIndexOf('.'))
      : '.pdf';
    const slipName = serviceOrderNo + '_CampaignSlip_' + Utilities.formatDate(now, "Asia/Kolkata", "yyyyMMdd_HHmmss") + slipExt;
    slipUrl = saveBase64ToDrive(slipUrl, slipName, DRIVE_FOLDER_ID);
  }

  // Zone readings (Zone 1 to 9)
  const zones = Array.isArray(data.zoneTemps) ? data.zoneTemps : (Array.isArray(data.zones) ? data.zones : []);
  
  // Col 1 (A): Service Order
  rSheet.getRange(row, 1).setValue(serviceOrderNo);
  // Col 2 (B): Party Name
  if (data.partyName || data.companyName) rSheet.getRange(row, 2).setValue(data.partyName || data.companyName);
  // Col 3 (C): Kiln No. & Size
  if (data.kilnNoAndSize) rSheet.getRange(row, 3).setValue(data.kilnNoAndSize);
  // Col 4 (D): Campaign No.
  if (data.campaignNo) rSheet.getRange(row, 4).setValue(data.campaignNo);
  // Col 5 (E): Campaign Start Date
  if (data.campaignStartDate) setDateCell(rSheet, row, 5, data.campaignStartDate);
  // Col 6 (F): Name of Inspector Incharge
  if (data.inspector || data.inspectionIncharge) rSheet.getRange(row, 6).setValue(data.inspector || data.inspectionIncharge);
  // Col 7 (G): Inner Temperature of Kiln (°C)
  if (data.innerTemp !== undefined && data.innerTemp !== null && data.innerTemp !== '') rSheet.getRange(row, 7).setValue(data.innerTemp);
  // Col 8 (H): Expected Shutdown Date
  if (data.expectedShutdownDate) setDateCell(rSheet, row, 8, data.expectedShutdownDate);
  // Col 9 (I): No. of Days Since Kiln Start
  if (data.daysSinceStart !== undefined && data.daysSinceStart !== null && data.daysSinceStart !== '') rSheet.getRange(row, 9).setValue(data.daysSinceStart);
  // Col 10 (J): Campaign Life Format Slip
  if (slipUrl) rSheet.getRange(row, 10).setValue(slipUrl);
  // Col 11 (K): Photo of Inner Temp Reading
  if (innerPhotoUrl) rSheet.getRange(row, 11).setValue(innerPhotoUrl);
  
  // Col 12-20 (L-T): Zone 1 to Zone 9
  for (let z = 0; z < 9; z++) {
    const zVal = zones[z];
    if (zVal !== undefined && zVal !== null && zVal !== '') {
      rSheet.getRange(row, 12 + z).setValue(zVal);
    }
  }
  // Col 21 (U): Average Outer Shell Temperature
  if (data.avgTemp !== undefined && data.avgTemp !== null && data.avgTemp !== '') {
    rSheet.getRange(row, 21).setValue(data.avgTemp);
  }
  
  return {
    innerPhotoUrl: innerPhotoUrl,
    slipUrl: slipUrl,
    row: row
  };
}

// Gets or creates the dedicated "Followup for Shutdown" tab matching the user's columns
function getOrCreateFollowupSheet(ss) {
  let sheet = ss.getSheetByName(FOLLOWUP_SHEET_NAME) || ss.getSheetByName('Followup For Shutdown') || ss.getSheetByName('followup for shutdown');
  if (!sheet) {
    sheet = ss.insertSheet(FOLLOWUP_SHEET_NAME);
    const headers = [
      'Date & Time',
      'Order No.',
      'Party Name',
      'Person Called',
      'Designation',
      'Mobile',
      'Shut Down Date Given',
      'Shut Down Date Expected / Next Date'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E0F2FE');
  }
  return sheet;
}

// Saves full call followup log directly into "Followup for Shutdown" tab
function saveFollowupToDedicatedSheet(ss, serviceOrderNo, data, now) {
  const fSheet = getOrCreateFollowupSheet(ss);
  const lastCol = Math.max(fSheet.getLastColumn(), 8);
  const headers = fSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  
  const colDateTime = headers.findIndex(function(h) { return (h.indexOf('date') !== -1 && h.indexOf('time') !== -1) || h.indexOf('timestamp') !== -1; });
  const colOrderNo = headers.findIndex(function(h) { return h.indexOf('order') !== -1 || h.indexOf('cn') !== -1; });
  const colPartyName = headers.findIndex(function(h) { return h.indexOf('party') !== -1 || h.indexOf('company') !== -1; });
  const colPersonCalled = headers.findIndex(function(h) { return h.indexOf('person') !== -1 || h.indexOf('called') !== -1; });
  const colDesignation = headers.findIndex(function(h) { return h.indexOf('designation') !== -1; });
  const colMobile = headers.findIndex(function(h) { return h.indexOf('mobile') !== -1 || h.indexOf('phone') !== -1; });
  let colGiven = headers.findIndex(function(h) { return h.indexOf('given') !== -1 || (h.indexOf('status') !== -1 && h.indexOf('date') === -1); });
  const colExpectedNext = headers.findIndex(function(h) { return h.indexOf('given') === -1 && (h.indexOf('expected') !== -1 || h.indexOf('next') !== -1 || (h.indexOf('shut') !== -1 && h.indexOf('date') !== -1)); });

  // If header for "Shut Down Date Given" does not exist, add it to column 8 (Col H)
  if (colGiven === -1) {
    const statusColIdx = 8;
    fSheet.getRange(1, statusColIdx).setValue('Shut Down Date Given').setFontWeight('bold').setBackground('#E0F2FE');
    colGiven = statusColIdx - 1; // 0-based
  }

  const callTime = data.timestamp ? (parseToDate(data.timestamp) || now) : now;
  const timeFormatted = Utilities.formatDate(callTime, "Asia/Kolkata", "dd/MM/yyyy HH:mm:ss");

  // Append new row for every call record (maintaining series Call-01, Call-02, ...)
  let row = fSheet.getLastRow() + 1;
  if (row < 2) row = 2;

  // Set Date & Time
  fSheet.getRange(row, colDateTime !== -1 ? colDateTime + 1 : 1).setValue(timeFormatted);
  // Set Order No.
  fSheet.getRange(row, colOrderNo !== -1 ? colOrderNo + 1 : 2).setValue(serviceOrderNo);
  // Set Party Name
  if (data.partyName) fSheet.getRange(row, colPartyName !== -1 ? colPartyName + 1 : 3).setValue(data.partyName);
  // Set Person Called
  if (data.personCalled) fSheet.getRange(row, colPersonCalled !== -1 ? colPersonCalled + 1 : 4).setValue(data.personCalled);
  // Set Designation
  if (data.designation) fSheet.getRange(row, colDesignation !== -1 ? colDesignation + 1 : 5).setValue(data.designation);
  // Set Mobile
  if (data.mobile) fSheet.getRange(row, colMobile !== -1 ? colMobile + 1 : 6).setValue("'" + String(data.mobile).trim());

  // Shut Down Date Expected / Next Date
  const targetDateCol = colExpectedNext !== -1 ? colExpectedNext + 1 : 7;
  if (data.expectedShutdownDate) {
    setDateCell(fSheet, row, targetDateCol, data.expectedShutdownDate);
  } else if (data.nextCallDate) {
    setDateCell(fSheet, row, targetDateCol, data.nextCallDate);
  }

  // Shut Down Date Given (Outcome)
  const statusOutcome = String(data.shutdownDateGiven || data.status || '').trim();
  if (colGiven !== -1 && statusOutcome) {
    fSheet.getRange(row, colGiven + 1).setValue(statusOutcome);
  }

  return row;
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
        String(u.role || 'User').trim(),
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
    
    const sheet = ss.getSheetByName('FMS') || ss.getActiveSheet();
    
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
      }
      // Also delete from Running Kiln Inspection sheet
      try {
        const rSheet = ss.getSheetByName(RUNNING_SHEET_NAME) || ss.getSheetByName('running kiln inspection');
        if (rSheet) {
          const rRow = findRowInRunningSheet(rSheet, serviceOrderNo);
          if (rRow !== -1) {
            rSheet.deleteRow(rRow);
          }
        }
      } catch (delErr) {}

      // Also delete from Followup for Shutdown sheet
      try {
        const fSheet = ss.getSheetByName(FOLLOWUP_SHEET_NAME) || ss.getSheetByName('Followup For Shutdown') || ss.getSheetByName('followup for shutdown');
        if (fSheet && fSheet.getLastRow() >= 2) {
          for (let r = fSheet.getLastRow(); r >= 2; r--) {
            const ord = String(fSheet.getRange(r, 2).getValue() || '').trim().toUpperCase();
            if (ord === serviceOrderNo.toUpperCase()) {
              fSheet.deleteRow(r);
            }
          }
        }
      } catch (fDelErr) {}

      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'deleted',
        row: row,
        serviceOrderNo: serviceOrderNo
      })).setMimeType(ContentService.MimeType.JSON);
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
      // NOTE: Planned and Delay columns are PROTECTED - NEVER write to them!
    }
    
    // STEP 2: Running Kiln Inspection
    let runningResult = null;
    if (step === 2 || step === 'running' || (step === 'full' && data.actualStep2)) {
      if (data.avgTemp) setCellSafe(sheet, row, COLS.AVG_TEMP, data.avgTemp);
      setTimestampCell(sheet, row, COLS.STEP2_ACTUAL, data.actualStep2 || now);
      if (data.daysSinceStart !== undefined && data.daysSinceStart !== null && data.daysSinceStart !== '') {
        setCellSafe(sheet, row, COLS.DAYS_SINCE_START, data.daysSinceStart);
      }
      if (data.expectedShutdownDate) setDateCell(sheet, row, COLS.EXPECTED_SHUTDOWN, data.expectedShutdownDate);
      if (data.inspector || data.inspectorStep2) setCellSafe(sheet, row, COLS.STEP2_INSPECTOR, data.inspector || data.inspectorStep2);
      // NOTE: Planned and Delay columns are PROTECTED - NEVER write to them!

      // Also save full details to dedicated "Running Kiln Inspection" tab & Google Drive folder
      try {
        runningResult = saveRunningInspectionToDedicatedSheet(ss, serviceOrderNo, data, now);
      } catch (rErr) {
        Logger.log('Error saving to Running Kiln Inspection tab: ' + rErr.toString());
      }
    }
    
    // STEP 3: Take Shut Down date
    if (step === 3 || step === 'call' || (step === 'full' && (data.actualStep3 || data.statusStep3 || data.shutdownDateGiven || data.nextCallDate))) {
      var rawStatus = String(data.status || data.statusStep3 || data.shutdownDateGiven || '');
      var cleanStatus = rawStatus.replace(/^\d+\.\s*/, '').trim();
      var isConfirmed = cleanStatus.indexOf('Yes') !== -1 || cleanStatus.indexOf('Forget') !== -1;

      if (isConfirmed) {
        setTimestampCell(sheet, row, COLS.STEP3_ACTUAL, data.actualStep3 || now);
        if (data.expectedShutdownDate || data.shutdownDate) {
          setDateCell(sheet, row, COLS.SHUTDOWN_DATE_GIVEN, data.expectedShutdownDate || data.shutdownDate);
        }
        // If confirmed, clear Next Call Date in Col V
        if (COLS.NEXT_CALL_DATE) {
          sheet.getRange(row, COLS.NEXT_CALL_DATE).setValue('');
        }
      } else {
        // When "No shutdown date not taken", Actual and Shutdown Date in main FMS sheet are left empty so Step 3 stays pending!
        sheet.getRange(row, COLS.STEP3_ACTUAL).setValue('');
        sheet.getRange(row, COLS.SHUTDOWN_DATE_GIVEN).setValue('');
        // Save Next Call Date into Col V!
        if (COLS.NEXT_CALL_DATE && data.nextCallDate) {
          setDateCell(sheet, row, COLS.NEXT_CALL_DATE, data.nextCallDate);
        }
      }

      if (cleanStatus) {
        setCellSafe(sheet, row, COLS.STEP3_STATUS, cleanStatus);
      }
      // NOTE: Planned and Delay columns are PROTECTED - NEVER write to them!

      // Also save full call followup log directly into "Followup for Shutdown" tab
      try {
        saveFollowupToDedicatedSheet(ss, serviceOrderNo, data, now);
      } catch (fErr) {
        Logger.log('Error saving to Followup sheet: ' + fErr.toString());
      }
    }
    
    // STEP 4: Shutdown Inspection
    if (step === 4 || step === 'shutdown' || (step === 'full' && data.actualStep4)) {
      if (data.avgThickness) setCellSafe(sheet, row, COLS.AVG_THICKNESS, data.avgThickness);
      setTimestampCell(sheet, row, COLS.STEP4_ACTUAL, data.actualStep4 || now);
      if (data.inspector || data.inspectorStep4) setCellSafe(sheet, row, COLS.STEP4_INSPECTOR, data.inspector || data.inspectorStep4);
      if (data.nextCampaignStartDate) setDateCell(sheet, row, COLS.NEXT_START_DATE, data.nextCampaignStartDate);
      // NOTE: Planned and Delay columns are PROTECTED - NEVER write to them!
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
      runningDetails: runningResult,
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
  const stepParam = e && e.parameter ? e.parameter.step : null;

  if (sheetParam.toLowerCase() === 'login' || sheetParam.toLowerCase() === 'login page' || actionParam === 'getUsers') {
    let loginSheet = ss.getSheetByName('Login Page') || ss.getSheetByName('Login') || ss.getSheetByName('login') || ss.getSheetByName('login page') || ss.getSheetByName('Users');
    if (!loginSheet) {
      // Auto-create Login sheet with headers if not present
      loginSheet = ss.insertSheet('Login');
      const headers = ['User ID', 'Name', 'Password', 'Role', 'Status', 'Access', 'Last Login'];
      loginSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      loginSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E8F0FE');
      loginSheet.appendRow(['admin', 'Admin User', '123', 'Admin', 'Active', 'All', '']);
      loginSheet.appendRow(['sanjay', 'Sanjay Singh', '123', 'User', 'Active', 'dashboard, running, take-shutdown-date, shutdown-inspection', '']);
      loginSheet.appendRow(['ahitesh', 'Ahitesh', '123', 'User', 'Active', 'dashboard, visit, take-shutdown-date, restart-process, masters', '']);
    } else if (loginSheet.getLastRow() <= 1) {
      // If sheet exists with only header, populate initial users
      loginSheet.appendRow(['admin', 'Admin User', '123', 'Admin', 'Active', 'All', '']);
      loginSheet.appendRow(['sanjay', 'Sanjay Singh', '123', 'User', 'Active', 'dashboard, running, take-shutdown-date, shutdown-inspection', '']);
      loginSheet.appendRow(['ahitesh', 'Ahitesh', '123', 'User', 'Active', 'dashboard, visit, take-shutdown-date, restart-process, masters', '']);
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
        
        const rawRole = String(row[colRole !== -1 ? colRole : 3] || 'User').trim();
        const rawAccess = colAccess !== -1 ? String(row[colAccess] || '').trim() : '';

        users.push({
          row: i + 1,
          userId: uId || uName.toLowerCase().replace(/\s+/g, ''),
          name: uName || uId,
          password: String(row[colPass !== -1 ? colPass : 2] || '').trim(),
          role: /^(admin|administrator)$/i.test(rawRole) ? 'Admin' : 'User',
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

  // 2. SUPPORT FOR DEDICATED "MASTER" SHEET
  if (sheetParam.toLowerCase() === 'master' || actionParam === 'getMaster') {
    let mSheet = ss.getSheetByName('Master') || ss.getSheetByName('master');
    const companies = [];
    const kilnSizes = [];
    if (mSheet && mSheet.getLastRow() >= 1) {
      const lastRow = mSheet.getLastRow();
      const lastCol = Math.max(mSheet.getLastColumn(), 2);
      const mData = mSheet.getRange(1, 1, lastRow, lastCol).getValues();
      for (let i = 0; i < mData.length; i++) {
        const valA = String(mData[i][0] || '').trim();
        const valB = String(mData[i][1] || '').trim();
        if (valA && valA.toLowerCase() !== 'name of the company' && !companies.includes(valA)) {
          companies.push(valA);
        }
        if (valB && valB.toLowerCase() !== 'size of kiln' && !kilnSizes.includes(valB)) {
          kilnSizes.push(valB);
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      sheet: 'Master',
      totalCompanies: companies.length,
      totalKilnSizes: kilnSizes.length,
      companies: companies,
      kilnSizes: kilnSizes
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 3. SUPPORT FOR DEDICATED "RUNNING KILN INSPECTION" SHEET
  if (sheetParam.toLowerCase() === 'running kiln inspection' || sheetParam.toLowerCase() === 'running' || stepParam === 'running_full') {
    let rSheet = ss.getSheetByName(RUNNING_SHEET_NAME) || ss.getSheetByName('running kiln inspection');
    const runningRecords = [];
    if (rSheet && rSheet.getLastRow() >= 2) {
      const rData = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 21).getValues();
      for (let i = 0; i < rData.length; i++) {
        const rOrder = String(rData[i][0] || '').trim();
        if (!rOrder) continue;
        runningRecords.push({
          row: i + 2,
          serviceOrderNo: rOrder,
          partyName: rData[i][1],
          kilnNoAndSize: rData[i][2],
          campaignNo: rData[i][3],
          campaignStartDate: rData[i][4],
          inspector: rData[i][5],
          innerTemp: rData[i][6],
          expectedShutdownDate: rData[i][7],
          daysSinceStart: rData[i][8],
          campaignLifeFormatSlip: rData[i][9],
          innerTempPhoto: rData[i][10],
          zone1: rData[i][11],
          zone2: rData[i][12],
          zone3: rData[i][13],
          zone4: rData[i][14],
          zone5: rData[i][15],
          zone6: rData[i][16],
          zone7: rData[i][17],
          zone8: rData[i][18],
          zone9: rData[i][19],
          avgTemp: rData[i][20]
        });
      }
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      sheet: 'Running Kiln Inspection',
      total: runningRecords.length,
      rows: runningRecords
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 3. SUPPORT FOR DEDICATED "FOLLOWUP FOR SHUTDOWN" SHEET
  if (sheetParam.toLowerCase() === 'followup for shutdown' || sheetParam.toLowerCase() === 'followup' || sheetParam.toLowerCase() === 'followup_shutdown') {
    let fSheet = ss.getSheetByName(FOLLOWUP_SHEET_NAME) || ss.getSheetByName('Followup For Shutdown') || ss.getSheetByName('followup for shutdown');
    const followupRecords = [];
    if (fSheet && fSheet.getLastRow() >= 2) {
      const lastRow = fSheet.getLastRow();
      const lastCol = Math.max(fSheet.getLastColumn(), 8);
      const fData = fSheet.getRange(1, 1, lastRow, lastCol).getValues();
      const headers = fData[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
      
      const colDateTime = headers.findIndex(function(h) { return (h.indexOf('date') !== -1 && h.indexOf('time') !== -1) || h.indexOf('timestamp') !== -1; });
      const colOrderNo = headers.findIndex(function(h) { return h.indexOf('order') !== -1 || h.indexOf('cn') !== -1; });
      const colPartyName = headers.findIndex(function(h) { return h.indexOf('party') !== -1 || h.indexOf('company') !== -1; });
      const colPersonCalled = headers.findIndex(function(h) { return h.indexOf('person') !== -1 || h.indexOf('called') !== -1; });
      const colDesignation = headers.findIndex(function(h) { return h.indexOf('designation') !== -1; });
      const colMobile = headers.findIndex(function(h) { return h.indexOf('mobile') !== -1 || h.indexOf('phone') !== -1; });
      let colGiven = headers.findIndex(function(h) { return h.indexOf('given') !== -1 || (h.indexOf('status') !== -1 && h.indexOf('date') === -1); });
      if (colGiven === -1 && fData[0].length >= 8) {
        colGiven = 7; // Col H is 0-based index 7
      }
      const colExpectedNext = headers.findIndex(function(h) { return h.indexOf('given') === -1 && (h.indexOf('expected') !== -1 || h.indexOf('next') !== -1 || (h.indexOf('shut') !== -1 && h.indexOf('date') !== -1)); });

      for (let i = 1; i < fData.length; i++) {
        const row = fData[i];
        const rOrder = String(row[colOrderNo !== -1 ? colOrderNo : 1] || '').trim();
        if (!rOrder) continue;

        const rawDate = row[colDateTime !== -1 ? colDateTime : 0];
        const rawOutcome = colGiven !== -1 ? String(row[colGiven] || '').trim() : '';
        const rawNextDate = colExpectedNext !== -1 ? row[colExpectedNext] : '';
        const isNo = rawOutcome.indexOf('No') !== -1;
        const isYes = rawOutcome.indexOf('Yes') !== -1;

        followupRecords.push({
          row: i + 1,
          timestamp: rawDate instanceof Date ? Utilities.formatDate(rawDate, "Asia/Kolkata", "dd/MM/yyyy HH:mm:ss") : String(rawDate || ''),
          serviceOrderNo: rOrder,
          partyName: String(row[colPartyName !== -1 ? colPartyName : 2] || ''),
          personCalled: String(row[colPersonCalled !== -1 ? colPersonCalled : 3] || ''),
          designation: String(row[colDesignation !== -1 ? colDesignation : 4] || 'Processor'),
          mobile: String(row[colMobile !== -1 ? colMobile : 5] || '').replace(/^'/, ''),
          shutdownDateGiven: rawOutcome || (isNo ? 'No shutdown date not taken' : (isYes ? 'Yes Shutdown date taken' : 'Pending Call')),
          expectedShutdownDate: (isYes || (!rawOutcome && rawNextDate && !isNo)) ? rawNextDate : '',
          nextCallDate: isNo ? rawNextDate : ''
        });
      }
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      sheet: 'Followup for Shutdown',
      total: followupRecords.length,
      rows: followupRecords
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Pre-load Running Kiln Inspection records to enrich main FMS rows
  const runningMap = {};
  try {
    const rSheet = ss.getSheetByName(RUNNING_SHEET_NAME) || ss.getSheetByName('running kiln inspection');
    if (rSheet && rSheet.getLastRow() >= 2) {
      const rData = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 21).getValues();
      for (let i = 0; i < rData.length; i++) {
        const rOrder = String(rData[i][0] || '').trim().toUpperCase();
        if (!rOrder) continue;
        runningMap[rOrder] = {
          serviceOrderNo: rData[i][0],
          partyName: rData[i][1],
          kilnNoAndSize: rData[i][2],
          campaignNo: rData[i][3],
          campaignStartDate: rData[i][4],
          inspector: rData[i][5],
          innerTemp: rData[i][6],
          expectedShutdownDate: rData[i][7],
          daysSinceStart: rData[i][8],
          campaignLifeFormatSlip: rData[i][9],
          innerTempPhoto: rData[i][10],
          zoneTemps: [
            rData[i][11], rData[i][12], rData[i][13],
            rData[i][14], rData[i][15], rData[i][16],
            rData[i][17], rData[i][18], rData[i][19]
          ],
          avgTemp: rData[i][20]
        };
      }
    }
  } catch (errMap) {}

  // 3. FMS MAIN SHEET HANDLING
  const sheet = ss.getSheetByName('FMS') || ss.getActiveSheet();
  const maxRows = Math.min(sheet.getMaxRows(), 500);
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
      
      const rDetails = runningMap[order.toUpperCase()] || null;
      
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
          avgTemp: (rDetails && rDetails.avgTemp) || data[i][COLS.AVG_TEMP - 1],
          avgThickness: data[i][COLS.AVG_THICKNESS - 1],
          planned: data[i][COLS.STEP2_PLANNED - 1],
          actual: data[i][COLS.STEP2_ACTUAL - 1],
          delay: data[i][COLS.STEP2_DELAY - 1],
          daysSinceStart: (rDetails && rDetails.daysSinceStart !== undefined && rDetails.daysSinceStart !== '') ? rDetails.daysSinceStart : data[i][COLS.DAYS_SINCE_START - 1],
          expectedShutdownDate: (rDetails && rDetails.expectedShutdownDate) || data[i][COLS.EXPECTED_SHUTDOWN - 1],
          inspector: (rDetails && rDetails.inspector) || data[i][COLS.STEP2_INSPECTOR - 1],
          runningDetails: rDetails
        });
      } else if (stepParam == '3' || stepParam === 'call') {
        result.push({
          row: rowNum,
          serviceOrderNo: order,
          planned: data[i][COLS.STEP3_PLANNED - 1],
          actual: data[i][COLS.STEP3_ACTUAL - 1],
          delay: data[i][COLS.STEP3_TIME_DELAY - 1],
          shutdownDate: data[i][COLS.SHUTDOWN_DATE_GIVEN - 1],
          status: data[i][COLS.STEP3_STATUS - 1],
          nextCallDate: (COLS.NEXT_CALL_DATE && data[i][COLS.NEXT_CALL_DATE - 1]) ? data[i][COLS.NEXT_CALL_DATE - 1] : ''
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
          
          avgTemp: (rDetails && rDetails.avgTemp) || data[i][COLS.AVG_TEMP - 1],
          avgThickness: data[i][COLS.AVG_THICKNESS - 1],
          step2Planned: data[i][COLS.STEP2_PLANNED - 1],
          step2Actual: data[i][COLS.STEP2_ACTUAL - 1],
          step2Delay: data[i][COLS.STEP2_DELAY - 1],
          daysSinceStart: (rDetails && rDetails.daysSinceStart !== undefined && rDetails.daysSinceStart !== '') ? rDetails.daysSinceStart : data[i][COLS.DAYS_SINCE_START - 1],
          expectedShutdownDate: (rDetails && rDetails.expectedShutdownDate) || data[i][COLS.EXPECTED_SHUTDOWN - 1],
          step2Inspector: (rDetails && rDetails.inspector) || data[i][COLS.STEP2_INSPECTOR - 1],
          runningDetails: rDetails,
          
          step3Planned: data[i][COLS.STEP3_PLANNED - 1],
          step3Actual: data[i][COLS.STEP3_ACTUAL - 1],
          step3Delay: data[i][COLS.STEP3_TIME_DELAY - 1],
          shutdownDate: data[i][COLS.SHUTDOWN_DATE_GIVEN - 1],
          step3Status: String(data[i][COLS.STEP3_STATUS - 1] || '').replace(/^\d+\.\s*/, '').trim(),
          nextCallDate: (COLS.NEXT_CALL_DATE && data[i][COLS.NEXT_CALL_DATE - 1]) ? data[i][COLS.NEXT_CALL_DATE - 1] : '',
          step3NextCallDate: (COLS.NEXT_CALL_DATE && data[i][COLS.NEXT_CALL_DATE - 1]) ? data[i][COLS.NEXT_CALL_DATE - 1] : '',
          
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
