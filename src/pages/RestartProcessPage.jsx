import React, { useState, useEffect } from 'react';
import { todayISO, formatDate, addWorkingDays } from '../utils/workflow';
import { saveData } from '../services/storage';
import { syncStepToGoogleSheet, syncStepChangesFromSheet } from '../services/googleSheets';
import CustomSelect from '../components/CustomSelect';
import Pagination from '../components/Pagination';
import DetailModal from '../components/DetailModal';

const formatCampaignNo = (value) => {
  const campaign = String(value || '').trim();
  if (!campaign) return '—';
  const number = campaign.replace(/^camp(?:aign)?[\s.\-_]*/i, '').trim();
  return `Camp-${number || campaign}`;
};

export default function RestartProcessPage({ data, refresh, notify }) {
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingRestart, setViewingRestart] = useState(null);

  // Pagination states
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [isSyncing, setIsSyncing] = useState(false);

  const [selectedLog, setSelectedLog] = useState(null);
  const [companyId, setCompanyId] = useState('');
  const [kilnNo, setKilnNo] = useState('');
  const [kilnSize, setKilnSize] = useState('');
  const [campaignNo, setCampaignNo] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [inspectionIncharge, setInspectionIncharge] = useState('');

  const kilnSizeOptions = [...new Set([
    ...(data?.kilnSizes && data.kilnSizes.length > 0 ? data.kilnSizes : ['80 TPD', '100 TPD', '120 TPD', '150 TPD']),
    ...(data?.kilns || []).map((k) => k.size).filter(Boolean)
  ])];

  const nextRestartNo = selectedLog?.serviceOrderNo
    ? `Re${selectedLog.serviceOrderNo}`
    : 'ReCN-00';

  const pendingLogs = (data.callLogs || [])
    .filter((log) => {
      const status = String(log.shutdownDateGiven || '').toLowerCase();
      const task = (data.stepTasks || []).find(
        (item) => item.serviceOrderNo === log.serviceOrderNo && item.step === 'call'
      );
      const restartTask = (data.stepTasks || []).find(
        (item) => item.serviceOrderNo === log.serviceOrderNo && item.step === 'restart'
      );
      const order = (data.orders || []).find(
        (item) => item.serviceOrderNo === log.serviceOrderNo
      );
      const inferredForget = (!status || status === 'pending call') && task?.status === 'done' && !log.expectedShutdownDate;
      const restartCompleted = restartTask?.status === 'done' || order?.status === 'closed';
      return (status.includes('forget') || inferredForget) && !log.restartServiceOrderNo && !restartCompleted;
    })
    .map((log) => {
      const oldOrder = (data.orders || []).find((order) => order.serviceOrderNo === log.serviceOrderNo);
      const kiln = oldOrder ? (data.kilns || []).find((item) => item.id === oldOrder.kilnId) : null;
      const visit = (data.visits || []).find((item) => item.serviceOrderNo === log.serviceOrderNo);
      const company = (data.companies || []).find((item) => item.id === oldOrder?.companyId);
      return {
        ...log,
        partyName: log.partyName || company?.name || visit?.companyName || 'Unknown Plant',
        oldCampaignNo: oldOrder?.campaignNo || visit?.campaignNo || '—',
        oldKilnNo: kiln?.kilnNo || visit?.kilnNo || '—',
        oldKilnSize: kiln?.size || visit?.kilnSize || '—',
        oldCampaignStartDate: oldOrder?.campaignStartDate || visit?.campaignStartDate || null,
        oldExpectedShutdownDate: oldOrder?.expectedShutdownDate || null,
        restartPlannedDate: oldOrder?.restartPlannedDate || null
      };
    });
  const history = data.restartProcesses || [];

  const openRestartForm = (log) => {
    const oldOrder = (data.orders || []).find((order) => order.serviceOrderNo === log.serviceOrderNo);
    const kiln = oldOrder ? (data.kilns || []).find((item) => item.id === oldOrder.kilnId) : null;
    const visit = (data.visits || []).find((item) => item.serviceOrderNo === log.serviceOrderNo);
    const running = (data.runningInspections || []).find((r) => r.serviceOrderNo === log.serviceOrderNo);
    const shutdown = (data.shutdownInspections || []).find((s) => s.serviceOrderNo === log.serviceOrderNo);
    setSelectedLog(log);
    setCompanyId(oldOrder?.companyId || '');
    setKilnNo(kiln?.kilnNo ? String(kiln.kilnNo) : '');
    setKilnSize(kiln?.size || '');
    setCampaignNo(oldOrder?.campaignNo ? String((parseInt(oldOrder.campaignNo, 10) || 1) + 1) : '');
    setStartDate(todayISO());
    let incharge = visit?.inspectionIncharge || visit?.visitedBy || oldOrder?.inspectionIncharge || shutdown?.inspector || running?.inspector || '';
    if (incharge === 'Sanjay Singh') {
      incharge = '';
    }
    setInspectionIncharge(incharge);
    setShowModal(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting || !selectedLog) return;
    if (!companyId || !kilnNo || !kilnSize || !campaignNo || !startDate || !inspectionIncharge.trim()) {
      notify('Please fill all required restart fields', 'bad');
      return;
    }

    setIsSubmitting(true);
    try {
      const nextData = { ...data };
      if (!Array.isArray(nextData.orders)) nextData.orders = [];
      if (!Array.isArray(nextData.kilns)) nextData.kilns = [];
      if (!Array.isArray(nextData.visits)) nextData.visits = [];
      if (!Array.isArray(nextData.stepTasks)) nextData.stepTasks = [];
      if (!Array.isArray(nextData.restartProcesses)) nextData.restartProcesses = [];

      const oldOrder = nextData.orders.find((order) => order.serviceOrderNo === selectedLog.serviceOrderNo);
      if (oldOrder) {
        oldOrder.status = 'closed';
        const oldCallTask = nextData.stepTasks.find(
          (task) => task.serviceOrderNo === selectedLog.serviceOrderNo && task.step === 'call' && task.status === 'pending'
        );
        if (oldCallTask) {
          oldCallTask.status = 'done';
          oldCallTask.actualDate = todayISO();
        }
      }

      let kiln = nextData.kilns.find(
        (item) => item.companyId === companyId && String(item.kilnNo) === String(kilnNo)
      );
      if (!kiln) {
        kiln = { id: `k${Date.now()}`, companyId, kilnNo: Number(kilnNo), size: kilnSize };
        nextData.kilns.push(kiln);
      }

      const company = (nextData.companies || []).find((item) => item.id === companyId);
      const expectedShutdownDate = addWorkingDays(startDate, 150);
      const newOrder = {
        serviceOrderNo: nextRestartNo,
        companyId,
        kilnId: kiln.id,
        campaignNo: campaignNo.trim(),
        campaignStartDate: startDate,
        expectedShutdownDate,
        status: 'open',
        visitType: 'Restarting The Process',
        oldServiceOrderNo: selectedLog.serviceOrderNo,
        inspectionIncharge: inspectionIncharge.trim()
      };
      nextData.orders.push(newOrder);

      nextData.visits.push({
        serviceOrderNo: nextRestartNo,
        companyId,
        companyName: company?.name || 'Unknown Plant',
        kilnNo: Number(kilnNo),
        kilnSize,
        campaignNo: campaignNo.trim(),
        campaignStartDate: startDate,
        what: 'Restarting The Process',
        oldServiceOrderNo: selectedLog.serviceOrderNo,
        inspectionIncharge: inspectionIncharge.trim(),
        visitedBy: inspectionIncharge.trim(),
        date: startDate
      });

      const now = Date.now();
      nextData.stepTasks.push({
        id: `t-${now}-restart-visit`,
        serviceOrderNo: nextRestartNo,
        step: 'visit',
        owner: 'CRM',
        plannedDate: startDate,
        actualDate: startDate,
        delayDays: 0,
        status: 'done'
      });
      nextData.stepTasks.push({
        id: `t-${now}-restart-running`,
        serviceOrderNo: nextRestartNo,
        step: 'running',
        owner: 'Sanjay',
        plannedDate: startDate,
        actualDate: null,
        delayDays: 0,
        status: 'pending'
      });

      const sourceLog = nextData.callLogs?.find((log) => log === selectedLog || (
        log.serviceOrderNo === selectedLog.serviceOrderNo && log.timestamp === selectedLog.timestamp
      ));
      if (sourceLog) sourceLog.restartServiceOrderNo = nextRestartNo;
      nextData.restartProcesses.push({
        serviceOrderNo: nextRestartNo,
        sourceServiceOrderNo: selectedLog.serviceOrderNo,
        callLogNo: selectedLog.callLogNo || '',
        companyId,
        companyName: company?.name || 'Unknown Plant',
        what: 'Restarting The Process',
        campaignNo: campaignNo.trim(),
        kilnNo: Number(kilnNo),
        kilnSize,
        campaignStartDate: startDate,
        inspectionIncharge: inspectionIncharge.trim(),
        date: startDate
      });

      // 1. Sync Step 5 for old order (closes old order with actual timestamp)
      await syncStepToGoogleSheet(5, selectedLog.serviceOrderNo, {
        status: `Restarted -> ${nextRestartNo}`
      });

      // 2. Sync Step 1 for new ReCN order (never touch Planned or Delay cols)
      await syncStepToGoogleSheet(1, nextRestartNo, {
        companyName: company?.name || 'Unknown Plant',
        campaignStartDate: startDate,
        campaignNo: campaignNo.trim(),
        kilnSize,
        kilnNo: Number(kilnNo),
        inspectionIncharge: inspectionIncharge.trim()
      });

      await saveData(nextData);
      await refresh();
      setShowModal(false);
      setActiveTab('history');
      notify(`${nextRestartNo} created for ${company?.name || 'the company'}. Running Inspection is now pending.`, 'good');
    } catch (error) {
      notify(error.message, 'bad');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncWithSheet = async () => {
    setIsSyncing(true);
    try {
      const res = await syncStepChangesFromSheet(5, data);
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

  const paginatedPending = pendingLogs.slice(
    (pendingPage - 1) * pendingPageSize,
    pendingPage * pendingPageSize
  );

  const reversedHistory = [...history].reverse();
  const paginatedHistory = reversedHistory.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Restart The Process
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>

          </p>
        </div>
      </div>

      <div className="card-panel" style={{ padding: '12px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)', width: 'fit-content' }}>
            <button type="button" className={`btn small ${activeTab === 'pending' ? 'primary' : ''}`} onClick={() => setActiveTab('pending')} style={{ height: '34px' }}>
              Pending ({pendingLogs.length})
            </button>
            <button type="button" className={`btn small ${activeTab === 'history' ? 'primary' : ''}`} onClick={() => setActiveTab('history')} style={{ height: '34px' }}>
              History ({history.length})
            </button>
          </div>

          <button
            type="button"
            className="btn small"
            onClick={handleSyncWithSheet}
            disabled={isSyncing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px' }}
            title="Synchronize latest data"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {activeTab === 'pending' && <div className="card-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0 }}>Restart Process Pending ({pendingLogs.length})</h2>
          <span className="pill warn">Forget to taken</span>
        </div>
        <div className="tablewrap">
          <table style={{ minWidth: '1400px' }}>
            <thead>
              <tr>
                <th>Old Service Order</th>
                <th>Planned Date</th>
                <th>Company</th>
                <th>Old Campaign No.</th>
                <th>Old Kiln No. & Size</th>
                <th>Old Campaign Start Date</th>
                <th>Old Expected Shutdown</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPending.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>No restart process pending records.</td></tr>
              ) : paginatedPending.map((log) => (
                <tr
                  key={`${log.serviceOrderNo}-${log.timestamp}`}
                  onClick={() => setViewingRestart(log)}
                  className="clickable-row"
                  title="Tap to view restart details"
                >
                  <td><b className="cn">{log.serviceOrderNo}</b></td>
                  <td>{log.restartPlannedDate ? formatDate(log.restartPlannedDate) : '—'}</td>
                  <td><b>{log.partyName || 'Unknown Plant'}</b></td>
                  <td>{formatCampaignNo(log.oldCampaignNo)}</td>
                  <td className="mono">Kiln {log.oldKilnNo} ({log.oldKilnSize})</td>
                  <td>{log.oldCampaignStartDate ? formatDate(log.oldCampaignStartDate) : '—'}</td>
                  <td>{log.oldExpectedShutdownDate ? formatDate(log.oldExpectedShutdownDate) : '—'}</td>
                  <td>
                    <button
                      className="btn primary small"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRestartForm(log);
                      }}
                    >
                      Company Visit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* TAB 1 PAGINATION */}
        <Pagination
          totalItems={pendingLogs.length}
          page={pendingPage}
          pageSize={pendingPageSize}
          onPageChange={setPendingPage}
          onPageSizeChange={setPendingPageSize}
          pageSizeOptions={[5, 10, 20, 50, 100]}
        />
      </div>}

      {activeTab === 'history' && <div className="card-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0 }}>Restart Process History ({history.length})</h2>
          <span className="pill good">ReCN Orders</span>
        </div>
        <div className="tablewrap">
          <table style={{ minWidth: '1100px' }}>
            <thead><tr><th>ReCN No.</th><th>Old Service Order No.</th><th>Name Of The Company</th><th>What</th><th>Campaign No.</th><th>Kiln No. & Size</th><th>Date Of Campaign Starting</th><th>Inspection Incharge</th><th style={{ width: '80px', textAlign: 'center' }}>Action</th></tr></thead>
            <tbody>
              {paginatedHistory.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No restart records submitted yet.</td></tr>
              ) : paginatedHistory.map((item) => (
                <tr
                  key={item.serviceOrderNo}
                  onClick={() => setViewingRestart(item)}
                  className="clickable-row"
                  title="Tap to view restart details"
                >
                  <td><b className="cn">{item.serviceOrderNo}</b></td>
                  <td className="mono">{item.sourceServiceOrderNo}</td>
                  <td><b>{item.companyName}</b></td>
                  <td>{item.what || 'Restarting The Process'}</td>
                  <td>{formatCampaignNo(item.campaignNo)}</td>
                  <td className="mono">Kiln {item.kilnNo || '—'} ({item.kilnSize || '—'})</td>
                  <td>{formatDate(item.campaignStartDate)}</td>
                  <td>{item.inspectionIncharge}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="btn small secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingRestart(item);
                      }}
                      title="View Details"
                      style={{ padding: '3px 8px', fontSize: '12px' }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
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
      </div>}

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Restart Company Visit (<span className="cn">{nextRestartNo}</span>)</h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="field"><label>Service Order No. (Auto-generated)</label><input readOnly value={nextRestartNo} className="input-text mono" style={{ background: 'var(--surface-subtle)', fontWeight: 700, color: 'var(--primary)' }} /></div>
              <div className="field"><label>Old Service Order No.</label><input readOnly value={selectedLog?.serviceOrderNo || ''} className="input-text mono" style={{ background: 'var(--surface-subtle)' }} /></div>
              <div className="field"><label>Name Of The Company *</label><CustomSelect required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="select-input" placeholder="Select Company"><option value="">Select Company</option>{(data?.companies || []).map((company) => <option key={company.id} value={company.id}>{company.name}{company.kycNo ? ` (${company.kycNo})` : ''}</option>)}</CustomSelect></div>
              <div className="fieldrow"><div className="field"><label>Date Of Campaign Starting *</label><input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-text" /></div><div className="field"><label>Campaign No. *</label><input required value={campaignNo} onChange={(e) => setCampaignNo(e.target.value)} placeholder="e.g. 2" className="input-text" /></div></div>
              <div className="fieldrow"><div className="field"><label>Size Of Kiln *</label><CustomSelect required value={kilnSize} onChange={(e) => setKilnSize(e.target.value)} className="select-input" placeholder="Select Kiln Size"><option value="">Select Kiln Size</option>{kilnSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</CustomSelect></div><div className="field"><label>Kiln No. *</label><input required type="number" min="1" max="6" value={kilnNo} onChange={(e) => setKilnNo(e.target.value)} placeholder="e.g. 1" className="input-text" /></div></div>
              <div className="field"><label>Name Of Inspection Incharge *</label><input required value={inspectionIncharge} onChange={(e) => setInspectionIncharge(e.target.value)} placeholder="Enter inspection incharge name" className="input-text" /></div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}><button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Submit Restart Process'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {viewingRestart && (
        <DetailModal
          isOpen={!!viewingRestart}
          onClose={() => setViewingRestart(null)}
          title="Restart Process Details"
          subtitle={`Order: ${viewingRestart.serviceOrderNo || viewingRestart.sourceServiceOrderNo || 'N/A'}`}
          badge={viewingRestart.what || (viewingRestart.callLogNo ? 'Pending Visit' : 'ReCN Order')}
          badgeTone="good"
          items={[
            { label: 'Company / Party', value: viewingRestart.companyName || viewingRestart.partyName },
            { label: 'ReCN / Service Order', value: viewingRestart.serviceOrderNo, mono: true },
            { label: 'Old Service Order', value: viewingRestart.sourceServiceOrderNo || viewingRestart.serviceOrderNo, mono: true },
            { label: 'Kiln No. & Size', value: `Kiln ${viewingRestart.kilnNo || viewingRestart.oldKilnNo || '—'} (${viewingRestart.kilnSize || viewingRestart.oldKilnSize || '—'})`, mono: true },
            { label: 'Campaign No.', value: formatCampaignNo(viewingRestart.campaignNo || viewingRestart.oldCampaignNo), mono: true },
            ...(viewingRestart.restartPlannedDate ? [{
              label: 'Planned Date',
              value: formatDate(viewingRestart.restartPlannedDate)
            }] : []),
            { label: 'Campaign Start Date', value: formatDate(viewingRestart.campaignStartDate || viewingRestart.oldCampaignStartDate) },
            { label: 'Inspection Incharge', value: viewingRestart.inspectionIncharge || '—' },
            { label: 'Process Status', value: viewingRestart.what || 'Restarting The Process' },
            ...(viewingRestart.oldExpectedShutdownDate ? [{
              label: 'Old Expected Shutdown',
              value: formatDate(viewingRestart.oldExpectedShutdownDate)
            }] : [])
          ]}
        />
      )}
    </div>
  );
}
