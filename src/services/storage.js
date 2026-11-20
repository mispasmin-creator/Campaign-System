/**
 * Storage Service: Single source of truth for localStorage persistence.
 * All functions return Promises (async) to allow smooth migration to backend.
 */

const STORAGE_KEY = 'campaign-life-fms-v1';

// Seed 6 Companies with kycNo, siteIncharge, mobile, gstNo, registeredAddress
export const SEED_COMPANIES = [
  { id: 'c1', name: 'Alankar Alloys Pvt Ltd', kycNo: 'KYC-001', gstNo: '22AABCA1234F1Z1', siteIncharge: 'Shravan Yadav', mobile: '9753779531', registeredAddress: 'Industrial Growth Centre, Siltara, Raipur (C.G.)' },
  { id: 'c2', name: 'Agrawal Sponge Pvt Ltd', kycNo: 'KYC-002', gstNo: '22AABCA5678G1Z2', siteIncharge: 'Harish Dewangan', mobile: '9755521321', registeredAddress: 'Urla Industrial Complex, Raipur (C.G.)' },
  { id: 'c3', name: 'Amalgam Steel & Power Ltd', kycNo: 'KYC-003', gstNo: '22AABCA9012H1Z3', siteIncharge: 'Tilak Verma', mobile: '9669186207', registeredAddress: 'Plot 45, Tilda Industrial Area, Raipur (C.G.)' },
  { id: 'c4', name: 'Action Ispat And Power', kycNo: 'KYC-004', gstNo: '22AABCA3456J1Z4', siteIncharge: 'Satish Gupta', mobile: '9229273149', registeredAddress: 'Industrial Area, Borai, Durg (C.G.)' },
  { id: 'c5', name: 'Aarti Sponge & Power Ltd', kycNo: 'KYC-005', gstNo: '22AABCA7890K1Z5', siteIncharge: 'Ramesh Patel', mobile: '9827113422', registeredAddress: 'Village Machadand, Bilaspur (C.G.)' },
  { id: 'c6', name: 'Ambica Minerals', kycNo: 'KYC-006', gstNo: '22AABCA2345L1Z6', siteIncharge: 'Anand Agrawal', mobile: '9425208841', registeredAddress: 'Industrial Area, Raigarh (C.G.)' }
];

// Seed 10 Kilns across the 6 companies
export const SEED_KILNS = [
  { id: 'k1', companyId: 'c1', kilnNo: 1, size: '100 TPD' },
  { id: 'k2', companyId: 'c1', kilnNo: 2, size: '120 TPD' },
  { id: 'k3', companyId: 'c2', kilnNo: 1, size: '350 TPD' },
  { id: 'k4', companyId: 'c2', kilnNo: 2, size: '100 TPD' },
  { id: 'k5', companyId: 'c3', kilnNo: 1, size: '150 TPD' },
  { id: 'k6', companyId: 'c3', kilnNo: 2, size: '250 TPD' },
  { id: 'k7', companyId: 'c4', kilnNo: 1, size: '100 TPD' },
  { id: 'k8', companyId: 'c4', kilnNo: 2, size: '150 TPD' },
  { id: 'k9', companyId: 'c5', kilnNo: 1, size: '100 TPD' },
  { id: 'k10', companyId: 'c6', kilnNo: 1, size: '80 TPD' }
];

export const EMPTY_DATABASE = {
  companies: [...SEED_COMPANIES],
  kilns: [...SEED_KILNS],
  kilnSizes: ['80 TPD', '100 TPD', '120 TPD', '150 TPD'],
  orders: [],
  visits: [],
  runningInspections: [],
  shutdownInspections: [],
  restartProcesses: [],
  callLogs: [],
  stepTasks: [],
  historicalCampaigns: [],
  settings: { offsets: { running: 7, call: -3, shutdown: 0, restart: 2 } },
  isSyncedFromSheet: false
};

