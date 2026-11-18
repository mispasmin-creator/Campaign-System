import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SummaryStrip from '../components/SummaryStrip';
import { todayISO, formatDate, getTaskDelay, calendarDaysDiff } from '../utils/workflow';
import CustomSelect from '../components/CustomSelect';

const STEPS_CONFIG = [
  {
    key: 'visit',
    num: '1',
    name: 'Company Visit',
    who: 'Sales',
    rule: 'Sales Co-ordinator · Start Date',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
  },
  {
    key: 'running',
    num: '2',
    name: 'Running Kiln Inspection',
    who: 'Sanjay',
    rule: 'Start + 7 days · Temp check',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    )
  },
  {
    key: 'call',
    num: '3',
    name: 'Take Shut Down Date',
    who: 'Sanjay',
    rule: 'N − 3 days · Call party',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    )
  },
  {
    key: 'shutdown',
    num: '4',
    name: 'Shutdown Inspection',
    who: 'Sanjay',
    rule: 'On shutdown date (N) · Thickness',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    )
  },
  {
    key: 'restart',
    num: '5',
    name: 'Restart the Process',
    who: 'CRM',
    rule: 'Shutdown + 2 days · Cycle repeat',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    )
  }
];

export default function TaskBoard({ data }) {
  const navigate = useNavigate();
  const [whoFilter, setWhoFilter] = useState('');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileActiveStage, setMobileActiveStage] = useState('visit');

  const today = todayISO();

  // Helper lookups
  const getCompany = (companyId) => (data.companies || []).find((c) => c.id === companyId);
  const getKiln = (kilnId) => (data.kilns || []).find((k) => k.id === kilnId);
  const getOrder = (serviceOrderNo) => (data.orders || []).find((o) => o.serviceOrderNo === serviceOrderNo);

  // Active pending tasks & open orders
  const pendingTasks = (data.stepTasks || []).filter((t) => t.status === 'pending');
  const openOrders = (data.orders || []).filter((o) => o.status === 'open');

  // Metrics
  const delayedTasks = pendingTasks.filter((t) => getTaskDelay(t, today) > 0);
  const dueTodayTasks = pendingTasks.filter((t) => t.plannedDate === today);
  const pendingCalls = pendingTasks.filter((t) => t.step === 'call');

  const totalDelayDays = delayedTasks.reduce((acc, t) => acc + getTaskDelay(t, today), 0);
  const avgDelay = delayedTasks.length ? (totalDelayDays / delayedTasks.length).toFixed(1) : '0.0';

  const summaryStats = [
    { label: 'Open orders', value: openOrders.length },
    { label: 'Due today', value: dueTodayTasks.length, tone: dueTodayTasks.length ? 'warn' : '' },
    { label: 'Delayed tasks', value: delayedTasks.length, tone: delayedTasks.length ? 'bad' : '' },
    { label: 'Average delay', value: `${avgDelay} d` },
    { label: 'Pending calls', value: pendingCalls.length }
  ];

  // Quick navigation to step forms
  const handleOpenForm = (task, order) => {
    if (task.step === 'visit') {
      navigate('/visit');
    } else if (task.step === 'running') {
      navigate(`/running?order=${task.serviceOrderNo}`);
    } else if (task.step === 'call') {
      navigate(`/take-shutdown-date?order=${task.serviceOrderNo}`);
    } else if (task.step === 'shutdown') {
      navigate(`/shutdown-inspection?order=${task.serviceOrderNo}`);
    } else if (task.step === 'restart') {
      navigate(`/visit?restartOrder=${task.serviceOrderNo}`);
    }
  };

  // Reset all filters
  const handleClearFilters = () => {
    setWhoFilter('');
    setDelayedOnly(false);
    setSearchQuery('');
  };

  const hasActiveFilters = whoFilter || delayedOnly || searchQuery;

  // Calls due today or overdue
  const callsDueToday = pendingCalls
    .filter((t) => t.plannedDate <= today)
    .sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1))
    .slice(0, 5);

  return (
    <div>
      {/* HEADER SECTION */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Task Board
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Track every service order across the 5 refractory lifecycle stages. Cards transition automatically as inspections are submitted.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => navigate('/visit')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Company Visit
        </button>
      </div>

      {/* SUMMARY KPI STRIP */}
      <SummaryStrip items={summaryStats} />

      {/* TOOLBAR */}
      <div className="card-panel" style={{ padding: '12px 16px', marginBottom: '18px' }}>
        <div className="board-toolbar" style={{ margin: 0 }}>
          <div className="search-box">
            <input
              type="search"
              placeholder="Search company or CN number (e.g. CN-01)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-text"
            />
          </div>

          <div style={{ width: '160px' }}>
            <CustomSelect
              value={whoFilter}
              onChange={(e) => setWhoFilter(e.target.value)}
              className="select-input"
              aria-label="Filter by owner"
            >
              <option value="">All Owners</option>
              <option value="Sales">Sales</option>
              <option value="Sanjay">Sanjay</option>
              <option value="CRM">CRM</option>
            </CustomSelect>
          </div>

          <button
            type="button"
            className={`btn small ${delayedOnly ? 'primary' : ''}`}
            onClick={() => setDelayedOnly(!delayedOnly)}
            style={{ height: '40px' }}
          >
            {delayedOnly ? '✓ Delayed Only' : 'Delayed Only'}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn small"
              onClick={handleClearFilters}
              style={{ height: '40px' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* MOBILE STAGE TABS (visible only on mobile) */}
      <div className="mobile-stage-selector" style={{ display: 'none', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' }}>
          {STEPS_CONFIG.map((s) => {
            const count = pendingTasks.filter((t) => t.step === s.key).length;
            return (
              <button
                key={s.key}
                type="button"
                className={`btn small ${mobileActiveStage === s.key ? 'primary' : ''}`}
                onClick={() => setMobileActiveStage(s.key)}
                style={{ flexShrink: 0 }}
              >
                {s.num}. {s.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 5-COLUMN WORKFLOW BOARD */}
      <div className="board-grid">
        {STEPS_CONFIG.map((step) => {
          // Column tasks matching filters
          const columnTasks = pendingTasks.filter((t) => {
            if (t.step !== step.key) return false;
            if (whoFilter && t.owner !== whoFilter) return false;

            const delay = getTaskDelay(t, today);
            if (delayedOnly && delay <= 0) return false;

            if (searchQuery) {
              const ord = getOrder(t.serviceOrderNo);
              const comp = ord ? getCompany(ord.companyId) : null;
              const text = `${t.serviceOrderNo} ${comp?.name || ''}`.toLowerCase();
              if (!text.includes(searchQuery.toLowerCase())) return false;
            }

            return true;
          });

          return (
            <div className="board-col" key={step.key}>
              <div className="col-header">
                <div className="col-title-group">
                  <span className="col-icon">{step.icon}</span>
                  <span className="col-name">{step.name}</span>
                </div>
                <span className="col-badge mono">{columnTasks.length}</span>
              </div>
              <div className="col-rule">{step.who} · {step.rule}</div>

              {columnTasks.length === 0 ? (
                <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No pending tasks
                </div>
              ) : (
                columnTasks.map((t) => {
                  const ord = getOrder(t.serviceOrderNo);
                  const comp = ord ? getCompany(ord.companyId) : null;
                  const kiln = ord ? getKiln(ord.kilnId) : null;
                  const delay = getTaskDelay(t, today);
                  const daysUntilDue = calendarDaysDiff(today, t.plannedDate);

                  let pill = null;
                  let borderClass = '';

                  if (delay > 0) {
                    borderClass = 'late';
                    pill = (
                      <span className="pill bad">
                        <span style={{ fontWeight: 700 }}>●</span> {delay} d late
                      </span>
                    );
                  } else if (daysUntilDue === 0) {
                    borderClass = 'soon';
                    pill = <span className="pill warn">Due Today</span>;
                  } else if (daysUntilDue > 0 && daysUntilDue <= 2) {
                    borderClass = 'soon';
                    pill = <span className="pill warn">Due in {daysUntilDue} d</span>;
                  } else {
                    pill = <span className="pill">In {daysUntilDue} d</span>;
                  }

                  return (
                    <div className={`board-card ${borderClass}`} key={t.id}>
                      <div className="card-top">
                        <span className="cn">{t.serviceOrderNo}</span>
                        {pill}
                      </div>

                      <div className="card-company">{comp?.name || 'Unknown Company'}</div>

                      <div className="card-meta">
                        <span>Kiln {kiln?.kilnNo || '1'} ({kiln?.size || '100 TPD'})</span>
                        <span>·</span>
                        <span>Camp. {ord?.campaignNo || '1'}</span>
                        <span>·</span>
                        <span style={{ fontWeight: 600 }}>{t.owner}</span>
                      </div>

                      <div className="card-footer">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Planned</span>
                          <span className="mono" style={{ fontSize: '12.5px', fontWeight: 600 }}>
                            {formatDate(t.plannedDate)}
                          </span>
                        </div>
                        <button
                          className="btn small"
                          onClick={() => handleOpenForm(t, ord)}
                        >
                          Open form →
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {/* BELOW THE BOARD: CALLS DUE TODAY & LIFECYCLE INFO */}
      <div className="board-bottom-grid">
        {/* Calls Due Today */}
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Calls Due Today ({callsDueToday.length})
            </h2>
            <button
              className="btn small"
              onClick={() => navigate('/calls')}
            >
              View Call Tracker →
            </button>
          </div>

          {callsDueToday.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              ✓ All party calls are up to date! No pending follow-ups due today.
            </div>
          ) : (
            <div>
              {callsDueToday.map((t) => {
                const ord = getOrder(t.serviceOrderNo);
                const comp = ord ? getCompany(ord.companyId) : null;
                const logCount = (data.callLogs || []).filter((l) => l.serviceOrderNo === t.serviceOrderNo).length;

                return (
                  <div className="call-row" key={t.id}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span className="cn">{t.serviceOrderNo}</span>
                        <b>{comp?.name}</b>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Contact: {comp?.siteIncharge || 'Site Incharge'} ({comp?.mobile || 'No mobile'}) · {logCount} previous call{logCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    <button
                      className="btn small primary"
                      onClick={() => navigate(`/calls?order=${t.serviceOrderNo}`)}
                    >
                      Log Call
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 5-Step Lifecycle Guide */}
        <div className="card-panel">
          <h2>Refractory Lifecycle Flow</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: '6px' }}>
              <span className="pill good">1</span>
              <div style={{ flex: 1, fontSize: '13px' }}>
                <b>Company Visit:</b> Sales records plant details, generates CN order.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: '6px' }}>
              <span className="pill">2</span>
              <div style={{ flex: 1, fontSize: '13px' }}>
                <b>Running Inspection:</b> Sanjay records inner temp & 9 zones outer temp (+7 days).
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: '6px' }}>
              <span className="pill warn">3</span>
              <div style={{ flex: 1, fontSize: '13px' }}>
                <b>Take Shutdown Date:</b> Outbound calls to finalize shutdown date (N − 3 days).
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: '6px' }}>
              <span className="pill">4</span>
              <div style={{ flex: 1, fontSize: '13px' }}>
                <b>Shutdown Inspection:</b> 9-zone refractory thickness in mm (Shutdown N + 0).
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: '6px' }}>
              <span className="pill good">5</span>
              <div style={{ flex: 1, fontSize: '13px' }}>
                <b>Restart the Process:</b> CRM closes completed campaign, initiates next cycle (+2 days).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
