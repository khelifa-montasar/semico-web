import { useState } from "react";
import { FARM_TIMEZONE } from "@semico/shared";
import {
  useAdminFarms,
  useSetFarmStatus,
} from "@/features/admin/useAdminOversight";
import { nextFarmStatus } from "@/features/admin/oversightActions";
import {
  CmsButton,
  CmsFeedback,
  CmsPagination,
} from "@/features/admin/CmsControls";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTokens } from "../../hooks/useTokens";

export function AdminFarms() {
  const { t, lang } = useLanguage();
  const copy = t.admin.oversight;
  const tokens = useTokens();
  const [page, setPage] = useState(1);
  const query = useAdminFarms(page);
  const change = useSetFarmStatus();
  const result = query.isError ? undefined : query.data;
  const dates = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "en-GB", {
    dateStyle: "medium",
    timeZone: FARM_TIMEZONE,
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.admin.farms}</h1>
        <p className="mt-2 text-sm" style={{ color: tokens.sec }}>
          {copy.farmsDescription}
        </p>
      </div>
      {change.isSuccess && (
        <p role="status" style={{ color: tokens.green }}>
          {copy.updated}
        </p>
      )}
      {change.isError && (
        <p role="alert" style={{ color: tokens.crit }}>
          {copy.changeError}
        </p>
      )}
      <CmsFeedback
        loading={query.isPending}
        error={query.isError}
        retry={() => {
          void query.refetch();
        }}
      />
      {result && result.data.length === 0 && <p>{copy.noFarms}</p>}
      {result && result.data.length > 0 && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: tokens.border }}
        >
          <table
            className="w-full min-w-[780px] text-sm text-start"
            aria-label={t.admin.farms}
            style={{ background: tokens.card }}
          >
            <thead style={{ background: tokens.thead }}>
              <tr>
                <th scope="col" className="p-4 text-start">
                  {t.admin.farmName}
                </th>
                <th scope="col" className="p-4 text-start">
                  {t.admin.owner}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.status}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.workers}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.createdAt}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((farm) => (
                <tr
                  key={farm.id}
                  className="border-t"
                  style={{ borderColor: tokens.border }}
                >
                  <td className="p-4">
                    <bdi>{farm.name}</bdi>
                    <p className="mt-1 text-xs" style={{ color: tokens.sec }}>
                      <bdi dir="ltr">{farm.id}</bdi>
                    </p>
                  </td>
                  <td className="p-4">
                    <bdi>{farm.owner.fullName}</bdi>
                    <p className="mt-1 text-xs" style={{ color: tokens.sec }}>
                      <bdi dir="ltr">{farm.owner.email}</bdi>
                    </p>
                  </td>
                  <td className="p-4">
                    {farm.status === "ACTIVE" ? copy.active : copy.suspended}
                  </td>
                  <td className="p-4">{farm.workerCount}</td>
                  <td className="p-4">
                    <time dateTime={farm.createdAt}>
                      {dates.format(new Date(farm.createdAt))}
                    </time>
                  </td>
                  <td className="p-4">
                    <CmsButton
                      danger={farm.status === "ACTIVE"}
                      disabled={change.isPending}
                      onClick={() => {
                        const status = nextFarmStatus(farm.status);
                        if (
                          !window.confirm(
                            `${status === "SUSPENDED" ? copy.suspendConfirm : copy.resumeConfirm}\n\n${farm.name}`,
                          )
                        )
                          return;
                        change.reset();
                        change.mutate({ id: farm.id, input: { status } });
                      }}
                    >
                      {farm.status === "ACTIVE" ? copy.suspend : copy.resume}
                    </CmsButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CmsPagination
        meta={result?.meta}
        busy={change.isPending}
        onPageChange={setPage}
      />
    </div>
  );
}
