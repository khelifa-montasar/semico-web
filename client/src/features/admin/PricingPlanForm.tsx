import { useState, type FormEvent } from "react";
import {
  createPricingPlanSchema,
  type CreatePricingPlanInput,
  type PricingPlan,
} from "@semico/shared";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { CmsButton, CmsField } from "./CmsControls";
import {
  pricingFormDefaults,
  pricingFormInput,
  type PricingFormState,
} from "./cmsForms";

interface PricingPlanFormProps {
  initialPlan?: PricingPlan;
  pending?: boolean;
  error?: string | null;
  onSave: (input: CreatePricingPlanInput) => void;
  onCancel: () => void;
}

export function PricingPlanForm({
  initialPlan,
  pending,
  error,
  onSave,
  onCancel,
}: PricingPlanFormProps) {
  const { t } = useLanguage();
  const copy = t.admin.cms;
  const tokens = useTokens();
  const [form, setForm] = useState(() => pricingFormDefaults(initialPlan));
  const [invalid, setInvalid] = useState(false);
  function change(fields: Partial<PricingFormState>) {
    setForm((current) => ({ ...current, ...fields }));
    setInvalid(false);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createPricingPlanSchema.safeParse(pricingFormInput(form));
    if (!result.success) {
      setInvalid(true);
      return;
    }
    onSave(result.data);
  }
  return (
    <form
      onSubmit={submit}
      className="rounded-xl border p-5 space-y-4"
      style={{ background: tokens.card, borderColor: tokens.border }}
    >
      <h2 className="text-lg font-medium">
        {initialPlan ? copy.edit : copy.addPlan}
      </h2>
      {(invalid || error) && (
        <p role="alert" style={{ color: tokens.crit }}>
          {invalid ? copy.invalidInput : error}
        </p>
      )}
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <CmsField
            label={copy.nameEn}
            language="en"
            value={form.nameEn}
            onChange={(value) => change({ nameEn: value })}
            required
            maxLength={200}
          />
          <CmsField
            label={copy.nameAr}
            language="ar"
            value={form.nameAr}
            onChange={(value) => change({ nameAr: value })}
            required
            maxLength={200}
          />
          <CmsField
            label={copy.price}
            type="number"
            language="en"
            value={form.price}
            onChange={(value) => change({ price: value })}
            required
            min={0}
            step="any"
          />
          <CmsField
            label={copy.currency}
            language="en"
            value={form.currency}
            onChange={(value) => change({ currency: value })}
            required
            maxLength={3}
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{copy.features}</h3>
          {form.features.map((feature, index) => (
            <div
              key={index}
              role="group"
              aria-label={`${copy.features} ${index + 1}`}
              className="rounded-lg border p-3 space-y-3"
              style={{ borderColor: tokens.border }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <CmsField
                  label={`${copy.featureEn} ${index + 1}`}
                  language="en"
                  value={feature.en}
                  required
                  maxLength={240}
                  onChange={(value) =>
                    change({
                      features: form.features.map((entry, position) =>
                        position === index ? { ...entry, en: value } : entry,
                      ),
                    })
                  }
                />
                <CmsField
                  label={`${copy.featureAr} ${index + 1}`}
                  language="ar"
                  value={feature.ar}
                  required
                  maxLength={240}
                  onChange={(value) =>
                    change({
                      features: form.features.map((entry, position) =>
                        position === index ? { ...entry, ar: value } : entry,
                      ),
                    })
                  }
                />
              </div>
              <CmsButton
                danger
                onClick={() =>
                  change({
                    features: form.features.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                {copy.removeFeature} {index + 1}
              </CmsButton>
            </div>
          ))}
          <CmsButton
            disabled={form.features.length >= 50}
            onClick={() =>
              change({ features: [...form.features, { en: "", ar: "" }] })
            }
          >
            {copy.addFeature}
          </CmsButton>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => change({ isActive: event.target.checked })}
          />
          {copy.active}
        </label>
        <div className="flex gap-3">
          <CmsButton type="submit">{copy.save}</CmsButton>
          <CmsButton onClick={onCancel}>{copy.cancel}</CmsButton>
        </div>
      </fieldset>
    </form>
  );
}
