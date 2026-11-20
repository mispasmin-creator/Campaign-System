import { describe, expect, it } from 'vitest';
import { buildAppDataFromSheetRows } from '../services/googleSheets';
import { getPageAccessLevel, hasPageAccess } from '../services/auth';

describe('10-entry workflow scenario smoke test', () => {
  it('loads ten different record conditions without dropping or crashing', () => {
    const rows = [
      { serviceOrderNo: 'QA-01', companyName: 'Pending Visit', campaignStartDate: '20/11/2026', step1Status: 'Pending' },
      { serviceOrderNo: 'QA-02', companyName: 'Running On Track', campaignStartDate: '19/11/2026', step2Actual: '20/11/2026', avgTemp: '950' },
      { serviceOrderNo: 'QA-03', companyName: 'Running Delayed', campaignStartDate: '01/11/2026', step2Actual: '20/11/2026', step2Delay: 5, avgTemp: '880' },
      { serviceOrderNo: 'QA-04', companyName: 'Shutdown Confirmed', campaignStartDate: '01/10/2026', step3Status: 'Yes Shutdown date taken', expectedShutdownDate: '25/11/2026' },
      { serviceOrderNo: 'QA-05', companyName: 'Shutdown Forgotten', campaignStartDate: '01/10/2026', step3Status: 'Forget to taken' },
      { serviceOrderNo: 'QA-06', companyName: 'Shutdown Not Taken', campaignStartDate: '01/10/2026', step3Status: 'No shutdown date not taken' },
      { serviceOrderNo: 'QA-07', companyName: 'Inspection Complete', campaignStartDate: '01/09/2026', step4Actual: '20/11/2026', avgThickness: 180, zoneThickness: [344, 356, 234, 234, 455, 345, 233, 334, 444] },
      { serviceOrderNo: 'QA-08', companyName: 'Inspection Critical', campaignStartDate: '01/09/2026', step4Actual: '20/11/2026', avgThickness: 150, zoneThickness: [120, 140, 150, 160, 155, 145, 130, 125, 135] },
      { serviceOrderNo: 'QA-09', companyName: 'Restart Pending', campaignStartDate: '01/08/2026', step5Planned: '27/11/2026' },
      { serviceOrderNo: 'QA-10', companyName: 'Closed Campaign', campaignStartDate: '01/07/2026', step5Actual: '20/11/2026', status: 'closed' }
    ];
    const result = buildAppDataFromSheetRows(rows);
    expect(result.orders).toHaveLength(10);
    expect(new Set(result.orders.map((order) => order.serviceOrderNo)).size).toBe(10);
    expect(result.orders.find((order) => order.serviceOrderNo === 'QA-04')?.callFollowupStatus).toBe('Yes Shutdown date taken');
    expect(result.orders.find((order) => order.serviceOrderNo === 'QA-05')?.callFollowupStatus).toBe('Forget to taken');
    expect(result.orders.find((order) => order.serviceOrderNo === 'QA-10')?.status).toBe('closed');
  });

  it('keeps view-only and full-access permissions distinct', () => {
    const viewUser = { role: 'User', access: 'view:running' };
    const fullUser = { role: 'User', access: 'full:running' };
    expect(getPageAccessLevel(viewUser, 'running')).toBe('view');
    expect(getPageAccessLevel(fullUser, 'running')).toBe('full');
    expect(hasPageAccess(viewUser, 'running')).toBe(true);
    expect(hasPageAccess(viewUser, 'masters')).toBe(false);
  });
});
