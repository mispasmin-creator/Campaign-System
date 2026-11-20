import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayISO, formatDate, avg, addWorkingDays, calendarDaysDiff, getTaskDelay } from '../utils/workflow';
import { saveData, resizeImage } from '../services/storage';
import { syncStepToGoogleSheet, syncStepChangesFromSheet } from '../services/googleSheets';
import Pagination from '../components/Pagination';
import DetailModal from '../components/DetailModal';

export default function RunningInspectionPage({ data, refresh, notify }) {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'history'
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  // View Details Modal State
  const [viewingInspection, setViewingInspection] = useState(null);

  // Pagination states for both tabs
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [isSyncing, setIsSyncing] = useState(false);

  // Edit History Record State
  const [editingInspection, setEditingInspection] = useState(null);
  const [editAvgTemp, setEditAvgTemp] = useState('');
  const [editInspector, setEditInspector] = useState('');
  const [editVisitDate, setEditVisitDate] = useState('');
  const [editExpectedShutdown, setEditExpectedShutdown] = useState('');
  const [editInnerTemp, setEditInnerTemp] = useState('');
  const [editDaysSinceStart, setEditDaysSinceStart] = useState('');
  const [editInnerPhoto, setEditInnerPhoto] = useState('');
  const [editCampaignLifeSlip, setEditCampaignLifeSlip] = useState('');
  const [editCampaignLifeSlipName, setEditCampaignLifeSlipName] = useState('');
  const [editZoneReadings, setEditZoneReadings] = useState(Array(9).fill(''));
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Selected Order for Inspection Form
  const [selectedOrderNo, setSelectedOrderNo] = useState('');
  const [visitDate, setVisitDate] = useState(todayISO());
  const [inspector, setInspector] = useState('');
  const [innerTemp, setInnerTemp] = useState('');
  const [innerPhoto, setInnerPhoto] = useState('');
  const [campaignLifeSlip, setCampaignLifeSlip] = useState('');
  const [campaignLifeSlipName, setCampaignLifeSlipName] = useState('');
  const [expectedShutdown, setExpectedShutdown] = useState('');
  const [zoneReadings, setZoneReadings] = useState(Array(9).fill(''));

  const today = todayISO();

  // 1. Pending Tab Orders: Orders from Company Visit that have Step 2 'running' pending
  // Must NOT already be completed in runningInspections history!
  const completedOrderNos = new Set(
    (data.runningInspections || []).map((ins) => String(ins.serviceOrderNo || '').trim().toUpperCase())
  );

  const pendingRunningTasks = (data.stepTasks || []).filter(
    (t) =>
      t.step === 'running' &&
      t.status === 'pending' &&
      !completedOrderNos.has(String(t.serviceOrderNo || '').trim().toUpperCase())
  );

  const pendingList = pendingRunningTasks.map((task) => {
    const order = (data.orders || []).find((o) => o.serviceOrderNo === task.serviceOrderNo);
    const company = order ? (data.companies || []).find((c) => c.id === order.companyId) : null;
    const kiln = order ? (data.kilns || []).find((k) => k.id === order.kilnId) : null;
    const visit = (data.visits || []).find((v) => v.serviceOrderNo === task.serviceOrderNo);

    return {
      task,
      order,
      company,
      kiln,
      visit,
      serviceOrderNo: task.serviceOrderNo,
      partyName: company ? company.name : 'Unknown Plant',
      kilnNo: kiln ? kiln.kilnNo : visit ? visit.kilnNo : 1,
      kilnSize: kiln ? kiln.size : visit ? visit.kilnSize : '100 TPD',
      campaignNo: order ? order.campaignNo : visit ? visit.campaignNo : '1',
      campaignStartDate: order ? order.campaignStartDate : visit ? visit.campaignStartDate : '—',
      plannedDate: order?.campaignStartDate || visit?.campaignStartDate || task.plannedDate,
      inspectionIncharge: (visit?.inspectionIncharge || visit?.visitedBy || order?.inspectionIncharge || '') === 'Sanjay Singh' ? '' : (visit?.inspectionIncharge || visit?.visitedBy || order?.inspectionIncharge || ''),
      delayDays: getTaskDelay(
        { ...task, plannedDate: order?.campaignStartDate || visit?.campaignStartDate || task.plannedDate },
        today
      )
    };
  });

  // Pre-select order if query param present
  useEffect(() => {
    const orderParam = searchParams.get('order');
    if (orderParam) {
      const row = pendingList.find((p) => p.serviceOrderNo === orderParam);
      if (row) {
        handleOpenInspectionModal(row);
      }
    }
  }, [searchParams]);

  // 2. History Tab: Completed Running Inspections
  const historyList = (data.runningInspections || []).map((ins) => {
    const order = (data.orders || []).find((o) => o.serviceOrderNo === ins.serviceOrderNo);
    const company = order ? (data.companies || []).find((c) => c.id === order.companyId) : null;
    const kiln = order ? (data.kilns || []).find((k) => k.id === order.kilnId) : null;

    const zoneTemps = (Array.isArray(ins.zoneTemps) && ins.zoneTemps.some((v) => v !== null && v !== ''))
      ? ins.zoneTemps
      : (Array.isArray(ins.zones) ? ins.zones : []);

    return {
      ...ins,
      partyName: ins.partyName || (company ? company.name : 'Unknown Plant'),
      kilnNo: ins.kilnNo || (kiln ? kiln.kilnNo : 1),
      kilnSize: ins.kilnSize || (kiln ? kiln.size : '100 TPD'),
      campaignNo: ins.campaignNo || order?.campaignNo || '—',
      campaignStartDate: ins.campaignStartDate || order?.campaignStartDate || null,
      zoneTemps,
      zones: zoneTemps
    };
  });

  // Open Inspection Modal for a specific row
  const handleOpenInspectionModal = (row) => {
    setSelectedOrderNo(row.serviceOrderNo);
    setVisitDate(todayISO());
    const visit = (data.visits || []).find((v) => v.serviceOrderNo === row.serviceOrderNo);
    const ord = (data.orders || []).find((o) => o.serviceOrderNo === row.serviceOrderNo);
    let incharge = row.inspectionIncharge || visit?.inspectionIncharge || visit?.visitedBy || ord?.inspectionIncharge || '';
    if (incharge === 'Sanjay Singh') {
      incharge = '';
    }
    setInspector(incharge);
    setInnerTemp('');
    setInnerPhoto('');
    setCampaignLifeSlip('');
    setCampaignLifeSlipName('');
    setExpectedShutdown(row.order?.expectedShutdownDate || '');
    setZoneReadings(Array(9).fill(''));
    setShowModal(true);
  };

  // Live average of outer temp zones
  const liveAvg = avg(zoneReadings);

  // Helper to cleanly format Zone 1-9 Outer Temps without extraneous commas or spaces
  const formatZoneTempsDisplay = (ins) => {
    if (!ins) return '—';
    const raw = Array.isArray(ins.zoneTemps) && ins.zoneTemps.length > 0
      ? ins.zoneTemps
      : (Array.isArray(ins.zones) ? ins.zones : []);
    const valid = raw
      .map((v) => (v !== null && v !== undefined ? String(v).trim() : ''))
      .filter((v) => v !== '' && v !== '—' && v !== '-' && !isNaN(Number(v)));
    if (valid.length === 0) return '—';
    return valid.join(', ');
  };

  // Active inspecting order details
  const activeRow = pendingList.find((p) => p.serviceOrderNo === selectedOrderNo);
  const daysSinceStart = activeRow?.order
    ? calendarDaysDiff(activeRow.order.campaignStartDate, visitDate)
    : 0;

  // Photo upload with canvas resize
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const resizedBase64 = await resizeImage(file, 800);
      setInnerPhoto(resizedBase64);
      notify('Photo uploaded & resized to max 800px', 'good');
    } catch (err) {
      notify('Photo upload error: ' + err.message, 'bad');
    }
  };

  const handleCampaignLifeSlipUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileData = file.type.startsWith('image/')
        ? await resizeImage(file, 1200)
        : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read the selected file'));
          reader.readAsDataURL(file);
        });
      setCampaignLifeSlip(fileData);
      setCampaignLifeSlipName(file.name);
      notify('Campaign Life Format Slip uploaded', 'good');
    } catch (err) {
      notify('Campaign Life Format Slip upload error: ' + err.message, 'bad');
    }
  };

  // Submit Inspection Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!selectedOrderNo || !visitDate || !expectedShutdown) {
      notify('Please fill all required running inspection fields', 'bad');
      return;
    }

    setIsSubmitting(true);
    try {
      const nextData = { ...data };
      const offsets = nextData.settings?.offsets || { running: 7, call: -3, shutdown: 0, restart: 2 };

      // Mark step 2 task done
      const task = (nextData.stepTasks || []).find(
        (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'running' && t.status === 'pending'
      );
      if (task) {
        const orderForTask = (nextData.orders || []).find((o) => o.serviceOrderNo === selectedOrderNo);
        const campaignStartDate = orderForTask?.campaignStartDate || task.plannedDate;
        const delay = calendarDaysDiff(campaignStartDate, visitDate);
        task.status = 'done';
        task.actualDate = visitDate;
        task.delayDays = delay > 0 ? delay : 0;
      }

      // Update order expected shutdown date and inspection incharge
      const ord = (nextData.orders || []).find((o) => o.serviceOrderNo === selectedOrderNo);
      if (ord) {
        ord.expectedShutdownDate = expectedShutdown;
        if (inspector.trim()) {
          ord.inspectionIncharge = inspector.trim();
        }
      }

      // Record running inspection
      if (!Array.isArray(nextData.runningInspections)) nextData.runningInspections = [];
      const zoneValues = zoneReadings.map((z) => (z === '' ? null : Number(z)));
      const newRunningRecord = {
        serviceOrderNo: selectedOrderNo,
        partyName: activeRow?.partyName || ord?.companyName || 'Unknown Plant',
        kilnNo: ord?.kilnNo || activeRow?.kilnNo || 1,
        kilnSize: ord?.kilnSize || activeRow?.kilnSize || '100 TPD',
        campaignNo: ord?.campaignNo || activeRow?.campaignNo || '1',
        campaignStartDate: ord?.campaignStartDate || activeRow?.campaignStartDate || null,
        visitDate,
        inspector: inspector.trim(),
        innerTemp: innerTemp !== '' ? Number(innerTemp) : '',
        innerTempPhoto: innerPhoto,
        campaignLifeFormatSlip: campaignLifeSlip,
        campaignLifeFormatSlipName: campaignLifeSlipName,
        zoneTemps: zoneValues,
        zones: zoneValues,
        avgTemp: liveAvg,
        expectedShutdownDate: expectedShutdown,
        daysSinceStart
      };

      const existingIdx = nextData.runningInspections.findIndex((r) => r.serviceOrderNo === selectedOrderNo);
      if (existingIdx >= 0) {
        nextData.runningInspections[existingIdx] = {
          ...nextData.runningInspections[existingIdx],
          ...newRunningRecord
        };
      } else {
        nextData.runningInspections.push(newRunningRecord);
      }

      // Schedule Step 3 Task: Take shut down date (expectedShutdown - 3 working days)
      const plannedCall = expectedShutdown;
      const existingCallTask = (nextData.stepTasks || []).find(
        (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'call'
      );

      if (existingCallTask) {
        existingCallTask.plannedDate = plannedCall;
        existingCallTask.status = 'pending';
      } else {
        nextData.stepTasks.push({
          id: `t-${Date.now()}-call`,
          serviceOrderNo: selectedOrderNo,
          step: 'call',
          owner: 'Sanjay',
          plannedDate: plannedCall,
          actualDate: null,
          delayDays: 0,
          status: 'pending'
        });
      }

      // Dynamic Google Sheets sync first (never touch Planned or Delay cols)
      await syncStepToGoogleSheet(2, selectedOrderNo, {
        partyName: activeRow?.partyName || ord?.companyName || '',
        kilnNo: ord?.kilnNo || activeRow?.kilnNo || 1,
        kilnSize: ord?.kilnSize || activeRow?.kilnSize || '',
        kilnNoAndSize: `Kiln ${activeRow?.kilnNo || ord?.kilnNo || 1} (${activeRow?.kilnSize || ord?.kilnSize || '100 TPD'})`,
        campaignNo: ord?.campaignNo || activeRow?.campaignNo || '1',
        campaignStartDate: ord?.campaignStartDate || activeRow?.campaignStartDate || '',
        visitDate,
        actualStep2: visitDate,
        inspector: inspector.trim(),
        innerTemp: innerTemp !== '' ? Number(innerTemp) : '',
        innerTempPhoto: innerPhoto,
        campaignLifeFormatSlip: campaignLifeSlip,
        campaignLifeFormatSlipName: campaignLifeSlipName,
        zoneTemps: zoneValues,
        avgTemp: liveAvg,
        expectedShutdownDate: expectedShutdown,
        daysSinceStart,
        driveFolderId: '1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8'
      });

      await saveData(nextData);
      await refresh();
      notify(`Running Inspection completed for ${selectedOrderNo}! Record moved to History tab.`, 'good');
      setShowModal(false);
      // Automatically switch to history tab so user sees it moved there!
      setActiveTab('history');
    } catch (err) {
      notify(err.message, 'bad');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered lists
  const filteredPending = pendingList.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.serviceOrderNo.toLowerCase().includes(q) ||
      p.partyName.toLowerCase().includes(q) ||
      (p.inspectionIncharge || '').toLowerCase().includes(q)
    );
  });

  const filteredHistory = historyList.filter((h) => {
    const q = search.toLowerCase();
    return h.serviceOrderNo.toLowerCase().includes(q) || h.partyName.toLowerCase().includes(q);
  });

  useEffect(() => {
    setPendingPage(1);
    setHistoryPage(1);
  }, [search, activeTab]);

  const handleSyncWithSheet = async () => {
    setIsSyncing(true);
    try {
      const res = await syncStepChangesFromSheet(2, data);
      if (res && res.nextData && res.changed > 0) {
        await saveData(res.nextData);
        await refresh();
        notify(`Synced successfully: ${res.changed} inspection record(s) updated!`, 'good');
      } else if (res && res.changed === 0) {
        notify('All inspection records are up to date.', 'good');
      } else if (res && res.error) {
        notify(`Sync warning: ${res.error}`, 'bad');
      }
    } catch (err) {
      notify('Sync failed: ' + err.message, 'bad');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncHistoryToSheet = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      if (historyList.length === 0) {
        notify('No recorded inspections in history to sync', 'bad');
        setIsSyncing(false);
        return;
      }
      for (const ins of historyList) {
        await syncStepToGoogleSheet(2, ins.serviceOrderNo, {
          partyName: ins.partyName || '',
          kilnNo: ins.kilnNo || 1,
          kilnSize: ins.kilnSize || '',
          kilnNoAndSize: `Kiln ${ins.kilnNo || 1} (${ins.kilnSize || '100 TPD'})`,
          campaignNo: ins.campaignNo || '1',
          campaignStartDate: ins.campaignStartDate || '',
          visitDate: ins.visitDate || todayISO(),
          actualStep2: ins.visitDate || todayISO(),
          inspector: ins.inspector || '',
          innerTemp: ins.innerTemp !== undefined && ins.innerTemp !== null ? ins.innerTemp : '',
          innerTempPhoto: ins.innerTempPhoto || '',
          campaignLifeFormatSlip: ins.campaignLifeFormatSlip || '',
          campaignLifeFormatSlipName: ins.campaignLifeFormatSlipName || '',
          zoneTemps: Array.isArray(ins.zoneTemps) ? ins.zoneTemps : (Array.isArray(ins.zones) ? ins.zones : []),
          avgTemp: ins.avgTemp || '',
          expectedShutdownDate: ins.expectedShutdownDate || '',
          daysSinceStart: ins.daysSinceStart !== undefined && ins.daysSinceStart !== null ? ins.daysSinceStart : 0,
          driveFolderId: '1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8'
        });
      }
      await refresh();
      notify(`Synced ${historyList.length} inspection(s) directly to Running Kiln Inspection tab!`, 'good');
    } catch (err) {
      notify('Sync error: ' + err.message, 'bad');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenEdit = (ins) => {
    setEditingInspection(ins);
    setEditAvgTemp(ins.avgTemp || '');
    setEditInspector(ins.inspector || '');
    setEditVisitDate(ins.visitDate || todayISO());
    setEditExpectedShutdown(ins.expectedShutdownDate || '');
    setEditInnerTemp(ins.innerTemp !== undefined && ins.innerTemp !== null ? ins.innerTemp : '');
    setEditDaysSinceStart(ins.daysSinceStart !== undefined && ins.daysSinceStart !== null ? ins.daysSinceStart : '');
    setEditInnerPhoto(ins.innerTempPhoto || '');
    setEditCampaignLifeSlip(ins.campaignLifeFormatSlip || '');
    setEditCampaignLifeSlipName(ins.campaignLifeFormatSlipName || '');
    const rawZones = Array.isArray(ins.zoneTemps) && ins.zoneTemps.length > 0
      ? ins.zoneTemps
      : (Array.isArray(ins.zones) ? ins.zones : []);
    setEditZoneReadings(
      Array.from({ length: 9 }, (_, i) => {
        const val = rawZones[i];
        if (val !== undefined && val !== null && String(val).trim() !== '' && !isNaN(Number(val))) {
          return Number(val);
        }
        return '';
      })
    );
  };

  const handleEditPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resizedBase64 = await resizeImage(file, 800);
      setEditInnerPhoto(resizedBase64);
      notify('Photo uploaded & resized to max 800px', 'good');
    } catch (err) {
      notify('Photo upload error: ' + err.message, 'bad');
    }
  };

  const handleEditCampaignLifeSlipUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fileData = file.type.startsWith('image/')
        ? await resizeImage(file, 1200)
        : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read the selected file'));
          reader.readAsDataURL(file);
        });
      setEditCampaignLifeSlip(fileData);
      setEditCampaignLifeSlipName(file.name);
      notify(`Slip attached: ${file.name}`, 'good');
    } catch (err) {
      notify('Slip upload error: ' + err.message, 'bad');
    }
  };

  // Live average for edit modal
  const editLiveAvg = avg(editZoneReadings);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingInspection) return;
    setIsSavingEdit(true);
    try {
      const nextData = { ...data };
      const finalAvg = editLiveAvg || (editAvgTemp ? String(editAvgTemp).trim() : '');
      const zoneValues = editZoneReadings.map((z) => (z === '' ? null : Number(z)));
      
      const ins = (nextData.runningInspections || []).find((x) => x.serviceOrderNo === editingInspection.serviceOrderNo);
      if (ins) {
        ins.avgTemp = finalAvg;
        ins.inspector = editInspector.trim();
        ins.visitDate = editVisitDate;
        ins.expectedShutdownDate = editExpectedShutdown;
        ins.innerTemp = editInnerTemp !== '' ? Number(editInnerTemp) : '';
        ins.innerTempPhoto = editInnerPhoto;
        ins.campaignLifeFormatSlip = editCampaignLifeSlip;
        ins.campaignLifeFormatSlipName = editCampaignLifeSlipName;
        ins.zoneTemps = zoneValues;
        ins.zones = zoneValues;
        if (editDaysSinceStart !== '') {
          ins.daysSinceStart = editDaysSinceStart;
        }
      }
      const ord = (nextData.orders || []).find((x) => x.serviceOrderNo === editingInspection.serviceOrderNo);
      if (ord) {
        ord.expectedShutdownDate = editExpectedShutdown;
        if (editInspector.trim()) {
          ord.inspectionIncharge = editInspector.trim();
        }
      }

      // Sync specific edited record immediately (NEVER touching Planned or Delay cols!)
      await syncStepToGoogleSheet(2, editingInspection.serviceOrderNo, {
        partyName: editingInspection.partyName || '',
        kilnNo: editingInspection.kilnNo || 1,
        kilnSize: editingInspection.kilnSize || '',
        kilnNoAndSize: `Kiln ${editingInspection.kilnNo || 1} (${editingInspection.kilnSize || '100 TPD'})`,
        campaignNo: editingInspection.campaignNo || '1',
        campaignStartDate: editingInspection.campaignStartDate || '',
        visitDate: editVisitDate,
        actualStep2: editVisitDate,
        inspector: editInspector.trim(),
        innerTemp: editInnerTemp !== '' ? Number(editInnerTemp) : '',
        innerTempPhoto: editInnerPhoto,
        campaignLifeFormatSlip: editCampaignLifeSlip,
        campaignLifeFormatSlipName: editCampaignLifeSlipName,
        zoneTemps: zoneValues,
        avgTemp: finalAvg,
        expectedShutdownDate: editExpectedShutdown,
        daysSinceStart: editDaysSinceStart !== '' ? editDaysSinceStart : (editingInspection.daysSinceStart || 0),
        driveFolderId: '1dB3lvy4wBfrTBl69vdpP-ahKkt7nSOt8'
      });

      await saveData(nextData);
      await refresh();
      notify(`Updated inspection for ${editingInspection.serviceOrderNo} successfully!`, 'good');
      setEditingInspection(null);
    } catch (err) {
      notify('Failed to save edit: ' + err.message, 'bad');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const paginatedPending = filteredPending.slice(
    (pendingPage - 1) * pendingPageSize,
    pendingPage * pendingPageSize
  );

  const reversedHistory = [...filteredHistory].reverse();
  const paginatedHistory = reversedHistory.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );

  return (
    <div>
      {/* HEADER ROW */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Running Kiln Inspection
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>

          </p>
        </div>
      </div>

      {/* TABS & SEARCH TOOLBAR */}
      <div className="card-panel" style={{ padding: '12px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              className={`btn small ${activeTab === 'pending' ? 'primary' : ''}`}
              onClick={() => setActiveTab('pending')}
              style={{ height: '34px' }}
            >
              Pending Inspections ({pendingList.length})
            </button>
            <button
              type="button"
              className={`btn small ${activeTab === 'history' ? 'primary' : ''}`}
              onClick={() => setActiveTab('history')}
              style={{ height: '34px' }}
            >
              History ({historyList.length})
            </button>
          </div>

          <div className="search-row-mobile" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn small"
              onClick={handleSyncWithSheet}
              disabled={isSyncing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Synchronize latest data"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              {isSyncing ? 'Syncing...' : 'Sync'}
            </button>

            <div className="search-input-wrap">
              <input
                type="search"
                placeholder={`Search ${activeTab} by plant or CN...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-text"
              />
            </div>
          </div>
        </div>
      </div>

      {/* TAB 1: PENDING TAB */}
      {activeTab === 'pending' && (
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ margin: 0 }}>Company Visits Awaiting Running Inspection ({filteredPending.length})</h2>
            <span className="pill warn">Action Required</span>
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Service Order</th>
                  <th>Party Name</th>
                  <th>Kiln No. & Size</th>
                  <th>Campaign No.</th>
                  <th>Campaign Start Date</th>
                  <th>Inspection Incharge</th>
                  <th>Planned Inspection Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPending.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      ✓ All company visits have completed running inspections! No pending tasks in this queue.
                    </td>
                  </tr>
                ) : (
                  paginatedPending.map((row) => {
                    const isLate = row.delayDays > 0;
                    return (
                      <tr
                        key={row.serviceOrderNo}
                        onClick={() => setViewingInspection(row)}
                        className="clickable-row"
                        title="Tap to view inspection details"
                      >
                        <td>
                          <b className="cn">{row.serviceOrderNo}</b>
                        </td>
                        <td>
                          <b>{row.partyName}</b>
                        </td>
                        <td className="mono">
                          Kiln {row.kilnNo} ({row.kilnSize})
                        </td>
                        <td className="mono">Camp. {row.campaignNo}</td>
                        <td>{formatDate(row.campaignStartDate)}</td>
                        <td>{row.inspectionIncharge || '—'}</td>
                        <td className="mono">{formatDate(row.plannedDate)}</td>
                        <td>
                          {isLate ? (
                            <span className="pill bad">{row.delayDays} d late</span>
                          ) : (
                            <span className="pill good">On Track</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn small primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenInspectionModal(row);
                            }}
                          >
                            Running Inspection
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* TAB 1 PAGINATION */}
          <Pagination
            totalItems={filteredPending.length}
            page={pendingPage}
            pageSize={pendingPageSize}
            onPageChange={setPendingPage}
            onPageSizeChange={setPendingPageSize}
            pageSizeOptions={[5, 10, 20, 50, 100]}
          />
        </div>
      )}

      {/* TAB 2: HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ margin: 0 }}>Completed Running Inspections History ({filteredHistory.length})</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn small"
                onClick={handleSyncHistoryToSheet}
                disabled={isSyncing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title="Send all history inspections directly to Google Sheet"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={isSyncing ? 'spin' : ''}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                {isSyncing ? 'Syncing...' : 'Sync to Sheet'}
              </button>
              <span className="pill good">Recorded Inspections</span>
            </div>
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Service Order</th>
                  <th>Party Name</th>
                  <th>Kiln</th>
                  <th>Campaign No.</th>
                  <th>Campaign Start Date</th>
                  <th>Visit Date</th>
                  <th>Inspector</th>
                  <th className="n">Inner Temp</th>
                  <th>Inner Temp Photo</th>
                  <th>Zone 1-9 Outer Temps (°C)</th>
                  <th className="n">Avg Temp</th>
                  <th>Expected Shutdown</th>
                  <th>Campaign Life Format Slip</th>
                  <th className="n">No. of Days Since Kiln Start</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.length === 0 ? (
                  <tr>
                    <td colSpan="15" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No running inspections in history yet.
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((ins, idx) => (
                    <tr
                      key={idx}
                      onClick={() => setViewingInspection(ins)}
                      className="clickable-row"
                      title="Tap to view inspection details & photo"
                    >
                      <td>
                        <b className="cn">{ins.serviceOrderNo}</b>
                      </td>
                      <td>
                        <b>{ins.partyName}</b>
                      </td>
                      <td className="mono">Kiln {ins.kilnNo}</td>
                      <td className="mono">{ins.campaignNo}</td>
                      <td>{formatDate(ins.campaignStartDate)}</td>
                      <td>{formatDate(ins.visitDate)}</td>
                      <td>{ins.inspector}</td>
                      <td className="n mono">
                        {ins.innerTemp !== undefined && ins.innerTemp !== null && ins.innerTemp !== '' ? `${ins.innerTemp} °C` : '—'}
                      </td>
                      <td>
                        {ins.innerTempPhoto ? (
                          <a
                            href={ins.innerTempPhoto}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}
                          >
                            View photo
                          </a>
                        ) : '—'}
                      </td>
                      <td className="mono" style={{ fontSize: '12px' }}>
                        {formatZoneTempsDisplay(ins)}
                      </td>
                      <td className="n mono" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {ins.avgTemp || '—'} °C
                      </td>
                      <td>{formatDate(ins.expectedShutdownDate)}</td>
                      <td>
                        {ins.campaignLifeFormatSlip ? (
                          <a
                            href={ins.campaignLifeFormatSlip}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}
                          >
                            {ins.campaignLifeFormatSlipName || 'View slip'}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="n mono">
                        {ins.daysSinceStart !== undefined && ins.daysSinceStart !== null && ins.daysSinceStart !== '' ? `${ins.daysSinceStart} d` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn small secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingInspection(ins);
                          }}
                          title="View Details"
                          style={{ padding: '3px 8px', fontSize: '12px', marginRight: '6px' }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(ins);
                          }}
                          title={`Edit ${ins.serviceOrderNo}`}
                          style={{ padding: '3px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* TAB 2 PAGINATION */}
          <Pagination
            totalItems={reversedHistory.length}
            page={historyPage}
            pageSize={historyPageSize}
            onPageChange={setHistoryPage}
            onPageSizeChange={setHistoryPageSize}
            pageSizeOptions={[5, 10, 20, 50, 100]}
          />
        </div>
      )}

      {/* RUNNING INSPECTION MODAL FORM */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Running Kiln Inspection: <span className="cn">{selectedOrderNo}</span>
              </h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ background: 'var(--surface-subtle)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '14px' }}>
                <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{activeRow?.partyName}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Kiln {activeRow?.kilnNo} ({activeRow?.kilnSize}) · Campaign {activeRow?.campaignNo} · Started {formatDate(activeRow?.campaignStartDate)} ({daysSinceStart} days ago)
                </div>
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>Date of Visit *</label>
                  <input
                    required
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>Name of Inspector Incharge *</label>
                  <input
                    required
                    value={inspector}
                    onChange={(e) => setInspector(e.target.value)}
                    placeholder="Enter inspector incharge name"
                    className="input-text"
                  />
                </div>
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>Inner Temperature of Kiln (°C) *</label>
                  <input
                    required
                    type="number"
                    value={innerTemp}
                    onChange={(e) => setInnerTemp(e.target.value)}
                    placeholder="e.g. 1100"
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>Expected Shutdown Date *</label>
                  <input
                    required
                    type="date"
                    value={expectedShutdown}
                    onChange={(e) => setExpectedShutdown(e.target.value)}
                    className="input-text"
                  />
                </div>
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>No. of Days Since Kiln Start</label>
                  <input
                    readOnly
                    value={`${Math.max(0, daysSinceStart)} days`}
                    className="input-text mono"
                    style={{ background: 'var(--surface-subtle)', fontWeight: 700, color: 'var(--primary)' }}
                  />
                </div>
                <div className="field">
                  <label>Campaign Life Format Slip</label>
                  <label className="photo-dropzone" style={{ minHeight: '44px', padding: '10px' }}>
                    <span>{campaignLifeSlipName ? `✓ ${campaignLifeSlipName}` : '+ Upload format slip'}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      style={{ display: 'none' }}
                      onChange={handleCampaignLifeSlipUpload}
                    />
                  </label>
                </div>
              </div>

              <div className="field">
                <label>Photo of Inner Temp Reading</label>
                <label className="photo-dropzone">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>{innerPhoto ? '✓ Photo selected (Click to replace)' : '+ Upload inner temperature photo (max 800px)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handlePhotoUpload}
                  />
                </label>
                {innerPhoto && (
                  <div className="photo-preview-wrap">
                    <img src={innerPhoto} alt="Inner Temp" />
                    <button
                      type="button"
                      className="photo-remove-btn"
                      onClick={() => setInnerPhoto('')}
                      title="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              {/* 9 ZONES INPUT GRID */}
              <div style={{ marginTop: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Outer Shell Temperature Zone 1 to Zone 9 (°C)
                </label>
                <div className="zones-grid">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div className="zone-cell" key={i}>
                      <label htmlFor={`run_z${i + 1}`}>Zone {i + 1}</label>
                      <input
                        id={`run_z${i + 1}`}
                        type="number"
                        placeholder="—"
                        value={zoneReadings[i]}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = [...zoneReadings];
                          next[i] = val;
                          setZoneReadings(next);
                        }}
                        className="input-text"
                      />
                    </div>
                  ))}
                </div>

                <div className="live-avg-banner">
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Average Outer Shell Temperature
                    </div>
                    <small style={{ color: 'var(--text-muted)' }}>Auto-calculated across filled zone readings</small>
                  </div>
                  <b>{liveAvg} °C</b>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit Running Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT RUNNING INSPECTION MODAL */}
      {editingInspection && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Edit Inspection Record (<span className="cn">{editingInspection.serviceOrderNo}</span>)
              </h2>
              <button className="modal-close-btn" onClick={() => setEditingInspection(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="fieldrow">
                <div className="field">
                  <label>Party Name (Read-only)</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={editingInspection.partyName || 'Plant'}
                    className="input-text"
                    style={{ background: 'var(--surface-subtle)', cursor: 'not-allowed' }}
                  />
                </div>
                <div className="field">
                  <label>Kiln No. & Size (Read-only)</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={`Kiln ${editingInspection.kilnNo || '1'} (${editingInspection.kilnSize || '100 TPD'})`}
                    className="input-text"
                    style={{ background: 'var(--surface-subtle)', cursor: 'not-allowed' }}
                  />
                </div>
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>Inspector Name *</label>
                  <input
                    type="text"
                    required
                    value={editInspector}
                    onChange={(e) => setEditInspector(e.target.value)}
                    placeholder="Enter inspector name"
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>Inspection Visit Date *</label>
                  <input
                    type="date"
                    required
                    value={editVisitDate}
                    onChange={(e) => setEditVisitDate(e.target.value)}
                    className="input-text"
                  />
                </div>
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>Inner Temperature of Kiln (°C)</label>
                  <input
                    type="number"
                    value={editInnerTemp}
                    onChange={(e) => setEditInnerTemp(e.target.value)}
                    placeholder="e.g. 950"
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>Expected Shutdown Date</label>
                  <input
                    type="date"
                    value={editExpectedShutdown}
                    onChange={(e) => setEditExpectedShutdown(e.target.value)}
                    className="input-text"
                  />
                </div>
              </div>

              {/* 9 ZONES INPUT GRID FOR EDIT */}
              <div style={{ marginTop: '10px', marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Zone 1 to Zone 9 Outer Shell Temperatures (°C)
                </label>
                <div className="zones-grid">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div className="zone-cell" key={i}>
                      <label htmlFor={`edit_z${i + 1}`}>Zone {i + 1}</label>
                      <input
                        id={`edit_z${i + 1}`}
                        type="number"
                        placeholder="—"
                        value={editZoneReadings[i]}
                        onChange={(e) => {
                          const val = e.target.value;
                          const next = [...editZoneReadings];
                          next[i] = val;
                          setEditZoneReadings(next);
                        }}
                        className="input-text"
                      />
                    </div>
                  ))}
                </div>

                <div className="live-avg-banner" style={{ marginTop: '8px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Average Outer Shell Temperature
                    </div>
                    <small style={{ color: 'var(--text-muted)' }}>Auto-calculated across 9 zones</small>
                  </div>
                  <b>{editLiveAvg || editAvgTemp || '—'} °C</b>
                </div>
              </div>

              {/* INNER TEMP PHOTO ATTACHMENT */}
              <div className="field" style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Photo of Inner Temp Reading (Google Drive Sync)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label className="btn small secondary" style={{ cursor: 'pointer', margin: 0 }}>
                    {editInnerPhoto ? 'Replace Photo' : 'Upload New Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleEditPhotoUpload}
                    />
                  </label>
                  {editInnerPhoto && typeof editInnerPhoto === 'string' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      {editInnerPhoto.startsWith('http') ? (
                        <a href={editInnerPhoto} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                          View in Google Drive ↗
                        </a>
                      ) : (
                        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>New photo selected</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditInnerPhoto('')}
                        style={{ background: 'none', border: 'none', color: 'var(--error, #C93838)', cursor: 'pointer', fontSize: '14px' }}
                        title="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* CAMPAIGN LIFE SLIP ATTACHMENT */}
              <div className="field" style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Campaign Life Format Slip (Google Drive Sync)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label className="btn small secondary" style={{ cursor: 'pointer', margin: 0 }}>
                    {editCampaignLifeSlip ? 'Replace Document' : 'Upload Document'}
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      style={{ display: 'none' }}
                      onChange={handleEditCampaignLifeSlipUpload}
                    />
                  </label>
                  {editCampaignLifeSlip && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      {editCampaignLifeSlip.startsWith('http') ? (
                        <a href={editCampaignLifeSlip} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                          {editCampaignLifeSlipName || 'View Slip in Drive ↗'}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{editCampaignLifeSlipName || 'New document selected'}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditCampaignLifeSlip('');
                          setEditCampaignLifeSlipName('');
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--error, #C93838)', cursor: 'pointer', fontSize: '14px' }}
                        title="Remove document"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn" onClick={() => setEditingInspection(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={isSavingEdit}>
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {viewingInspection && (
        <DetailModal
          isOpen={!!viewingInspection}
          onClose={() => setViewingInspection(null)}
          title="Running Kiln Inspection Details"
          subtitle={`Service Order: ${viewingInspection.serviceOrderNo || 'N/A'}`}
          badge={viewingInspection.avgTemp ? `Avg: ${viewingInspection.avgTemp} °C` : (viewingInspection.status || 'Pending')}
          badgeTone={viewingInspection.avgTemp ? 'good' : 'bad'}
          items={[
            { label: 'Company / Party', value: viewingInspection.partyName },
            { label: 'Kiln No. & Size', value: `Kiln ${viewingInspection.kilnNo || '—'} (${viewingInspection.kilnSize || '—'})`, mono: true },
            { label: 'Campaign No.', value: viewingInspection.campaignNo, mono: true },
            { label: 'Campaign Start Date', value: formatDate(viewingInspection.campaignStartDate) },
            { label: 'Inspection Visit Date', value: formatDate(viewingInspection.visitDate || viewingInspection.plannedDate) },
            { label: 'Inspector Name', value: viewingInspection.inspector || '—' },
            { label: 'Inner Temp', value: (viewingInspection.innerTemp !== undefined && viewingInspection.innerTemp !== null && viewingInspection.innerTemp !== '') ? `${viewingInspection.innerTemp} °C` : '—', mono: true },
            { label: 'Expected Shutdown Date', value: formatDate(viewingInspection.expectedShutdownDate) },
            { label: 'Days Running Since Start', value: (viewingInspection.daysSinceStart !== undefined && viewingInspection.daysSinceStart !== null && viewingInspection.daysSinceStart !== '') ? `${viewingInspection.daysSinceStart} days` : '—', mono: true },
            ...(viewingInspection.campaignLifeFormatSlip ? [{
              label: 'Campaign Slip Document',
              value: (
                <a
                  href={viewingInspection.campaignLifeFormatSlip}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--primary)', fontWeight: 600 }}
                >
                  {viewingInspection.campaignLifeFormatSlipName || 'Download / View Document'}
                </a>
              ),
              fullWidth: true
            }] : [])
          ]}
          readings={(viewingInspection.zoneTemps || viewingInspection.zones) ? {
            title: 'Zone 1-9 Outer Shell Temperatures (°C)',
            unit: '°C',
            values: viewingInspection.zoneTemps || viewingInspection.zones
          } : null}
          photoUrl={viewingInspection.innerTempPhoto || viewingInspection.photo}
          onEdit={viewingInspection.avgTemp ? () => {
            const item = viewingInspection;
            setViewingInspection(null);
            handleOpenEdit(item);
          } : null}
        />
      )}
    </div>
  );
}

