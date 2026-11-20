import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayISO, formatDate, addWorkingDays, calendarDaysDiff, getTaskDelay } from '../utils/workflow';
import { saveData } from '../services/storage';
import { syncStepToGoogleSheet, syncStepChangesFromSheet } from '../services/googleSheets';
import CustomSelect from '../components/CustomSelect';
import Pagination from '../components/Pagination';
import DetailModal from '../components/DetailModal';

export default function TakeShutdownDatePage({ data, refresh, notify }) {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'history'
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View Details Modal State
  const [viewingRecord, setViewingRecord] = useState(null);

  // Pagination states
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(10);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal State
  const [showCallModal, setShowCallModal] = useState(false);
  const [showDirectUpdateModal, setShowDirectUpdateModal] = useState(false);
  const [selectedOrderNo, setSelectedOrderNo] = useState('');

  // Form Fields for Call Tracker / Shutdown Date
  const [personCalled, setPersonCalled] = useState('');
  const [mobile, setMobile] = useState('');
  const [designation, setDesignation] = useState('Processor'); // 'Processor' | 'Purchaser'
  const [shutdownDateGiven, setShutdownDateGiven] = useState('Yes Shutdown date taken'); // Yes Shutdown date taken | No shutdown date not taken | Forget to taken
  const [expectedShutdownDate, setExpectedShutdownDate] = useState('');
  const [nextCallDate, setNextCallDate] = useState('');

  const today = todayISO();
  const cleanCallStatus = (status = '') => String(status || '').replace(/^\d+\.\s*/, '');
  const isDateValue = (value) => /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/.test(String(value || '').trim());

  const formatCallLogNo = (serviceOrderNo, rawCallLogNo, fallbackNo = 1) => {
    const match = String(rawCallLogNo || '').match(/Call\s*-\s*(\d+)/i);
    const sequence = match ? Number(match[1]) : fallbackNo;
    const cleanOrder = String(serviceOrderNo || '').trim().replace(/\s+/g, '').replace(/^CN-0*(\d+)/i, 'CN$1');
    return `${cleanOrder}Call-${String(sequence).padStart(2, '0')}`;
  };

  const getNextCallLogNo = (logs, serviceOrderNo) => {
    const cleanTarget = String(serviceOrderNo || '').trim().toUpperCase();
    const matchingLogs = (logs || []).filter(
      (log) => String(log.serviceOrderNo || '').trim().toUpperCase() === cleanTarget
    );
    const maxNo = matchingLogs
      .map((log) => {
        const match = String(log.callLogNo || '').match(/Call\s*-\s*(\d+)/i);
        return match ? Number(match[1]) : 0;
      })
      .reduce((max, value) => Math.max(max, value), 0);
    const nextSeq = Math.max(maxNo, matchingLogs.length) + 1;
    return formatCallLogNo(serviceOrderNo, `Call-${nextSeq}`);
  };

  // Pre-select order if query param present
  useEffect(() => {
    const orderParam = searchParams.get('order');
    if (orderParam) {
      setSelectedOrderNo(orderParam);
      const row = pendingList.find((p) => p.serviceOrderNo === orderParam);
      if (row) {
        handleOpenCallModal(row);
      }
    }
  }, [searchParams]);

  // 1. Pending List: completed Running Inspection records that still
  // have a pending Step 3 call task.
  const pendingCallTasks = (data.stepTasks || []).filter(
    (t) => {
      const latestCall = (data.callLogs || []).find((log) => log.serviceOrderNo === t.serviceOrderNo);
      const latestOutcome = String(latestCall?.shutdownDateGiven || '').toLowerCase();
      const isForgotten = latestOutcome.includes('forget');

      return (
        t.step === 'call' &&
        t.status === 'pending' &&
        !isForgotten &&
        ((data.runningInspections || []).some((r) => r.serviceOrderNo === t.serviceOrderNo) ||
         (data.stepTasks || []).some((st) => st.serviceOrderNo === t.serviceOrderNo && st.step === 'running' && st.status === 'done'))
      );
    }
  );

  const pendingList = pendingCallTasks.map((task) => {
    const order = (data.orders || []).find((o) => o.serviceOrderNo === task.serviceOrderNo);
    const company = order ? (data.companies || []).find((c) => c.id === order.companyId) : null;
    const kiln = order ? (data.kilns || []).find((k) => k.id === order.kilnId) : null;
    const visit = (data.visits || []).find((v) => v.serviceOrderNo === task.serviceOrderNo);
    const running = (data.runningInspections || []).find((r) => r.serviceOrderNo === task.serviceOrderNo);
    const companyName = company?.name || visit?.companyName || 'Unknown Plant';

    // Find all call logs for this order
    const calls = (data.callLogs || []).filter((c) => c.serviceOrderNo === task.serviceOrderNo);
    // New call logs are added with unshift, so the first item is the latest call.
    const lastCall = calls[0];

    return {
      task,
      order,
      company,
      kiln,
      visit,
      running,
      serviceOrderNo: task.serviceOrderNo,
      partyName: companyName,
      kilnNo: kiln ? kiln.kilnNo : visit ? visit.kilnNo : 1,
      kilnSize: kiln ? kiln.size : visit ? visit.kilnSize : '100 TPD',
      campaignNo: running?.campaignNo || order?.campaignNo || visit?.campaignNo || '1',
      campaignStartDate: order ? order.campaignStartDate : visit ? visit.campaignStartDate : '—',
      expectedShutdownDate: (order?.callFollowupStatus?.includes('Yes') ? order?.expectedShutdownDate : null) || running?.expectedShutdownDate || '—',
      plannedCallDate: lastCall?.nextCallDate || running?.expectedShutdownDate || task.plannedDate,
      callLogNo: getNextCallLogNo(data.callLogs, task.serviceOrderNo),
      nextCallDate: lastCall?.nextCallDate || (isDateValue(lastCall?.shutdownDateGiven) ? lastCall.shutdownDateGiven : ''),
      callFollowupStatus: isDateValue(order?.callFollowupStatus) ? 'No shutdown date not taken' : (order?.callFollowupStatus || 'Pending Call'),
      lastCall,
      callCount: calls.length,
      delayDays: getTaskDelay(
        { ...task, plannedDate: lastCall?.nextCallDate || running?.expectedShutdownDate || task.plannedDate },
        today
      )
    };
  });

  // 2. History List: Orders where shutdown date follow-up has been completed/updated
  // (Either task.step === 'call' && status === 'done', or order.callFollowupStatus is set)
  const completedCallTasks = (data.stepTasks || []).filter(
    (t) =>
      t.step === 'call' &&
      (t.status === 'done' || (data.callLogs || []).some((log) => log.serviceOrderNo === t.serviceOrderNo))
  );

  const legacyHistoryList = completedCallTasks.map((task) => {
    const order = (data.orders || []).find((o) => o.serviceOrderNo === task.serviceOrderNo);
    const company = order ? (data.companies || []).find((c) => c.id === order.companyId) : null;
    const kiln = order ? (data.kilns || []).find((k) => k.id === order.kilnId) : null;
    const visit = (data.visits || []).find((v) => v.serviceOrderNo === task.serviceOrderNo);
    const companyName = company?.name || visit?.companyName || 'Unknown Plant';

    const calls = (data.callLogs || []).filter((c) => c.serviceOrderNo === task.serviceOrderNo);
    // New call logs are added with unshift, so the first item is the latest call.
    const lastCall = calls[0];

    // Priority for shutdown status: order status -> last call status
    const rawCallFollowupStatus =
      cleanCallStatus(order?.callFollowupStatus) ||
      cleanCallStatus(lastCall?.shutdownDateGiven) ||
      'Yes Shutdown date taken';
    const callFollowupStatus = isDateValue(rawCallFollowupStatus)
      ? 'No shutdown date not taken'
      : rawCallFollowupStatus;

    return {
      task,
      order,
      company,
      kiln,
      serviceOrderNo: task.serviceOrderNo,
      partyName: companyName,
      kilnNo: kiln ? kiln.kilnNo : visit ? visit.kilnNo : 1,
      kilnSize: kiln ? kiln.size : visit ? visit.kilnSize : '100 TPD',
      campaignNo: order ? order.campaignNo : visit ? visit.campaignNo : '1',
      expectedShutdownDate: order?.expectedShutdownDate || '—',
      callFollowupStatus,
      lastPersonCalled: lastCall?.personCalled || company?.siteIncharge || 'Site Incharge',
      mobile: lastCall?.mobile || company?.mobile || '—',
      designation: lastCall?.designation || 'Processor',
      actualDate: task.actualDate || (lastCall ? lastCall.timestamp.slice(0, 10) : today),
      callCount: calls.length,
      callLogNo: formatCallLogNo(task.serviceOrderNo, lastCall?.callLogNo, calls.length || 1),
      nextCallDate: lastCall?.nextCallDate || (isDateValue(rawCallFollowupStatus) ? rawCallFollowupStatus : '')
    };
  });

  const historyList = (data.callLogs || []).map((call) => {
    const task = (data.stepTasks || []).find((t) => t.serviceOrderNo === call.serviceOrderNo && t.step === 'call');
    const order = (data.orders || []).find((o) => o.serviceOrderNo === call.serviceOrderNo);
    const company = order ? (data.companies || []).find((c) => c.id === order.companyId) : null;
    const kiln = order ? (data.kilns || []).find((k) => k.id === order.kilnId) : null;
    const visit = (data.visits || []).find((v) => v.serviceOrderNo === call.serviceOrderNo);
    const sameLogs = (data.callLogs || []).filter((log) => log.serviceOrderNo === call.serviceOrderNo);
    const callIndex = sameLogs.indexOf(call);

    const rawCallStatus = call.shutdownDateGiven || '';
    const isPendingPlaceholder = !rawCallStatus || rawCallStatus.trim().toLowerCase() === 'pending call';
    const displayCallStatus = isPendingPlaceholder && task?.status === 'done' && !call.expectedShutdownDate
      ? 'Forget to taken'
      : (rawCallStatus || (call.expectedShutdownDate ? 'Yes Shutdown date taken' : 'Pending Call'));
    const recoveredNextCallDate = call.nextCallDate || (isDateValue(displayCallStatus) ? displayCallStatus : '');

    return {
      task,
      order,
      company,
      kiln,
      serviceOrderNo: call.serviceOrderNo,
      partyName: call.partyName || company?.name || visit?.companyName || 'Unknown Plant',
      kilnNo: kiln ? kiln.kilnNo : visit ? visit.kilnNo : 1,
      kilnSize: kiln ? kiln.size : visit ? visit.kilnSize : '100 TPD',
      campaignNo: order?.campaignNo || visit?.campaignNo || '1',
      expectedShutdownDate: displayCallStatus.includes('Yes') ? call.expectedShutdownDate : null,
      callFollowupStatus: isDateValue(displayCallStatus) ? 'No shutdown date not taken' : (cleanCallStatus(displayCallStatus) || 'Pending Call'),
      lastPersonCalled: call.personCalled || company?.siteIncharge || 'Site Incharge',
      mobile: call.mobile || company?.mobile || '—',
      designation: call.designation || 'Processor',
      actualDate: call.timestamp ? call.timestamp.slice(0, 10) : today,
      callCount: sameLogs.length,
      callLogNo: formatCallLogNo(call.serviceOrderNo, call.callLogNo, sameLogs.length - callIndex),
      nextCallDate: recoveredNextCallDate
    };
  });

  // Active Selected Row Details for Modal
  const activePending = pendingList.find((p) => p.serviceOrderNo === selectedOrderNo);
  const activeCompany = activePending?.company || (data.companies || []).find((c) => c.name === activePending?.partyName);

  // Open Call Tracker Modal
  const handleOpenCallModal = (row) => {
    setSelectedOrderNo(row.serviceOrderNo);
    const last = row.lastCall;
    setPersonCalled(last?.personCalled || row.lastPersonCalled || activeCompany?.siteIncharge || '');
    setMobile(last?.mobile || (row.mobile && row.mobile !== '—' ? row.mobile : '') || activeCompany?.mobile || '');
    setDesignation(last?.designation || row.designation || 'Processor');
    setShutdownDateGiven('Yes Shutdown date taken');
    setExpectedShutdownDate(row.expectedShutdownDate !== '—' ? row.expectedShutdownDate : '');
    setNextCallDate('');
    setShowCallModal(true);
  };

  // Open Direct Update Modal
  const handleOpenDirectUpdateModal = (row) => {
    setSelectedOrderNo(row.serviceOrderNo);
    setShutdownDateGiven('Yes Shutdown date taken');
    setExpectedShutdownDate(row.expectedShutdownDate !== '—' ? row.expectedShutdownDate : '');
    setNextCallDate('');
    setShowDirectUpdateModal(true);
  };

  // Submit Call Tracker Form
  const handleSubmitCallTracker = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!personCalled.trim()) {
      notify('Please enter Name Of The Person Call To', 'bad');
      return;
    }
    if (!mobile.trim()) {
      notify('Please enter Mobile No. Of The Person', 'bad');
      return;
    }
    if (shutdownDateGiven.includes('Yes') && !expectedShutdownDate) {
      notify('Please enter Expected Shut Down Date', 'bad');
      return;
    }
    if (shutdownDateGiven.includes('No') && !nextCallDate) {
      notify('Please enter Next Date For Call', 'bad');
      return;
    }

    setIsSubmitting(true);
    try {
      const nextData = { ...data };
      const partyName = activePending ? activePending.partyName : 'Company Plant';
      const cleanStatus = cleanCallStatus(shutdownDateGiven);
      const isYes = shutdownDateGiven.includes('Yes');
      const isNo = shutdownDateGiven.includes('No');
      const isForget = shutdownDateGiven.includes('Forget');

      // 1. Record in callLogs (saved for Followup for Shutdown page)
      if (!Array.isArray(nextData.callLogs)) nextData.callLogs = [];
      const newLog = {
        callLogNo: getNextCallLogNo(nextData.callLogs, selectedOrderNo),
        timestamp: new Date().toISOString(),
        serviceOrderNo: selectedOrderNo,
        partyName,
        personCalled: personCalled.trim(),
        designation,
        mobile: mobile.trim(),
        shutdownDateGiven: cleanStatus,
        expectedShutdownDate: isYes ? expectedShutdownDate : null,
        nextCallDate: isNo ? nextCallDate : null
      };
      nextData.callLogs.unshift(newLog);

      // 2. Update order callFollowupStatus
      const order = (nextData.orders || []).find((o) => o.serviceOrderNo === selectedOrderNo);
      if (order) {
        order.callFollowupStatus = cleanStatus;
        if (isYes) {
          order.expectedShutdownDate = expectedShutdownDate;
        }
      }

      // 3. Update task status according to outcome
      const callTask = (nextData.stepTasks || []).find(
        (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'call' && t.status === 'pending'
      );

      if (isYes) {
        // Step 3 is completed!
        if (callTask) {
          callTask.status = 'done';
          callTask.actualDate = today;
          const delay = calendarDaysDiff(callTask.plannedDate, today);
          callTask.delayDays = delay > 0 ? delay : 0;
        }

        // Schedule Step 4: Shutdown Inspection on expected shutdown date (N + 0)
        const offsets = nextData.settings?.offsets || { running: 7, call: -3, shutdown: 0, restart: 2 };
        const shutdownPlanned = addWorkingDays(expectedShutdownDate, offsets.shutdown ?? 0);

        const existingShutdownTask = (nextData.stepTasks || []).find(
          (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'shutdown'
        );
        if (existingShutdownTask) {
          existingShutdownTask.plannedDate = shutdownPlanned;
          existingShutdownTask.status = 'pending';
        } else {
          nextData.stepTasks.push({
            id: `t-${Date.now()}-shutdown`,
            serviceOrderNo: selectedOrderNo,
            step: 'shutdown',
            owner: 'Sanjay',
            plannedDate: shutdownPlanned,
            actualDate: null,
            delayDays: 0,
            status: 'pending'
          });
        }

        // Dynamic Google Sheets sync first (never touch Planned or Delay cols, save to Followup sheet)
        await syncStepToGoogleSheet(3, selectedOrderNo, {
          partyName,
          personCalled: personCalled.trim(),
          designation,
          mobile: mobile.trim(),
          shutdownDateGiven: cleanStatus,
          expectedShutdownDate: isYes ? expectedShutdownDate : '',
          nextCallDate: '',
          status: cleanStatus,
          timestamp: newLog.timestamp
        });

        await saveData(nextData);
        await refresh();
        setShowCallModal(false);
        setActiveTab('history');
        notify(`Shutdown date confirmed for ${selectedOrderNo}. Moved to History & ready for Shutdown Inspection!`, 'good');
      } else if (isForget) {
        // Forget is complete for this call and moves to Restart The Process.
        if (callTask) {
          callTask.status = 'done';
          callTask.actualDate = today;
          callTask.delayDays = 0;
        }
        await syncStepToGoogleSheet(3, selectedOrderNo, {
          partyName,
          personCalled: personCalled.trim(),
          designation,
          mobile: mobile.trim(),
          shutdownDateGiven: cleanStatus,
          expectedShutdownDate: '',
          nextCallDate: '',
          status: cleanStatus,
          timestamp: newLog.timestamp
        });

        await saveData(nextData);
        await refresh();
        setShowCallModal(false);
        setActiveTab('history');
        notify(`Call logged for ${selectedOrderNo}. Restart The Process is now pending.`, 'warn');
      } else {
        // No shutdown date -> update next planned call date and keep pending.
        if (callTask) {
          callTask.plannedDate = nextCallDate;
          callTask.status = 'pending';
          callTask.actualDate = null;
        }
        await syncStepToGoogleSheet(3, selectedOrderNo, {
          partyName,
          personCalled: personCalled.trim(),
          designation,
          mobile: mobile.trim(),
          shutdownDateGiven: cleanStatus,
          expectedShutdownDate: '',
          nextCallDate: nextCallDate,
          status: cleanStatus,
          timestamp: newLog.timestamp
        });

        await saveData(nextData);
        await refresh();
        setShowCallModal(false);
        setActiveTab('pending');
        notify(`Call logged for ${selectedOrderNo} (${newLog.callLogNo}). Next call scheduled on ${formatDate(nextCallDate)}. Order remains in Pending queue.`, 'good');
      }
    } catch (err) {
      notify('Failed to save call tracker: ' + err.message, 'bad');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Direct Update to move to History
  const handleSubmitDirectUpdate = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (shutdownDateGiven.includes('Yes') && !expectedShutdownDate) {
      notify('Please enter Expected Shut Down Date', 'bad');
      return;
    }
    if (shutdownDateGiven.includes('No') && !nextCallDate) {
      notify('Please enter Next Date For Call', 'bad');
      return;
    }

    setIsSubmitting(true);
    try {
      const nextData = { ...data };
      const partyName = activePending ? activePending.partyName : 'Company Plant';
      const cleanStatus = cleanCallStatus(shutdownDateGiven);
      const isYes = shutdownDateGiven.includes('Yes');
      const isNo = shutdownDateGiven.includes('No');
      const isForget = shutdownDateGiven.includes('Forget');

      const order = (nextData.orders || []).find((o) => o.serviceOrderNo === selectedOrderNo);
      if (order) {
        order.callFollowupStatus = cleanStatus;
        if (isYes && expectedShutdownDate) {
          order.expectedShutdownDate = expectedShutdownDate;
        }
      }

      // Complete confirmed calls; non-confirmed calls remain pending.
      const callTask = (nextData.stepTasks || []).find(
        (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'call' && t.status === 'pending'
      );
      if (callTask) {
        if (isYes) {
          callTask.status = 'done';
          callTask.actualDate = today;
          const delay = calendarDaysDiff(callTask.plannedDate, today);
          callTask.delayDays = delay > 0 ? delay : 0;
        } else if (isForget) {
          callTask.status = 'done';
          callTask.actualDate = today;
          callTask.delayDays = 0;
        } else {
          callTask.status = 'pending';
          callTask.actualDate = null;
          callTask.plannedDate = nextCallDate;
        }
      }

      // If shutdown date taken, create/update Step 4 Shutdown Inspection task
      if (isYes && expectedShutdownDate) {
        const offsets = nextData.settings?.offsets || { running: 7, call: -3, shutdown: 0, restart: 2 };
        const shutdownPlanned = addWorkingDays(expectedShutdownDate, offsets.shutdown ?? 0);
        const existingShutdownTask = (nextData.stepTasks || []).find(
          (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'shutdown'
        );
        if (existingShutdownTask) {
          existingShutdownTask.plannedDate = shutdownPlanned;
          existingShutdownTask.status = 'pending';
        } else {
          nextData.stepTasks.push({
            id: `t-${Date.now()}-shutdown`,
            serviceOrderNo: selectedOrderNo,
            step: 'shutdown',
            owner: 'Sanjay',
            plannedDate: shutdownPlanned,
            actualDate: null,
            delayDays: 0,
            status: 'pending'
          });
        }
      }

      // Log to callLogs
      if (!Array.isArray(nextData.callLogs)) nextData.callLogs = [];
      const directLog = {
        callLogNo: getNextCallLogNo(nextData.callLogs, selectedOrderNo),
        timestamp: new Date().toISOString(),
        serviceOrderNo: selectedOrderNo,
        partyName,
        personCalled: activeCompany?.siteIncharge || 'Site Incharge',
        designation: 'Processor',
        mobile: activeCompany?.mobile || '—',
        shutdownDateGiven: cleanStatus,
        expectedShutdownDate: isYes ? expectedShutdownDate : null,
        nextCallDate: isNo ? nextCallDate : null
      };
      nextData.callLogs.unshift(directLog);

      // Dynamic Google Sheets sync first (saves to both FMS and Followup for Shutdown tab)
      await syncStepToGoogleSheet(3, selectedOrderNo, {
        partyName,
        personCalled: directLog.personCalled,
        designation: directLog.designation,
        mobile: directLog.mobile,
        shutdownDateGiven: cleanStatus,
        expectedShutdownDate: isYes ? expectedShutdownDate : '',
        nextCallDate: isNo ? nextCallDate : '',
        status: cleanStatus,
        plannedShutdownDate: isYes ? expectedShutdownDate : '',
        timestamp: directLog.timestamp
      });

      await saveData(nextData);
      await refresh();
      setShowDirectUpdateModal(false);
      if (isYes || isForget) {
        setActiveTab('history');
        notify(
          isYes
            ? `Shutdown date confirmed for ${selectedOrderNo}. Moved to History!`
            : `Call logged for ${selectedOrderNo}. Restart The Process is now pending.`,
          'good'
        );
      } else {
        setActiveTab('pending');
        notify(`Call logged for ${selectedOrderNo} (${directLog.callLogNo}). Next call scheduled on ${formatDate(nextCallDate)}. Order remains in Pending queue.`, 'good');
      }
    } catch (err) {
      notify('Failed to update status: ' + err.message, 'bad');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered lists
  const filteredPending = pendingList.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.serviceOrderNo.toLowerCase().includes(q) ||
      item.partyName.toLowerCase().includes(q) ||
      item.campaignNo.toLowerCase().includes(q)
    );
  });

  const completedHistory = historyList.filter((item) => {
    const status = String(item.callFollowupStatus || '');
    return status.includes('Yes') || status.includes('Forget');
  });

  const filteredHistory = completedHistory.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.serviceOrderNo.toLowerCase().includes(q) ||
      item.partyName.toLowerCase().includes(q) ||
      item.callFollowupStatus.toLowerCase().includes(q) ||
      item.lastPersonCalled.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setPendingPage(1);
    setHistoryPage(1);
  }, [search, activeTab]);

  const handleSyncWithSheet = async () => {
    setIsSyncing(true);
    try {
      const res = await syncStepChangesFromSheet(3, data);
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

  const paginatedPending = filteredPending.slice(
    (pendingPage - 1) * pendingPageSize,
    pendingPage * pendingPageSize
  );

  const paginatedHistory = filteredHistory.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );

  return (
    <div>
      {/* PAGE HEADER */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Take Shut Down Date
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
            History ({completedHistory.length})
          </button>
        </div>

        <div className="search-row-mobile" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input-wrap">
            <input
              type="search"
              placeholder="Search party or CN number..."
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
              Pending Shutdown Date Confirmations
            </h3>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>

            </span>
          </div>

          <div className="table-wrap" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table" style={{ minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Call Log</th>
                  <th>Party Name</th>
                  <th>Kiln</th>
                  <th>Campaign</th>
                  <th>Expected Shutdown</th>
                  <th>Planned Call</th>
                  <th>Next Call Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPending.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                      No pending shutdown date calls found.
                    </td>
                  </tr>
                ) : (
                  paginatedPending.map((row) => (
                    <tr
                      key={`${row.serviceOrderNo}-${row.callLogNo}`}
                    >
                      <td>
                        <span className="cn">{row.serviceOrderNo}</span>
                      </td>
                      <td className="mono">{row.callLogNo}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {row.partyName}
                      </td>
                      <td>
                        <span className="pill">Kiln {row.kilnNo} ({row.kilnSize})</span>
                      </td>
                      <td>Camp. {row.campaignNo}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                        {formatDate(row.expectedShutdownDate)}
                      </td>
                      <td>
                        <span style={{ color: row.delayDays > 0 ? 'var(--error)' : 'inherit', fontWeight: row.delayDays > 0 ? 700 : 500 }}>
                          {formatDate(row.plannedCallDate)}
                        </span>
                      </td>
                      <td>{row.nextCallDate ? formatDate(row.nextCallDate) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn primary small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCallModal(row);
                            }}
                            title="Open Call Tracker Form"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            Call Tracker
                          </button>
                        </div>
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
            searchValue={search}
            onSearchChange={(value) => { setSearch(value); setPendingPage(1); setHistoryPage(1); }}
            searchPlaceholder="Search order or company..."
          />
        </div>
      )}

      {/* TAB 2: HISTORY */}
      {activeTab === 'history' && (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="panel-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Shutdown Date History
            </h3>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Completed calls with Call Followup Status. Confirmed shutdown orders appear in Shutdown Inspection.
            </span>
          </div>

          <div className="table-wrap" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table" style={{ minWidth: '1450px' }}>
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Call Log</th>
                  <th>Party Name</th>
                  <th>Kiln</th>
                  <th>Campaign</th>
                  <th>Next Call Date</th>
                  <th>Call Followup Status</th>
                  <th>Confirmed / Expected Shutdown</th>
                  <th>Person Called</th>
                  <th>Mobile</th>
                  <th>Designation</th>
                  <th>Date Updated</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.length === 0 ? (
                  <tr>
                    <td colSpan="12" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                      No history records found.
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((row) => (
                    <tr
                      key={`${row.serviceOrderNo}-${row.callLogNo}`}
                      onClick={() => setViewingRecord(row)}
                      className="clickable-row"
                      title="Tap to view shutdown confirmation details"
                    >
                      <td>
                        <span className="cn">{row.serviceOrderNo}</span>
                      </td>
                      <td className="mono">{row.callLogNo}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {row.partyName}
                      </td>
                      <td>
                        <span className="pill">Kiln {row.kilnNo} ({row.kilnSize})</span>
                      </td>
                      <td>Camp. {row.campaignNo}</td>
                      <td>{row.nextCallDate ? formatDate(row.nextCallDate) : '—'}</td>
                      <td>
                        {row.callFollowupStatus?.includes('Yes') ? (
                          <span className="pill good" style={{ fontWeight: 700 }}>
                            ✓ {cleanCallStatus(row.callFollowupStatus)}
                          </span>
                        ) : row.callFollowupStatus?.includes('Forget') ? (
                          <span className="pill bad">
                            {cleanCallStatus(row.callFollowupStatus)}
                          </span>
                        ) : (
                          <span className="pill warn">
                            {cleanCallStatus(row.callFollowupStatus)}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                        {row.callFollowupStatus?.includes('Yes')
                          ? formatDate(row.expectedShutdownDate)
                          : '—'}
                      </td>
                      <td>{row.lastPersonCalled}</td>
                      <td style={{ fontFamily: 'var(--f-mono)', fontSize: '12px' }}>
                        {row.mobile}
                      </td>
                      <td>
                        <span className="pill">{row.designation}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {formatDate(row.actualDate)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* TAB 2 PAGINATION */}
          <Pagination
            totalItems={filteredHistory.length}
            page={historyPage}
            pageSize={historyPageSize}
            onPageChange={setHistoryPage}
            onPageSizeChange={setHistoryPageSize}
            pageSizeOptions={[5, 10, 20, 50, 100]}
            searchValue={search}
            onSearchChange={(value) => { setSearch(value); setPendingPage(1); setHistoryPage(1); }}
            searchPlaceholder="Search order or company..."
          />
        </div>
      )}

      {/* MODAL 1: CALL TRACKER FORM */}
      {showCallModal && (
        <div className="modal-backdrop" onClick={() => setShowCallModal(false)}>
          <div className="modal-card" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Call Tracker Form
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Take Shutdown Date & log call for {selectedOrderNo} ({getNextCallLogNo(data.callLogs, selectedOrderNo)})
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCallModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCallTracker}>
              {/* Service Order No. & Party Name (Autofill readonly) */}
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
                  <label>Party Name (Auto fill from Visit)</label>
                  <input
                    type="text"
                    value={activePending ? activePending.partyName : ''}
                    readOnly
                    className="input-text"
                    style={{ background: 'var(--surface-subtle)', fontWeight: 600 }}
                  />
                </div>
              </div>

              {/* Name Of The Person Call To & Mobile No. */}
              <div className="fieldrow">
                <div className="field">
                  <label>Name Of The Person Call To *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Name of Person Called"
                    value={personCalled}
                    onChange={(e) => setPersonCalled(e.target.value)}
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>Mobile No. Of The Person *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9826144021"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="input-text"
                  />
                </div>
              </div>

              {/* Designation Of the Person (Dropdown: Processer / Purchaser) */}
              <div className="field">
                <label>Designation Of the Person *</label>
                <CustomSelect
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="select-input"
                >
                  <option value="Processor">Processor</option>
                  <option value="Purchaser">Purchaser</option>
                </CustomSelect>
              </div>

              {/* Shut Down Date Given (Dropdown with 3 options) */}
              <div className="field">
                <label>Shut Down Date Given *</label>
                <CustomSelect
                  value={shutdownDateGiven}
                  onChange={(e) => setShutdownDateGiven(e.target.value)}
                  className="select-input"
                  style={{ fontWeight: 600 }}
                >
                  <option value="Yes Shutdown date taken">Yes Shutdown date taken</option>
                  <option value="No shutdown date not taken">No shutdown date not taken</option>
                  <option value="Forget to taken">Forget to taken</option>
                </CustomSelect>
              </div>

              {/* CONDITIONAL TEXT BOXES */}
              {shutdownDateGiven.includes('Yes') && (
                <div className="field" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                  <label style={{ color: 'var(--primary)', fontWeight: 700 }}>
                    Expected Shut Down Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={expectedShutdownDate}
                    onChange={(e) => setExpectedShutdownDate(e.target.value)}
                    className="input-text"
                    style={{ borderColor: 'var(--primary)' }}
                  />
                </div>
              )}

              {shutdownDateGiven.includes('No') && (
                <div className="field" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                  <label style={{ color: 'var(--warning)', fontWeight: 700 }}>
                    Next Date For Call *
                  </label>
                  <input
                    type="date"
                    required
                    value={nextCallDate}
                    onChange={(e) => setNextCallDate(e.target.value)}
                    className="input-text"
                    style={{ borderColor: 'var(--warning)' }}
                  />
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowCallModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn primary"
                  style={{ fontWeight: 600, minWidth: '140px' }}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Call Tracker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DIRECT STATUS UPDATE MODAL */}
      {showDirectUpdateModal && (
        <div className="modal-backdrop" onClick={() => setShowDirectUpdateModal(false)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Update Shutdown Status
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Update followup status for {selectedOrderNo} and save a Call Log
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowDirectUpdateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDirectUpdate}>
              <div className="field">
                <label>Service Order No.</label>
                <input
                  type="text"
                  value={selectedOrderNo}
                  readOnly
                  className="input-text"
                  style={{ background: 'var(--surface-subtle)', fontWeight: 600, color: 'var(--primary)' }}
                />
              </div>

              <div className="field">
                <label>Shut Down Date Given *</label>
                <CustomSelect
                  value={shutdownDateGiven}
                  onChange={(e) => setShutdownDateGiven(e.target.value)}
                  className="select-input"
                  style={{ fontWeight: 600 }}
                >
                  <option value="Yes Shutdown date taken">Yes Shutdown date taken</option>
                  <option value="No shutdown date not taken">No shutdown date not taken</option>
                  <option value="Forget to taken">Forget to taken</option>
                </CustomSelect>
              </div>

              {shutdownDateGiven.includes('Yes') && (
                <div className="field">
                  <label style={{ color: 'var(--primary)', fontWeight: 700 }}>Expected Shut Down Date *</label>
                  <input
                    type="date"
                    required
                    value={expectedShutdownDate}
                    onChange={(e) => setExpectedShutdownDate(e.target.value)}
                    className="input-text"
                  />
                </div>
              )}

              {shutdownDateGiven.includes('No') && (
                <div className="field">
                  <label style={{ color: 'var(--warning)', fontWeight: 700 }}>Next Date For Call *</label>
                  <input
                    type="date"
                    required
                    value={nextCallDate}
                    onChange={(e) => setNextCallDate(e.target.value)}
                    className="input-text"
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowDirectUpdateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn primary"
                  style={{ fontWeight: 600 }}
                >
                  {isSubmitting ? 'Updating...' : 'Update & Move to History'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW SHUTDOWN RECORD DETAILS POPUP MODAL */}
      {viewingRecord && (
        <DetailModal
          isOpen={!!viewingRecord}
          onClose={() => setViewingRecord(null)}
          title="Shutdown Call & Date Details"
          subtitle={`Service Order: ${viewingRecord.serviceOrderNo} • Log #${viewingRecord.callLogNo}`}
          badge={cleanCallStatus(viewingRecord.callFollowupStatus || 'Pending Call')}
          badgeTone={viewingRecord.callFollowupStatus?.includes('Yes') ? 'good' : viewingRecord.callFollowupStatus?.toLowerCase().includes('forget') ? 'warn' : 'bad'}
          items={[
            { label: 'Client Plant Company', value: viewingRecord.partyName, fullWidth: true },
            { label: 'Service Order No.', value: viewingRecord.serviceOrderNo, mono: true },
            { label: 'Rotary Kiln', value: `Kiln ${viewingRecord.kilnNo} (${viewingRecord.kilnSize})` },
            { label: 'Campaign No.', value: `Campaign ${viewingRecord.campaignNo}`, mono: true },
            { label: 'Expected Shutdown Date', value: formatDate(viewingRecord.expectedShutdownDate), mono: true },
            { label: 'Planned Call Date', value: formatDate(viewingRecord.plannedCallDate) },
            { label: 'Next Scheduled Call Date', value: viewingRecord.nextCallDate ? formatDate(viewingRecord.nextCallDate) : 'Not Scheduled' },
            { label: 'Followup Status', value: cleanCallStatus(viewingRecord.callFollowupStatus || 'Pending Call') },
            { label: 'Contact Person Called', value: viewingRecord.lastPersonCalled || viewingRecord.personCalled || '—' },
            { label: 'Mobile Number', value: viewingRecord.mobile || '—', mono: true },
            { label: 'Designation / Role', value: viewingRecord.designation || 'Processor' },
            { label: 'Confirmed Shutdown Date', value: viewingRecord.confirmedShutdownDate ? formatDate(viewingRecord.confirmedShutdownDate) : 'Pending Confirmation' }
          ]}
          onEdit={() => handleOpenCallModal(viewingRecord)}
          editLabel="Log Call Tracker"
        />
      )}
    </div>
  );
}

