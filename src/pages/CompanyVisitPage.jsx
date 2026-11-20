import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { todayISO, formatDate, addWorkingDays } from '../utils/workflow';
import { saveData } from '../services/storage';
import { syncStepToGoogleSheet, syncStepChangesFromSheet, deleteOrderFromGoogleSheet } from '../services/googleSheets';
import CustomSelect from '../components/CustomSelect';
import Pagination from '../components/Pagination';
import DetailModal from '../components/DetailModal';

export default function CompanyVisitPage({ data, refresh, notify }) {
  const location = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  // View Details Modal State
  const [viewingVisit, setViewingVisit] = useState(null);

  // Pagination & Two-way Sync State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isSyncing, setIsSyncing] = useState(false);

  // Edit Modal State (Full editing of all fields)
  const [editingVisit, setEditingVisit] = useState(null);
  const [editCompanyId, setEditCompanyId] = useState('');
  const [editWhat, setEditWhat] = useState('First Campaign In FMS');
  const [editStartDate, setEditStartDate] = useState('');
  const [editCampaignNo, setEditCampaignNo] = useState('');
  const [editKilnSize, setEditKilnSize] = useState('');
  const [editKilnNo, setEditKilnNo] = useState('');
  const [editIncharge, setEditIncharge] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Form State
  const [companyId, setCompanyId] = useState('');
  const [kilnNo, setKilnNo] = useState('');
  const [kilnSize, setKilnSize] = useState('');
  const [campaignNo, setCampaignNo] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [what, setWhat] = useState('First Campaign In FMS');
  const [oldServiceOrderNo, setOldServiceOrderNo] = useState('');
  const [inspectionIncharge, setInspectionIncharge] = useState('');

  const kilnSizeOptions = [...new Set([
    ...(data?.kilnSizes && data.kilnSizes.length > 0 ? data.kilnSizes : ['80 TPD', '100 TPD', '120 TPD', '150 TPD']),
    ...(data?.kilns || []).map((k) => k.size).filter(Boolean)
  ])];

  // Compute next CN number preview
  const existingNums = (data.orders || [])
    .map((o) => parseInt(String(o?.serviceOrderNo || '').replace(/\D/g, ''), 10))
    .filter(Boolean);
  const maxNum = existingNums.length ? Math.max(...existingNums) : 0;
  const nextOrderNo = `CN-${String(maxNum + 1).padStart(2, '0')}`;

  // The Task Board can open this page directly for a pending restart task.
  useEffect(() => {
    const restartOrderNo = new URLSearchParams(location.search).get('restartOrder');
    if (!restartOrderNo) return;

    const oldOrder = (data.orders || []).find((o) => o.serviceOrderNo === restartOrderNo);
    if (!oldOrder) return;

    const oldKiln = (data.kilns || []).find((k) => k.id === oldOrder.kilnId);
    const oldVisit = (data.visits || []).find((v) => v.serviceOrderNo === restartOrderNo);
    const oldRunning = (data.runningInspections || []).find((r) => r.serviceOrderNo === restartOrderNo);
    const oldShutdown = (data.shutdownInspections || []).find((s) => s.serviceOrderNo === restartOrderNo);
    let incharge = oldVisit?.inspectionIncharge || oldVisit?.visitedBy || oldOrder?.inspectionIncharge || oldShutdown?.inspector || oldRunning?.inspector || '';
    if (incharge === 'Sanjay Singh') {
      incharge = '';
    }

    setWhat('Restarting The Process');
    setOldServiceOrderNo(oldOrder.serviceOrderNo);
    setCompanyId(oldOrder.companyId);
    setKilnNo(oldKiln?.kilnNo?.toString() || '1');
    setKilnSize(oldKiln?.size || '100 TPD');
    setCampaignNo(String((parseInt(oldOrder.campaignNo, 10) || 1) + 1));
    setStartDate(todayISO());
    setInspectionIncharge(incharge);
    setShowModal(true);
  }, [location.search]);

  const handleOpenModal = () => {
    setCompanyId('');
    setKilnNo('');
    setKilnSize('');
    setCampaignNo('');
    setStartDate(todayISO());
    setWhat('First Campaign In FMS');
    setOldServiceOrderNo('');
    setInspectionIncharge('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!companyId || !kilnNo || !kilnSize || !campaignNo || !startDate || !inspectionIncharge) {
      notify('Please fill all required company visit fields', 'bad');
      return;
    }

    const oldOrderNo = oldServiceOrderNo.trim().toUpperCase();
    if (what === 'Restarting The Process' && !oldOrderNo) {
      notify('Please enter the old service order number', 'bad');
      return;
    }

    setIsSubmitting(true);
    try {
      const nextData = { ...data };
      const offsets = nextData.settings?.offsets || { running: 7, call: -3, shutdown: 0, restart: 2 };

      // Find or create kiln in masters
      let kiln = (nextData.kilns || []).find(
        (k) => k.companyId === companyId && k.kilnNo.toString() === kilnNo.toString()
      );
      if (!kiln) {
        kiln = {
          id: `k${Date.now()}`,
          companyId,
          kilnNo: parseInt(kilnNo, 10) || 1,
          size: kilnSize.trim()
        };
        nextData.kilns.push(kiln);
      }

      const comp = (nextData.companies || []).find((c) => c.id === companyId);
      const companyName = comp ? comp.name : 'Unknown Plant';

      if (what === 'Restarting The Process') {
        const oldOrder = nextData.orders.find((o) => o.serviceOrderNo.toUpperCase() === oldOrderNo);
        if (!oldOrder) {
          notify(`Old service order ${oldOrderNo} was not found`, 'bad');
          return;
        }
        oldOrder.status = 'closed';
      }

      // Expected shutdown default estimate ~150 working days
      const estShutdown = addWorkingDays(startDate, 150);

      // Create Order
      const newOrder = {
        serviceOrderNo: nextOrderNo,
        companyId,
        kilnId: kiln.id,
        campaignNo: campaignNo.trim(),
        campaignStartDate: startDate,
        expectedShutdownDate: estShutdown,
        status: 'open',
        visitType: what,
        oldServiceOrderNo: what === 'Restarting The Process' ? oldOrderNo : null,
        inspectionIncharge: inspectionIncharge.trim()
      };
      nextData.orders.push(newOrder);

      // Record Visit
      if (!Array.isArray(nextData.visits)) nextData.visits = [];
      nextData.visits.push({
        serviceOrderNo: nextOrderNo,
        companyId,
        companyName,
        kilnNo: parseInt(kilnNo, 10) || 1,
        kilnSize: kilnSize.trim(),
        campaignNo: campaignNo.trim(),
        campaignStartDate: startDate,
        what,
        oldServiceOrderNo: what === 'Restarting The Process' ? oldOrderNo : '',
        inspectionIncharge: inspectionIncharge.trim(),
        // Keep this legacy key so older workflow pages continue to work.
        visitedBy: inspectionIncharge.trim(),
        date: startDate
      });

      // Complete Step 1 Task
      if (!Array.isArray(nextData.stepTasks)) nextData.stepTasks = [];
      nextData.stepTasks.push({
        id: `t-${Date.now()}-visit`,
        serviceOrderNo: nextOrderNo,
        step: 'visit',
        owner: what === 'Restarting The Process' ? 'CRM' : 'Sales',
        plannedDate: startDate,
        actualDate: startDate,
        delayDays: 0,
        status: 'done'
      });

      // Schedule Step 2 Task on the campaign start date.
      const plannedRunning = startDate;
      nextData.stepTasks.push({
        id: `t-${Date.now()}-run`,
        serviceOrderNo: nextOrderNo,
        step: 'running',
        owner: 'Sanjay',
        plannedDate: plannedRunning,
        actualDate: null,
        delayDays: 0,
        status: 'pending'
      });

      // 1. Sync to Google Sheet first so it writes to the cloud spreadsheet (NEVER touch Planned or Delay cols!)
      await syncStepToGoogleSheet(1, nextOrderNo, {
        companyName,
        campaignStartDate: startDate,
        campaignNo: campaignNo.trim(),
        kilnSize: kilnSize.trim(),
        kilnNo: parseInt(kilnNo, 10) || 1,
        inspectionIncharge: inspectionIncharge.trim()
      });

      // 2. Save state and refresh view
      await saveData(nextData);
      await refresh();
      notify(`Company Visit saved for ${companyName}! Service Order ${nextOrderNo} created.`, 'good');
      setShowModal(false);
    } catch (err) {
      notify(err.message, 'bad');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered visits list
  const visitsList = (data.visits || []).filter((v) => {
    const q = search.toLowerCase();
    const cName = v.companyName || ((data.companies || []).find((c) => c.id === v.companyId)?.name || '');
    return (
      v.serviceOrderNo.toLowerCase().includes(q) ||
      cName.toLowerCase().includes(q) ||
      (v.inspectionIncharge || v.visitedBy || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleSyncWithSheet = async () => {
    setIsSyncing(true);
    try {
      const res = await syncStepChangesFromSheet(1, data);
      if (res && res.nextData && res.changed > 0) {
        await saveData(res.nextData);
        await refresh();
        notify(`Synced successfully: ${res.changed} record(s) updated!`, 'good');
      } else if (res && res.changed === 0) {
        notify('All records are up to date.', 'good');
      } else if (res && res.error) {
        notify(`Sync warning: ${res.error}`, 'bad');
      }
    } catch (err) {
      notify('Sync failed: ' + err.message, 'bad');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenEdit = (v) => {
    setEditingVisit(v);
    const co = (data.companies || []).find(
      (c) => c.id === v.companyId || (c.name && v.companyName && c.name.toLowerCase() === v.companyName.toLowerCase())
    );
    setEditCompanyId(co?.id || v.companyId || '');
    setEditWhat(v.what || 'First Campaign In FMS');
    setEditStartDate(v.campaignStartDate || v.date || todayISO());
    setEditCampaignNo(v.campaignNo ? String(v.campaignNo) : '1');
    setEditKilnSize(v.kilnSize || '80 TPD');
    setEditKilnNo(v.kilnNo ? String(v.kilnNo) : '1');
    setEditIncharge(v.inspectionIncharge || v.visitedBy || '');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingVisit) return;
    setIsSavingEdit(true);
    try {
      const co = (data.companies || []).find((c) => c.id === editCompanyId);
      const companyName = co?.name || editingVisit.companyName;

      const nextData = { ...data };
      const v = (nextData.visits || []).find((x) => x.serviceOrderNo === editingVisit.serviceOrderNo);
      if (v) {
        v.companyId = editCompanyId;
        v.companyName = companyName;
        v.what = editWhat;
        v.campaignStartDate = editStartDate;
        v.campaignNo = editCampaignNo.trim();
        v.kilnSize = editKilnSize.trim();
        v.kilnNo = parseInt(editKilnNo, 10) || 1;
        v.inspectionIncharge = editIncharge.trim();
      }
      const o = (nextData.orders || []).find((x) => x.serviceOrderNo === editingVisit.serviceOrderNo);
      if (o) {
        o.companyId = editCompanyId;
        o.companyName = companyName;
        o.campaignStartDate = editStartDate;
        o.campaignNo = editCampaignNo.trim();
        o.kilnSize = editKilnSize.trim();
        o.kilnNo = parseInt(editKilnNo, 10) || 1;
        o.inspectionIncharge = editIncharge.trim();
      }

      // Update pending running task plannedDate if start date changed
      const task = (nextData.stepTasks || []).find(
        (t) => t.serviceOrderNo === editingVisit.serviceOrderNo && t.step === 'running'
      );
      if (task && task.status === 'pending') {
        task.plannedDate = editStartDate;
      }

      // Sync specific edited record to Google Sheet immediately (NEVER touching Planned or Delay cols!)
      await syncStepToGoogleSheet(1, editingVisit.serviceOrderNo, {
        companyName: companyName,
        campaignStartDate: editStartDate,
        campaignNo: editCampaignNo.trim(),
        kilnSize: editKilnSize.trim(),
        kilnNo: parseInt(editKilnNo, 10) || 1,
        inspectionIncharge: editIncharge.trim()
      });

      await saveData(nextData);
      await refresh();
      notify(`Updated ${editingVisit.serviceOrderNo} successfully!`, 'good');
      setEditingVisit(null);
    } catch (err) {
      notify('Failed to save edit: ' + err.message, 'bad');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteVisit = async (visit) => {
    const orderNo = visit.serviceOrderNo;
    if (!window.confirm(`Are you sure you want to delete Company Visit (${orderNo})? This will permanently delete the order from the app and Google Sheet.`)) {
      return;
    }

    try {
      // 1. Send delete request to Google Sheet
      deleteOrderFromGoogleSheet(orderNo);

      // 2. Remove order from local application state
      const nextData = { ...data };
      nextData.orders = (nextData.orders || []).filter((o) => o.serviceOrderNo !== orderNo);
      nextData.visits = (nextData.visits || []).filter((v) => v.serviceOrderNo !== orderNo);
      nextData.runningInspections = (nextData.runningInspections || []).filter((r) => r.serviceOrderNo !== orderNo);
      nextData.shutdownInspections = (nextData.shutdownInspections || []).filter((s) => s.serviceOrderNo !== orderNo);
      nextData.callLogs = (nextData.callLogs || []).filter((c) => c.serviceOrderNo !== orderNo);
      nextData.stepTasks = (nextData.stepTasks || []).filter((t) => t.serviceOrderNo !== orderNo);

      await saveData(nextData);
      await refresh();
      notify(`Order ${orderNo} deleted successfully from App and Sheet!`, 'good');
    } catch (err) {
      notify('Failed to delete order: ' + err.message, 'bad');
    }
  };

  const sortedVisits = [...visitsList].reverse();
  const paginatedVisits = sortedVisits.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      {/* HEADER SECTION WITH CORNER ACTION BUTTON */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Company Visit
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>

          </p>
        </div>

        {/* Form button corner me */}
        <button className="btn primary" onClick={handleOpenModal}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Company Visit
        </button>
      </div>

      {/* SEARCH AND KPI BAR */}
      <div className="card-panel" style={{ padding: '12px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Visits Logged: </span>
              <b className="mono" style={{ fontSize: '15px', color: 'var(--primary)' }}>{(data.visits || []).length}</b>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Next Order ID: </span>
              <b className="cn">{nextOrderNo}</b>
            </div>
          </div>

          <div className="search-row-mobile" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-input-wrap">
              <input
                type="search"
                placeholder="Search by party name or CN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-text"
              />
            </div>
          </div>
        </div>
      </div>

      {/* TABLE: SUBMIT HOTE HI DATA SHOW HOGA */}
      <div className="card-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0 }}>Company Visit Records</h2>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Service Order</th>
                <th>Name Of The Company</th>
                <th>What</th>
                <th>Old Service Order No.</th>
                <th>Kiln No. & Size</th>
                <th>Campaign No.</th>
                <th>Campaign Start Date</th>
                <th>Inspection Incharge</th>
                <th>Order Status</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedVisits.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No company visits found. Click "+ New Company Visit" in the top corner to record one.
                  </td>
                </tr>
              ) : (
                paginatedVisits.map((v) => {
                  const comp = (data.companies || []).find((c) => c.id === v.companyId);
                  const partyName = v.companyName || comp?.name || 'Unknown Company';
                  const order = (data.orders || []).find((o) => o.serviceOrderNo === v.serviceOrderNo);

                  return (
                    <tr
                      key={v.serviceOrderNo}
                      onClick={() => setViewingVisit(v)}
                      className="clickable-row"
                      title="Tap to view full details"
                    >
                      <td>
                        <b className="cn">{v.serviceOrderNo}</b>
                      </td>
                      <td>
                        <b>{partyName}</b>
                      </td>
                      <td>{v.what || 'First Campaign In FMS'}</td>
                      <td className="mono">{v.oldServiceOrderNo || '—'}</td>
                      <td className="mono">
                        Kiln {v.kilnNo} ({v.kilnSize})
                      </td>
                      <td className="mono">Camp. {v.campaignNo}</td>
                      <td>{formatDate(v.campaignStartDate || v.date)}</td>
                      <td>{v.inspectionIncharge || v.visitedBy || '—'}</td>
                      <td>
                        <span className={`pill ${order?.status === 'closed' ? '' : 'good'}`}>
                          {order?.status === 'closed' ? 'Closed' : 'Active'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingVisit(v);
                            }}
                            title="View Details"
                            style={{ padding: '3px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            View
                          </button>
                          <button
                            type="button"
                            className="btn small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(v);
                            }}
                            title={`Edit ${v.serviceOrderNo}`}
                            style={{ padding: '3px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVisit(v);
                            }}
                            title={`Delete ${v.serviceOrderNo}`}
                            style={{ padding: '3px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--error, #C93838)', borderColor: 'var(--error-border, #FAD1D1)' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION COMPONENT WITH ROWS PER PAGE DROPDOWN */}
        <Pagination
          totalItems={sortedVisits.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10, 20, 50, 100]}
          searchValue={search}
          onSearchChange={(value) => { setSearch(value); setPage(1); }}
          searchPlaceholder="Search company or order..."
        />
      </div>

      {/* NEW COMPANY VISIT MODAL FORM */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Record Company Visit (<span className="cn">{nextOrderNo}</span>)
              </h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Service Order No. (Auto-generated)</label>
                <input
                  readOnly
                  value={nextOrderNo}
                  className="input-text mono"
                  style={{ background: 'var(--surface-subtle)', fontWeight: 700, color: 'var(--primary)' }}
                />
              </div>

              <div className="field">
                <label>Name Of The Company *</label>
                <CustomSelect
                  required
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="select-input"
                  placeholder="Select Company"
                >
                  <option value="">Select Company</option>
                  {(data?.companies || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.kycNo ? ` (${c.kycNo})` : ''}
                    </option>
                  ))}
                </CustomSelect>
              </div>

              <div className="field">
                <label>What *</label>
                <CustomSelect
                  required
                  value={what}
                  onChange={(e) => setWhat(e.target.value)}
                  className="select-input"
                >
                  <option>First Campaign In FMS</option>
                  <option>Restarting The Process</option>
                </CustomSelect>
              </div>

              {what === 'Restarting The Process' && (
                <div className="field">
                  <label>Old Service Order No. *</label>
                  <input
                    required
                    value={oldServiceOrderNo}
                    onChange={(e) => setOldServiceOrderNo(e.target.value)}
                    placeholder="e.g. CN-12"
                    className="input-text mono"
                  />
                </div>
              )}

              <div className="fieldrow">
                <div className="field">
                  <label>Date Of Campaign Starting *</label>
                  <input
                    required
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>Campaign No. *</label>
                  <input
                    required
                    value={campaignNo}
                    onChange={(e) => setCampaignNo(e.target.value)}
                    placeholder="e.g. 1"
                    className="input-text"
                  />
                </div>
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>Size Of Kiln *</label>
                  <CustomSelect
                    required
                    value={kilnSize}
                    onChange={(e) => setKilnSize(e.target.value)}
                    className="select-input"
                    placeholder="Select Kiln Size"
                  >
                    <option value="">Select Kiln Size</option>
                    {kilnSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                  </CustomSelect>
                </div>
                <div className="field">
                  <label>Kiln No. *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="6"
                    value={kilnNo}
                    onChange={(e) => setKilnNo(e.target.value)}
                    placeholder="e.g. 1"
                    className="input-text"
                  />
                </div>
              </div>

              <div className="field">
                <label>Name Of Inspection Incharge *</label>
                <input
                  required
                  value={inspectionIncharge}
                  onChange={(e) => setInspectionIncharge(e.target.value)}
                  placeholder="Enter inspection incharge name"
                  className="input-text"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Visit & Generate Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT COMPANY VISIT MODAL */}
      {editingVisit && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Edit Visit Record (<span className="cn">{editingVisit.serviceOrderNo}</span>)
              </h2>
              <button className="modal-close-btn" onClick={() => setEditingVisit(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="field">
                <label>Service Order No.</label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={editingVisit.serviceOrderNo}
                  className="input-text mono"
                  style={{ background: 'var(--surface-subtle)', fontWeight: 700, color: 'var(--primary)' }}
                />
              </div>

              <div className="field">
                <label>Name Of The Company *</label>
                <CustomSelect
                  required
                  value={editCompanyId}
                  onChange={(e) => setEditCompanyId(e.target.value)}
                  className="select-input"
                  placeholder="Select Company"
                >
                  <option value="">Select Company</option>
                  {(data?.companies || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.kycNo ? ` (${c.kycNo})` : ''}
                    </option>
                  ))}
                </CustomSelect>
              </div>

              <div className="field">
                <label>What *</label>
                <CustomSelect
                  value={editWhat}
                  onChange={(e) => setEditWhat(e.target.value)}
                  className="select-input"
                >
                  <option value="First Campaign In FMS">First Campaign In FMS</option>
                  <option value="Restarting The Process">Restarting The Process</option>
                </CustomSelect>
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>Date Of Campaign Starting *</label>
                  <input
                    required
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>Campaign No. *</label>
                  <input
                    required
                    value={editCampaignNo}
                    onChange={(e) => setEditCampaignNo(e.target.value)}
                    placeholder="e.g. 1"
                    className="input-text"
                  />
                </div>
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>Size Of Kiln *</label>
                  <CustomSelect
                    required
                    value={editKilnSize}
                    onChange={(e) => setEditKilnSize(e.target.value)}
                    className="select-input"
                    placeholder="Select Kiln Size"
                  >
                    <option value="">Select Kiln Size</option>
                    {kilnSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </CustomSelect>
                </div>
                <div className="field">
                  <label>Kiln No. *</label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="6"
                    value={editKilnNo}
                    onChange={(e) => setEditKilnNo(e.target.value)}
                    placeholder="e.g. 1"
                    className="input-text"
                  />
                </div>
              </div>

              <div className="field">
                <label>Name Of Inspection Incharge *</label>
                <input
                  required
                  value={editIncharge}
                  onChange={(e) => setEditIncharge(e.target.value)}
                  placeholder="Enter inspection incharge name"
                  className="input-text"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" className="btn" onClick={() => setEditingVisit(null)}>
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

      {/* VIEW DETAILS POPUP MODAL */}
      {viewingVisit && (
        <DetailModal
          isOpen={!!viewingVisit}
          onClose={() => setViewingVisit(null)}
          title="Company Visit Details"
          subtitle={`Service Order: ${viewingVisit.serviceOrderNo}`}
          badge={(data.orders || []).find((o) => o.serviceOrderNo === viewingVisit.serviceOrderNo)?.status === 'closed' ? 'Closed' : 'Active'}
          badgeTone={(data.orders || []).find((o) => o.serviceOrderNo === viewingVisit.serviceOrderNo)?.status === 'closed' ? 'warn' : 'good'}
          items={[
            {
              label: 'Client Plant Company',
              value: viewingVisit.companyName || (data.companies || []).find((c) => c.id === viewingVisit.companyId)?.name || '—',
              fullWidth: true
            },
            { label: 'Service Order No.', value: viewingVisit.serviceOrderNo, mono: true },
            { label: 'Old Service Order No.', value: viewingVisit.oldServiceOrderNo || 'None', mono: true },
            { label: 'Rotary Kiln', value: `Kiln ${viewingVisit.kilnNo} (${viewingVisit.kilnSize || 'Standard'})` },
            { label: 'Campaign No.', value: `Campaign ${viewingVisit.campaignNo}`, mono: true },
            { label: 'Campaign Start Date', value: formatDate(viewingVisit.campaignStartDate || viewingVisit.date) },
            { label: 'Inspection Incharge', value: viewingVisit.inspectionIncharge || viewingVisit.visitedBy || '—' },
            {
              label: 'Order Status',
              value: (data.orders || []).find((o) => o.serviceOrderNo === viewingVisit.serviceOrderNo)?.status === 'closed' ? 'Closed' : 'Active'
            },
            { label: 'Nature of Visit / What', value: viewingVisit.what || 'First Campaign In FMS', fullWidth: true }
          ]}
          onEdit={() => handleOpenEdit(viewingVisit)}
          editLabel="Edit Visit"
        />
      )}
    </div>
  );
}

