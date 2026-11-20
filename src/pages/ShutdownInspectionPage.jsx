import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayISO, formatDate, avg, addWorkingDays, calendarDaysDiff, getTaskDelay } from '../utils/workflow';
import { saveData, resizeImage } from '../services/storage';
import { syncStepToGoogleSheet, syncStepChangesFromSheet } from '../services/googleSheets';
import CustomSelect from '../components/CustomSelect';
import Pagination from '../components/Pagination';
import DetailModal from '../components/DetailModal';

export default function ShutdownInspectionPage({ data, refresh, notify }) {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'history'
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState(null);

  // View Details Modal State
  const [viewingShutdown, setViewingShutdown] = useState(null);

  // Pagination states
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [isSyncing, setIsSyncing] = useState(false);

  // Edit History State
  const [editingShutdown, setEditingShutdown] = useState(null);
  const [editInspector, setEditInspector] = useState('');
  const [editAvgThickness, setEditAvgThickness] = useState('');
  const [editInspectionDate, setEditInspectionDate] = useState('');
  const [editNextCampaignDate, setEditNextCampaignDate] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Form State
  const [selectedOrderNo, setSelectedOrderNo] = useState('');
  const [what, setWhat] = useState('Done'); // 'Done' | 'I forget to do' | 'They Start without telling me'
  const [inspectionDate, setInspectionDate] = useState(todayISO());
  const [inspector, setInspector] = useState('');
  const [zoneDistances, setZoneDistances] = useState(Array(9).fill(''));
  const [zonePhotos, setZonePhotos] = useState(Array(9).fill(''));
  const [campaignStartingDate, setCampaignStartingDate] = useState('');

  const today = todayISO();

  // Pre-select order if query param present
  useEffect(() => {
    const orderParam = searchParams.get('order');
    if (orderParam) {
      setSelectedOrderNo(orderParam);
      const row = pendingList.find((p) => p.serviceOrderNo === orderParam);
      if (row) {
        handleOpenModal(row);
      }
    }
  }, [searchParams]);

  // 1. Pending List:
  // As specified by user:
  // "agar Take Shut Down date page ke history me agar call followup status me Yes Shut Down Date Taken huaa to wah is Shutdown Inspection ke page ke pending me show karega"
  // And must not have already completed Shutdown Inspection!
  const completedInspections = data.shutdownInspections || [];
  const completedOrderNos = new Set(completedInspections.map((i) => i.serviceOrderNo));

  const pendingList = (data.orders || [])
    .filter((order) => {
      // Must not already be completed in shutdownInspections
      if (completedOrderNos.has(order.serviceOrderNo)) return false;

      // The latest Take Shut Down Date history call must be confirmed.
      // Non-confirmed calls stay in that page's pending/follow-up flow.
      const latestCall = (data.callLogs || []).find(
        (log) => log.serviceOrderNo === order.serviceOrderNo
      );
      const followupStatus = latestCall?.shutdownDateGiven || order.callFollowupStatus || '';
      return followupStatus.toLowerCase().includes('yes');
    })
    .map((order) => {
      const company = (data.companies || []).find((c) => c.id === order.companyId);
      const kiln = (data.kilns || []).find((k) => k.id === order.kilnId);
      const visit = (data.visits || []).find((v) => v.serviceOrderNo === order.serviceOrderNo);
      const task = (data.stepTasks || []).find(
        (t) => t.serviceOrderNo === order.serviceOrderNo && t.step === 'shutdown' && t.status === 'pending'
      );

      const companyName = company?.name || visit?.companyName || 'Unknown Plant';
      const running = (data.runningInspections || []).find((r) => r.serviceOrderNo === order.serviceOrderNo);
      let rawIncharge = visit?.inspectionIncharge || visit?.visitedBy || order.inspectionIncharge || running?.inspector || '';
      if (rawIncharge === 'Sanjay Singh') {
        rawIncharge = '';
      }
      const inspectionIncharge = rawIncharge;

      return {
        order,
        task,
        company,
        kiln,
        visit,
        running,
        serviceOrderNo: order.serviceOrderNo,
        companyName,
        kilnNo: kiln ? kiln.kilnNo : visit ? visit.kilnNo : 1,
        kilnSize: kiln ? kiln.size : visit ? visit.kilnSize : '100 TPD',
        campaignNo: order.campaignNo || '1',
        confirmedShutdownDate: order.expectedShutdownDate || '—',
        plannedDate: task?.plannedDate || order.expectedShutdownDate || today,
        delayDays: task ? getTaskDelay(task, today) : 0,
        inspectionIncharge
      };
    });

  // 2. History List: Completed Shutdown Inspections
  const historyList = completedInspections.map((ins) => {
    const order = (data.orders || []).find((o) => o.serviceOrderNo === ins.serviceOrderNo);
    const company = order ? (data.companies || []).find((c) => c.id === order.companyId) : null;
    const kiln = order ? (data.kilns || []).find((k) => k.id === order.kilnId) : null;
    const visit = (data.visits || []).find((v) => v.serviceOrderNo === ins.serviceOrderNo);

    const companyName = ins.companyName || company?.name || visit?.companyName || 'Unknown Plant';

    return {
      ...ins,
      companyName,
      kilnNo: kiln ? kiln.kilnNo : visit ? visit.kilnNo : 1,
      kilnSize: kiln ? kiln.size : visit ? visit.kilnSize : '100 TPD',
      campaignNo: order?.campaignNo || visit?.campaignNo || '1'
    };
  });

  // Active Row for Modal
  const activePendingRow = pendingList.find((p) => p.serviceOrderNo === selectedOrderNo);
  const activeCompanyName = activePendingRow ? activePendingRow.companyName : '';

  // Open Form Modal
  const handleOpenModal = (row) => {
    setSelectedOrderNo(row.serviceOrderNo);
    setWhat('Done');
    setInspectionDate(todayISO());
    const visit = (data.visits || []).find((v) => v.serviceOrderNo === row.serviceOrderNo);
    const ord = (data.orders || []).find((o) => o.serviceOrderNo === row.serviceOrderNo);
    const running = (data.runningInspections || []).find((r) => r.serviceOrderNo === row.serviceOrderNo);
    let incharge = row.inspectionIncharge || visit?.inspectionIncharge || visit?.visitedBy || ord?.inspectionIncharge || running?.inspector || '';
    if (incharge === 'Sanjay Singh') {
      incharge = '';
    }
    setInspector(incharge);
    setZoneDistances(Array(9).fill(''));
    setZonePhotos(Array(9).fill(''));
    setCampaignStartingDate('');
    setShowModal(true);
  };

  // Live calculation of average refractory distance
  const liveAvgDistance = avg(zoneDistances);

  // Single zone distance change
  const handleDistanceChange = (index, value) => {
    const updated = [...zoneDistances];
    updated[index] = value;
    setZoneDistances(updated);
  };

  // Single zone photo upload with compression
  const handlePhotoUpload = async (index, file) => {
    if (!file) return;
    try {
      const compressed = await resizeImage(file, 800);
      const updated = [...zonePhotos];
      updated[index] = compressed;
      setZonePhotos(updated);
      notify(`Photo for Zone ${index + 1} uploaded & resized.`, 'good');
    } catch (err) {
      notify(`Failed to upload photo for Zone ${index + 1}: ${err.message}`, 'bad');
    }
  };

  // Submit Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!selectedOrderNo) {
      notify('Please select a valid service order', 'bad');
      return;
    }

    if (what === 'Done') {
      if (!inspectionDate || !inspector.trim()) {
        notify('Please fill Inspection Date and Name Of Inspection Incharge', 'bad');
        return;
      }
      if (!campaignStartingDate) {
        notify('Please enter Campaign Starting Date', 'bad');
        return;
      }
    } else {
      // For 'I forget to do' or 'They Start without telling me'
      if (!campaignStartingDate) {
        notify('Please enter Campaign Starting Date', 'bad');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const nextData = { ...data };
      const companyName = activeCompanyName || 'Plant Refractory';

      // 1. Mark Step 4 task as done
      const shutdownTask = (nextData.stepTasks || []).find(
        (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'shutdown' && t.status === 'pending'
      );
      if (shutdownTask) {
        const actual = what === 'Done' ? inspectionDate : today;
        const delay = calendarDaysDiff(shutdownTask.plannedDate, actual);
        shutdownTask.status = 'done';
        shutdownTask.actualDate = actual;
        shutdownTask.delayDays = delay > 0 ? delay : 0;
      }

      // 2. Append to shutdownInspections
      if (!Array.isArray(nextData.shutdownInspections)) nextData.shutdownInspections = [];
      const newRecord = {
        serviceOrderNo: selectedOrderNo,
        companyName,
        what,
        inspectionDate: what === 'Done' ? inspectionDate : today,
        inspector: what === 'Done' ? inspector.trim() : (inspector.trim() || '—'),
        zoneThickness: what === 'Done' ? zoneDistances.map((d) => (d === '' ? null : Number(d))) : [],
        zonePhotos: what === 'Done' ? zonePhotos : [],
        avgThickness: what === 'Done' ? liveAvgDistance : null,
        nextCampaignStartDate: campaignStartingDate
      };
      nextData.shutdownInspections.push(newRecord);

      // 3. Close the current order and schedule Step 5 / Next campaign restart
      const order = (nextData.orders || []).find((o) => o.serviceOrderNo === selectedOrderNo);
      if (order) {
        order.status = 'closed';
      }

      // Schedule Step 5 (Restart)
      const offsets = nextData.settings?.offsets || { running: 7, call: -3, shutdown: 0, restart: 2 };
      const restartPlanned = addWorkingDays(campaignStartingDate, offsets.restart ?? 2);

      const existingRestart = (nextData.stepTasks || []).find(
        (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'restart'
      );
      if (existingRestart) {
        existingRestart.plannedDate = restartPlanned;
        existingRestart.status = 'pending';
      } else {
        nextData.stepTasks.push({
          id: `t-${Date.now()}-restart`,
          serviceOrderNo: selectedOrderNo,
          step: 'restart',
          owner: 'CRM',
          plannedDate: restartPlanned,
          actualDate: null,
          delayDays: 0,
          status: 'pending'
        });
      }

      // Dynamic Google Sheets sync first (never touch Planned or Delay cols)
      await syncStepToGoogleSheet(4, selectedOrderNo, {
        companyName,
        what,
        inspectionDate: newRecord.inspectionDate,
        avgThickness: liveAvgDistance,
        inspector: inspector.trim(),
        zoneThickness: newRecord.zoneThickness,
        zonePhotos: newRecord.zonePhotos,
        nextCampaignStartDate: campaignStartingDate
      });

      await saveData(nextData);
      await refresh();
      setShowModal(false);
      setActiveTab('history');
      notify(`Shutdown Inspection for ${selectedOrderNo} saved successfully! Moved to History.`, 'good');
    } catch (err) {
      notify('Failed to save shutdown inspection: ' + err.message, 'bad');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered lists
  const filteredPending = pendingList.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.serviceOrderNo.toLowerCase().includes(q) ||
      item.companyName.toLowerCase().includes(q) ||
      item.campaignNo.toLowerCase().includes(q)
    );
  });

  const filteredHistory = historyList.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.serviceOrderNo.toLowerCase().includes(q) ||
      item.companyName.toLowerCase().includes(q) ||
      item.what.toLowerCase().includes(q) ||
      (item.inspector || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setPendingPage(1);
    setHistoryPage(1);
  }, [search, activeTab]);

  const handleSyncWithSheet = async () => {
    setIsSyncing(true);
    try {
      const res = await syncStepChangesFromSheet(4, data);
      if (res && res.nextData && res.changed > 0) {
        await saveData(res.nextData);
        await refresh();
        notify(`Synced successfully: ${res.changed} record(s) updated!`, 'good');
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

  const handleOpenEdit = (row) => {
    setEditingShutdown(row);
    setEditInspector(row.inspector || '');
    setEditAvgThickness(row.avgThickness || '');
    setEditInspectionDate(row.inspectionDate || todayISO());
    setEditNextCampaignDate(row.nextCampaignStartDate || '');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingShutdown) return;
    setIsSavingEdit(true);
    try {
      const nextData = { ...data };
      const s = (nextData.shutdownInspections || []).find((x) => x.serviceOrderNo === editingShutdown.serviceOrderNo);
      if (s) {
        s.inspector = editInspector.trim();
        s.avgThickness = editAvgThickness.trim();
        s.inspectionDate = editInspectionDate;
        s.nextCampaignStartDate = editNextCampaignDate;
      }

      // Sync specific edited record to Google Sheet immediately (Protected: NEVER send Planned or Delay!)
      await syncStepToGoogleSheet(4, editingShutdown.serviceOrderNo, {
        companyName: editingShutdown.companyName || '',
        what: editingShutdown.what || 'Done',
        inspectionDate: editInspectionDate,
        avgThickness: editAvgThickness.trim(),
        inspector: editInspector.trim(),
        zoneThickness: editingShutdown.zoneThickness || editingShutdown.zoneDistances || [],
        zonePhotos: editingShutdown.zonePhotos || [],
        nextCampaignStartDate: editNextCampaignDate
      });

      await saveData(nextData);
      await refresh();
      notify(`Updated shutdown inspection for ${editingShutdown.serviceOrderNo} successfully!`, 'good');
      setEditingShutdown(null);
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
      {/* PAGE HEADER */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Shutdown Inspection
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>

          </p>
        </div>
      </div>

      {/* TABS & SEARCH BAR */}
      <div
        className="card-panel"
        style={{
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'pending' ? 'primary' : ''}`}
            onClick={() => setActiveTab('pending')}
            style={{ fontWeight: 600, padding: '8px 16px', height: '38px' }}
          >
            Pending ({pendingList.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'history' ? 'primary' : ''}`}
            onClick={() => setActiveTab('history')}
            style={{ fontWeight: 600, padding: '8px 16px', height: '38px' }}
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px' }}
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
              placeholder="Search plant or CN number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-text"
              style={{ height: '38px' }}
            />
          </div>
        </div>
      </div>

      {/* TAB 1: PENDING ORDERS */}
      {activeTab === 'pending' && (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="panel-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Pending Shutdown Inspections ({filteredPending.length})
            </h3>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Orders with confirmed shutdown dates awaiting on-site refractory inspection
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Name Of The Company</th>
                  <th>Kiln</th>
                  <th>Campaign</th>
                  <th>Inspection Incharge</th>
                  <th>Confirmed Shutdown Date</th>
                  <th>Planned Inspection</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPending.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                      No pending shutdown inspections found. Orders with "Yes Shutdown date taken" will appear here automatically.
                    </td>
                  </tr>
                ) : (
                  paginatedPending.map((row) => (
                    <tr
                      key={row.serviceOrderNo}
                      onClick={() => setViewingShutdown(row)}
                      className="clickable-row"
                      title="Tap to view shutdown details"
                    >
                      <td>
                        <span className="cn">{row.serviceOrderNo}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {row.companyName}
                      </td>
                      <td>
                        <span className="pill">Kiln {row.kilnNo} ({row.kilnSize})</span>
                      </td>
                      <td>Camp. {row.campaignNo}</td>
                      <td>{row.inspectionIncharge || '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                        {formatDate(row.confirmedShutdownDate)}
                      </td>
                      <td>
                        <span style={{ color: row.delayDays > 0 ? 'var(--error)' : 'inherit', fontWeight: row.delayDays > 0 ? 700 : 500 }}>
                          {formatDate(row.plannedDate)}
                        </span>
                      </td>
                      <td>
                        {row.delayDays > 0 ? (
                          <span className="pill bad">Delayed ({row.delayDays}d)</span>
                        ) : row.plannedDate === today ? (
                          <span className="pill warn">Due Today</span>
                        ) : (
                          <span className="pill good">On Track</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn primary small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenModal(row);
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 14 14" />
                          </svg>
                          Shutdown Inspection
                        </button>
                      </td>
                    </tr>
                  ))
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

      {/* TAB 2: HISTORY */}
      {activeTab === 'history' && (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="panel-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Shutdown Inspection History ({filteredHistory.length})
            </h3>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Completed refractory distance inspections and campaign completion records
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Name Of The Company</th>
                  <th>What</th>
                  <th>Inspection Date</th>
                  <th>Inspector Incharge</th>
                  <th>Avg Distance (mm)</th>
                  <th>Zones with Photos</th>
                  <th>New Campaign Start Date</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                      No shutdown inspection history recorded yet.
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((row, idx) => {
                    const photosCount = (row.zonePhotos || []).filter(Boolean).length;
                    const isThin = row.avgThickness && row.avgThickness < 160;

                    return (
                      <tr
                        key={idx}
                        onClick={() => setViewingShutdown(row)}
                        className="clickable-row"
                        title="Tap to view shutdown wear details & photos"
                      >
                        <td>
                          <span className="cn">{row.serviceOrderNo}</span>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {row.companyName}
                        </td>
                        <td>
                          {row.what === 'Done' ? (
                            <span className="pill good">✓ Done</span>
                          ) : (
                            <span className="pill warn">{row.what}</span>
                          )}
                        </td>
                        <td>{formatDate(row.inspectionDate)}</td>
                        <td>{row.inspector}</td>
                        <td>
                          {row.avgThickness ? (
                            <span
                              className={`pill ${isThin ? 'bad' : 'good'}`}
                              style={{ fontWeight: 700, fontFamily: 'var(--f-mono)' }}
                            >
                              {row.avgThickness} mm {isThin ? '• Critical' : ''}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {photosCount > 0 ? (
                            <button
                              type="button"
                              className="btn small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhotoModal(row);
                              }}
                              style={{ padding: '3px 8px', fontSize: '11.5px', background: 'var(--surface-subtle)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                              </svg>
                              {photosCount} photo{photosCount !== 1 ? 's' : ''}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No photos</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                          {formatDate(row.nextCampaignStartDate)}
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn small secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingShutdown(row);
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
                              handleOpenEdit(row);
                            }}
                            title={`Edit ${row.serviceOrderNo}`}
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
                    );
                  })
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

      {/* MODAL: SHUTDOWN INSPECTION FORM */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: '680px', maxHeight: '92vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Shutdown Inspection Form
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Record post-campaign refractory distance readings and photos
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Autofill Header Fields */}
              <div className="fieldrow">
                <div className="field">
                  <label>Service Order No. (Auto fill)</label>
                  <input
                    type="text"
                    value={selectedOrderNo}
                    readOnly
                    className="input-text"
                    style={{ background: 'var(--surface-subtle)', fontWeight: 600, color: 'var(--primary)' }}
                  />
                </div>
                <div className="field">
                  <label>Name Of The Company (Auto fill from CN)</label>
                  <input
                    type="text"
                    value={activeCompanyName}
                    readOnly
                    className="input-text"
                    style={{ background: 'var(--surface-subtle)', fontWeight: 600 }}
                  />
                </div>
              </div>

              {/* What (Dropdown with 3 choices) */}
              <div className="field">
                <label>What *</label>
                <CustomSelect
                  value={what}
                  onChange={(e) => setWhat(e.target.value)}
                  className="select-input"
                  style={{ fontWeight: 600, borderColor: what === 'Done' ? 'var(--primary)' : 'var(--warning)' }}
                >
                  <option value="Done">Done</option>
                  <option value="I forget to do">I forget to do</option>
                  <option value="They Start without telling me">They Start without telling me</option>
                </CustomSelect>
              </div>

              {/* CONDITIONAL BRANCH: IF 'Done' IS SELECTED */}
              {what === 'Done' ? (
                <>
                  <div className="fieldrow">
                    <div className="field">
                      <label>Inspection Date *</label>
                      <input
                        type="date"
                        required
                        value={inspectionDate}
                        onChange={(e) => setInspectionDate(e.target.value)}
                        className="input-text"
                      />
                    </div>
                    <div className="field">
                      <label>Name Of Inspection Incharge *</label>
                      <input
                        type="text"
                        required
                        value={inspector}
                        onChange={(e) => setInspector(e.target.value)}
                        placeholder="Enter inspection incharge name"
                        className="input-text"
                      />
                    </div>
                  </div>

                  {/* 9 ZONES DISTANCES (mm) */}
                  <div style={{ marginTop: '14px', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                        Distances Between Refractory (Zone 1 to Zone 9 in mm)
                      </label>
                      <span
                        className={`pill ${liveAvgDistance > 0 && liveAvgDistance < 160 ? 'bad' : 'good'}`}
                        style={{ fontFamily: 'var(--f-mono)', fontWeight: 700 }}
                      >
                        Avg Distance: {liveAvgDistance} mm {liveAvgDistance > 0 && liveAvgDistance < 160 ? '• Critical (<160mm)' : ''}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      {zoneDistances.map((dist, idx) => (
                        <div key={idx} className="field" style={{ margin: 0 }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Distances Between Refractory Zone {idx + 1} (mm)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="500"
                            placeholder="e.g. 175"
                            value={dist}
                            onChange={(e) => handleDistanceChange(idx, e.target.value)}
                            className="input-text"
                            style={{
                              borderColor: dist && Number(dist) < 160 ? 'var(--error)' : 'var(--border)',
                              background: dist && Number(dist) < 160 ? 'var(--error-soft)' : 'var(--surface)'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 9 ZONES PHOTOS */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
                      Photo Zone 1 to Photo Zone 9
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      {zonePhotos.map((photo, idx) => (
                        <div
                          key={idx}
                          style={{
                            border: '1px dashed var(--border)',
                            borderRadius: '8px',
                            padding: '8px',
                            textAlign: 'center',
                            background: photo ? 'var(--surface-subtle)' : 'var(--surface)'
                          }}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            Photo Zone {idx + 1}
                          </div>

                          {photo ? (
                            <div style={{ position: 'relative' }}>
                              <img
                                src={photo}
                                alt={`Zone ${idx + 1}`}
                                style={{ width: '100%', height: '56px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)' }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const upd = [...zonePhotos];
                                  upd[idx] = '';
                                  setZonePhotos(upd);
                                }}
                                style={{
                                  position: 'absolute',
                                  top: '2px',
                                  right: '2px',
                                  background: 'rgba(0,0,0,0.6)',
                                  color: '#fff',
                                  border: 0,
                                  borderRadius: '50%',
                                  width: '18px',
                                  height: '18px',
                                  fontSize: '10px',
                                  cursor: 'pointer'
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <label
                              style={{
                                display: 'block',
                                cursor: 'pointer',
                                fontSize: '11px',
                                padding: '6px 0',
                                color: 'var(--primary)',
                                fontWeight: 600
                              }}
                            >
                              + Upload
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => handlePhotoUpload(idx, e.target.files?.[0])}
                              />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Campaign Starting Date (New Campaign) */}
                  <div className="field">
                    <label style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      Campaign Starting Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={campaignStartingDate}
                      onChange={(e) => setCampaignStartingDate(e.target.value)}
                      className="input-text"
                      style={{ borderColor: 'var(--primary)' }}
                    />
                    <small style={{ color: 'var(--text-secondary)', fontSize: '11.5px', marginTop: '4px' }}>
                      Sets starting date for the next campaign cycle and queues Restart Process.
                    </small>
                  </div>
                </>
              ) : (
                /* CONDITIONAL BRANCH: IF 'I forget to do' OR 'They Start without telling me' */
                <div style={{ animation: 'fadeIn 0.2s ease-out', marginTop: '10px' }}>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'var(--warning-soft)',
                      border: '1px solid var(--warning-border)',
                      marginBottom: '16px',
                      fontSize: '13px',
                      color: 'var(--warning)'
                    }}
                  >
                    You have selected <strong>"{what}"</strong>. Distance and zone photos are bypassed. Please enter the new <strong>Campaign Starting Date</strong> below to restart the campaign process.
                  </div>

                  <div className="field">
                    <label style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      Campaign Starting Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={campaignStartingDate}
                      onChange={(e) => setCampaignStartingDate(e.target.value)}
                      className="input-text"
                      style={{ borderColor: 'var(--primary)' }}
                    />
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn primary"
                  style={{ fontWeight: 600, minWidth: '160px' }}
                >
                  {isSubmitting ? 'Saving...' : 'Submit Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PHOTO PREVIEW MODAL */}
      {selectedPhotoModal && (
        <div className="modal-backdrop" onClick={() => setSelectedPhotoModal(null)}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Zone Photos — {selectedPhotoModal.serviceOrderNo} ({selectedPhotoModal.companyName})
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedPhotoModal(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '12px' }}>
              {(selectedPhotoModal.zonePhotos || []).map((img, idx) =>
                img ? (
                  <div key={idx} style={{ textAlign: 'center' }}>
                    <img
                      src={img}
                      alt={`Zone ${idx + 1}`}
                      style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
                      Zone {idx + 1}
                    </span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT SHUTDOWN INSPECTION MODAL */}
      {editingShutdown && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Edit Shutdown Inspection (<span className="cn">{editingShutdown.serviceOrderNo}</span>)
              </h2>
              <button className="modal-close-btn" onClick={() => setEditingShutdown(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="field">
                <label>Company Name (Read-only)</label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={editingShutdown.companyName || 'Plant'}
                  className="input-text"
                  style={{ background: 'var(--surface-subtle)', cursor: 'not-allowed' }}
                />
              </div>

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

              <div className="fieldrow">
                <div className="field">
                  <label>Inspection Date *</label>
                  <input
                    type="date"
                    required
                    value={editInspectionDate}
                    onChange={(e) => setEditInspectionDate(e.target.value)}
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>Avg Distance Between Refractory (mm) *</label>
                  <input
                    type="number"
                    required
                    value={editAvgThickness}
                    onChange={(e) => setEditAvgThickness(e.target.value)}
                    placeholder="e.g. 175"
                    className="input-text"
                  />
                </div>
              </div>

              <div className="field">
                <label>Next Campaign Starting Date</label>
                <input
                  type="date"
                  value={editNextCampaignDate}
                  onChange={(e) => setEditNextCampaignDate(e.target.value)}
                  className="input-text"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn" onClick={() => setEditingShutdown(null)}>
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
      {viewingShutdown && (
        <DetailModal
          isOpen={!!viewingShutdown}
          onClose={() => setViewingShutdown(null)}
          title="Shutdown Inspection Details"
          subtitle={`Service Order: ${viewingShutdown.serviceOrderNo || 'N/A'}`}
          badge={viewingShutdown.what || (viewingShutdown.delayDays > 0 ? `${viewingShutdown.delayDays}d Delayed` : 'Pending Inspection')}
          badgeTone={viewingShutdown.what === 'Done' ? 'good' : (viewingShutdown.delayDays > 0 ? 'bad' : 'warn')}
          items={[
            { label: 'Company / Party', value: viewingShutdown.companyName || viewingShutdown.partyName },
            { label: 'Kiln No. & Size', value: `Kiln ${viewingShutdown.kilnNo || '—'} (${viewingShutdown.kilnSize || '—'})`, mono: true },
            { label: 'Campaign No.', value: viewingShutdown.campaignNo, mono: true },
            { label: 'Inspection Status', value: viewingShutdown.what || 'Pending' },
            { label: 'Inspection Date', value: formatDate(viewingShutdown.inspectionDate || viewingShutdown.confirmedShutdownDate || viewingShutdown.plannedDate) },
            { label: 'Inspector Name', value: viewingShutdown.inspector || '—' },
            { label: 'Avg Refractory Wear', value: viewingShutdown.avgThickness ? `${viewingShutdown.avgThickness} mm` : '—', mono: true },
            { label: 'Next Campaign Start Date', value: formatDate(viewingShutdown.nextCampaignStartDate) },
            ...(viewingShutdown.delayDays !== undefined ? [{
              label: 'Schedule Delay',
              value: viewingShutdown.delayDays > 0 ? `${viewingShutdown.delayDays} days late` : 'On track',
              mono: true
            }] : [])
          ]}
          readings={viewingShutdown.zoneDistances ? {
            title: 'Zone 1-9 Refractory Thickness / Wear (mm)',
            unit: 'mm',
            values: viewingShutdown.zoneDistances
          } : null}
          photoUrl={
            (viewingShutdown.zonePhotos || []).find(Boolean) || null
          }
          onEdit={viewingShutdown.avgThickness ? () => {
            const item = viewingShutdown;
            setViewingShutdown(null);
            handleOpenEdit(item);
          } : null}
        />
      )}
    </div>
  );
}

