import { useEffect, useState } from 'react';
import { tcsApi } from '../api';
import { TcsPageHeader, TcsSearchBar } from '../components/TcsPageHeader';

interface AuditLogEntry {
  id: number;
  actor: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  created_at: string | null;
}

export function LogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [q, setQ] = useState('');

  const load = () => tcsApi<AuditLogEntry[]>(`/api/tcs/logs${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setLogs);
  useEffect(() => { load(); }, [q]);

  return (
    <div>
      <TcsPageHeader
        title="Logs"
        description="Platform-wide audit trail. For organization-specific activity, open an organization and use the Logs tab."
      />

      <TcsSearchBar value={q} onChange={setQ} onReset={() => setQ('')} placeholder="Search logs by actor, action, or details" />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden ring-1 ring-slate-200/60">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Actor</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium">Entity</th>
              <th className="px-4 py-3 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No log entries found.</td></tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-slate-700">{log.actor || 'system'}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">{log.action}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="text-xs">{log.entity_type}</span>
                  {log.entity_id && <span className="text-slate-400 ml-1 font-mono text-xs">#{log.entity_id}</span>}
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-md truncate" title={log.details || ''}>{log.details || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
