import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import SummaryStrip from '../components/SummaryStrip';
import {
  todayISO,
  formatDate,
  addWorkingDays,
  calendarDaysDiff
} from '../utils/workflow';
import { saveData } from '../services/storage';
import CustomSelect from '../components/CustomSelect';
import Pagination from '../components/Pagination';

export default function CallTracker({ data, refresh, notify }) {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialOrderParam = queryParams.get('order') || '';

  const today = todayISO();

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');

  // Find all orders that have a pending 'call' task and no finalized shutdown inspection yet
  const callTasks = (data.stepTasks || []).filter((t) => t.step === 'call' && t.status === 'pending');
  const waitingOrders = callTasks
    .map((t) => {
      const order = (data.orders || []).find((o) => o.serviceOrderNo === t.serviceOrderNo);
      if (!order) return null;
      const company = (data.companies || []).find((c) => c.id === order.companyId);
      const kiln = (data.kilns || []).find((k) => k.id === order.kilnId);
      const logs = (data.callLogs || []).filter((l) => l.serviceOrderNo === order.serviceOrderNo);
      const lastLog = logs.length ? logs[logs.length - 1] : null;
      return {
        task: t,
        order,
        company,
        kiln,
        logs,
        lastLog
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.order.expectedShutdownDate < b.order.expectedShutdownDate ? -1 : 1));

  // Selected Order for viewing history
  const [selectedOrderNo, setSelectedOrderNo] = useState(
    initialOrderParam || (waitingOrders[0]?.order.serviceOrderNo || '')
  );

  // Modal State for "Log Call"
  const [showModal, setShowModal] = useState(false);
  const [modalOrderNo, setModalOrderNo] = useState('');
  const [personCalled, setPersonCalled] = useState('');
  const [designation, setDesignation] = useState('Processor');
  const [mobile, setMobile] = useState('');
  const [shutdownDateGiven, setShutdownDateGiven] = useState(false);
  const [expectedDate, setExpectedDate] = useState('');
  const [nextCallDate, setNextCallDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync if URL query param changes
  useEffect(() => {
    if (initialOrderParam) {
      setSelectedOrderNo(initialOrderParam);
    }
  }, [initialOrderParam]);

  // Open Log Call Modal
  const handleOpenLogModal = (ordNo) => {
    const targetOrder = (data.orders || []).find((o) => o.serviceOrderNo === ordNo);
    const comp = targetOrder ? (data.companies || []).find((c) => c.id === targetOrder.companyId) : null;
    const prevLogs = (data.callLogs || []).filter((l) => l.serviceOrderNo === ordNo);
    const last = prevLogs.length ? prevLogs[prevLogs.length - 1] : null;

    setModalOrderNo(ordNo);
    setPersonCalled('');
    setDesignation(last?.designation || 'Processor');
    setMobile('');
    setShutdownDateGiven(false);
    setExpectedDate(targetOrder?.expectedShutdownDate || '');
    setNextCallDate('');
    setShowModal(true);
  };

  // Submit Call Log
  const handleSubmitCall = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedPerson = personCalled.trim();
    if (!trimmedPerson) {
      notify('Please enter name of the person called', 'bad');
      return;
    }

    if (mobile && !/^\d{10}$/.test(mobile.trim())) {
      notify('Mobile number must be 10 digits', 'bad');
      return;
    }

    if (shutdownDateGiven && !expectedDate) {
      notify('Please specify the agreed shutdown date', 'bad');
      return;
    }

    if (!shutdownDateGiven && !nextCallDate) {
      notify('Please specify the next follow-up call date', 'bad');
      return;
    }

    setIsSubmitting(true);
    try {
      const nextData = { ...data };
      const offsets = nextData.settings?.offsets || { running: 7, call: -3, shutdown: 0, restart: 2 };

      // Record call log
      nextData.callLogs.push({
        timestamp: new Date().toISOString(),
        serviceOrderNo: modalOrderNo,
        personCalled: trimmedPerson,
        designation: designation.trim() || 'Processor',
        mobile: mobile.trim(),
        shutdownDateGiven: Boolean(shutdownDateGiven),
        expectedShutdownDate: expectedDate,
        nextCallDate: shutdownDateGiven ? null : nextCallDate
      });

      // Update Order expected shutdown date
      const ord = nextData.orders.find((o) => o.serviceOrderNo === modalOrderNo);
      if (ord) {
        ord.expectedShutdownDate = expectedDate;
      }

      if (shutdownDateGiven) {
        // Shutdown date received: mark Step 3 'call' task DONE
        const callTask = nextData.stepTasks.find(
          (t) => t.serviceOrderNo === modalOrderNo && t.step === 'call' && t.status === 'pending'
        );
        if (callTask) {
          const delay = calendarDaysDiff(callTask.plannedDate, today);
          callTask.status = 'done';
          callTask.actualDate = today;
          callTask.delayDays = delay > 0 ? delay : 0;
        }

        // Schedule Step 4 'shutdown' task on the agreed shutdown date (N + 0)
        const plannedShutdown = addWorkingDays(expectedDate, offsets.shutdown ?? 0);
        const existingShutdownTask = nextData.stepTasks.find(
          (t) => t.serviceOrderNo === modalOrderNo && t.step === 'shutdown'
        );

        if (existingShutdownTask) {
          existingShutdownTask.plannedDate = plannedShutdown;
          existingShutdownTask.status = 'pending';
        } else {
          nextData.stepTasks.push({
            id: `t-${Date.now()}-shut`,
            serviceOrderNo: modalOrderNo,
            step: 'shutdown',
            owner: 'Sanjay',
            plannedDate: plannedShutdown,
            actualDate: null,
            delayDays: 0,
            status: 'pending'
          });
        }

        notify(`Shutdown date confirmed for ${modalOrderNo}! Shutdown inspection scheduled for ${formatDate(plannedShutdown)}.`, 'good');
      } else {
        // Shutdown date not received: keep task pending, update planned follow-up date
        const callTask = nextData.stepTasks.find(
          (t) => t.serviceOrderNo === modalOrderNo && t.step === 'call' && t.status === 'pending'
        );
        if (callTask) {
          callTask.plannedDate = nextCallDate;
        }

        notify(`Call logged for ${modalOrderNo}. Next follow-up call set for ${formatDate(nextCallDate)}.`, 'good');
      }

      await saveData(nextData);
      await refresh();
      setShowModal(false);
    } catch (err) {
      notify(err.message, 'bad');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stats calculation
  const overdueCount = waitingOrders.filter(
    (w) => w.lastLog?.nextCallDate && w.lastLog.nextCallDate < today
  ).length;
  const dueTodayCount = waitingOrders.filter(
    (w) => w.lastLog?.nextCallDate && w.lastLog.nextCallDate === today
  ).length;
  const notCalledYetCount = waitingOrders.filter((w) => w.logs.length === 0).length;

  const summaryStats = [
    { label: 'Waiting for Date', value: waitingOrders.length },
    { label: 'Call Overdue', value: overdueCount, tone: overdueCount ? 'bad' : '' },
    { label: 'Call Today', value: dueTodayCount, tone: dueTodayCount ? 'warn' : '' },
    { label: 'Not Contacted Yet', value: notCalledYetCount },
    { label: 'Total Logs Recorded', value: data.callLogs?.length || 0 }
  ];

  const selectedItem = waitingOrders.find((w) => w.order.serviceOrderNo === selectedOrderNo) || waitingOrders[0];
  const selectedLogs = (data.callLogs || []).filter((l) => l.serviceOrderNo === (selectedItem?.order.serviceOrderNo || selectedOrderNo));

  const filteredWaiting = waitingOrders.filter((item) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return String(item.order.serviceOrderNo || '').toLowerCase().includes(query)
      || String(item.company?.name || '').toLowerCase().includes(query)
      || String(item.company?.siteIncharge || '').toLowerCase().includes(query);
  });
  const paginatedWaiting = filteredWaiting.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div>
      {/* HEADER ROW */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Call Tracker
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Follow up with customer plant representatives before kiln shutdown. Finalizing the date automatically schedules Shutdown Inspection.
          </p>
        </div>
      </div>

      <SummaryStrip items={summaryStats} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>
        {/* LEFT: TABLE OF ORDERS AWAITING SHUTDOWN CONFIRMATION */}
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <h2 style={{ margin: 0 }}>Orders Awaiting Shutdown Confirmation</h2>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order or company..."
              className="input-text"
              style={{ width: '240px', maxWidth: '100%' }}
            />
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Company & Kiln</th>
                  <th>Site Incharge</th>
                  <th>Last Call</th>
                  <th>Next Call</th>
                  <th className="n">Calls</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedWaiting.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      ✓ All kilns have confirmed shutdown dates! No outbound calls pending.
                    </td>
                  </tr>
                ) : (
                  paginatedWaiting.map((w) => {
                    const isSelected = w.order.serviceOrderNo === selectedItem?.order.serviceOrderNo;
                    const nextDate = w.lastLog?.nextCallDate;
                    const isOverdue = nextDate && nextDate < today;
                    const isToday = nextDate && nextDate === today;

                    return (
                      <tr
                        key={w.order.serviceOrderNo}
                        onClick={() => setSelectedOrderNo(w.order.serviceOrderNo)}
                        className={`clickable-row ${isSelected ? 'selected' : ''}`}
                        title="Tap to view call history"
                        style={{
                          background: isSelected ? 'var(--primary-soft)' : undefined
                        }}
                      >
                        <td>
                          <b className="cn">{w.order.serviceOrderNo}</b>
                        </td>
                        <td>
                          <div><b>{w.company?.name}</b></div>
                          <small style={{ color: 'var(--text-secondary)' }}>
                            Kiln {w.kiln?.kilnNo} ({w.kiln?.size}) · Camp. {w.order.campaignNo}
                          </small>
                        </td>
                        <td>
                          <div>{w.company?.siteIncharge || '—'}</div>
                          <small className="mono" style={{ color: 'var(--text-secondary)' }}>
                            {w.company?.mobile || ''}
                          </small>
                        </td>
                        <td>{w.lastLog ? formatDate(w.lastLog.timestamp.slice(0, 10)) : 'Never'}</td>
                        <td>
                          {nextDate ? (
                            <span className={isOverdue ? 'date-bad' : isToday ? 'date-today' : ''}>
                              {formatDate(nextDate)}
                              {isOverdue && <span className="pill bad" style={{ marginLeft: '4px' }}>Overdue</span>}
                              {isToday && <span className="pill warn" style={{ marginLeft: '4px' }}>Today</span>}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Not set</span>
                          )}
                        </td>
                        <td className="n mono">{w.logs.length}</td>
                        <td>
                          <button
                            className="btn small primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenLogModal(w.order.serviceOrderNo);
                            }}
                          >
                            Log Call
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            totalItems={filteredWaiting.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[5, 10, 20, 50]}
            searchValue={search}
            onSearchChange={(value) => { setSearch(value); setPage(1); }}
            searchPlaceholder="Search order or company..."
          />
        </div>

        {/* RIGHT: CALL LOG HISTORY */}
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ margin: 0 }}>
              Call History: <span className="cn">{selectedItem?.order.serviceOrderNo || 'Select Order'}</span>
            </h2>
            {selectedItem && (
              <button
                className="btn small primary"
                onClick={() => handleOpenLogModal(selectedItem.order.serviceOrderNo)}
              >
                + Log Call
              </button>
            )}
          </div>

          {selectedItem ? (
            <div>
              <div style={{ background: 'var(--surface-subtle)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedItem.company?.name}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Representative: <b>{selectedItem.company?.siteIncharge}</b> ({selectedItem.company?.mobile})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600, marginTop: '4px' }}>
                  Target Expected Shutdown: {formatDate(selectedItem.order.expectedShutdownDate)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedLogs.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No call logs recorded yet. Click "Log Call" to register the first interaction.
                  </div>
                ) : (
                  [...selectedLogs].reverse().map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <b style={{ fontSize: '13px' }}>{formatDate(log.timestamp.slice(0, 10))}</b>
                        <span className={`pill ${log.shutdownDateGiven ? 'good' : 'warn'}`}>
                          {log.shutdownDateGiven ? '✓ Date Confirmed' : 'Follow-up Needed'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        Called: <b>{log.personCalled}</b> ({log.designation}) · {log.mobile}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '12px', borderTop: '1px dashed var(--border-subtle)', paddingTop: '6px' }}>
                        {log.shutdownDateGiven ? (
                          <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                            Agreed Shutdown Date: {formatDate(log.expectedShutdownDate)}
                          </span>
                        ) : (
                          <span>
                            Next Follow-up Call: <b>{formatDate(log.nextCallDate)}</b>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select an order from the list to view its complete contact trail.
            </div>
          )}
        </div>
      </div>

      {/* RESTYLED LOG CALL MODAL */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Log Outbound Call: <span className="cn">{modalOrderNo}</span>
              </h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCall}>
              <div className="field">
                <label>Person Contacted *</label>
                <input
                  required
                  value={personCalled}
                  onChange={(e) => setPersonCalled(e.target.value)}
                  placeholder="Enter Name of Person Called"
                  className="input-text"
                />
              </div>

              <div className="fieldrow">
                <div className="field">
                  <label>Designation</label>
                  <CustomSelect
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="select-input"
                  >
                    <option value="Processor">Processor</option>
                    <option value="GM">GM</option>
                    <option value="Plant Head">Plant Head</option>
                    <option value="Site Incharge">Site Incharge</option>
                    <option value="Managing Director">Managing Director</option>
                  </CustomSelect>
                </div>

                <div className="field">
                  <label>Mobile Number (10 digits)</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="9753779531"
                    className="input-text"
                  />
                </div>
              </div>

              {/* OUTCOME SELECTION */}
              <div style={{ margin: '14px 0', padding: '12px', background: 'var(--surface-subtle)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
                  Shutdown Confirmation Outcome
                </label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="sdOutcome"
                      checked={shutdownDateGiven === true}
                      onChange={() => setShutdownDateGiven(true)}
                    />
                    <span>Yes, date confirmed</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="sdOutcome"
                      checked={shutdownDateGiven === false}
                      onChange={() => setShutdownDateGiven(false)}
                    />
                    <span>No, follow-up needed</span>
                  </label>
                </div>
              </div>

              {shutdownDateGiven ? (
                <div className="field" style={{ background: 'var(--success-soft)', padding: '12px', borderRadius: '8px', border: '1px solid var(--success-border)' }}>
                  <label style={{ color: 'var(--success)', fontWeight: 700 }}>Confirmed Shutdown Date *</label>
                  <input
                    required
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="input-text"
                  />
                </div>
              ) : (
                <div className="fieldrow" style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div className="field">
                    <label>Next Call Date *</label>
                    <input
                      required
                      type="date"
                      value={nextCallDate}
                      onChange={(e) => setNextCallDate(e.target.value)}
                      className="input-text"
                    />
                  </div>
                  <div className="field">
                    <label>Tentative Shutdown Date</label>
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      className="input-text"
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Call Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
