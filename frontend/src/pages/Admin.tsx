import { useAdminStats } from '../lib/queries';
import { Eyebrow, Spinner } from '../components/ui';

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-3xl tabular-nums">{value.toLocaleString()}</dd>
      {note && <dd className="mt-1 text-xs text-muted">{note}</dd>}
    </div>
  );
}

export function AdminPage() {
  const { data, isLoading, error } = useAdminStats();
  return (
    <div className="container-page py-12 sm:py-16">
      <Eyebrow>Admin</Eyebrow>
      <h1 className="mt-3 text-3xl font-medium sm:text-5xl">Usage overview</h1>
      <p className="mt-2 text-muted">Aggregate counts only — individual answers are never shown here.</p>
      {isLoading && <div className="mt-8"><Spinner label="Loading stats" /></div>}
      {error && <p className="mt-8 text-danger">{error.message}</p>}
      {data && (
        <>
          <h2 className="mt-10 text-xl font-medium">Users</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile label="Total" value={data.users.total} note={`${data.users.verified} verified`} />
            <Tile label="New this week" value={data.users.week} note={`${data.users.month} in 30 days`} />
            <Tile label="Standard" value={data.users.plans.standard} />
            <Tile label="Premium" value={data.users.plans.premium} note={`${data.users.plans.free} on Free`} />
          </dl>
          <h2 className="mt-10 text-xl font-medium">Practice</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile label="Assessed sessions" value={data.practices.complete} note={`${data.practices.mock} mock tests`} />
            <Tile label="This week" value={data.practices.week} />
            <Tile label="Active users (7 days)" value={data.practices.active_week} />
            <Tile label="Failed assessments" value={data.practices.failed} />
          </dl>
          <h2 className="mt-10 text-xl font-medium">Newsletter</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile label="Confirmed" value={data.subscribers.confirmed} note={`${data.subscribers.total - data.subscribers.confirmed} awaiting confirmation`} />
          </dl>
          <h2 className="mt-10 text-xl font-medium">Last 14 days</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-muted">
                <tr><th className="px-4 py-2.5 font-medium">Day</th><th className="px-4 py-2.5 font-medium">Signups</th><th className="px-4 py-2.5 font-medium">Sessions</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...data.daily].reverse().map(d => (
                  <tr key={d.day}>
                    <td className="px-4 py-2">{new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                    <td className="px-4 py-2">{d.signups}</td>
                    <td className="px-4 py-2">{d.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
