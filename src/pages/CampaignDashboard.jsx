import React, { useState, useEffect } from 'react';
import SummaryStrip from '../components/SummaryStrip';
import { formatDate, calendarDaysDiff, todayISO } from '../utils/workflow';
import CustomSelect from '../components/CustomSelect';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';

const LINE_COLORS = ['#14B8A6', '#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B', '#10B981'];

export default function CampaignDashboard({ data }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(data.companies?.[0]?.id || '');

  const companyKilns = (data.kilns || []).filter((k) => k.companyId === selectedCompanyId);
  const [selectedKilnNo, setSelectedKilnNo] = useState(
    companyKilns[0]?.kilnNo?.toString() || '1'
  );
  const [mode, setMode] = useState('thick'); // 'thick' | 'temp'
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // View Details Modal State
  const [viewingCampaign, setViewingCampaign] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [campaignSearch, setCampaignSearch] = useState('');

  // Look up matching kiln
  const activeKiln = companyKilns.find((k) => k.kilnNo.toString() === selectedKilnNo.toString()) || companyKilns[0];

  // Retrieve campaigns for this company & kiln
  const historyList = (data.historicalCampaigns || []).filter(
    (h) => h.companyId === selectedCompanyId && (!activeKiln || h.kilnId === activeKiln.id)
  );

  const currentOrders = (data.orders || []).filter(
    (o) => o.companyId === selectedCompanyId && (!activeKiln || o.kilnId === activeKiln.id)
  );

  // Combine campaigns into unified structures for display
  const combinedCampaigns = [];

  // Add historical
  historyList.forEach((h) => {
    combinedCampaigns.push({
      no: h.campaignNo,
      start: h.startDate,
      days: h.daysRun,
      thick: Array.isArray(h.thickness) ? h.thickness : [],
      temp: Array.isArray(h.temp) ? h.temp : [],
      status: h.status || 'Closed'
    });
  });

  // Add active orders and their inspections
  currentOrders.forEach((o) => {
    const shut = (data.shutdownInspections || []).find((s) => s.serviceOrderNo === o.serviceOrderNo);
    const run = (data.runningInspections || []).find((r) => r.serviceOrderNo === o.serviceOrderNo);
    const daysRun = calendarDaysDiff(o.campaignStartDate, o.shutdownDate || todayISO());

    const thickValues = Array.isArray(shut?.zoneThickness)
      ? shut.zoneThickness.filter((v) => v !== null && v !== '').map(Number).filter(Number.isFinite)
      : [];
    const tempValues = Array.isArray(run?.zoneTemps)
      ? run.zoneTemps.filter((v) => v !== null && v !== '').map(Number).filter(Number.isFinite)
      : [];

    combinedCampaigns.push({
      no: o.campaignNo,
      start: o.campaignStartDate,
      days: daysRun > 0 ? daysRun : 1,
      thick: thickValues,
      temp: tempValues,
      status: o.status === 'closed' ? 'Closed' : o.shutdownDate ? 'Shutdown due' : 'Active running'
    });
  });

  // A new company/kiln has no readings until an inspection is submitted.
  // Never render demo readings for an empty selection.
  const activeCampaigns = combinedCampaigns;

  const lastCamp = activeCampaigns[activeCampaigns.length - 1] || {
    no: '—', days: null, thick: [], temp: [], status: 'No data'
  };
  const filteredHistoricalCampaigns = activeCampaigns.filter((campaign) => {
    const query = campaignSearch.trim().toLowerCase();
    if (!query) return true;
    return String(campaign.no || '').toLowerCase().includes(query)
      || String(campaign.status || '').toLowerCase().includes(query)
      || String(campaign.start || '').toLowerCase().includes(query);
  });
  const paginatedCampaigns = filteredHistoricalCampaigns.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedCompanyId, selectedKilnNo, campaignSearch]);
  const lastThick = lastCamp.thick || [];
  const lastValues = mode === 'thick' ? lastCamp.thick || [] : lastCamp.temp || [];
  const avgThickness = lastThick.length
    ? (lastThick.reduce((a, b) => a + Number(b), 0) / lastThick.length).toFixed(0)
    : '—';
  const worstThickness = lastThick.length ? Math.min(...lastThick) : 0;
  const worstZoneIndex = lastThick.indexOf(worstThickness);

  // Summary strip statistics
  const summaryStats = [
    { label: 'Campaigns Tracked', value: activeCampaigns.length },
    { label: 'Latest Campaign Run', value: lastCamp.days ? `${lastCamp.days} d` : '—' },
    { label: 'Avg Refractory Thickness', value: `${avgThickness} mm` },
    {
      label: lastThick.length ? `Thinnest Zone (Z${worstZoneIndex + 1})` : 'Thinnest Zone',
      value: lastThick.length ? `${worstThickness} mm` : '—',
      tone: lastThick.length && worstThickness < 160 ? 'bad' : ''
    }
  ];

  // SVG Chart Dimensions & Math
  const key = mode; // 'thick' or 'temp'
  const allValues = activeCampaigns.flatMap((c) => c[key] || []);
  const minVal = allValues.length ? Math.min(...allValues) : 100;
  const maxVal = allValues.length ? Math.max(...allValues) : 300;

  const lo = Math.floor(minVal / 10) * 10 - 10;
  const hi = Math.ceil(maxVal / 10) * 10 + 10;

  const W = 620;
  const H = 280;
  const L = 46;
  const R = 20;
  const T = 20;
  const B = 34;

  const getX = (i) => L + (i * (W - L - R)) / 8;
  const getY = (val) => T + ((hi - val) * (H - T - B)) / (hi - lo || 1);

  // Grid lines
  const gridSteps = [0, 1, 2, 3, 4];
  const gridLines = gridSteps.map((step) => {
    const val = lo + (step * (hi - lo)) / 4;
    return { val: Math.round(val), y: getY(val) };
  });

  return (
    <div>
      {/* HEADER ROW WITH SELECTORS */}
      <div className="card-panel" style={{ padding: '14px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Client Plant Company
              </label>
              <CustomSelect
                value={selectedCompanyId}
                onChange={(e) => {
                  setSelectedCompanyId(e.target.value);
                  const kilns = (data.kilns || []).filter((k) => k.companyId === e.target.value);
                  setSelectedKilnNo(kilns[0]?.kilnNo?.toString() || '1');
                }}
                className="select-input"
              >
                {(data.companies || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </CustomSelect>
            </div>

            <div style={{ minWidth: '160px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Rotary Kiln
              </label>
              <CustomSelect
                value={selectedKilnNo}
                onChange={(e) => setSelectedKilnNo(e.target.value)}
                className="select-input"
              >
                {companyKilns.length === 0 ? (
                  <option value="1">Kiln 1 (100 TPD)</option>
                ) : (
                  companyKilns.map((k) => (
                    <option key={k.id} value={k.kilnNo.toString()}>
                      Kiln {k.kilnNo} · {k.size}
                    </option>
                  ))
                )}
              </CustomSelect>
            </div>
          </div>

          {/* TOGGLE THICKNESS / TEMPERATURE */}
          <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              className={`btn small ${mode === 'thick' ? 'primary' : ''}`}
              onClick={() => setMode('thick')}
              style={{ height: '34px' }}
            >
              Thickness (mm)
            </button>
            <button
              type="button"
              className={`btn small ${mode === 'temp' ? 'primary' : ''}`}
              onClick={() => setMode('temp')}
              style={{ height: '34px' }}
            >
              Temperature (°C)
            </button>
          </div>
        </div>
      </div>

      {/* SUMMARY KPI STRIP */}
      <SummaryStrip items={summaryStats} />

      {/* CHART & LATEST ZONE READINGS */}
      <div className="dashboard-chart-grid" style={{ marginBottom: '20px' }}>
        {/* SVG Multi-Line Chart */}
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0 }}>
              {mode === 'thick' ? 'Refractory Lining Thickness Across Zones (mm)' : 'Outer Shell Temperature Across Zones (°C)'}
            </h2>
            <span className="pill">
              {mode === 'thick' ? 'Unit: mm' : 'Unit: °C'}
            </span>
          </div>

          <div style={{ position: 'relative' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {/* Horizontal Grid lines */}
              {gridLines.map((g, idx) => (
                <g key={idx}>
                  <line
                    x1={L}
                    y1={g.y}
                    x2={W - R}
                    y2={g.y}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={L - 8}
                    y={g.y + 4}
                    textAnchor="end"
                    style={{ fontSize: '10.5px', fill: 'var(--text-muted)', fontFamily: 'var(--f-mono)' }}
                  >
                    {g.val}
                  </text>
                </g>
              ))}

              {/* Vertical Zone lines */}
              {Array.from({ length: 9 }, (_, i) => {
                const x = getX(i);
                return (
                  <g key={i}>
                    <line
                      x1={x}
                      y1={T}
                      x2={x}
                      y2={H - B}
                      stroke="var(--border-subtle)"
                    />
                    <text
                      x={x}
                      y={H - 12}
                      textAnchor="middle"
                      style={{ fontSize: '11px', fill: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--f-mono)' }}
                    >
                      Z{i + 1}
                    </text>
                  </g>
                );
              })}

              {/* Campaign Polylines */}
              {activeCampaigns.map((camp, cIdx) => {
                const color = LINE_COLORS[cIdx % LINE_COLORS.length];
                const vals = camp[key] || [];
                const points = vals
                  .map((v, i) => `${getX(i)},${getY(Number(v))}`)
                  .join(' ');

                return (
                  <g key={cIdx}>
                    <polyline
                      fill="none"
                      stroke={color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />
                    {vals.map((v, i) => (
                      <circle
                        key={i}
                        cx={getX(i)}
                        cy={getY(Number(v))}
                        r="4"
                        fill="var(--surface)"
                        stroke={color}
                        strokeWidth="2.5"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredPoint({ campNo: camp.no, zone: i + 1, val: v, unit: mode === 'thick' ? 'mm' : '°C' })}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredPoint && (
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '14px',
                  background: 'var(--text)',
                  color: 'var(--surface)',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  pointerEvents: 'none',
                  boxShadow: 'var(--shadow-md)'
                }}
              >
                Camp. {hoveredPoint.campNo} · Zone {hoveredPoint.zone}: <b>{hoveredPoint.val} {hoveredPoint.unit}</b>
              </div>
            )}
          </div>

          {/* Campaign Legend */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
            {activeCampaigns.map((c, idx) => {
              const color = LINE_COLORS[idx % LINE_COLORS.length];
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: color }} />
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>Campaign {c.no}</span>
                  <span>({c.days} d runtime)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Latest Zone Bars */}
        <div className="card-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h2 style={{ margin: 0 }}>Latest Readings (Camp. {lastCamp.no})</h2>
            <span className="pill good">{lastCamp.days ? `${lastCamp.days} days active` : 'No readings'}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lastValues.length === 0 ? (
              <div style={{ padding: '24px 8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                No {mode === 'thick' ? 'thickness' : 'temperature'} readings submitted for this campaign yet.
              </div>
            ) : lastValues.map((val, i) => {
              const numVal = Number(val);
              // CRITICAL SPEC: Threshold below 160 mm highlighted RED only for thickness, NEVER for temperature
              const isDanger = mode === 'thick' && numVal < 160;
              const pct = Math.min(100, Math.max(10, ((numVal - 100) / 150) * 100));

              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 64px', gap: '10px', alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Z{i + 1}
                  </span>
                  <div style={{ background: 'var(--surface-subtle)', height: '16px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                    <div
                      style={{
                        background: isDanger ? 'var(--error)' : 'var(--primary)',
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                  <span
                    className="mono"
                    style={{
                      textAlign: 'right',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: isDanger ? 'var(--error)' : 'var(--text)'
                    }}
                  >
                    {numVal} {mode === 'thick' ? 'mm' : '°C'}
                  </span>
                </div>
              );
            })}
          </div>

          {mode === 'thick' && worstThickness < 160 && (
            <div style={{ marginTop: '16px', background: 'var(--error-soft)', color: 'var(--error)', border: '1px solid var(--error-border)', padding: '10px 12px', borderRadius: '8px', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span><b>Critical Wear Alert:</b> Zone {worstZoneIndex + 1} is worn below safe threshold (160 mm). Kiln shutdown & relining inspection is urgently advised.</span>
            </div>
          )}
        </div>
      </div>

      {/* HISTORICAL COMPARISON TABLE */}
      <div className="card-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <h2 style={{ margin: 0 }}>Historical Campaign Records & Comparison</h2>
          <input
            type="search"
            value={campaignSearch}
            onChange={(e) => setCampaignSearch(e.target.value)}
            placeholder="Search campaign history..."
            className="input-text"
            style={{ width: '240px', maxWidth: '100%' }}
          />
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Starting Date</th>
                <th>Days Run</th>
                <th className="n">Avg Thickness</th>
                <th className="n">Avg Shell Temp</th>
                <th>Thinnest Zone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCampaigns.map((c, idx) => {
                const thickArr = c.thick || [];
                const tempArr = c.temp || [];
                const avgThick = thickArr.length
                  ? (thickArr.reduce((a, b) => a + Number(b), 0) / thickArr.length).toFixed(0)
                  : '—';
                const avgTmp = tempArr.length
                  ? (tempArr.reduce((a, b) => a + Number(b), 0) / tempArr.length).toFixed(0)
                  : '—';
                const minThick = thickArr.length ? Math.min(...thickArr) : null;
                const worstZ = minThick !== null ? `Z${thickArr.indexOf(minThick) + 1} (${minThick} mm)` : '—';
                const isCrit = minThick !== null && minThick < 160;

                return (
                  <tr
                    key={idx}
                    onClick={() => setViewingCampaign(c)}
                    className="clickable-row"
                    title="Tap to view full campaign comparison details"
                  >
                    <td>
                      <b>Campaign {c.no}</b>
                    </td>
                    <td>{formatDate(c.start)}</td>
                    <td className="mono">{c.days} days</td>
                    <td className="n mono">{avgThick} mm</td>
                    <td className="n mono">{avgTmp} °C</td>
                    <td className={isCrit ? 'date-bad' : ''}>
                      {worstZ} {isCrit && <span className="pill bad" style={{ marginLeft: '4px' }}>Critical</span>}
                    </td>
                    <td>
                      <span className={`pill ${c.status === 'Closed' ? '' : 'good'}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          totalItems={filteredHistoricalCampaigns.length}
          page={historyPage}
          pageSize={historyPageSize}
          onPageChange={setHistoryPage}
          onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(1); }}
          pageSizeOptions={[5, 10, 20, 50]}
          searchValue={campaignSearch}
          onSearchChange={(value) => { setCampaignSearch(value); setHistoryPage(1); }}
          searchPlaceholder="Search campaigns..."
        />
      </div>

      {/* VIEW CAMPAIGN DETAILS POPUP MODAL */}
      {viewingCampaign && (
        <DetailModal
          isOpen={!!viewingCampaign}
          onClose={() => setViewingCampaign(null)}
          title={`Campaign ${viewingCampaign.no} Record`}
          subtitle={`Plant: ${(data.companies || []).find((co) => co.id === selectedCompanyId)?.name || 'Plant'} • Kiln ${selectedKilnNo}`}
          badge={viewingCampaign.status || 'Active'}
          badgeTone={viewingCampaign.status === 'Closed' ? 'warn' : 'good'}
          items={[
            {
              label: 'Client Company',
              value: (data.companies || []).find((co) => co.id === selectedCompanyId)?.name || 'Plant',
              fullWidth: true
            },
            { label: 'Campaign Number', value: `Campaign ${viewingCampaign.no}`, mono: true },
            { label: 'Rotary Kiln', value: `Kiln ${selectedKilnNo}`, mono: true },
            { label: 'Campaign Start Date', value: formatDate(viewingCampaign.start) },
            { label: 'Operational Runtime', value: `${viewingCampaign.days} Days` },
            {
              label: 'Average Lining Thickness',
              value: viewingCampaign.thick?.length
                ? `${(viewingCampaign.thick.reduce((a, b) => a + Number(b), 0) / viewingCampaign.thick.length).toFixed(0)} mm`
                : '—',
              mono: true
            },
            {
              label: 'Average Shell Temperature',
              value: viewingCampaign.temp?.length
                ? `${(viewingCampaign.temp.reduce((a, b) => a + Number(b), 0) / viewingCampaign.temp.length).toFixed(0)} °C`
                : '—',
              mono: true
            },
            {
              label: 'Campaign Status',
              value: viewingCampaign.status || 'Active'
            }
          ]}
          readings={
            viewingCampaign.thick?.length
              ? {
                  title: '9-Zone Refractory Thickness Profile',
                  unit: 'mm',
                  values: viewingCampaign.thick
                }
              : null
          }
        />
      )}
    </div>
  );
}
