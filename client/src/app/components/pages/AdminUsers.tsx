import { useState } from "react";
import {
  FARM_TIMEZONE,
  type Role,
  type UserStatus,
  type WorkerType,
} from "@semico/shared";
import { useAuth } from "@/features/auth/AuthContext";
import {
  useAdminUsers,
  useSetUserStatus,
} from "@/features/admin/useAdminOversight";
import {
  canChangeUserStatus,
  nextUserStatus,
} from "@/features/admin/oversightActions";
import {
  CmsButton,
  CmsFeedback,
  CmsPagination,
} from "@/features/admin/CmsControls";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTokens } from "../../hooks/useTokens";

export function AdminUsers() {
  const { t, lang } = useLanguage();
  const { user: actor } = useAuth();
  const copy = t.admin.oversight;
  const tokens = useTokens();
  const [page, setPage] = useState(1);
  const query = useAdminUsers(page);
  const change = useSetUserStatus();
  const result = query.isError ? undefined : query.data;
  const dates = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "en-GB", {
    dateStyle: "medium",
    timeZone: FARM_TIMEZONE,
  });
  const roles: Record<Role, string> = {
    OWNER: copy.owner,
    WORKER: copy.worker,
    SUPER_ADMIN: copy.superAdmin,
  };
  const statuses: Record<UserStatus, string> = {
    ACTIVE: copy.active,
    DISABLED: copy.disabled,
    INVITED: copy.invited,
  };
  const workerTypes: Record<WorkerType, string> = {
    OPERATOR: copy.operator,
    ENGINEER: copy.engineer,
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.admin.users}</h1>
        <p className="mt-2 text-sm" style={{ color: tokens.sec }}>
          {copy.usersDescription}
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
      {result && result.data.length === 0 && <p>{copy.noUsers}</p>}
      {result && result.data.length > 0 && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: tokens.border }}
        >
          <table
            className="w-full min-w-[850px] text-sm text-start"
            aria-label={t.admin.users}
            style={{ background: tokens.card }}
          >
            <thead style={{ background: tokens.thead }}>
              <tr>
                <th scope="col" className="p-4 text-start">
                  {copy.user}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.role}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.status}
                </th>
                <th scope="col" className="p-4 text-start">
                  {t.admin.farms}
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
              {result.data.map((user) => {
                const farms =
                  user.role === "OWNER"
                    ? user.ownedFarms
                    : user.farm
                      ? [user.farm]
                      : [];
                const permitted = canChangeUserStatus(actor?.id, user);
                const status = nextUserStatus(user);
                return (
                  <tr
                    key={user.id}
                    className="border-t"
                    style={{ borderColor: tokens.border }}
                  >
                    <td className="p-4">
                      <bdi>{user.fullName}</bdi>
                      <p className="mt-1 text-xs" style={{ color: tokens.sec }}>
                        <bdi dir="ltr">{user.email}</bdi>
                      </p>
                    </td>
                    <td className="p-4">
                      {roles[user.role] ?? user.role}
                      {user.role === "WORKER" && user.workerType && (
                        <p
                          className="mt-1 text-xs"
                          style={{ color: tokens.sec }}
                        >
                          {workerTypes[user.workerType] ?? user.workerType}
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      {statuses[
                        user.platformDisabled ? "DISABLED" : user.status
                      ] ?? user.status}
                      {user.platformDisabled && (
                        <p
                          className="mt-1 text-xs"
                          style={{ color: tokens.crit }}
                        >
                          {copy.platformLock}
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      {farms.length === 0
                        ? copy.noFarm
                        : farms.map((farm) => (
                            <p key={farm.id}>
                              <bdi>{farm.name}</bdi>
                            </p>
                          ))}
                    </td>
                    <td className="p-4">
                      <time dateTime={user.createdAt}>
                        {dates.format(new Date(user.createdAt))}
                      </time>
                    </td>
                    <td className="p-4">
                      <CmsButton
                        danger={status === "DISABLED"}
                        disabled={change.isPending || !permitted}
                        title={!permitted ? copy.selfProtected : undefined}
                        onClick={() => {
                          if (
                            !permitted ||
                            !window.confirm(
                              `${status === "DISABLED" ? copy.disableConfirm : copy.enableConfirm}\n\n${user.email}`,
                            )
                          )
                            return;
                          change.reset();
                          change.mutate({ id: user.id, input: { status } });
                        }}
                      >
                        {status === "DISABLED" ? copy.disable : copy.enable}
                      </CmsButton>
                      {!permitted && (
                        <p
                          className="mt-1 text-xs"
                          style={{ color: tokens.sec }}
                        >
                          {copy.currentAccount}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
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
