"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Search, Save, AlertTriangle, ArrowLeft, Upload, LogOut } from 'lucide-react';

const API_BASE = '/api';

export default function Dashboard() {
  const router = useRouter();
  
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string>('');
  
  const [overview, setOverview] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [edits, setEdits] = useState<any>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Check Auth & Load Datasets
  useEffect(() => {
    const init = async () => {
      try {
        const authRes = await fetch('/api/auth/me');
        const authData = await authRes.json();
        
        if (!authData.user) {
          router.push('/login');
          return;
        }
        setUser(authData.user);

        const dRes = await fetch('/api/datasets');
        const dData = await dRes.json();
        if (dData.datasets && dData.datasets.length > 0) {
          setDatasets(dData.datasets);
          setActiveDatasetId(dData.datasets[0].id);
        } else {
          setLoading(false); // No datasets, stop loading to show empty state
        }
      } catch (err) {
        console.error("Init error", err);
      }
    };
    init();
  }, [router]);

  // 2. Load Overview when active dataset changes
  useEffect(() => {
    if (activeDatasetId) {
      fetchOverview(activeDatasetId);
      // Reset views
      setSelectedAccount(null);
      setAccounts([]);
    }
  }, [activeDatasetId]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const fetchOverview = async (datasetId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/overview?datasetId=${datasetId}`);
      const data = await res.json();
      if (!data.error) {
        setOverview(data);
      }
    } catch (error) {
      console.error("Error fetching overview:", error);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        alert("File imported successfully!");
        
        // Refresh datasets list and switch to the new one
        const dRes = await fetch('/api/datasets');
        const dData = await dRes.json();
        setDatasets(dData.datasets);
        setActiveDatasetId(data.dataset.id);
        
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert("Upload failed.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const searchAccounts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDatasetId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/accounts?datasetId=${activeDatasetId}&query=${query}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
      setSelectedAccount(null);
      setEdits({});
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
    setLoading(false);
  };

  const loadAccountDetails = async (accountNo: string) => {
    if (!activeDatasetId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/accounts/${accountNo}?datasetId=${activeDatasetId}`);
      const data = await res.json();
      setSelectedAccount(data.account);
      setFindings(data.findings);
      setEdits({});
    } catch (error) {
      console.error("Error fetching account details:", error);
    }
    setLoading(false);
  };

  const handleEditChange = (slNo: string, field: string, value: string) => {
    setEdits((prev: any) => ({
      ...prev,
      [slNo]: {
        ...(prev[slNo] || {}),
        [field]: value
      }
    }));
  };

  const saveAllChanges = async () => {
    if (Object.keys(edits).length === 0 || !activeDatasetId) return;
    setSaving(true);
    
    try {
      const promises = Object.keys(edits).map(slNo => {
        return fetch(`${API_BASE}/accounts/${selectedAccount['Account No']}/findings/${slNo}?datasetId=${activeDatasetId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(edits[slNo])
        });
      });
      
      await Promise.all(promises);
      await loadAccountDetails(selectedAccount['Account No']);
      setEdits({});
    } catch (error) {
      console.error("Error saving changes:", error);
      alert("An error occurred while saving.");
    }
    setSaving(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  if (!user) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <input 
        type="file" 
        accept=".xlsx, .xls" 
        style={{ display: 'none' }} 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
      />

      <header className="top-header" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span>Audit Analytics Dashboard</span>
          {datasets.length > 0 && (
            <select 
              value={activeDatasetId} 
              onChange={(e) => setActiveDatasetId(e.target.value)}
              className="input-field"
              style={{ padding: '6px 12px', width: '200px' }}
            >
              {datasets.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <form onSubmit={searchAccounts} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input 
              type="text" 
              className="input-field" 
              style={{ width: '200px', padding: '8px 12px' }}
              placeholder="Search Account..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={18} /> Search
            </button>
          </form>
          
          <button onClick={triggerUpload} disabled={uploading} className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', borderColor: 'white' }}>
            <Upload size={18} /> {uploading ? 'Importing...' : 'Import Excel'}
          </button>
          
          <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '12px', paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.3)' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user.username}</span>
            <button onClick={handleLogout} className="btn-outline" style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', color: 'white' }}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ flex: 1 }}>
        {datasets.length === 0 && !loading && (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', marginTop: '40px' }}>
            <h2 style={{ color: 'var(--bob-blue)' }}>Welcome, {user.username}!</h2>
            <p>Please import an Excel report to begin tracking audit findings.</p>
            <button onClick={triggerUpload} className="btn-primary" style={{ marginTop: '20px' }}>Import First Report</button>
          </div>
        )}

        {/* Global Overview */}
        {!selectedAccount && accounts.length === 0 && overview && overview.total_accounts > 0 && (
          <div className="animate-fade-in">
            <h1 style={{ color: 'var(--bob-blue-dark)', marginBottom: '24px' }}>Branch Overview</h1>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '32px' }}>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Portfolio Size</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--bob-blue)' }}>{formatCurrency(overview.total_sanctioned)}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>Across {overview.total_accounts} accounts</div>
              </div>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Outstanding</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--bob-orange)' }}>{formatCurrency(overview.total_outstanding)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
              <div className="glass-panel" style={{ padding: '24px', height: '350px' }}>
                <h3 style={{ marginTop: 0 }}>Risk Distribution</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={overview.risk_distribution} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                      {overview.risk_distribution.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="glass-panel" style={{ padding: '24px', height: '350px', overflowY: 'auto' }}>
                <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle color="var(--status-high-text)" size={20} /> Top Risky Accounts
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {overview.top_risky_accounts.map((acc: any, i: number) => (
                    <div key={i} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }} onClick={() => loadAccountDetails(acc['Account No'])} className="hover-lift">
                      <div style={{ fontWeight: 600, color: 'var(--bob-blue)' }}>{acc['Account Name']}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.85rem' }}>
                        <span>Account: {acc['Account No']}</span>
                        <span style={{ color: 'var(--status-high-text)', fontWeight: 600 }}>{acc['Total Findings']} Findings</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Results */}
        {!selectedAccount && accounts.length > 0 && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'var(--bob-blue-dark)', margin: 0 }}>Search Results ({accounts.length})</h2>
              <button className="btn-outline" onClick={() => { setAccounts([]); fetchOverview(activeDatasetId); }}>Clear Search</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
              {accounts.map((acc, i) => (
                <div 
                  key={i} 
                  className="glass-panel hover-lift" 
                  style={{ padding: '20px', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onClick={() => loadAccountDetails(acc['Account No'])}
                >
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--bob-blue)', marginBottom: '4px' }}>{acc['Account Name']}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Account No: {acc['Account No']}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <div><strong>Sanctioned:</strong> {formatCurrency(acc['Sanctioned Limit'] || 0)}</div>
                    <div><span className="status-badge risk-high">{acc['Total Findings']} Findings</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Account Details View */}
        {selectedAccount && (
          <div className="animate-fade-in">
            <button className="btn-outline" onClick={() => { setSelectedAccount(null); setEdits({}); if (accounts.length === 0) fetchOverview(activeDatasetId); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <ArrowLeft size={16} /> Back
            </button>
            
            <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
                
                {/* Account Metadata */}
                <div>
                  <h1 style={{ margin: '0 0 8px 0', color: 'var(--bob-blue-dark)' }}>{selectedAccount['Account Name']}</h1>
                  <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '1.1rem' }}>Account No: <strong>{selectedAccount['Account No']}</strong></p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                      <div className="meta-label">Product</div>
                      <div className="meta-value">{selectedAccount['Account Product'] || '-'}</div>
                    </div>
                    <div>
                      <div className="meta-label">Customer ID</div>
                      <div className="meta-value">{selectedAccount['Customer ID'] || '-'}</div>
                    </div>
                    <div>
                      <div className="meta-label">Sanctioned Date</div>
                      <div className="meta-value">{selectedAccount['Sanctioned Date'] || '-'}</div>
                    </div>
                    <div>
                      <div className="meta-label">Interest Rate</div>
                      <div className="meta-value">{selectedAccount['Interest Rate'] ? `${selectedAccount['Interest Rate']}%` : '-'}</div>
                    </div>
                  </div>
                </div>

                {/* Mini Chart */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px', textAlign: 'center' }}>Sanctioned vs Outstanding</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={[
                      { name: 'Sanctioned', value: selectedAccount['Sanctioned Limit'] || 0, fill: 'var(--bob-blue)' },
                      { name: 'Outstanding', value: selectedAccount['Outstanding Balance'] || 0, fill: 'var(--bob-orange)' }
                    ]}>
                      <Tooltip formatter={(value) => formatCurrency(value as number)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {
                          [0,1].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--bob-blue)' : 'var(--bob-orange)'} />
                          ))
                        }
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'var(--text-main)', margin: 0 }}>Audit Findings ({findings.length})</h2>
              {Object.keys(edits).length > 0 && (
                <button className="btn-primary" onClick={saveAllChanges} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Save size={18} /> {saving ? 'Saving...' : `Save ${Object.keys(edits).length} Updates`}
                </button>
              )}
            </div>
            
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '10%' }}>Risk</th>
                      <th style={{ width: '25%' }}>Observation</th>
                      <th style={{ width: '35%' }}>Comments & Updates</th>
                      <th style={{ width: '15%' }}>Add Comment</th>
                      <th style={{ width: '15%' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f, i) => {
                      const slNo = f['SL No'];
                      const riskClass = f.Risk === 'HIGH' ? 'risk-high' : f.Risk === 'MEDIUM' ? 'risk-medium' : 'risk-low';
                      
                      const currentStatus = edits[slNo]?.status ?? f.Status;
                      const sharedCommentInput = edits[slNo]?.shared_comment ?? '';
                      
                      return (
                        <tr key={i} className={edits[slNo] ? 'row-edited' : ''}>
                          <td>
                            <span className={`status-badge ${riskClass}`}>{f.Risk}</span>
                            <div style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px'}}>{f['Category Name']}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: '500', marginBottom: '8px', color: 'var(--bob-blue-dark)' }}>{f['Subcategory Name']}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.4' }}>{f['Observation (Audit Checkpoint)']}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '8px' }}>
                              {/* Original Auditor Comment */}
                              {f['Auditor Comment'] && (
                                <div style={{ fontSize: '0.85rem', background: 'var(--bg-gradient)', padding: '8px', borderRadius: '4px', borderLeft: '3px solid var(--bob-blue)' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--bob-blue-dark)', marginBottom: '2px' }}>{f['Auditor Name'] || 'Auditor'} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(Original)</span></div>
                                  <div style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>"{f['Auditor Comment']}"</div>
                                </div>
                              )}
                              {/* Threaded Comments */}
                              {f.comments?.map((c: any, idx: number) => (
                                <div key={idx} style={{ fontSize: '0.85rem', background: c.type === 'PRIVATE' ? 'rgba(255,237,213,0.5)' : '#f8fafc', padding: '8px', borderRadius: '4px', borderLeft: `3px solid ${c.type === 'PRIVATE' ? 'var(--bob-orange)' : 'var(--bob-blue)'}` }}>
                                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{c.username} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.type === 'PRIVATE' ? '(Private)' : ''}</span></span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                                  </div>
                                  <div>{c.text}</div>
                                </div>
                              ))}
                              {(!f.comments || f.comments.length === 0) && !f['Auditor Comment'] && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No comments yet.</div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <textarea 
                                className="inline-edit-input"
                                style={{ minHeight: '60px' }}
                                value={sharedCommentInput}
                                onChange={(e) => handleEditChange(slNo, 'shared_comment', e.target.value)}
                                placeholder="Write a comment..."
                              />
                            </div>
                          </td>
                          <td style={{ padding: '16px 8px' }}>
                            <select 
                              className={`status-select status-${(currentStatus || 'Not Complied').replace(/\s+/g, '-').toLowerCase()}`}
                              value={currentStatus || 'Not Complied'}
                              onChange={(e) => handleEditChange(slNo, 'status', e.target.value)}
                            >
                              <option value="Not Complied">Not Complied</option>
                              <option value="Partially Complied">Partially Complied</option>
                              <option value="Complied">Complied</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
