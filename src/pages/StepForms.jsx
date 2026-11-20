import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  todayISO,
  formatDate,
  avg,
  addWorkingDays,
  calendarDaysDiff,
  getTaskDelay,
  canSubmitStep
} from '../utils/workflow';
import { saveData, resizeImage } from '../services/storage';
import CustomSelect from '../components/CustomSelect';

export default function StepForms({ data, refresh, notify }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);

  const initialMode = queryParams.get('mode') || 'visit';
  const initialOrderNo = queryParams.get('order') || '';
  const initialRestartOrderNo = queryParams.get('restartOrder') || '';

  const [mode, setMode] = useState(initialMode); // 'visit' | 'running' | 'shutdown'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Visit / Restart Form State
  const [visitType, setVisitType] = useState(initialRestartOrderNo ? 'Restarting The Process' : 'First Campaign');
  const [vOldOrder, setVOldOrder] = useState(initialRestartOrderNo);
  const [vCompanyId, setVCompanyId] = useState('');
  const [vKilnNo, setVKilnNo] = useState('');
  const [vSize, setVSize] = useState('');
  const [vCamp, setVCamp] = useState('');
  const [vStart, setVStart] = useState(todayISO());
  const [vWho, setVWho] = useState('');

  // Running & Shutdown Form State
  const [selectedOrderNo, setSelectedOrderNo] = useState(initialOrderNo);
  const [visitDate, setVisitDate] = useState(todayISO());
  const [inspector, setInspector] = useState('');
  const [innerTemp, setInnerTemp] = useState('');
  const [innerPhoto, setInnerPhoto] = useState('');
  const [expectedShutdown, setExpectedShutdown] = useState('');
  const [zoneReadings, setZoneReadings] = useState(Array(9).fill(''));
  const [zonePhotos, setZonePhotos] = useState(Array(9).fill(''));

  // Sync when query params change
  useEffect(() => {
    const qMode = queryParams.get('mode');
    const qOrder = queryParams.get('order');
    const qRestart = queryParams.get('restartOrder');

    if (qMode && ['visit', 'running', 'shutdown'].includes(qMode)) {
      setMode(qMode);
    }
    if (qOrder) {
      setSelectedOrderNo(qOrder);
    }
    if (qRestart) {
      setVisitType('Restarting The Process');
      setVOldOrder(qRestart);
      setVWho('CRM');
    }
  }, [location.search]);

  // When selected order changes in Running/Shutdown, prefill expectedShutdown and inspector
  useEffect(() => {
    if (selectedOrderNo) {
      const ord = (data.orders || []).find((o) => o.serviceOrderNo === selectedOrderNo);
      const visit = (data.visits || []).find((v) => v.serviceOrderNo === selectedOrderNo);
      const running = (data.runningInspections || []).find((r) => r.serviceOrderNo === selectedOrderNo);
      if (ord) {
        setExpectedShutdown(ord.expectedShutdownDate || addWorkingDays(todayISO(), 20));
      }
      let incharge = visit?.inspectionIncharge || ord?.inspectionIncharge || running?.inspector || '';
      if (incharge === 'Sanjay Singh' || incharge === 'Sales Co-ordinator' || incharge === 'Sales') {
        incharge = '';
      }
      setInspector(incharge);
    }
  }, [selectedOrderNo, data.orders, data.visits, data.runningInspections]);

  // When old order is selected in Restart, prefill company and kiln
  useEffect(() => {
    if (vOldOrder) {
      const ord = (data.orders || []).find((o) => o.serviceOrderNo === vOldOrder);
      const visit = (data.visits || []).find((v) => v.serviceOrderNo === vOldOrder);
      const running = (data.runningInspections || []).find((r) => r.serviceOrderNo === vOldOrder);
      const shutdown = (data.shutdownInspections || []).find((s) => s.serviceOrderNo === vOldOrder);
      if (ord) {
        setVCompanyId(ord.companyId);
        const kiln = (data.kilns || []).find((k) => k.id === ord.kilnId);
        if (kiln) {
          setVKilnNo(kiln.kilnNo.toString());
          setVSize(kiln.size);
        }
        const nextCampNum = (parseInt(ord.campaignNo, 10) || 1) + 1;
        setVCamp(nextCampNum.toString());
        let incharge = visit?.inspectionIncharge || ord?.inspectionIncharge || shutdown?.inspector || running?.inspector || '';
        if (incharge === 'Sanjay Singh' || incharge === 'Sales Co-ordinator' || incharge === 'Sales') {
          incharge = '';
        }
        if (incharge) {
          setVWho(incharge);
        }
      }
    }
  }, [vOldOrder, data.orders, data.kilns, data.visits, data.runningInspections, data.shutdownInspections]);

  // Pending tasks lists
  const pendingRunningTasks = (data.stepTasks || []).filter((t) => t.step === 'running' && t.status === 'pending');
  const pendingShutdownTasks = (data.stepTasks || []).filter((t) => t.step === 'shutdown' && t.status === 'pending');
  const currentPendingTasks = mode === 'running' ? pendingRunningTasks : pendingShutdownTasks;

  // Selected order details
  const activeOrder = (data.orders || []).find((o) => o.serviceOrderNo === selectedOrderNo);
  const activeCompany = activeOrder ? (data.companies || []).find((c) => c.id === activeOrder.companyId) : null;
  const activeKiln = activeOrder ? (data.kilns || []).find((k) => k.id === activeOrder.kilnId) : null;
  const activeTask = activeOrder
    ? (data.stepTasks || []).find((t) => t.serviceOrderNo === selectedOrderNo && t.step === mode && t.status === 'pending')
    : null;

  // Auto-calculated fields
  const liveAvg = avg(zoneReadings);
  const daysSinceStart = activeOrder ? calendarDaysDiff(activeOrder.campaignStartDate, visitDate) : 0;
  const activeDelay = activeTask ? getTaskDelay(activeTask, todayISO()) : 0;

  // Photo upload with 800px client-side canvas compression
  const handlePhotoUpload = async (e, index = null) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const resizedBase64 = await resizeImage(file, 800);
      if (index !== null) {
        const next = [...zonePhotos];
        next[index] = resizedBase64;
        setZonePhotos(next);
      } else {
        setInnerPhoto(resizedBase64);
      }
      notify('Photo uploaded & compressed under 800px', 'good');
    } catch (err) {
      notify('Photo upload error: ' + err.message, 'bad');
    }
  };

  // Switch form mode
  const switchMode = (newMode) => {
    setMode(newMode);
    setZoneReadings(Array(9).fill(''));
    if (newMode === 'visit') {
      setVWho(visitType === 'Restarting The Process' ? 'CRM' : 'Sales Co-ordinator');
    } else {
      const pending = newMode === 'running' ? pendingRunningTasks : pendingShutdownTasks;
      const targetNo = pending.length > 0 && !pending.some((p) => p.serviceOrderNo === selectedOrderNo)
        ? pending[0].serviceOrderNo
        : selectedOrderNo;
      if (pending.length > 0 && !pending.some((p) => p.serviceOrderNo === selectedOrderNo)) {
        setSelectedOrderNo(pending[0].serviceOrderNo);
      }
      const ord = (data.orders || []).find((o) => o.serviceOrderNo === targetNo);
      const visit = (data.visits || []).find((v) => v.serviceOrderNo === targetNo);
      const running = (data.runningInspections || []).find((r) => r.serviceOrderNo === targetNo);
      let incharge = visit?.inspectionIncharge || ord?.inspectionIncharge || running?.inspector || '';
      if (incharge === 'Sanjay Singh' || incharge === 'Sales Co-ordinator' || incharge === 'Sales') {
        incharge = '';
      }
      setInspector(incharge);
    }
  };

  // Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const nextData = { ...data };
      const offsets = nextData.settings?.offsets || { running: 7, call: -3, shutdown: 0, restart: 2 };

      if (mode === 'visit') {
        if (!vCompanyId || !vStart || !vCamp || !vKilnNo || !vSize || !vWho) {
          throw new Error('Please fill all required visit fields');
        }
        if (visitType === 'Restarting The Process' && !vOldOrder) {
          throw new Error('Please select old service order for restart');
        }

        // Find or create kiln
        let kiln = nextData.kilns.find(
          (k) => k.companyId === vCompanyId && k.kilnNo.toString() === vKilnNo.toString()
        );
        if (!kiln) {
          kiln = {
            id: `k${Date.now()}`,
            companyId: vCompanyId,
            kilnNo: parseInt(vKilnNo, 10) || 1,
            size: vSize
          };
          nextData.kilns.push(kiln);
        }

        // Generate next CN number
        const existingNums = (nextData.orders || [])
          .map((o) => parseInt(String(o?.serviceOrderNo || '').replace(/\D/g, ''), 10))
          .filter(Boolean);
        const maxNum = existingNums.length ? Math.max(...existingNums) : 0;
        const newServiceOrderNo = `CN-${String(maxNum + 1).padStart(2, '0')}`;

        // Expected shutdown = start date + 150 working days approximate
        const estShutdown = addWorkingDays(vStart, 150);

        // Close old order if restarting
        if (visitType === 'Restarting The Process' && vOldOrder) {
          const oldOrd = nextData.orders.find((o) => o.serviceOrderNo === vOldOrder);
          if (oldOrd) oldOrd.status = 'closed';
        }

        // Create new Order
        const newOrder = {
          serviceOrderNo: newServiceOrderNo,
          companyId: vCompanyId,
          kilnId: kiln.id,
          campaignNo: vCamp,
          campaignStartDate: vStart,
          expectedShutdownDate: estShutdown,
          status: 'open'
        };
        nextData.orders.push(newOrder);

        // Record visit
        nextData.visits.push({
          serviceOrderNo: newServiceOrderNo,
          date: vStart,
          visitedBy: vWho,
          kilnSize: vSize
        });

        // Step 1 Task Done
        nextData.stepTasks.push({
          id: `t-${Date.now()}-visit`,
          serviceOrderNo: newServiceOrderNo,
          step: 'visit',
          owner: vWho.includes('CRM') ? 'CRM' : 'Sales',
          plannedDate: vStart,
          actualDate: vStart,
          delayDays: 0,
          status: 'done'
        });

        // Schedule Step 2 Task on the campaign start date.
        const plannedRunning = vStart;
        nextData.stepTasks.push({
          id: `t-${Date.now()}-run`,
          serviceOrderNo: newServiceOrderNo,
          step: 'running',
          owner: 'Sanjay',
          plannedDate: plannedRunning,
          actualDate: null,
          delayDays: 0,
          status: 'pending'
        });

        await saveData(nextData);
        await refresh();
        notify(`Order ${newServiceOrderNo} created! Running Kiln Inspection planned for the campaign start date (${formatDate(plannedRunning)}).`, 'good');
        navigate('/');
      } else if (mode === 'running') {
        if (!selectedOrderNo) throw new Error('Please select a service order');
        if (!visitDate) throw new Error('Please select visit date');
        if (!expectedShutdown) throw new Error('Please enter expected shutdown date');

        if (!canSubmitStep(selectedOrderNo, 'running', nextData.stepTasks)) {
          throw new Error(`Running inspection for ${selectedOrderNo} is already submitted.`);
        }

        const task = nextData.stepTasks.find(
          (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'running' && t.status === 'pending'
        );
        if (!task) throw new Error('No pending running inspection task found for this order');

        const delay = calendarDaysDiff(task.plannedDate, visitDate);
        task.status = 'done';
        task.actualDate = visitDate;
        task.delayDays = delay > 0 ? delay : 0;

        // Update order expected shutdown date
        const ord = nextData.orders.find((o) => o.serviceOrderNo === selectedOrderNo);
        if (ord) ord.expectedShutdownDate = expectedShutdown;

        // Record running inspection
        nextData.runningInspections.push({
          serviceOrderNo: selectedOrderNo,
          visitDate,
          inspector,
          innerTemp: Number(innerTemp) || 0,
          innerTempPhoto: innerPhoto,
          zoneTemps: zoneReadings.map((z) => (z === '' ? null : Number(z))),
          avgTemp: liveAvg,
          expectedShutdownDate: expectedShutdown,
          daysSinceStart
        });

        // Schedule Step 3 Task: Take shut down date (expectedShutdown - 3 working days)
        const plannedCall = expectedShutdown;
        const existingCallTask = nextData.stepTasks.find(
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

        await saveData(nextData);
        await refresh();
        notify(`Running inspection saved for ${selectedOrderNo}! Call tracker scheduled for the expected shutdown date (${formatDate(plannedCall)}).`, 'good');
        navigate('/');
      } else if (mode === 'shutdown') {
        if (!selectedOrderNo) throw new Error('Please select a service order');
        if (!visitDate) throw new Error('Please select inspection date');

        if (!canSubmitStep(selectedOrderNo, 'shutdown', nextData.stepTasks)) {
          throw new Error(`Shutdown inspection for ${selectedOrderNo} is already submitted.`);
        }

        const task = nextData.stepTasks.find(
          (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'shutdown' && t.status === 'pending'
        );
        if (!task) throw new Error('No pending shutdown inspection task found for this order');

        const delay = calendarDaysDiff(task.plannedDate, visitDate);
        task.status = 'done';
        task.actualDate = visitDate;
        task.delayDays = delay > 0 ? delay : 0;

        // Record shutdown inspection
        nextData.shutdownInspections.push({
          serviceOrderNo: selectedOrderNo,
          inspectionDate: visitDate,
          inspector,
          zoneThickness: zoneReadings.map((z) => (z === '' ? 180 : Number(z))),
          zonePhotos,
          avgThickness: liveAvg || 180
        });

        // Schedule Step 5 Task: Restart process (inspectionDate + 2 working days)
        const plannedRestart = addWorkingDays(visitDate, offsets.restart ?? 2);
        const existingRestartTask = nextData.stepTasks.find(
          (t) => t.serviceOrderNo === selectedOrderNo && t.step === 'restart'
        );

        if (existingRestartTask) {
          existingRestartTask.plannedDate = plannedRestart;
          existingRestartTask.status = 'pending';
        } else {
          nextData.stepTasks.push({
            id: `t-${Date.now()}-restart`,
            serviceOrderNo: selectedOrderNo,
            step: 'restart',
            owner: 'CRM',
            plannedDate: plannedRestart,
            actualDate: null,
            delayDays: 0,
            status: 'pending'
          });
        }

        await saveData(nextData);
        await refresh();
        notify(`Shutdown inspection saved for ${selectedOrderNo}! Restart task scheduled for ${formatDate(plannedRestart)}.`, 'good');
        navigate('/');
      }
    } catch (err) {
      notify(err.message, 'bad');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* TOP STATUS BANNER WITH COMPACT 5-STAGE PROGRESS INDICATOR */}
      <div className="form-header-banner">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pill good">
              {visitType === 'Restarting The Process' ? 'Restart Campaign' : mode === 'visit' ? 'Company Visit' : mode === 'running' ? 'Running Inspection' : 'Shutdown Inspection'}
            </span>
            {selectedOrderNo && <span className="cn">{selectedOrderNo}</span>}
            {activeCompany && <b style={{ fontSize: '13.5px' }}>{activeCompany.name}</b>}
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {activeOrder ? (
              <>
                Kiln {activeKiln?.kilnNo} ({activeKiln?.size}) · Camp. {activeOrder.campaignNo} · Started {formatDate(activeOrder.campaignStartDate)}
                {activeTask && (
                  <> · Planned <b>{formatDate(activeTask.plannedDate)}</b> {activeDelay > 0 && <span style={{ color: 'var(--error)', fontWeight: 600 }}>({activeDelay}d late)</span>}</>
                )}
              </>
            ) : (
              'Create a new service order for sponge-iron plant kiln campaign'
            )}
          </div>
        </div>

        {/* Compact 5-stage progress indicator */}
        <div className="workflow-stepper">
          <div className={`step-node ${mode === 'visit' ? 'active' : 'done'}`}>Visit</div>
          <div className={`step-node ${mode === 'running' ? 'active' : mode === 'shutdown' ? 'done' : ''}`}>Running</div>
          <div className="step-node">Call</div>
          <div className={`step-node ${mode === 'shutdown' ? 'active' : ''}`}>Shutdown</div>
          <div className={`step-node ${visitType === 'Restarting The Process' ? 'active' : ''}`}>Restart</div>
        </div>
      </div>

      {/* FORM MODE SWITCHER */}
      <div className="step-segment-nav">
        <button
          type="button"
          className={`segment-btn ${mode === 'visit' ? 'active' : ''}`}
          onClick={() => switchMode('visit')}
        >
          {visitType === 'Restarting The Process' ? 'Restart Campaign' : 'Company Visit'}
        </button>
        <button
          type="button"
          className={`segment-btn ${mode === 'running' ? 'active' : ''}`}
          onClick={() => switchMode('running')}
        >
          Running Inspection
        </button>
        <button
          type="button"
          className={`segment-btn ${mode === 'shutdown' ? 'active' : ''}`}
          onClick={() => switchMode('shutdown')}
        >
          Shutdown Inspection
        </button>
      </div>

      {/* MAIN TWO-COLUMN FORM LAYOUT */}
      <div className="form-layout-grid">
        {/* LEFT COLUMN: THE FORM FIELDS */}
        <div className="card-panel">
          <form onSubmit={handleSubmit}>
            {/* STAGE 1 & 5: COMPANY VISIT / RESTART FORM */}
            {mode === 'visit' && (
              <div>
                <div className="field">
                  <label htmlFor="vType">Visit Flow Type</label>
                  <CustomSelect
                    id="vType"
                    value={visitType}
                    onChange={(e) => {
                      setVisitType(e.target.value);
                      setVWho(e.target.value === 'Restarting The Process' ? 'CRM' : 'Sales Co-ordinator');
                    }}
                    className="select-input"
                  >
                    <option>First Campaign</option>
                    <option>Restarting The Process</option>
                  </CustomSelect>
                </div>

                {visitType === 'Restarting The Process' && (
                  <div className="field" style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <label htmlFor="vOldOrder" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      Previous Campaign Order (To Close upon submit) *
                    </label>
                    <CustomSelect
                      id="vOldOrder"
                      value={vOldOrder}
                      onChange={(e) => setVOldOrder(e.target.value)}
                      className="select-input"
                      required
                    >
                      <option value="">Select previous order to close</option>
                      {(data.orders || [])
                        .filter((o) => o.status === 'open')
                        .map((o) => {
                          const c = (data.companies || []).find((co) => co.id === o.companyId);
                          return (
                            <option key={o.serviceOrderNo} value={o.serviceOrderNo}>
                              {o.serviceOrderNo} · {c?.name} · Camp. {o.campaignNo}
                            </option>
                          );
                        })}
                    </CustomSelect>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="vCo">Client Plant Company *</label>
                  <CustomSelect
                    id="vCo"
                    value={vCompanyId}
                    onChange={(e) => setVCompanyId(e.target.value)}
                    className="select-input"
                    placeholder="Select Client Plant Company"
                    required
                  >
                    <option value="">Select Client Plant Company</option>
                    {(data?.companies || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.kycNo ? ` (${c.kycNo})` : ''}
                      </option>
                    ))}
                  </CustomSelect>
                </div>

                <div className="fieldrow">
                  <div className="field">
                    <label htmlFor="vKiln">Kiln Number *</label>
                    <input
                      id="vKiln"
                      type="number"
                      min="1"
                      max="6"
                      value={vKilnNo}
                      onChange={(e) => setVKilnNo(e.target.value)}
                      className="input-text"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="vSize">Kiln Capacity / Size *</label>
                    <input
                      id="vSize"
                      value={vSize}
                      onChange={(e) => setVSize(e.target.value)}
                      placeholder="e.g. 100 TPD"
                      className="input-text"
                      required
                    />
                  </div>
                </div>

                <div className="fieldrow">
                  <div className="field">
                    <label htmlFor="vCamp">Campaign Number *</label>
                    <input
                      id="vCamp"
                      value={vCamp}
                      onChange={(e) => setVCamp(e.target.value)}
                      placeholder="e.g. 1"
                      className="input-text"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="vStart">Date of Campaign Starting *</label>
                    <input
                      id="vStart"
                      type="date"
                      value={vStart}
                      onChange={(e) => setVStart(e.target.value)}
                      className="input-text"
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="vWho">Visited By (Sales or CRM) *</label>
                  <input
                    id="vWho"
                    value={vWho}
                    onChange={(e) => setVWho(e.target.value)}
                    className="input-text"
                    required
                  />
                </div>
              </div>
            )}

            {/* STAGE 2 & 4: RUNNING & SHUTDOWN INSPECTION FORMS */}
            {mode !== 'visit' && (
              <div>
                <div className="field">
                  <label htmlFor="so">Select Pending Service Order *</label>
                  <CustomSelect
                    id="so"
                    value={selectedOrderNo}
                    onChange={(e) => setSelectedOrderNo(e.target.value)}
                    className="select-input"
                    required
                  >
                    <option value="">Choose an order awaiting this inspection</option>
                    {currentPendingTasks.map((t) => {
                      const ord = (data.orders || []).find((o) => o.serviceOrderNo === t.serviceOrderNo);
                      const comp = ord ? (data.companies || []).find((c) => c.id === ord.companyId) : null;
                      const kiln = ord ? (data.kilns || []).find((k) => k.id === ord.kilnId) : null;
                      return (
                        <option key={t.serviceOrderNo} value={t.serviceOrderNo}>
                          {t.serviceOrderNo} · {comp?.name} · Kiln {kiln?.kilnNo || '1'} (Camp. {ord?.campaignNo})
                        </option>
                      );
                    })}
                  </CustomSelect>
                </div>

                <div className="fieldrow">
                  <div className="field">
                    <label htmlFor="dt">{mode === 'running' ? 'Date of Visit *' : 'Inspection Date *'}</label>
                    <input
                      id="dt"
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className="input-text"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ins">Inspector Incharge *</label>
                    <input
                      id="ins"
                      value={inspector}
                      onChange={(e) => setInspector(e.target.value)}
                      className="input-text"
                      required
                    />
                  </div>
                </div>

                {/* RUNNING SPECIFIC: INNER TEMP & PHOTO */}
                {mode === 'running' && (
                  <div>
                    <div className="fieldrow">
                      <div className="field">
                        <label htmlFor="inner">Inner Temperature (°C) *</label>
                        <input
                          id="inner"
                          type="number"
                          value={innerTemp}
                          onChange={(e) => setInnerTemp(e.target.value)}
                          placeholder="e.g. 1100"
                          className="input-text"
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="exp">Expected Shutdown Date *</label>
                        <input
                          id="exp"
                          type="date"
                          value={expectedShutdown}
                          onChange={(e) => setExpectedShutdown(e.target.value)}
                          className="input-text"
                          required
                        />
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
                        <span>{innerPhoto ? '✓ Photo selected (Click to replace)' : '+ Click to upload inner temperature photo (max 800px)'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => handlePhotoUpload(e)}
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
                  </div>
                )}

                {/* 9 ZONES INPUT GRID */}
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    {mode === 'running'
                      ? 'Outer Shell Temperature per Zone (°C)'
                      : 'Refractory Distance / Thickness per Zone (mm)'}
                  </label>

                  <div className="zones-grid">
                    {Array.from({ length: 9 }, (_, i) => (
                      <div className="zone-cell" key={i}>
                        <label htmlFor={`z${i + 1}`}>Zone {i + 1}</label>
                        <input
                          id={`z${i + 1}`}
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

                  {/* LIVE AVERAGE KPI BANNER */}
                  <div className="live-avg-banner">
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {mode === 'running' ? 'Average Outer Shell Temperature' : 'Average Refractory Thickness'}
                      </div>
                      <small style={{ color: 'var(--text-muted)' }}>Calculated live across filled zone inputs</small>
                    </div>
                    <b>{liveAvg} {mode === 'running' ? '°C' : 'mm'}</b>
                  </div>
                </div>

                {/* SHUTDOWN SPECIFIC: ZONE PHOTOS */}
                {mode === 'shutdown' && (
                  <div className="field">
                    <label>Refractory Zone Condition Photo (Optional)</label>
                    <label className="photo-dropzone">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span>{zonePhotos[0] ? '✓ Photo selected (Click to replace)' : '+ Click to upload refractory wear photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => handlePhotoUpload(e, 0)}
                      />
                    </label>
                    {zonePhotos[0] && (
                      <div className="photo-preview-wrap">
                        <img src={zonePhotos[0]} alt="Refractory wear" />
                        <button
                          type="button"
                          className="photo-remove-btn"
                          onClick={() => {
                            const next = [...zonePhotos];
                            next[0] = '';
                            setZonePhotos(next);
                          }}
                          title="Remove photo"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              className="btn primary"
              style={{ width: '100%', marginTop: '16px', height: '44px', fontSize: '14px' }}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Submitting inspection...'
                : mode === 'visit'
                  ? visitType === 'Restarting The Process' ? 'Close Old Order & Start Next Campaign' : 'Save Visit & Generate Service Order'
                  : mode === 'running'
                    ? 'Submit Running Inspection & Schedule Calls'
                    : 'Submit Shutdown Inspection & Schedule Restart'}
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: AUTO-TRANSITION & CONTEXT SUMMARY */}
        <div className="card-panel">
          <h2>Inspection Workflow & Transition</h2>
          <p className="note">
            The Campaign Life FMS engine calculates working days automatically according to Excel <code>WORKDAY.INTL</code> (skipping Sundays).
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {mode === 'visit' && (
              <>
                <div style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <b>Next Scheduled Task:</b>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Running Kiln Inspection planned for the <b>Campaign Start Date</b> ({formatDate(vStart)}), owner Sanjay.
                  </div>
                </div>
                <div style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <b>Order Lifecycle:</b>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    A new unique Service Order No. will be minted and placed into the Task Board automatically.
                  </div>
                </div>
              </>
            )}

            {mode === 'running' && (
              <>
                <div style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <b>Campaign Runtime:</b>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Days in operation: <b className="mono">{daysSinceStart} days</b> since start date ({activeOrder ? formatDate(activeOrder.campaignStartDate) : '—'}).
                  </div>
                </div>
                <div style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <b>Next Scheduled Task:</b>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Take Shut Down Date planned for the <b>Expected Shutdown Date</b> ({expectedShutdown ? formatDate(expectedShutdown) : '—'}).
                  </div>
                </div>
              </>
            )}

            {mode === 'shutdown' && (
              <>
                <div style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <b>Wear Analysis:</b>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Average thickness recorded: <b className="mono">{liveAvg} mm</b> across all measured zones.
                  </div>
                </div>
                <div style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <b>Next Scheduled Task:</b>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Restart the Process (CRM) planned for <b>{formatDate(addWorkingDays(visitDate, 2))}</b> (+2 working days).
                  </div>
                </div>
              </>
            )}

            <div style={{ padding: '12px', background: 'var(--surface-subtle)', borderRadius: '8px', border: '1px dashed var(--border)', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--primary)' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span><b>Double-Submission Guard:</b> Once an inspection is submitted, its status is locked as Done. If photos are attached, they are compressed client-side to prevent hitting storage limits.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
