/**
 * Campaign Life FMS - Google Apps Script
 * Tab 1: "FMS" (Main Workflow)
 * Tab 2: "Running Kiln Inspection" (Detailed inspections with all photos & zones)
 * Tab 3: "Followup for Shutdown" (Dedicated call followup log)
 * Tab 4: "Login" (User authentication and page-level access control)
 */

var START_ROW = 7;
var DRIVE_FOLDER_ID = '1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8';

function normalizeUserRole(role) {
  var value = String(role || '').trim().toLowerCase();
  return value === 'admin' || value === 'administrator' ? 'Admin' : 'User';
}

var COLS = {
  // Step 1: Company Visit — exact FMS row 6 mapping
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

function parseToDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    var s = val.trim();
    var dmyTime = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\s+(\d{1,2}):(\d{1,2}):?(\d{1,2})?/);
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
    var isoDate = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (isoDate) {
      return new Date(
        parseInt(isoDate[1], 10),
        parseInt(isoDate[2], 10) - 1,
        parseInt(isoDate[3], 10)
      );
    }
    var dmyDate = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (dmyDate) {
      return new Date(
        parseInt(dmyDate[3], 10),
        parseInt(dmyDate[2], 10) - 1,
        parseInt(dmyDate[1], 10)
      );
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function setTimestampCell(sheet, row, col, val) {
  var dateObj = parseToDate(val) || new Date();
  var cell = sheet.getRange(row, col);
  cell.setValue(dateObj);
  cell.setNumberFormat("dd/MM/yyyy HH:mm:ss");
}

function setDateCell(sheet, row, col, val) {
  if (!val) return;
  var dateObj = parseToDate(val);
  var cell = sheet.getRange(row, col);
  if (dateObj) {
    cell.setValue(dateObj);
    cell.setNumberFormat("dd/MM/yyyy");
  } else {
    cell.setValue(val);
  }
}

function findRowByServiceOrder(sheet, serviceOrderNo) {
  var maxRows = Math.min(sheet.getMaxRows(), 500);
  var values = sheet.getRange(START_ROW, COLS.SERVICE_ORDER_NO, maxRows - START_ROW + 1, 1).getValues();
  var target = String(serviceOrderNo || '').trim().toUpperCase();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toUpperCase() === target) {
      return START_ROW + i;
    }
  }
  return -1;
}

function findNextAvailableRow(sheet) {
  var maxRows = Math.min(sheet.getMaxRows(), 500);
  var values = sheet.getRange(START_ROW, COLS.SERVICE_ORDER_NO, maxRows - START_ROW + 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (!values[i][0] || String(values[i][0]).trim() === '') {
      return START_ROW + i;
    }
  }
  return START_ROW + values.length;
}

function setCellSafe(sheet, row, col, val) {
  if (val !== undefined && val !== null) {
    sheet.getRange(row, col).setValue(val);
  }
}

function saveBase64ToDrive(base64Data, fileName) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  if (base64Data.indexOf('data:') !== 0) return base64Data;

  try {
    var parts = base64Data.split(',');
    if (parts.length < 2) return '';
    var mimeMatch = parts[0].match(/data:([^;]+);/);
    var mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    var blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), mimeType, fileName);
    var folder;
    try {
      folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    } catch (folderError) {
      folder = DriveApp.getRootFolder();
    }
    var file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {}
    return file.getUrl();
  } catch (error) {
    Logger.log('Drive upload error: ' + error.toString());
    return '';
  }
}

function getOrCreateRunningSheet(ss) {
  var sheet = ss.getSheetByName('Running Kiln Inspection');
  if (!sheet) {
    sheet = ss.insertSheet('Running Kiln Inspection');
    var headers = [
      'Service Order', 'Party Name', 'Kiln No. & Size', 'Campaign No.',
      'Campaign Start Date', 'Name of Inspector Incharge',
      'Inner Temperature of Kiln (°C)', 'Expected Shutdown Date',
      'No. of Days Since Kiln Start', 'Campaign Life Format Slip',
      'Photo of Inner Temp Reading', 'Zone 1', 'Zone 2', 'Zone 3',
      'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8', 'Zone 9',
      'Average Outer Shell Temperature'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E0F2FE');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRowInRunningSheet(sheet, serviceOrderNo) {
  if (sheet.getLastRow() < 2) return -1;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var target = String(serviceOrderNo || '').trim().toUpperCase();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toUpperCase() === target) return i + 2;
  }
  return -1;
}

