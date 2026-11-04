import { RefreshCw, Radio, Sprout, Users } from "lucide-react";
import { FARM_TIMEZONE } from "@semico/shared";
import { useAdminStats } from "@/features/admin/useAdminStats";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTokens } from "../../hooks/useTokens";

export function AdminDashboard() {
  const { data, isPending, isError, isFetching, refetch, dataUpdatedAt } = useAdminStats();
  const { t, lang } = useLanguage();
  const c = useTokens();
  const a = t.admin;
  // A permission or network failure must not present stale platform data as current.
  const stats = isError ? undefined : data;
  const locale = lang === "ar" ? "ar-DZ" : "en-GB";
  const numbers = new Intl.NumberFormat(locale);
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: FARM_TIMEZONE });
  const cards = [
    { label: a.totalFarms, value: stats?.totalFarms, Icon: Sprout },
    { label: a.totalUsers, value: stats?.totalUsers, Icon: Users },
    { label: a.totalActiveMqttDevices, value: stats?.totalActiveMqttDevices, Icon: Radio },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{a.dashboard}</h1>
          <p className="mt-2 text-sm" style={{ color: c.sec }}>{a.description}</p>
        </div>
        <button type="button" disabled={isFetching} onClick={() => { void refetch(); }}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
          style={{ borderColor: c.border, background: c.card }}>
          <RefreshCw size={16} aria-hidden="true" className={isFetching ? "animate-spin" : ""} />{a.refresh}
        </button>
      </div>
      {isPending && <p role="status" className="text-sm" style={{ color: c.sec }}>{a.loading}</p>}
      {isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          style={{ color: c.crit, borderColor: c.crit, background: c.card }}>
          <p className="text-sm">{a.loadError}</p>
          <button type="button" disabled={isFetching} onClick={() => { void refetch(); }}
            className="text-sm underline disabled:opacity-50">{a.retry}</button>
        </div>
      )}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-busy={isPending}>
        {cards.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border p-5" style={{ background: c.card, borderColor: c.border }}>
            <dt className="flex items-center justify-between gap-3 text-sm" style={{ color: c.sec }}>
              {label}<Icon size={20} aria-hidden="true" style={{ color: c.green }} />
            </dt>
            <dd className="mt-4 text-3xl font-semibold"><bdi>{value === undefined ? "—" : numbers.format(value)}</bdi></dd>
          </div>
        ))}
      </dl>
      <p className="text-xs" style={{ color: c.sec }}>{a.mqttActivityHint}</p>
      <section className="rounded-xl border overflow-hidden" style={{ background: c.card, borderColor: c.border }}
        aria-labelledby="recent-farms-title">
        <div className="p-5 border-b" style={{ borderColor: c.border }}>
          <h2 id="recent-farms-title" className="text-base font-semibold">{a.recentFarmSignups}</h2>
          <p className="mt-1 text-sm" style={{ color: c.sec }}>{a.recentFarmHint}</p>
        </div>
        {stats && stats.recentFarms.length === 0 && <p className="p-6 text-sm" style={{ color: c.sec }}>{a.noFarms}</p>}
        {stats && stats.recentFarms.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[580px] text-start text-sm" aria-labelledby="recent-farms-title">
              <thead style={{ background: c.thead, color: c.sec }}>
                <tr>
                  <th scope="col" className="px-5 py-3 text-start font-medium">{a.farmName}</th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">{a.owner}</th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">{a.signupDate}</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentFarms.map((farm) => (
                  <tr key={farm.id} className="border-t" style={{ borderColor: c.border }}>
                    <td className="px-5 py-4 font-medium"><bdi>{farm.name}</bdi></td>
                    <td className="px-5 py-4">
                      <bdi>{farm.owner.fullName}</bdi>
                      <p className="mt-1 text-xs" style={{ color: c.sec }}><bdi dir="ltr">{farm.owner.email}</bdi></p>
                    </td>
                    <td className="px-5 py-4"><time dateTime={farm.createdAt}><bdi>{dates.format(new Date(farm.createdAt))}</bdi></time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {stats && dataUpdatedAt > 0 && <p className="text-xs" style={{ color: c.sec }}>
        {a.lastUpdated}: <bdi>{new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: FARM_TIMEZONE }).format(new Date(dataUpdatedAt))}</bdi>
      </p>}
    </div>
  );
}
