import React, { useState } from 'react';
import { formatDate } from '../utils/workflow';
import CustomSelect from '../components/CustomSelect';

export default function FollowupShutdownPage({ data, notify }) {
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');

  const callLogs = data.callLogs || [];

  // Metrics
  const totalCalls = callLogs.length;
  const confirmedCalls = callLogs.filter((c) => c.shutdownDateGiven?.includes('Yes')).length;
  const pendingCalls = callLogs.filter((c) => c.shutdownDateGiven?.includes('No')).length;
  const forgetCalls = callLogs.filter((c) => c.shutdownDateGiven?.includes('Forget')).length;

  const filteredLogs = callLogs.filter((log) => {
    const q = search.toLowerCase();
    const matchSearch =
      (log.serviceOrderNo || '').toLowerCase().includes(q) ||
      (log.partyName || '').toLowerCase().includes(q) ||
      (log.personCalled || '').toLowerCase().includes(q) ||
      (log.mobile || '').toLowerCase().includes(q);

    const matchOutcome = !outcomeFilter || (log.shutdownDateGiven || '').includes(outcomeFilter);
    const matchDesignation = !designationFilter || log.designation === designationFilter;

    return matchSearch && matchOutcome && matchDesignation;
  });

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return iso;
    }
  };

  return (
    <div>
      {/* PAGE HEADER */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Followup for Shutdown
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>

          </p>
        </div>
      </div>

      {/* SUMMARY STAT TILES */}
      <div className="summary-strip" style={{ marginBottom: '18px' }}>
        <div className="metric-tile">
          <div className="metric-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Calls Logged</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{totalCalls}</div>
          </div>
        </div>

        <div className="metric-tile">
          <div className="metric-icon-box" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Date Confirmed</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--success)' }}>{confirmedCalls}</div>
          </div>
        </div>

        <div className="metric-tile warn">
          <div className="metric-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Date Not Taken</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--warning)' }}>{pendingCalls}</div>
          </div>
        </div>

        <div className="metric-tile bad">
          <div className="metric-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Forget to Taken</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--error)' }}>{forgetCalls}</div>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS */}
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
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1, minWidth: 0, width: '100%' }}>
          <div className="search-input-wrap" style={{ flex: '1 1 200px' }}>
            <input
              type="search"
              placeholder="Search company, CN, person, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-text"
              style={{ height: '38px', width: '100%' }}
            />
          </div>

          <div style={{ width: '220px' }}>
            <CustomSelect
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="select-input"
              style={{ height: '38px' }}
            >
              <option value="">All Call Outcomes</option>
              <option value="Yes">Yes Shutdown date taken</option>
              <option value="No">No shutdown date not taken</option>
              <option value="Forget">Forget to taken</option>
            </CustomSelect>
          </div>

          <div style={{ width: '160px' }}>
            <CustomSelect
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              className="select-input"
              style={{ height: '38px' }}
            >
              <option value="">All Designations</option>
              <option value="Processor">Processor</option>
              <option value="Purchaser">Purchaser</option>
            </CustomSelect>
          </div>
        </div>

        {(search || outcomeFilter || designationFilter) && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setSearch('');
              setOutcomeFilter('');
              setDesignationFilter('');
            }}
            style={{ height: '38px' }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* DATA TABLE */}
      <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="panel-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Followup Logs ({filteredLogs.length})
          </h3>
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Chronological call records logged by inspector / coordinator
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Order No.</th>
                <th>Party Name</th>
                <th>Person Called</th>
                <th>Designation</th>
                <th>Mobile</th>
                <th>Shut Down Date Given</th>
                <th>Expected / Next Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                    No call followup records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={idx}>
                    <td style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td>
                      <span className="cn">{log.serviceOrderNo}</span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {log.partyName}
                    </td>
                    <td>{log.personCalled}</td>
                    <td>
                      <span className="pill">{log.designation || 'Processor'}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--f-mono)', fontSize: '12px' }}>
                      {log.mobile}
                    </td>
                    <td>
                      {log.shutdownDateGiven?.includes('Yes') ? (
                        <span className="pill good" style={{ fontWeight: 700 }}>
                          ✓ {log.shutdownDateGiven}
                        </span>
                      ) : log.shutdownDateGiven?.includes('Forget') ? (
                        <span className="pill bad">
                          {log.shutdownDateGiven}
                        </span>
                      ) : (
                        <span className="pill warn">
                          {log.shutdownDateGiven}
                        </span>
                      )}
                    </td>
                    <td>
                      {log.expectedShutdownDate ? (
                        <div>
                          <small style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px' }}>
                            Expected Shutdown:
                          </small>
                          <strong style={{ color: 'var(--primary)' }}>
                            {formatDate(log.expectedShutdownDate)}
                          </strong>
                        </div>
                      ) : log.nextCallDate ? (
                        <div>
                          <small style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '11px' }}>
                            Next Call Date:
                          </small>
                          <strong style={{ color: 'var(--warning)' }}>
                            {formatDate(log.nextCallDate)}
                          </strong>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