function saveRunningInspectionToDedicatedSheet(ss, serviceOrderNo, data, now) {
  var sheet = getOrCreateRunningSheet(ss);
  var row = findRowInRunningSheet(sheet, serviceOrderNo);
  if (row === -1) row = Math.max(sheet.getLastRow() + 1, 2);

  var innerPhotoUrl = data.innerTempPhoto || data.innerPhoto || '';
  if (String(innerPhotoUrl).indexOf('data:') === 0) {
    innerPhotoUrl = saveBase64ToDrive(
      innerPhotoUrl,
      serviceOrderNo + '_InnerTemp_' + Utilities.formatDate(now, 'Asia/Kolkata', 'yyyyMMdd_HHmmss') + '.jpg'
    );
  }

  var slipUrl = data.campaignLifeFormatSlip || data.campaignLifeSlip || '';
  if (String(slipUrl).indexOf('data:') === 0) {
    var slipExtension = data.campaignLifeFormatSlipName && data.campaignLifeFormatSlipName.indexOf('.') !== -1
      ? data.campaignLifeFormatSlipName.substring(data.campaignLifeFormatSlipName.lastIndexOf('.'))
      : '.pdf';
    slipUrl = saveBase64ToDrive(
      slipUrl,
      serviceOrderNo + '_CampaignSlip_' + Utilities.formatDate(now, 'Asia/Kolkata', 'yyyyMMdd_HHmmss') + slipExtension
    );
  }

  var zones = Array.isArray(data.zoneTemps)
    ? data.zoneTemps
    : (Array.isArray(data.zones) ? data.zones : []);
  var kilnDisplay = data.kilnNoAndSize || (
    data.kilnNo || data.kilnSize
      ? 'Kiln ' + (data.kilnNo || '') + (data.kilnSize ? ' (' + data.kilnSize + ')' : '')
      : ''
  );

  sheet.getRange(row, 1).setValue(serviceOrderNo);
  if (data.partyName || data.companyName) sheet.getRange(row, 2).setValue(data.partyName || data.companyName);
  if (kilnDisplay) sheet.getRange(row, 3).setValue(kilnDisplay);
  if (data.campaignNo !== undefined && data.campaignNo !== '') sheet.getRange(row, 4).setValue(data.campaignNo);
  if (data.campaignStartDate) setDateCell(sheet, row, 5, data.campaignStartDate);
  if (data.inspector || data.inspectionIncharge) sheet.getRange(row, 6).setValue(data.inspector || data.inspectionIncharge);
  if (data.innerTemp !== undefined && data.innerTemp !== null && data.innerTemp !== '') sheet.getRange(row, 7).setValue(data.innerTemp);
  if (data.expectedShutdownDate) setDateCell(sheet, row, 8, data.expectedShutdownDate);
  if (data.daysSinceStart !== undefined && data.daysSinceStart !== null && data.daysSinceStart !== '') sheet.getRange(row, 9).setValue(data.daysSinceStart);
  if (slipUrl) sheet.getRange(row, 10).setValue(slipUrl);
  if (innerPhotoUrl) sheet.getRange(row, 11).setValue(innerPhotoUrl);

  for (var zoneIndex = 0; zoneIndex < 9; zoneIndex++) {
    if (zones[zoneIndex] !== undefined && zones[zoneIndex] !== null && zones[zoneIndex] !== '') {
      sheet.getRange(row, 12 + zoneIndex).setValue(zones[zoneIndex]);
    }
  }
  if (data.avgTemp !== undefined && data.avgTemp !== null && data.avgTemp !== '') {
    sheet.getRange(row, 21).setValue(data.avgTemp);
  }

  return { row: row, innerPhotoUrl: innerPhotoUrl, slipUrl: slipUrl };
}

