import React, { useState } from 'react';
import { saveData } from '../services/storage';
import CustomSelect from '../components/CustomSelect';
import DetailModal from '../components/DetailModal';

export default function Masters({ data, refresh, notify }) {
  const [activeTab, setActiveTab] = useState('companies'); // 'companies' | 'kilns'
  const [search, setSearch] = useState('');

  // View Details Modal State
  const [viewingCompany, setViewingCompany] = useState(null);
  const [viewingKiln, setViewingKiln] = useState(null);

  // Company Modal State
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [kycNo, setKycNo] = useState('');
  const [gstNo, setGstNo] = useState('');
  const [siteIncharge, setSiteIncharge] = useState('');
  const [mobile, setMobile] = useState('');
  const [registeredAddress, setRegisteredAddress] = useState('');

  // Kiln Modal State
  const [showKilnModal, setShowKilnModal] = useState(false);
  const [editingKiln, setEditingKiln] = useState(null);
  const [kilnCompanyId, setKilnCompanyId] = useState('');
  const [kilnNo, setKilnNo] = useState('');
  const [kilnSize, setKilnSize] = useState('');

  // Open Add Company Modal
  const handleOpenAddCompany = () => {
    setEditingCompany(null);
    setCompanyName('');
    setKycNo(`KYC-${String((data.companies || []).length + 1).padStart(3, '0')}`);
    setGstNo('');
    setSiteIncharge('');
    setMobile('');
    setRegisteredAddress('');
    setShowCompanyModal(true);
  };

  // Open Edit Company Modal
  const handleOpenEditCompany = (comp) => {
    setEditingCompany(comp);
    setCompanyName(comp.name);
    setKycNo(comp.kycNo || '');
    setGstNo(comp.gstNo || '');
    setSiteIncharge(comp.siteIncharge || '');
    setMobile(comp.mobile || '');
    setRegisteredAddress(comp.registeredAddress || '');
    setShowCompanyModal(true);
  };

  // Save Company (Create or Update)
  const handleSaveCompany = async (e) => {
    e.preventDefault();
    const trimmedName = companyName.trim();
    if (!trimmedName) {
      notify('Please enter company name', 'bad');
      return;
    }

    if (mobile && !/^\d{10}$/.test(mobile.trim())) {
      notify('Mobile number must be exactly 10 digits', 'bad');
      return;
    }

    const trimmedGst = gstNo.trim().toUpperCase();
    const trimmedAddress = registeredAddress.trim();

    try {
      const nextData = { ...data };
      if (editingCompany) {
        // Update
        const idx = nextData.companies.findIndex((c) => c.id === editingCompany.id);
        if (idx !== -1) {
          nextData.companies[idx] = {
            ...nextData.companies[idx],
            name: trimmedName,
            kycNo: kycNo.trim(),
            gstNo: trimmedGst,
            siteIncharge: siteIncharge.trim(),
            mobile: mobile.trim(),
            registeredAddress: trimmedAddress
          };
        }
        notify(`Company "${trimmedName}" updated!`, 'good');
      } else {
        // Create
        const newId = `c${Date.now()}`;
        nextData.companies.push({
          id: newId,
          name: trimmedName,
          kycNo: kycNo.trim() || `KYC-${String((data.companies || []).length + 1).padStart(3, '0')}`,
          gstNo: trimmedGst,
          siteIncharge: siteIncharge.trim(),
          mobile: mobile.trim(),
          registeredAddress: trimmedAddress
        });
        // Default kiln for new company
        nextData.kilns.push({
          id: `k${Date.now()}`,
          companyId: newId,
          kilnNo: 1,
          size: '100 TPD'
        });
        notify(`Company "${trimmedName}" created with Kiln 1!`, 'good');
      }

      await saveData(nextData);
      await refresh();
      setShowCompanyModal(false);
    } catch (err) {
      notify(err.message, 'bad');
    }
  };

  // Delete Company
  const handleDeleteCompany = async (comp) => {
    if (!window.confirm(`Are you sure you want to delete "${comp.name}"? Associated kilns will also be removed.`)) {
      return;
    }
    try {
      const nextData = { ...data };
      nextData.companies = nextData.companies.filter((c) => c.id !== comp.id);
      nextData.kilns = nextData.kilns.filter((k) => k.companyId !== comp.id);
      await saveData(nextData);
      await refresh();
      notify(`Company "${comp.name}" deleted`, 'info');
    } catch (err) {
      notify(err.message, 'bad');
    }
  };

  // Open Add Kiln Modal
  const handleOpenAddKiln = () => {
    setEditingKiln(null);
    setKilnCompanyId('');
    setKilnNo('');
    setKilnSize('');
    setShowKilnModal(true);
  };

  // Open Edit Kiln Modal
  const handleOpenEditKiln = (kiln) => {
    setEditingKiln(kiln);
    setKilnCompanyId(kiln.companyId);
    setKilnNo(kiln.kilnNo.toString());
    setKilnSize(kiln.size);
    setShowKilnModal(true);
  };

  // Save Kiln (Create or Update)
  const handleSaveKiln = async (e) => {
    e.preventDefault();
    if (!kilnCompanyId || !kilnNo || !kilnSize) {
      notify('Please fill all kiln fields', 'bad');
      return;
    }

    try {
      const nextData = { ...data };
      const numKiln = Number(kilnNo);
      const trimmedSize = kilnSize.trim();

      if (editingKiln) {
        const idx = nextData.kilns.findIndex((k) => k.id === editingKiln.id);
        if (idx !== -1) {
          nextData.kilns[idx] = {
            ...nextData.kilns[idx],
            companyId: kilnCompanyId,
            kilnNo: numKiln,
            size: trimmedSize
          };
        }
        notify(`Kiln ${numKiln} updated!`, 'good');
      } else {
        // Prevent duplicate kiln number for the same company
        const duplicate = nextData.kilns.some(
          (k) => k.companyId === kilnCompanyId && k.kilnNo === numKiln
        );
        if (duplicate) {
          notify(`Kiln ${numKiln} already exists for this company.`, 'bad');
          return;
        }

        nextData.kilns.push({
          id: `k${Date.now()}`,
          companyId: kilnCompanyId,
          kilnNo: numKiln,
          size: trimmedSize
        });
        notify(`Kiln ${numKiln} added!`, 'good');
      }

      await saveData(nextData);
      await refresh();
      setShowKilnModal(false);
    } catch (err) {
      notify(err.message, 'bad');
    }
  };

  // Delete Kiln
  const handleDeleteKiln = async (kiln) => {
    const comp = (data.companies || []).find((c) => c.id === kiln.companyId);
    if (!window.confirm(`Delete Kiln ${kiln.kilnNo} (${comp?.name})?`)) return;

    try {
      const nextData = { ...data };
      nextData.kilns = nextData.kilns.filter((k) => k.id !== kiln.id);
      await saveData(nextData);
      await refresh();
      notify(`Kiln ${kiln.kilnNo} deleted`, 'info');
    } catch (err) {
      notify(err.message, 'bad');
    }
  };

  // Filtered lists
  const filteredCompanies = (data.companies || []).filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.siteIncharge && c.siteIncharge.toLowerCase().includes(q)) ||
      (c.kycNo && c.kycNo.toLowerCase().includes(q)) ||
      (c.mobile && c.mobile.includes(q)) ||
      (c.gstNo && c.gstNo.toLowerCase().includes(q)) ||
      (c.registeredAddress && c.registeredAddress.toLowerCase().includes(q))
    );
  });

  const filteredKilns = (data.kilns || []).filter((k) => {
    const comp = (data.companies || []).find((c) => c.id === k.companyId);
    const q = search.toLowerCase();
    return (
      (comp && comp.name.toLowerCase().includes(q)) ||
      `kiln ${k.kilnNo}`.includes(q) ||
      k.size.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* HEADER SECTION */}
      <div className="page-header-row">
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Masters Repository
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Manage client plants, site incharge contacts, KYC references, and rotary kiln specifications.
          </p>
        </div>
      </div>

      {/* TABS & SEARCH TOOLBAR */}
      <div className="card-panel" style={{ padding: '12px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--surface-subtle)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              className={`btn small ${activeTab === 'companies' ? 'primary' : ''}`}
              onClick={() => setActiveTab('companies')}
              style={{ height: '34px' }}
            >
              Companies
            </button>
            <button
              type="button"
              className={`btn small ${activeTab === 'kilns' ? 'primary' : ''}`}
              onClick={() => setActiveTab('kilns')}
              style={{ height: '34px' }}
            >
              Kilns
            </button>
          </div>

          <div className="search-row-mobile" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-input-wrap">
              <input
                type="search"
                placeholder={`Search ${activeTab}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-text"
              />
            </div>
            {activeTab === 'companies' ? (
              <button className="btn primary small" onClick={handleOpenAddCompany} style={{ height: '38px', whiteSpace: 'nowrap' }}>
                + Add Company
              </button>
            ) : (
              <button className="btn primary small" onClick={handleOpenAddKiln} style={{ height: '38px', whiteSpace: 'nowrap' }}>
                + Add Kiln
              </button>
            )}
          </div>
        </div>
      </div>

      {/* COMPANIES TAB CONTENT */}
      {activeTab === 'companies' && (
        <div className="card-panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>KYC Reference</th>
                  <th>Company Name & Address</th>
                  <th>GST Number</th>
                  <th>Site Incharge</th>
                  <th>Mobile Number</th>
                  <th className="n">Kilns Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No companies match your search.
                    </td>
                  </tr>
                ) : (
                  filteredCompanies.map((c) => {
                    const count = (data.kilns || []).filter((k) => k.companyId === c.id).length;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setViewingCompany(c)}
                        className="clickable-row"
                        title="Tap to view full company details"
                      >
                        <td>
                          <span className="pill">{c.kycNo || 'KYC-000'}</span>
                        </td>
                        <td>
                          <b>{c.name}</b>
                          {c.registeredAddress && (
                            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px', maxWidth: '300px', lineHeight: 1.3 }}>
                              {c.registeredAddress}
                            </div>
                          )}
                        </td>
                        <td>
                          {c.gstNo ? (
                            <span className="mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>
                              {c.gstNo}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                        <td>{c.siteIncharge || '—'}</td>
                        <td className="mono">{c.mobile || '—'}</td>
                        <td className="n mono">{count}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="btn small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingCompany(c);
                              }}
                              title="View Details"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditCompany(c);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn small danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCompany(c);
                              }}
                            >
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
        </div>
      )}

      {/* KILNS TAB CONTENT */}
      {activeTab === 'kilns' && (
        <div className="card-panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Plant Company</th>
                  <th>Kiln Number</th>
                  <th>Capacity / Sizing</th>
                  <th className="n">Active Orders</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredKilns.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No kilns match your search.
                    </td>
                  </tr>
                ) : (
                  filteredKilns.map((k) => {
                    const comp = (data.companies || []).find((c) => c.id === k.companyId);
                    const ordersCount = (data.orders || []).filter(
                      (o) => o.kilnId === k.id && o.status === 'open'
                    ).length;
                    return (
                      <tr
                        key={k.id}
                        onClick={() => setViewingKiln(k)}
                        className="clickable-row"
                        title="Tap to view kiln specifications"
                      >
                        <td>
                          <b>{comp?.name || 'Unknown'}</b>
                        </td>
                        <td className="mono">Kiln {k.kilnNo}</td>
                        <td>
                          <span className="pill warn">{k.size}</span>
                        </td>
                        <td className="n mono">{ordersCount}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="btn small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingKiln(k);
                              }}
                              title="View Kiln Specs"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditKiln(k);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn small danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteKiln(k);
                              }}
                            >
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
        </div>
      )}

      {/* COMPANY MODAL */}
      {showCompanyModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                {editingCompany ? 'Edit Plant Company' : 'Add New Plant Company'}
              </h2>
              <button className="modal-close-btn" onClick={() => setShowCompanyModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveCompany}>
              <div className="field">
                <label>Company Name *</label>
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Alankar Alloys Pvt Ltd"
                  className="input-text"
                />
              </div>
              <div className="fieldrow">
                <div className="field">
                  <label>KYC Number</label>
                  <input
                    value={kycNo}
                    onChange={(e) => setKycNo(e.target.value)}
                    placeholder="KYC-001"
                    className="input-text"
                  />
                </div>
                <div className="field">
                  <label>GST Number (GSTIN)</label>
                  <input
                    value={gstNo}
                    onChange={(e) => setGstNo(e.target.value.toUpperCase())}
                    placeholder="e.g. 22AAAAA0000A1Z5"
                    maxLength={15}
                    className="input-text"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              </div>
              <div className="fieldrow">
                <div className="field">
                  <label>Site Incharge Representative</label>
                  <input
                    value={siteIncharge}
                    onChange={(e) => setSiteIncharge(e.target.value)}
                    placeholder="Enter Representative Name"
                    className="input-text"
                  />
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
              <div className="field">
                <label>Registered Address</label>
                <textarea
                  rows={2}
                  value={registeredAddress}
                  onChange={(e) => setRegisteredAddress(e.target.value)}
                  placeholder="Enter registered office / plant address..."
                  className="input-text"
                  style={{ height: 'auto', minHeight: '62px', padding: '8px 12px', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" className="btn" onClick={() => setShowCompanyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  {editingCompany ? 'Update Company' : 'Save Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KILN MODAL */}
      {showKilnModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                {editingKiln ? 'Edit Rotary Kiln' : 'Add New Rotary Kiln'}
              </h2>
              <button className="modal-close-btn" onClick={() => setShowKilnModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveKiln}>
              <div className="field">
                <label>Plant Company *</label>
                <CustomSelect
                  required
                  value={kilnCompanyId}
                  onChange={(e) => setKilnCompanyId(e.target.value)}
                  className="select-input"
                  placeholder="Select Company"
                >
                  <option value="">Select Company</option>
                  {(data.companies || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              <div className="fieldrow">
                <div className="field">
                  <label>Kiln Number (1-6) *</label>
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
                <div className="field">
                  <label>Kiln Capacity / Size *</label>
                  <CustomSelect
                    required
                    value={kilnSize}
                    onChange={(e) => setKilnSize(e.target.value)}
                    className="select-input"
                    placeholder="Select Kiln Size"
                  >
                    <option value="">Select Kiln Size</option>
                    {[...new Set([
                      ...(data?.kilnSizes && data.kilnSizes.length > 0 ? data.kilnSizes : ['80 TPD', '100 TPD', '120 TPD', '150 TPD']),
                      '80 TPD', '100 TPD', '120 TPD', '150 TPD', '250 TPD', '350 TPD', '500 TPD'
                    ])].map((sz) => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </CustomSelect>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button type="button" className="btn" onClick={() => setShowKilnModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  {editingKiln ? 'Update Kiln' : 'Save Kiln'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW COMPANY DETAILS POPUP MODAL */}
      {viewingCompany && (
        <DetailModal
          isOpen={!!viewingCompany}
          onClose={() => setViewingCompany(null)}
          title="Plant Company Details"
          subtitle={`KYC Reference: ${viewingCompany.kycNo || 'KYC-000'}`}
          badge={`${(data.kilns || []).filter((k) => k.companyId === viewingCompany.id).length} Kilns Registered`}
          badgeTone="good"
          items={[
            { label: 'Company Name', value: viewingCompany.name, fullWidth: true },
            { label: 'KYC Reference', value: viewingCompany.kycNo || 'KYC-000', mono: true },
            { label: 'GST Number (GSTIN)', value: viewingCompany.gstNo || 'Not Provided', mono: true },
            { label: 'Site Incharge Representative', value: viewingCompany.siteIncharge || '—' },
            { label: 'Contact Mobile Number', value: viewingCompany.mobile || '—', mono: true },
            {
              label: 'Registered Factory Address',
              value: viewingCompany.registeredAddress || 'No registered address on file',
              fullWidth: true
            },
            {
              label: 'Associated Rotary Kilns',
              value: (data.kilns || [])
                .filter((k) => k.companyId === viewingCompany.id)
                .map((k) => `Kiln ${k.kilnNo} (${k.size})`)
                .join(', ') || 'None registered yet',
              fullWidth: true
            }
          ]}
          onEdit={() => handleOpenEditCompany(viewingCompany)}
          editLabel="Edit Company"
        />
      )}

      {/* VIEW KILN DETAILS POPUP MODAL */}
      {viewingKiln && (
        <DetailModal
          isOpen={!!viewingKiln}
          onClose={() => setViewingKiln(null)}
          title="Rotary Kiln Specifications"
          subtitle={`Kiln No. ${viewingKiln.kilnNo}`}
          badge={viewingKiln.size || 'Standard'}
          badgeTone="warn"
          items={[
            {
              label: 'Client Company',
              value: (data.companies || []).find((c) => c.id === viewingKiln.companyId)?.name || 'Unknown Company',
              fullWidth: true
            },
            { label: 'Rotary Kiln Number', value: `Kiln ${viewingKiln.kilnNo}`, mono: true },
            { label: 'Capacity / Production Size', value: viewingKiln.size || 'Standard TPD' },
            {
              label: 'Active Service Orders',
              value: `${(data.orders || []).filter((o) => o.kilnId === viewingKiln.id && o.status === 'open').length} active orders`,
              mono: true
            }
          ]}
          onEdit={() => handleOpenEditKiln(viewingKiln)}
          editLabel="Edit Kiln"
        />
      )}
    </div>
  );
}