// 12 Orders spread across the workflow
function generateSeedData() {
  const orders = [
    // Step 1: Company visit (Sales)
    {
      serviceOrderNo: 'CN-06',
      companyId: 'c1',
      kilnId: 'k2',
      campaignNo: '1',
      campaignStartDate: '2026-11-07',
      expectedShutdownDate: '2026-12-15',
      status: 'open'
    },
    {
      serviceOrderNo: 'CN-07',
      companyId: 'c3',
      kilnId: 'k6',
      campaignNo: '4',
      campaignStartDate: '2026-11-12',
      expectedShutdownDate: '2026-12-28',
      status: 'open'
    },
    // Step 2: Running inspection (Sanjay)
    {
      serviceOrderNo: 'CN-05',
      companyId: 'c2',
      kilnId: 'k3',
      campaignNo: '4',
      campaignStartDate: '2026-11-01',
      expectedShutdownDate: '2026-12-04',
      status: 'open'
    },
    {
      serviceOrderNo: 'CN-08',
      companyId: 'c5',
      kilnId: 'k9',
      campaignNo: '2',
      campaignStartDate: '2026-10-25',
      expectedShutdownDate: '2026-11-28',
      status: 'open'
    },
    {
      serviceOrderNo: 'CN-09',
      companyId: 'c1',
      kilnId: 'k1',
      campaignNo: '1',
      campaignStartDate: '2026-11-02',
      expectedShutdownDate: '2026-12-10',
      status: 'open'
    },
    // Step 3: Take shutdown date (Sanjay)
    {
      serviceOrderNo: 'CN-01',
      companyId: 'c4',
      kilnId: 'k8',
      campaignNo: '3',
      campaignStartDate: '2026-05-02',
      expectedShutdownDate: '2026-11-14',
      callFollowupStatus: null,
      status: 'open'
    },
    {
      serviceOrderNo: 'CN-03',
      companyId: 'c3',
      kilnId: 'k5',
      campaignNo: '5',
      campaignStartDate: '2026-05-18',
      expectedShutdownDate: '2026-11-12',
      callFollowupStatus: null,
      status: 'open'
    },
    {
      serviceOrderNo: 'CN-04',
      companyId: 'c5',
      kilnId: 'k9',
      campaignNo: '2',
      campaignStartDate: '2026-05-20',
      expectedShutdownDate: '2026-11-18',
      callFollowupStatus: null,
      status: 'open'
    },
    // Step 4: Shutdown inspection (Sanjay)
    {
      serviceOrderNo: 'CN-02',
      companyId: 'c4',
      kilnId: 'k7',
      campaignNo: '2',
      campaignStartDate: '2026-06-01',
      expectedShutdownDate: '2026-11-08',
      callFollowupStatus: 'Yes Shutdown date taken',
      status: 'open'
    },
    {
      serviceOrderNo: 'CN-10',
      companyId: 'c6',
      kilnId: 'k10',
      campaignNo: '6',
      campaignStartDate: '2026-05-10',
      expectedShutdownDate: '2026-11-14',
      callFollowupStatus: 'Yes Shutdown date taken',
      status: 'open'
    },
    // Step 5: Restart the process (CRM) / Closed
    {
      serviceOrderNo: 'CN-11',
      companyId: 'c2',
      kilnId: 'k4',
      campaignNo: '3',
      campaignStartDate: '2026-05-01',
      expectedShutdownDate: '2026-11-04',
      callFollowupStatus: 'Yes Shutdown date taken',
      status: 'open'
    },
    {
      serviceOrderNo: 'CN-12',
      companyId: 'c6',
      kilnId: 'k10',
      campaignNo: '1',
      campaignStartDate: '2026-05-05',
      expectedShutdownDate: '2026-11-12',
      callFollowupStatus: 'Yes Shutdown date taken',
      status: 'closed'
    }
  ];

  // Tasks reflecting the workflow states of these 12 orders
  const stepTasks = [
    // CN-06: Pending Visit (Sales) - Delayed
    { id: 't-1', serviceOrderNo: 'CN-06', step: 'visit', owner: 'Sales', plannedDate: '2026-11-07', actualDate: null, delayDays: 4, status: 'pending' },
    // CN-07: Pending Visit (Sales) - On Track
    { id: 't-2', serviceOrderNo: 'CN-07', step: 'visit', owner: 'Sales', plannedDate: '2026-11-12', actualDate: null, delayDays: 0, status: 'pending' },

    // CN-05: Visit Done, Running Due Today
    { id: 't-3a', serviceOrderNo: 'CN-05', step: 'visit', owner: 'Sales', plannedDate: '2026-11-01', actualDate: '2026-11-01', delayDays: 0, status: 'done' },
    { id: 't-3b', serviceOrderNo: 'CN-05', step: 'running', owner: 'Sanjay', plannedDate: '2026-11-11', actualDate: null, delayDays: 0, status: 'pending' },

    // CN-08: Visit Done, Running Late
    { id: 't-4a', serviceOrderNo: 'CN-08', step: 'visit', owner: 'Sales', plannedDate: '2026-10-25', actualDate: '2026-10-25', delayDays: 0, status: 'done' },
    { id: 't-4b', serviceOrderNo: 'CN-08', step: 'running', owner: 'Sanjay', plannedDate: '2026-11-03', actualDate: null, delayDays: 8, status: 'pending' },

    // CN-09: Visit Done, Running On Track
    { id: 't-5a', serviceOrderNo: 'CN-09', step: 'visit', owner: 'Sales', plannedDate: '2026-11-02', actualDate: '2026-11-02', delayDays: 0, status: 'done' },
    { id: 't-5b', serviceOrderNo: 'CN-09', step: 'running', owner: 'Sanjay', plannedDate: '2026-11-11', actualDate: null, delayDays: 0, status: 'pending' },

    // CN-01: Running Done, Call Pending (Late next call)
    { id: 't-6a', serviceOrderNo: 'CN-01', step: 'running', owner: 'Sanjay', plannedDate: '2026-05-10', actualDate: '2026-05-10', delayDays: 0, status: 'done' },
    { id: 't-6b', serviceOrderNo: 'CN-01', step: 'call', owner: 'Sanjay', plannedDate: '2026-11-10', actualDate: null, delayDays: 1, status: 'pending' },

    // CN-03: Running Done, Call Pending (Next call today)
    { id: 't-7a', serviceOrderNo: 'CN-03', step: 'running', owner: 'Sanjay', plannedDate: '2026-05-26', actualDate: '2026-05-26', delayDays: 0, status: 'done' },
    { id: 't-7b', serviceOrderNo: 'CN-03', step: 'call', owner: 'Sanjay', plannedDate: '2026-11-07', actualDate: null, delayDays: 4, status: 'pending' },

    // CN-04: Running Done, Call Pending (Next call in 2 days)
    { id: 't-8a', serviceOrderNo: 'CN-04', step: 'running', owner: 'Sanjay', plannedDate: '2026-05-28', actualDate: '2026-05-28', delayDays: 0, status: 'done' },
    { id: 't-8b', serviceOrderNo: 'CN-04', step: 'call', owner: 'Sanjay', plannedDate: '2026-11-13', actualDate: null, delayDays: 0, status: 'pending' },

    // CN-02: Call Done (Yes), Shutdown Inspection Planned
    { id: 't-9a', serviceOrderNo: 'CN-02', step: 'call', owner: 'Sanjay', plannedDate: '2026-11-04', actualDate: '2026-11-04', delayDays: 0, status: 'done' },
    { id: 't-9b', serviceOrderNo: 'CN-02', step: 'shutdown', owner: 'Sanjay', plannedDate: '2026-11-08', actualDate: null, delayDays: 3, status: 'pending' },

    // CN-10: Call Done (Yes), Shutdown Inspection Planned
    { id: 't-10a', serviceOrderNo: 'CN-10', step: 'call', owner: 'Sanjay', plannedDate: '2026-11-10', actualDate: '2026-11-10', delayDays: 0, status: 'done' },
    { id: 't-10b', serviceOrderNo: 'CN-10', step: 'shutdown', owner: 'Sanjay', plannedDate: '2026-11-14', actualDate: null, delayDays: 0, status: 'pending' },

    // CN-11: Shutdown Done, Restart Process Pending (CRM)
    { id: 't-11a', serviceOrderNo: 'CN-11', step: 'shutdown', owner: 'Sanjay', plannedDate: '2026-11-04', actualDate: '2026-11-04', delayDays: 0, status: 'done' },
    { id: 't-11b', serviceOrderNo: 'CN-11', step: 'restart', owner: 'CRM', plannedDate: '2026-11-06', actualDate: null, delayDays: 5, status: 'pending' },

    // CN-12: Closed History
    { id: 't-12a', serviceOrderNo: 'CN-12', step: 'shutdown', owner: 'Sanjay', plannedDate: '2026-11-12', actualDate: '2026-11-12', delayDays: 0, status: 'done' },
    { id: 't-12b', serviceOrderNo: 'CN-12', step: 'restart', owner: 'CRM', plannedDate: '2026-11-14', actualDate: '2026-11-14', delayDays: 0, status: 'done' }
  ];

  // Company Visits history (populated for all seed orders)
  const visits = [
    { serviceOrderNo: 'CN-01', companyId: 'c4', companyName: 'Action Ispat And Power', kilnNo: 2, kilnSize: '150 TPD', campaignNo: '3', campaignStartDate: '2026-05-02', visitedBy: 'Sales Co-ordinator', date: '2026-05-02' },
    { serviceOrderNo: 'CN-02', companyId: 'c4', companyName: 'Action Ispat And Power', kilnNo: 1, kilnSize: '100 TPD', campaignNo: '2', campaignStartDate: '2026-06-01', visitedBy: 'Sales Co-ordinator', date: '2026-06-01' },
    { serviceOrderNo: 'CN-03', companyId: 'c3', companyName: 'Amalgam Steel & Power Ltd', kilnNo: 1, kilnSize: '150 TPD', campaignNo: '5', campaignStartDate: '2026-05-18', visitedBy: 'Sales Co-ordinator', date: '2026-05-18' },
    { serviceOrderNo: 'CN-04', companyId: 'c5', companyName: 'Aarti Sponge & Power Ltd', kilnNo: 1, kilnSize: '100 TPD', campaignNo: '2', campaignStartDate: '2026-05-20', visitedBy: 'Sales Co-ordinator', date: '2026-05-20' },
    { serviceOrderNo: 'CN-05', companyId: 'c2', companyName: 'Agrawal Sponge Pvt Ltd', kilnNo: 1, kilnSize: '350 TPD', campaignNo: '4', campaignStartDate: '2026-11-01', visitedBy: 'Sales Co-ordinator', date: '2026-11-01' },
    { serviceOrderNo: 'CN-06', companyId: 'c1', companyName: 'Alankar Alloys Pvt Ltd', kilnNo: 2, kilnSize: '120 TPD', campaignNo: '1', campaignStartDate: '2026-11-07', visitedBy: 'Sales Co-ordinator', date: '2026-11-07' },
    { serviceOrderNo: 'CN-07', companyId: 'c3', companyName: 'Amalgam Steel & Power Ltd', kilnNo: 2, kilnSize: '250 TPD', campaignNo: '4', campaignStartDate: '2026-11-12', visitedBy: 'Sales Co-ordinator', date: '2026-11-12' },
    { serviceOrderNo: 'CN-08', companyId: 'c5', companyName: 'Aarti Sponge & Power Ltd', kilnNo: 1, kilnSize: '100 TPD', campaignNo: '2', campaignStartDate: '2026-10-25', visitedBy: 'Sales Co-ordinator', date: '2026-10-25' },
    { serviceOrderNo: 'CN-09', companyId: 'c1', companyName: 'Alankar Alloys Pvt Ltd', kilnNo: 1, kilnSize: '100 TPD', campaignNo: '1', campaignStartDate: '2026-11-02', visitedBy: 'Sales Co-ordinator', date: '2026-11-02' },
    { serviceOrderNo: 'CN-10', companyId: 'c6', companyName: 'Ambica Minerals', kilnNo: 1, kilnSize: '80 TPD', campaignNo: '6', campaignStartDate: '2026-05-10', visitedBy: 'Sales Co-ordinator', date: '2026-05-10' },
    { serviceOrderNo: 'CN-11', companyId: 'c2', companyName: 'Agrawal Sponge Pvt Ltd', kilnNo: 2, kilnSize: '100 TPD', campaignNo: '3', campaignStartDate: '2026-05-01', visitedBy: 'Sales Co-ordinator', date: '2026-05-01' },
    { serviceOrderNo: 'CN-12', companyId: 'c6', companyName: 'Ambica Minerals', kilnNo: 1, kilnSize: '80 TPD', campaignNo: '1', campaignStartDate: '2026-05-05', visitedBy: 'Sales Co-ordinator', date: '2026-05-05' }
  ];

  const runningInspections = [
    {
      serviceOrderNo: 'CN-01',
      visitDate: '2026-05-10',
      inspector: '',
      innerTemp: 1120,
      innerTempPhoto: '',
      zoneTemps: [170, 208, 205, 244, 248, 263, 295, 224, 190],
      avgTemp: 227.4,
      expectedShutdownDate: '2026-11-14',
      daysSinceStart: 8
    },
    {
      serviceOrderNo: 'CN-03',
      visitDate: '2026-05-26',
      inspector: '',
      innerTemp: 1090,
      innerTempPhoto: '',
      zoneTemps: [160, 200, 195, 225, 235, 255, 280, 215, 185],
      avgTemp: 216.7,
      expectedShutdownDate: '2026-11-12',
      daysSinceStart: 8
    },
    {
      serviceOrderNo: 'CN-04',
      visitDate: '2026-05-28',
      inspector: '',
      innerTemp: 1100,
      innerTempPhoto: '',
      zoneTemps: [155, 195, 190, 220, 232, 248, 270, 212, 182],
      avgTemp: 211.6,
      expectedShutdownDate: '2026-11-18',
      daysSinceStart: 8
    }
  ];

  const shutdownInspections = [
    {
      serviceOrderNo: 'CN-11',
      what: 'Done',
      inspectionDate: '2026-11-04',
      inspector: '',
      companyName: 'Agrawal Sponge Pvt Ltd',
      zoneThickness: [198, 194, 184, 172, 158, 150, 166, 180, 192],
      zonePhotos: Array(9).fill(''),
      avgThickness: 177.1,
      nextCampaignStartDate: '2026-11-06'
    },
    {
      serviceOrderNo: 'CN-12',
      what: 'Done',
      inspectionDate: '2026-11-12',
      inspector: '',
      companyName: 'Ambica Minerals',
      zoneThickness: [200, 198, 190, 182, 170, 165, 178, 188, 196],
      zonePhotos: Array(9).fill(''),
      avgThickness: 185.2,
      nextCampaignStartDate: '2026-11-14'
    }
  ];

  const historicalCampaigns = [
    {
      companyId: 'c2',
      kilnId: 'k3',
      campaignNo: '1',
      startDate: '2025-01-12',
      endDate: '2025-06-29',
      daysRun: 168,
      thickness: [200, 200, 195, 190, 185, 180, 190, 195, 200],
      temp: [150, 190, 185, 215, 225, 240, 265, 210, 180],
      status: 'Closed'
    },
    {
      companyId: 'c2',
      kilnId: 'k3',
      campaignNo: '2',
      startDate: '2025-07-02',
      endDate: '2025-12-30',
      daysRun: 181,
      thickness: [200, 198, 190, 182, 170, 165, 178, 188, 196],
      temp: [160, 200, 195, 225, 235, 255, 280, 215, 185],
      status: 'Closed'
    },
    {
      companyId: 'c4',
      kilnId: 'k8',
      campaignNo: '1',
      startDate: '2025-02-20',
      endDate: '2025-07-10',
      daysRun: 140,
      thickness: [200, 196, 190, 184, 176, 170, 180, 190, 198],
      temp: [155, 195, 190, 220, 232, 248, 270, 212, 182],
      status: 'Closed'
    },
    {
      companyId: 'c4',
      kilnId: 'k8',
      campaignNo: '2',
      startDate: '2025-07-15',
      endDate: '2025-12-17',
      daysRun: 155,
      thickness: [199, 194, 186, 176, 166, 158, 170, 184, 194],
      temp: [165, 204, 198, 232, 240, 258, 286, 220, 188],
      status: 'Closed'
    }
  ];

  // Call Logs (matching exact dropdowns: Processor/Purchaser and 3 outcome choices)
  const callLogs = [
    {
      timestamp: '2026-11-03T10:15:00Z',
      serviceOrderNo: 'CN-01',
      partyName: 'Action Ispat And Power',
      personCalled: 'Manish Chobey Ji',
      designation: 'Processor',
      mobile: '9826144021',
      shutdownDateGiven: 'No shutdown date not taken',
      expectedShutdownDate: '2026-11-14',
      nextCallDate: '2026-11-06'
    },
    {
      timestamp: '2026-11-06T11:30:00Z',
      serviceOrderNo: 'CN-01',
      partyName: 'Action Ispat And Power',
      personCalled: 'Manish Chobey Ji',
      designation: 'Processor',
      mobile: '9826144021',
      shutdownDateGiven: 'No shutdown date not taken',
      expectedShutdownDate: '2026-11-14',
      nextCallDate: '2026-11-10'
    },
    {
      timestamp: '2026-11-07T14:20:00Z',
      serviceOrderNo: 'CN-03',
      partyName: 'Amalgam Steel & Power Ltd',
      personCalled: 'Tilak Verma',
      designation: 'Processor',
      mobile: '9669186207',
      shutdownDateGiven: 'No shutdown date not taken',
      expectedShutdownDate: '2026-11-12',
      nextCallDate: '2026-11-11'
    },
    {
      timestamp: '2026-11-08T16:00:00Z',
      serviceOrderNo: 'CN-04',
      partyName: 'Aarti Sponge & Power Ltd',
      personCalled: 'Satish Gupta',
      designation: 'Purchaser',
      mobile: '9229273149',
      shutdownDateGiven: 'No shutdown date not taken',
      expectedShutdownDate: '2026-11-18',
      nextCallDate: '2026-11-13'
    },
    {
      timestamp: '2026-11-04T12:00:00Z',
      serviceOrderNo: 'CN-02',
      partyName: 'Action Ispat And Power',
      personCalled: 'Harish Dewangan',
      designation: 'Processor',
      mobile: '9755521321',
      shutdownDateGiven: 'Yes Shutdown date taken',
      expectedShutdownDate: '2026-11-08',
      nextCallDate: null
    },
    {
      timestamp: '2026-11-05T15:30:00Z',
      serviceOrderNo: 'CN-10',
      partyName: 'Ambica Minerals',
      personCalled: 'Anand Agrawal',
      designation: 'Purchaser',
      mobile: '9425208841',
      shutdownDateGiven: 'Yes Shutdown date taken',
      expectedShutdownDate: '2026-11-14',
      nextCallDate: null
    }
  ];

  return {
    companies: SEED_COMPANIES,
    kilns: SEED_KILNS,
    kilnSizes: ['80 TPD', '100 TPD', '120 TPD', '150 TPD'],
    orders,
    stepTasks,
    visits,
    runningInspections,
    shutdownInspections,
    historicalCampaigns,
    callLogs,
    settings: {
      offsets: {
        running: 7,
        call: -3,
        shutdown: 0,
        restart: 2
      }
    }
  };
}