function getOrCreateShutdownSheet(ss) {
  var sheet = ss.getSheetByName('Shutdown Inspection');
  if (!sheet) {
    sheet = ss.insertSheet('Shutdown Inspection');
    var headers = [
      'Timestamps', 'Service Order No', 'Name Of The Company', 'What',
      'Inspection Date', 'Name Of Inspection Incharge', '',
      'Distances Between Refractory Zone 1 (mm)',
      'Distances Between Refractory Zone 2 (mm)',
      'Distances Between Refractory Zone 3 (mm)',
      'Distances Between Refractory Zone 4 (mm)',
      'Distances Between Refractory Zone 5 (mm)',
      'Distances Between Refractory Zone 6 (mm)',
      'Distances Between Refractory Zone 7 (mm)',
      'Distances Between Refractory Zone 8 (mm)',
      'Distances Between Refractory Zone 9 (mm)',
      'Photo Zone 1', 'Photo Zone 2', 'Photo Zone 3', 'Photo Zone 4',
      'Photo Zone 5', 'Photo Zone 6', 'Photo Zone 7', 'Photo Zone 8',
      'Photo Zone 9', 'Campaign Starting Date '
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E0F2FE');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRowInShutdownSheet(sheet, serviceOrderNo) {
  if (sheet.getLastRow() < 2) return -1;
  var values = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  var target = String(serviceOrderNo || '').trim().toUpperCase();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim().toUpperCase() === target) return i + 2;
  }
  return -1;
}

function saveShutdownInspectionToDedicatedSheet(ss, serviceOrderNo, data, now) {
  var sheet = getOrCreateShutdownSheet(ss);
  var row = findRowInShutdownSheet(sheet, serviceOrderNo);
  if (row === -1) row = Math.max(sheet.getLastRow() + 1, 2);

  var distances = Array.isArray(data.zoneThickness)
    ? data.zoneThickness
    : (Array.isArray(data.zoneDistances) ? data.zoneDistances : []);
  var photos = Array.isArray(data.zonePhotos) ? data.zonePhotos : [];

  setTimestampCell(sheet, row, 1, data.timestamp || now);
  sheet.getRange(row, 2).setValue(serviceOrderNo);
  if (data.companyName || data.partyName) sheet.getRange(row, 3).setValue(data.companyName || data.partyName);
  if (data.what) sheet.getRange(row, 4).setValue(data.what);
  if (data.inspectionDate) setDateCell(sheet, row, 5, data.inspectionDate);
  if (data.inspector || data.inspectionIncharge) sheet.getRange(row, 6).setValue(data.inspector || data.inspectionIncharge);

  for (var index = 0; index < 9; index++) {
    if (distances[index] !== undefined && distances[index] !== null && distances[index] !== '') {
      sheet.getRange(row, 8 + index).setValue(distances[index]);
    }

    var photo = photos[index] || '';
    if (String(photo).indexOf('data:') === 0) {
      photo = saveBase64ToDrive(
        photo,
        serviceOrderNo + '_Shutdown_Zone' + (index + 1) + '_' +
          Utilities.formatDate(now, 'Asia/Kolkata', 'yyyyMMdd_HHmmss') + '.jpg'
      );
    }
    if (photo) sheet.getRange(row, 17 + index).setValue(photo);
  }

  if (data.nextCampaignStartDate) setDateCell(sheet, row, 26, data.nextCampaignStartDate);
  return { row: row };
}

function getOrCreateFollowupSheet(ss) {
  var fSheet = ss.getSheetByName('Followup for Shutdown') || ss.getSheetByName('Followup for shutdown') || ss.getSheetByName('Followup');
  if (!fSheet) {
    fSheet = ss.insertSheet('Followup for Shutdown');
    var headers = ['Date & Time', 'Order No.', 'Party Name', 'Person Called', 'Designation', 'Mobile', 'Shut Down Date Given', 'Expected / Next Date'];
    fSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#E0F2FE');
    fSheet.setFrozenRows(1);
  }
  return fSheet;
}

