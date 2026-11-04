import { useState } from "react";
import type { PricingPlan } from "@semico/shared";
import {
  useAdminPricing,
  usePricingMutations,
} from "@/features/admin/useAdminCms";
import { PricingPlanForm } from "@/features/admin/PricingPlanForm";
import {
  CmsButton,
  CmsFeedback,
  CmsPagination,
} from "@/features/admin/CmsControls";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLocalized } from "../../hooks/useLocalized";
import { useTokens } from "../../hooks/useTokens";

export function AdminPricing() {
  const { t, lang } = useLanguage();
  const copy = t.admin.cms;
  const localize = useLocalized();
  const tokens = useTokens();
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<PricingPlan | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const query = useAdminPricing(page);
  const { save, toggle, remove } = usePricingMutations();
  const busy = save.isPending || toggle.isPending || remove.isPending;
  const result = query.isError ? undefined : query.data;
  function resetMessages() {
    save.reset();
    toggle.reset();
    remove.reset();
    setNotice("");
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.pricing}</h1>
          <p className="mt-2 text-sm" style={{ color: tokens.sec }}>
            {copy.pricingDescription}
          </p>
        </div>
        <CmsButton
          disabled={busy || editor !== null}
          onClick={() => {
            resetMessages();
            setEditor("new");
          }}
        >
          {copy.addPlan}
        </CmsButton>
      </div>
      {notice && (
        <p role="status" style={{ color: tokens.green }}>
          {notice}
        </p>
      )}
      {(toggle.isError || remove.isError) && (
        <p role="alert" style={{ color: tokens.crit }}>
          {copy.saveError}
        </p>
      )}
      {editor !== null && (
        <PricingPlanForm
          key={editor === "new" ? "new" : editor.id}
          initialPlan={editor === "new" ? undefined : editor}
          pending={busy}
          error={save.isError ? copy.saveError : null}
          onCancel={() => setEditor(null)}
          onSave={(input) => {
            resetMessages();
            save.mutate(
              { id: editor === "new" ? undefined : editor.id, input },
              {
                onSuccess: () => {
                  setEditor(null);
                  setPage(1);
                  setNotice(copy.saved);
                },
              },
            );
          }}
        />
      )}
      <CmsFeedback
        loading={query.isPending}
        error={query.isError}
        retry={() => {
          void query.refetch();
        }}
      />
      {result && result.data.length === 0 && <p>{copy.noPlans}</p>}
      {result && result.data.length > 0 && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: tokens.border }}
        >
          <table
            className="w-full min-w-[620px] text-sm text-start"
            aria-label={t.admin.pricing}
            style={{ background: tokens.card }}
          >
            <thead style={{ background: tokens.thead }}>
              <tr>
                <th scope="col" className="p-4 text-start">
                  {t.admin.pricing}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.price}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.status}
                </th>
                <th scope="col" className="p-4 text-start">
                  {copy.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((plan) => (
                <tr
                  key={plan.id}
                  className="border-t"
                  style={{ borderColor: tokens.border }}
                >
                  <td className="p-4">
                    <bdi>{localize(plan.name)}</bdi>
                  </td>
                  <td className="p-4">
                    <bdi>
                      {new Intl.NumberFormat(
                        lang === "ar" ? "ar-DZ" : "en-GB",
                        { style: "currency", currency: plan.currency },
                      ).format(plan.price)}
                    </bdi>
                  </td>
                  <td className="p-4">
                    {plan.isActive ? copy.active : copy.inactive}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-2">
                      <CmsButton
                        disabled={busy || editor !== null}
                        onClick={() => {
                          resetMessages();
                          setEditor(plan);
                        }}
                      >
                        {copy.edit}
                      </CmsButton>
                      <CmsButton
                        disabled={busy || editor !== null}
                        onClick={() => {
                          resetMessages();
                          toggle.mutate(
                            { id: plan.id, isActive: !plan.isActive },
                            { onSuccess: () => setNotice(copy.saved) },
                          );
                        }}
                      >
                        {plan.isActive ? copy.deactivate : copy.activate}
                      </CmsButton>
                      <CmsButton
                        danger
                        disabled={busy || editor !== null}
                        onClick={() => {
                          if (!window.confirm(copy.deletePlanConfirm)) return;
                          resetMessages();
                          remove.mutate(plan.id, {
                            onSuccess: () => {
                              setPage(1);
                              setNotice(copy.saved);
                            },
                          });
                        }}
                      >
                        {copy.delete}
                      </CmsButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CmsPagination
        meta={result?.meta}
        busy={busy || editor !== null}
        onPageChange={setPage}
      />
    </div>
  );
}