/**
 * Returns an empty local structure. Live records come from Google Sheet.
 */
export async function getData() {
  try {
    // Application records are owned by Google Sheet, not browser storage.
    const parsed = JSON.parse(JSON.stringify(EMPTY_DATABASE));
    
    // Ensure all collections and fields exist cleanly
    if (!Array.isArray(parsed.companies) || parsed.companies.length === 0) {
      parsed.companies = [...SEED_COMPANIES];
    } else {
      parsed.companies = parsed.companies.map((c) => {
        const seedMatch = SEED_COMPANIES.find((s) => s.id === c.id);
        return {
          id: c.id,
          name: c.name,
          kycNo: c.kycNo !== undefined ? c.kycNo : (seedMatch?.kycNo || ''),
          gstNo: c.gstNo || seedMatch?.gstNo || '',
          siteIncharge: c.siteIncharge || seedMatch?.siteIncharge || '',
          mobile: c.mobile || seedMatch?.mobile || '',
          registeredAddress: c.registeredAddress || seedMatch?.registeredAddress || ''
        };
      });
    }

    if (!Array.isArray(parsed.kilns) || parsed.kilns.length === 0) {
      parsed.kilns = [...SEED_KILNS];
    }

    if (!Array.isArray(parsed.kilnSizes) || parsed.kilnSizes.length === 0) {
      parsed.kilnSizes = ['80 TPD', '100 TPD', '120 TPD', '150 TPD'];
    }

    // If local storage still holds legacy mock seed data (never synced from Google Sheet), wipe out fake mock orders
    if (!parsed.isSyncedFromSheet && Array.isArray(parsed.orders) && parsed.orders.some((o) => o.serviceOrderNo === 'CN-01' && o.companyId === 'c4')) {
      parsed.orders = [];
      parsed.visits = [];
      parsed.runningInspections = [];
      parsed.shutdownInspections = [];
      parsed.callLogs = [];
      parsed.stepTasks = [];
    }

    // Do NOT forcefully regenerate seed orders! If orders is empty, it stays empty!
    if (!Array.isArray(parsed.orders)) parsed.orders = [];
    if (!Array.isArray(parsed.visits)) parsed.visits = [];
    if (!Array.isArray(parsed.runningInspections)) parsed.runningInspections = [];
    if (!Array.isArray(parsed.shutdownInspections)) parsed.shutdownInspections = [];
    if (!Array.isArray(parsed.callLogs)) parsed.callLogs = [];
    if (!Array.isArray(parsed.stepTasks)) parsed.stepTasks = [];
    if (!Array.isArray(parsed.historicalCampaigns)) parsed.historicalCampaigns = [];
    
    // Sanitize any legacy hardcoded 'Sanjay Singh' from older demo data
    parsed.runningInspections.forEach((ins) => {
      if (ins.inspector === 'Sanjay Singh') ins.inspector = '';
    });
    parsed.shutdownInspections.forEach((ins) => {
      if (ins.inspector === 'Sanjay Singh') ins.inspector = '';
    });

    // Sanitize any legacy number prefixes (e.g. "1. Yes Shutdown date taken") from status
    if (Array.isArray(parsed.orders)) {
      parsed.orders.forEach((o) => {
        if (typeof o.callFollowupStatus === 'string') {
          o.callFollowupStatus = o.callFollowupStatus.replace(/^\d+\.\s*/, '');
        }
      });
    }
    if (Array.isArray(parsed.callLogs)) {
      parsed.callLogs.forEach((c) => {
        if (typeof c.shutdownDateGiven === 'string') {
          c.shutdownDateGiven = c.shutdownDateGiven.replace(/^\d+\.\s*/, '');
        }
      });
    }

    if (!parsed.settings?.offsets) {
      parsed.settings = { offsets: { running: 7, call: -3, shutdown: 0, restart: 2 } };
    }
    return parsed;
  } catch (err) {
    console.error('Failed to create empty database structure', err);
    return { ...EMPTY_DATABASE };
  }
}

/**
 * Local persistence is disabled; Google Sheet is the source of truth.
 */
export async function saveData(data) {
  // Mutations must be synced to Google Sheet by the caller first.
  return data;
}

/**
 * Resets local database to seed data.
 */
export async function resetDemo() {
  const seed = generateSeedData();
  await saveData(seed);
  return seed;
}

/**
 * Exports data as a downloadable JSON file.
 */
export async function exportData(data) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `campaign-life-fms-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates and imports data from a JSON file.
 */
export async function importData(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed.orders || !parsed.companies || !parsed.kilns) {
    throw new Error('Invalid backup file. Required campaign collections (orders, companies, kilns) are missing.');
  }
  await saveData(parsed);
  return parsed;
}

/**
 * Client-side image resize helper:
 * Resizes image file to max 800px on the longest dimension and returns a compressed base64 data URL.
 */
export function resizeImage(file, maxDimension = 800) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress as JPEG 0.78 quality to minimize size
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