function saveFollowupToDedicatedSheet(ss, serviceOrderNo, data, now) {
  var fSheet = getOrCreateFollowupSheet(ss);
  var lastCol = Math.max(fSheet.getLastColumn(), 8);
  var headers = fSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  
  var colDateTime = headers.findIndex(function(h) { return (h.indexOf('date') !== -1 && h.indexOf('time') !== -1) || h.indexOf('timestamp') !== -1; });
  var colOrderNo = headers.findIndex(function(h) { return h.indexOf('order') !== -1 || h.indexOf('cn') !== -1; });
  var colPartyName = headers.findIndex(function(h) { return h.indexOf('party') !== -1 || h.indexOf('company') !== -1; });
  var colPersonCalled = headers.findIndex(function(h) { return h.indexOf('person') !== -1 || h.indexOf('called') !== -1; });
  var colDesignation = headers.findIndex(function(h) { return h.indexOf('designation') !== -1; });
  var colMobile = headers.findIndex(function(h) { return h.indexOf('mobile') !== -1 || h.indexOf('phone') !== -1; });
  var colGiven = headers.findIndex(function(h) { return h.indexOf('given') !== -1 || (h.indexOf('status') !== -1 && h.indexOf('date') === -1); });
  var colExpectedNext = headers.findIndex(function(h) { return h.indexOf('given') === -1 && (h.indexOf('expected') !== -1 || h.indexOf('next') !== -1); });

  if (colGiven === -1) {
    var statusColIdx = 8;
    fSheet.getRange(1, statusColIdx).setValue('Shut Down Date Given').setFontWeight('bold').setBackground('#E0F2FE');
    colGiven = statusColIdx - 1;
  }

  var callTime = data.timestamp ? (parseToDate(data.timestamp) || now) : now;
  var timeFormatted = Utilities.formatDate(callTime, "Asia/Kolkata", "dd/MM/yyyy HH:mm:ss");

  var row = fSheet.getLastRow() + 1;
  if (row < 2) row = 2;

  fSheet.getRange(row, colDateTime !== -1 ? colDateTime + 1 : 1).setValue(timeFormatted);
  fSheet.getRange(row, colOrderNo !== -1 ? colOrderNo + 1 : 2).setValue(serviceOrderNo);
  if (data.partyName) fSheet.getRange(row, colPartyName !== -1 ? colPartyName + 1 : 3).setValue(data.partyName);
  if (data.personCalled) fSheet.getRange(row, colPersonCalled !== -1 ? colPersonCalled + 1 : 4).setValue(data.personCalled);
  if (data.designation) fSheet.getRange(row, colDesignation !== -1 ? colDesignation + 1 : 5).setValue(data.designation);
  if (data.mobile) fSheet.getRange(row, colMobile !== -1 ? colMobile + 1 : 6).setValue("'" + String(data.mobile).trim());

  var targetDateCol = colExpectedNext !== -1 ? colExpectedNext + 1 : 7;
  if (data.expectedShutdownDate) {
    setDateCell(fSheet, row, targetDateCol, data.expectedShutdownDate);
  } else if (data.nextCallDate) {
    setDateCell(fSheet, row, targetDateCol, data.nextCallDate);
  }

  var statusOutcome = String(data.shutdownDateGiven || data.status || '').trim();
  if (colGiven !== -1 && statusOutcome) {
    fSheet.getRange(row, colGiven + 1).setValue(statusOutcome);
  }

  return row;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    
    var step = payload.step;
    var serviceOrderNo = payload.serviceOrderNo;
    var data = payload.data || {};
    var now = new Date();

    if (!serviceOrderNo) {
      throw new Error('serviceOrderNo is required');
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('FMS') || ss.getActiveSheet();
    
    var row = findRowByServiceOrder(sheet, serviceOrderNo);
    if (row === -1) {
      row = findNextAvailableRow(sheet);
    }
    
    // STEP 1: Company Visit
    if (step === 1 || step === 'visit' || step === 'full') {
      setCellSafe(sheet, row, COLS.SERVICE_ORDER_NO, serviceOrderNo);
      setCellSafe(sheet, row, COLS.COMPANY_NAME, data.companyName);
      if (data.kilnNo) setCellSafe(sheet, row, COLS.KILN_NO, data.kilnNo);
      if (data.kilnSize) setCellSafe(sheet, row, COLS.KILN_SIZE, data.kilnSize);
      if (data.campaignNo) setCellSafe(sheet, row, COLS.CAMPAIGN_NO, data.campaignNo);
      if (data.campaignStartDate) setDateCell(sheet, row, COLS.CAMPAIGN_START_DATE, data.campaignStartDate);
      if (data.inspectionIncharge) setCellSafe(sheet, row, COLS.INSPECTION_INCHARGE, data.inspectionIncharge);
      setTimestampCell(sheet, row, COLS.TIMESTAMP, now);
    }
    
    // STEP 2: Running Kiln Inspection
    var runningResult = null;
    if (step === 2 || step === 'running' || (step === 'full' && data.actualStep2)) {
      if (data.avgTemp) setCellSafe(sheet, row, COLS.AVG_TEMP, data.avgTemp);
      setTimestampCell(sheet, row, COLS.STEP2_ACTUAL, data.actualStep2 || now);
      if (data.daysSinceStart !== undefined && data.daysSinceStart !== '') {
        setCellSafe(sheet, row, COLS.DAYS_SINCE_START, data.daysSinceStart);
      }
      if (data.expectedShutdownDate) {
        setDateCell(sheet, row, COLS.EXPECTED_SHUTDOWN, data.expectedShutdownDate);
      }
      if (data.inspector || data.inspectorStep2) {
        setCellSafe(sheet, row, COLS.STEP2_INSPECTOR, data.inspector || data.inspectorStep2);
      }
      runningResult = saveRunningInspectionToDedicatedSheet(ss, serviceOrderNo, data, now);
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
        if (COLS.NEXT_CALL_DATE) {
          sheet.getRange(row, COLS.NEXT_CALL_DATE).setValue('');
        }
      } else {
        // When "No shutdown date not taken", Actual and Shutdown Date in main FMS sheet are left empty so Step 3 stays pending!
        sheet.getRange(row, COLS.STEP3_ACTUAL).setValue('');
        sheet.getRange(row, COLS.SHUTDOWN_DATE_GIVEN).setValue('');
        if (COLS.NEXT_CALL_DATE && data.nextCallDate) {
          setDateCell(sheet, row, COLS.NEXT_CALL_DATE, data.nextCallDate);
        }
      }

      if (cleanStatus) {
        setCellSafe(sheet, row, COLS.STEP3_STATUS, cleanStatus);
      }

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
      saveShutdownInspectionToDedicatedSheet(ss, serviceOrderNo, data, now);
    }
    
    // STEP 5: Restart the Process
    if (step === 5 || step === 'restart' || (step === 'full' && data.statusStep5)) {
      setTimestampCell(sheet, row, COLS.STEP5_ACTUAL, now);
      setCellSafe(sheet, row, COLS.STEP5_STATUS, data.status || data.statusStep5 || 'Completed');
    }
    
    SpreadsheetApp.flush();

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

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getMainRows(sheet) {
  var rows = [];
  if (!sheet || sheet.getLastRow() < START_ROW) return rows;
  var lastRow = Math.min(sheet.getLastRow(), 500);
  var data = sheet.getRange(START_ROW, 1, lastRow - START_ROW + 1, 31).getValues();

  for (var i = 0; i < data.length; i++) {
    var orderNo = String(data[i][COLS.SERVICE_ORDER_NO - 1] || '').trim();
    if (!orderNo) continue;
    rows.push({
      row: START_ROW + i,
      serviceOrderNo: orderNo,
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
      nextCallDate: data[i][COLS.NEXT_CALL_DATE - 1],
      step3NextCallDate: data[i][COLS.NEXT_CALL_DATE - 1],
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
  return rows;
}

function getRunningRows(ss) {
  var sheet = ss.getSheetByName('Running Kiln Inspection');
  var rows = [];
  if (!sheet || sheet.getLastRow() < 2) return rows;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 21).getValues();
  for (var i = 0; i < data.length; i++) {
    if (!String(data[i][0] || '').trim()) continue;
    rows.push({
      row: i + 2, serviceOrderNo: data[i][0], partyName: data[i][1],
      kilnNoAndSize: data[i][2], campaignNo: data[i][3],
      campaignStartDate: data[i][4], inspector: data[i][5],
      innerTemp: data[i][6], expectedShutdownDate: data[i][7],
      daysSinceStart: data[i][8], campaignLifeFormatSlip: data[i][9],
      innerTempPhoto: data[i][10], zone1: data[i][11], zone2: data[i][12],
      zone3: data[i][13], zone4: data[i][14], zone5: data[i][15],
      zone6: data[i][16], zone7: data[i][17], zone8: data[i][18],
      zone9: data[i][19], zoneTemps: data[i].slice(11, 20), avgTemp: data[i][20]
    });
  }
  return rows;
}

function getShutdownRows(ss) {
  var sheet = ss.getSheetByName('Shutdown Inspection');
  var rows = [];
  if (!sheet || sheet.getLastRow() < 2) return rows;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 26).getValues();
  for (var i = 0; i < data.length; i++) {
    var orderNo = String(data[i][1] || '').trim();
    if (!orderNo) continue;
    rows.push({
      row: i + 2,
      timestamp: data[i][0],
      serviceOrderNo: orderNo,
      companyName: data[i][2],
      what: data[i][3],
      inspectionDate: data[i][4],
      inspector: data[i][5],
      zoneThickness: data[i].slice(7, 16),
      zoneDistances: data[i].slice(7, 16),
      zonePhotos: data[i].slice(16, 25),
      nextCampaignStartDate: data[i][25]
    });
  }
  return rows;
}

function getFollowupRows(ss) {
  var sheet = ss.getSheetByName('Followup for Shutdown');
  var rows = [];
  if (!sheet || sheet.getLastRow() < 2) return rows;
  var lastCol = Math.max(sheet.getLastColumn(), 8);
  var data = sheet.getRange(1, 1, sheet.getLastRow(), lastCol).getValues();
  var headers = data[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  var colDate = headers.findIndex(function(h) { return (h.indexOf('date') !== -1 && h.indexOf('time') !== -1) || h.indexOf('timestamp') !== -1; });
  var colOrder = headers.findIndex(function(h) { return h.indexOf('order') !== -1 || h.indexOf('cn') !== -1; });
  var colParty = headers.findIndex(function(h) { return h.indexOf('party') !== -1 || h.indexOf('company') !== -1; });
  var colPerson = headers.findIndex(function(h) { return h.indexOf('person') !== -1 || h.indexOf('called') !== -1; });
  var colDesignation = headers.findIndex(function(h) { return h.indexOf('designation') !== -1; });
  var colMobile = headers.findIndex(function(h) { return h.indexOf('mobile') !== -1 || h.indexOf('phone') !== -1; });
  var colStatus = headers.findIndex(function(h) { return h.indexOf('given') !== -1 || (h.indexOf('status') !== -1 && h.indexOf('date') === -1); });
  var colExpectedNext = headers.findIndex(function(h) { return h.indexOf('given') === -1 && (h.indexOf('expected') !== -1 || h.indexOf('next') !== -1); });

  for (var i = 1; i < data.length; i++) {
    var orderNo = String(data[i][colOrder >= 0 ? colOrder : 1] || '').trim();
    if (!orderNo) continue;
    var status = String(data[i][colStatus >= 0 ? colStatus : 6] || '').trim();
    var expectedNext = data[i][colExpectedNext >= 0 ? colExpectedNext : 7] || '';
    rows.push({
      row: i + 1, timestamp: data[i][colDate >= 0 ? colDate : 0],
      serviceOrderNo: orderNo, partyName: data[i][colParty >= 0 ? colParty : 2],
      personCalled: data[i][colPerson >= 0 ? colPerson : 3],
      designation: data[i][colDesignation >= 0 ? colDesignation : 4] || 'Processor',
      mobile: String(data[i][colMobile >= 0 ? colMobile : 5] || '').replace(/^'/, ''),
      shutdownDateGiven: status || 'Pending Call',
      expectedShutdownDate: status.indexOf('Yes') !== -1 ? expectedNext : '',
      nextCallDate: status.indexOf('No') !== -1 ? expectedNext : ''
    });
  }
  return rows;
}

function getMasterData(ss) {
  var sheet = ss.getSheetByName('Master');
  var companies = [], kilnSizes = [];
  if (sheet && sheet.getLastRow() >= 1) {
    var data = sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), 2)).getValues();
    for (var i = 0; i < data.length; i++) {
      var company = String(data[i][0] || '').trim();
      var size = String(data[i][1] || '').trim();
      if (company && company.toLowerCase() !== 'name of the company' && companies.indexOf(company) === -1) companies.push(company);
      if (size && size.toLowerCase() !== 'size of kiln' && kilnSizes.indexOf(size) === -1) kilnSizes.push(size);
    }
  }
  return { companies: companies, kilnSizes: kilnSizes };
}

function getLoginUsers(ss) {
  var sheet = ss.getSheetByName('Login') || ss.getSheetByName('Login Page');
  var users = [];
  if (!sheet || sheet.getLastRow() < 2) return users;
  var data = sheet.getRange(1, 1, sheet.getLastRow(), Math.max(sheet.getLastColumn(), 7)).getValues();
  for (var i = 1; i < data.length; i++) {
    var userId = String(data[i][0] || '').trim();
    var name = String(data[i][1] || '').trim();
    if (!userId && !name) continue;
    users.push({
      row: i + 1, userId: userId, name: name,
      password: String(data[i][2] || '').trim(),
      role: normalizeUserRole(data[i][3]),
      status: String(data[i][4] || 'Active').trim(),
      access: String(data[i][5] || '').trim(), lastLogin: data[i][6] || ''
    });
  }
  return users;
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var params = e && e.parameter ? e.parameter : {};
  var requestedSheet = String(params.sheet || params.tab || '').trim().toLowerCase();
  var action = String(params.action || '').trim();
  var step = params.step || 'all';

  if (requestedSheet === 'running kiln inspection' || requestedSheet === 'running') {
    var runningRows = getRunningRows(ss);
    return jsonResponse({ status: 'success', sheet: 'Running Kiln Inspection', total: runningRows.length, rows: runningRows });
  }
  if (requestedSheet === 'shutdown inspection' || requestedSheet === 'shutdown') {
    var shutdownRows = getShutdownRows(ss);
    return jsonResponse({ status: 'success', sheet: 'Shutdown Inspection', total: shutdownRows.length, rows: shutdownRows });
  }
  if (requestedSheet === 'followup for shutdown' || requestedSheet === 'followup' || requestedSheet === 'followup_shutdown') {
    var followupRows = getFollowupRows(ss);
    return jsonResponse({ status: 'success', sheet: 'Followup for Shutdown', total: followupRows.length, rows: followupRows });
  }
  if (requestedSheet === 'master' || action === 'getMaster') {
    var master = getMasterData(ss);
    return jsonResponse({ status: 'success', sheet: 'Master', companies: master.companies, kilnSizes: master.kilnSizes, totalCompanies: master.companies.length, totalKilnSizes: master.kilnSizes.length });
  }
  if (requestedSheet === 'login' || requestedSheet === 'login page' || action === 'getUsers') {
    var users = getLoginUsers(ss);
    return jsonResponse({ status: 'success', sheet: 'Login', total: users.length, users: users });
  }

  var rows = getMainRows(ss.getSheetByName('FMS'));
  return jsonResponse({ status: 'success', step: step, total: rows.length, rows: rows });
}


