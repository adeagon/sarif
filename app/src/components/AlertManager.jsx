import { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2, Play, X, ChevronDown, ChevronUp, RefreshCw, ExternalLink, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { PROGRAMS, CABINS, TRANSFER_TO_KEYS, bookLink, fmt, fmtDate, fmtTaxes } from '../utils/awardConstants.js';

// All unique transferable program keys (for multi-select)
const ALL_PROGRAM_KEYS = [...new Set(Object.values(TRANSFER_TO_KEYS).flat())].sort();

function StatusBadge({ status }) {
  if (status === 'new')       return <span className="inline-flex items-center gap-1 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded px-1.5 py-0.5">New</span>;
  if (status === 'active')    return <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5">Active</span>;
  if (status === 'expired')   return <span className="inline-flex items-center gap-1 text-xs bg-slate-500/20 text-slate-500 border border-slate-600/30 rounded px-1.5 py-0.5">Expired</span>;
  if (status === 'dismissed') return <span className="inline-flex items-center gap-1 text-xs bg-slate-500/10 text-slate-600 border border-slate-700/30 rounded px-1.5 py-0.5">Dismissed</span>;
  return null;
}

function RunStatusIcon({ status }) {
  if (status === 'ok')      return <CheckCircle size={12} className="text-emerald-400" />;
  if (status === 'error')   return <AlertCircle size={12} className="text-red-400" />;
  if (status === 'skipped') return <Clock       size={12} className="text-slate-500" />;
  return null;
}

function CabinLabel({ cabin }) {
  return CABINS.find(c => c.key === cabin)?.label || cabin;
}

function AlertCard({ alert, onToggle, onDelete, onRun, running }) {
  const [expanded, setExpanded] = useState(false);
  const [matches,  setMatches]  = useState(null);
  const [runs,     setRuns]     = useState(null);

  async function loadDetails() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    const [mRes, rRes] = await Promise.all([
      fetch(`/api/alerts/${alert.id}/matches`).then(r => r.json()),
      fetch(`/api/alerts/${alert.id}/runs`).then(r => r.json()),
    ]);
    setMatches(mRes);
    setRuns(rRes);
  }

  async function handleDismiss(matchId) {
    await fetch(`/api/alerts/matches/${matchId}/dismiss`, { method: 'POST' });
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'dismissed' } : m));
  }

  const activeMatches = (matches || []).filter(m => m.status !== 'dismissed' && m.status !== 'expired');
  const hasMatches    = (alert.match_count || 0) > 0;

  return (
    <div className={`rounded-2xl border bg-white/5 overflow-hidden transition-colors ${
      alert.enabled ? 'border-white/10' : 'border-white/5 opacity-60'
    }`}>
      <div className="p-4 flex items-center gap-3 flex-wrap">
        {/* Enable/disable toggle */}
        <button
          onClick={() => onToggle(alert.id, !alert.enabled)}
          className={`w-8 h-4 rounded-full flex-shrink-0 transition-colors relative ${alert.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
          title={alert.enabled ? 'Disable alert' : 'Enable alert'}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${alert.enabled ? 'left-4' : 'left-0.5'}`} />
        </button>

        {/* Route info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-white text-sm">{alert.origin} → {alert.destination}</span>
            <span className="text-xs bg-slate-700/50 border border-white/10 rounded px-1.5 py-0.5 text-slate-400">
              <CabinLabel cabin={alert.cabin} />
            </span>
            {alert.date_from && <span className="text-xs text-slate-500">{fmtDate(alert.date_from)}{alert.date_to ? ` – ${fmtDate(alert.date_to)}` : '+'}</span>}
            {alert.max_miles && <span className="text-xs text-slate-500">≤{fmt(alert.max_miles)}</span>}
            {alert.transferable ? <span className="text-xs bg-violet-500/15 border border-violet-500/30 text-violet-400 rounded px-1.5 py-0.5">Transferable only</span> : null}
            {hasMatches && (
              <span className="text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded px-1.5 py-0.5">
                {alert.match_count} match{alert.match_count !== 1 ? 'es' : ''}
              </span>
            )}
            {alert.name && <span className="text-xs text-slate-500 truncate">{alert.name}</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {alert.last_run_status && <RunStatusIcon status={alert.last_run_status} />}
            {alert.last_run_at && (
              <span className="text-xs text-slate-600">
                Last run {new Date(alert.last_run_at + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {alert.last_run_error && (
              <span className="text-xs text-red-400 truncate max-w-xs">{alert.last_run_error}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onRun(alert.id)}
            disabled={running}
            title="Run now"
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 disabled:opacity-40 transition-colors">
            {running ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
            Run
          </button>
          <button onClick={loadDetails} title="View matches & history"
            className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={() => onDelete(alert.id)} title="Delete alert"
            className="text-slate-600 hover:text-red-400 transition-colors p-1">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/5 p-4 space-y-4">
          {/* Matches */}
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
              Matches
              <span className="inline-flex items-center gap-1 text-slate-600 font-normal normal-case tracking-normal bg-white/5 border border-white/8 rounded px-1.5 py-0.5 text-xs">
                Cached — seats.aero data, verify before booking
              </span>
            </div>
            {!matches && <div className="text-xs text-slate-500 flex items-center gap-1"><RefreshCw size={11} className="animate-spin" /> Loading...</div>}
            {matches && activeMatches.length === 0 && (
              <p className="text-xs text-slate-600">No active matches yet — run now or wait for the next poll.</p>
            )}
            {activeMatches.length > 0 && (
              <div className="space-y-2">
                {activeMatches.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-white/3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-white text-sm">{fmt(m.miles)}</span>
                        <span className="text-xs text-slate-500">{fmtDate(m.date)}</span>
                        {m.taxes > 0 && <span className="text-xs text-slate-500">+{fmtTaxes(m.taxes)} taxes</span>}
                        {m.direct ? <span className="text-xs text-emerald-400">direct</span> : null}
                        {m.seats > 0 && <span className="text-xs text-slate-500">{m.seats} seats</span>}
                        <span className="text-xs text-slate-500">{PROGRAMS[m.source]?.name || m.source}</span>
                        {m.destination_airport && m.destination_airport !== alert.destination && (
                          <span className="text-xs font-mono text-slate-400">{m.origin_airport}–{m.destination_airport}</span>
                        )}
                        <StatusBadge status={m.status} />
                      </div>
                      {m.airlines && <div className="text-xs text-slate-600 mt-0.5">{m.airlines}</div>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={bookLink(m.source, m.origin_airport || alert.origin, m.destination_airport || alert.destination)}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 rounded-md px-2 py-0.5 transition-colors">
                        Book <ExternalLink size={9} />
                      </a>
                      <button onClick={() => handleDismiss(m.id)}
                        className="text-slate-600 hover:text-slate-400 transition-colors" title="Dismiss">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Run history */}
          {runs && runs.length > 0 && (
            <div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Recent runs</div>
              <div className="space-y-1">
                {runs.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-xs text-slate-500">
                    <RunStatusIcon status={r.status} />
                    <span className="font-mono">{new Date(r.ran_at + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {r.matches_new > 0 && <span className="text-emerald-400">+{r.matches_new} new</span>}
                    {r.matches_seen > 0 && <span className="text-slate-600">{r.matches_seen} seen</span>}
                    {r.error && <span className="text-red-400 truncate max-w-xs">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  name: '', origin: '', destination: '', cabin: 'J',
  date_from: '', date_to: '',
  max_miles: '', max_taxes: '', min_seats: '1',
  direct_only: false, transferable: false,
  programs: [],
};

export default function AlertManager({ alertPrefill }) {
  const [alerts,      setAlerts]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [creating,    setCreating]    = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [runningId,   setRunningId]   = useState(null);
  const [error,       setError]       = useState(null);
  const [successMsg,  setSuccessMsg]  = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res  = await fetch('/api/alerts');
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch { /* server may not be up yet */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Pre-fill from "Create Alert" in Award Search
  useEffect(() => {
    if (!alertPrefill) return;
    setForm(f => ({
      ...f,
      origin:      alertPrefill.origin      || f.origin,
      destination: alertPrefill.destination || f.destination,
      cabin:       alertPrefill.cabin       || f.cabin,
      date_from:   alertPrefill.dateFrom    || f.date_from,
      date_to:     alertPrefill.dateTo      || f.date_to,
      transferable: alertPrefill.transferable ?? f.transferable,
    }));
    setCreating(true);
  }, [alertPrefill]);

  // SSE listener for new matches
  useEffect(() => {
    const es = new EventSource('/api/alerts/events');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'match') fetchAlerts();
      } catch { /* ignore malformed */ }
    };
    return () => es.close();
  }, [fetchAlerts]);

  function fieldSet(key) {
    return (e) => setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    const body = {
      ...form,
      max_miles:  form.max_miles  ? parseInt(form.max_miles,  10) : null,
      max_taxes:  form.max_taxes  ? parseInt(form.max_taxes,  10) : null,
      min_seats:  form.min_seats  ? parseInt(form.min_seats,  10) : 1,
      direct_only: form.direct_only ? 1 : 0,
      transferable: form.transferable ? 1 : 0,
      programs:   form.programs.join(',') || null,
    };
    const res  = await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) { setError(data.message); return; }
    setAlerts(prev => [data, ...prev]);
    setForm(EMPTY_FORM);
    setCreating(false);
    setSuccessMsg('Alert created — it will run on the next poll or click Run Now.');
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function handleToggle(id, enabled) {
    const res  = await fetch(`/api/alerts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabled ? 1 : 0 }) });
    const data = await res.json();
    setAlerts(prev => prev.map(a => a.id === id ? data : a));
  }

  async function handleDelete(id) {
    if (!confirm('Delete this alert and all its matches?')) return;
    await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  async function handleRun(id) {
    setRunningId(id);
    setError(null);
    try {
      const res  = await fetch(`/api/alerts/${id}/run`, { method: 'POST' });
      const data = await res.json();
      setRunningId(null);
      if (data.error) {
        if (data.code === 'RATE_LIMITED') {
          setError('Rate limited by Seats.aero — please wait a few minutes before retrying.');
        } else if (data.code === 'ALREADY_RUNNING') {
          setError('Alert is already running — please wait for it to complete.');
        } else {
          setError(data.message || 'Error running alert.');
        }
        setTimeout(() => setError(null), 6000);
        return;
      }
      // Re-fetch to get updated match counts
      fetchAlerts();
      if (data.matchesNew > 0) {
        setSuccessMsg(`Found ${data.matchesNew} new match${data.matchesNew !== 1 ? 'es' : ''}!`);
      } else {
        setSuccessMsg(`No new matches (${data.matchesSeen} previously seen).`);
      }
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch {
      setRunningId(null);
      setError('Could not reach the server — check your connection.');
      setTimeout(() => setError(null), 6000);
    }
  }

  function toggleProgram(key) {
    setForm(f => ({
      ...f,
      programs: f.programs.includes(key)
        ? f.programs.filter(k => k !== key)
        : [...f.programs, key],
    }));
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bell size={18} className="text-amber-400" /> Award Alerts
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Monitor routes for award availability — polled every 15 min via Seats.aero cached search.</p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors">
          {creating ? <X size={14} /> : <Plus size={14} />}
          {creating ? 'Cancel' : 'New Alert'}
        </button>
      </div>

      {/* Feedback */}
      {error      && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
      {successMsg && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">{successMsg}</div>}

      {/* Create form */}
      {creating && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Create Alert</h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">From *</label>
              <input value={form.origin} onChange={fieldSet('origin')} required placeholder="LAX"
                maxLength={4} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">To *</label>
              <input value={form.destination} onChange={fieldSet('destination')} required placeholder="NRT"
                maxLength={4} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Cabin *</label>
              <select value={form.cabin} onChange={fieldSet('cabin')}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
                {CABINS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Name (optional)</label>
              <input value={form.name} onChange={fieldSet('name')} placeholder="Summer trip to Tokyo"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date from</label>
              <input type="date" value={form.date_from} onChange={fieldSet('date_from')}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date to</label>
              <input type="date" min={form.date_from} value={form.date_to} onChange={fieldSet('date_to')}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Max miles</label>
              <input type="number" value={form.max_miles} onChange={fieldSet('max_miles')} placeholder="75000" min="0"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Max taxes ($)</label>
              <input type="number" value={form.max_taxes} onChange={fieldSet('max_taxes')} placeholder="200" min="0"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>

          <div className="flex items-center gap-5 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
              <input type="checkbox" checked={form.direct_only} onChange={fieldSet('direct_only')} className="rounded accent-blue-500" />
              Direct only
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
              <input type="checkbox" checked={form.transferable} onChange={fieldSet('transferable')} className="rounded accent-blue-500" />
              Transferable programs only
            </label>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Min seats</label>
              <input type="number" value={form.min_seats} onChange={fieldSet('min_seats')} min="1" max="9"
                className="w-16 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>

          {/* Program filter */}
          <div>
            <label className="text-xs text-slate-500 block mb-2">Programs to watch (leave empty for all)</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_PROGRAM_KEYS.map(key => (
                <button key={key} type="button"
                  onClick={() => toggleProgram(key)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    form.programs.includes(key)
                      ? 'bg-blue-500/25 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
                  }`}>
                  {PROGRAMS[key]?.name || key}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
              <Bell size={14} /> Create Alert
            </button>
            <button type="button" onClick={() => { setCreating(false); setForm(EMPTY_FORM); }}
              className="text-sm px-4 py-2 rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Alerts list */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
          <RefreshCw size={14} className="animate-spin" /> Loading alerts...
        </div>
      )}

      {!loading && alerts.length === 0 && !creating && (
        <div className="rounded-2xl border border-white/8 bg-white/3 p-10 text-center space-y-2">
          <Bell size={24} className="text-slate-600 mx-auto" />
          <p className="text-slate-400 text-sm">No alerts yet</p>
          <p className="text-slate-600 text-xs">Create an alert to be notified when award seats match your criteria.</p>
        </div>
      )}

      {alerts.map(alert => (
        <AlertCard
          key={alert.id}
          alert={alert}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onRun={handleRun}
          running={runningId === alert.id}
        />
      ))}
    </div>
  );
}
