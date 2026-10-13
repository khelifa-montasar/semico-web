import { useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLocalized } from "../../hooks/useLocalized";
import { ConsultationBooking } from "../ConsultationBooking";
import { useContentBundle } from "../../../features/content/useContent";
import { useCreateLead } from "../../../features/leads/useLeads";

export function Services() {
  const { t, lang, isRTL, font } = useLanguage();
  const L = useLocalized();
  const s = t.services;
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [bookingModal, setBookingModal] = useState(false);

  // The lead form was previously uncontrolled and submitted nowhere — it advanced to a thank-you
  // step promising contact within 24 hours while sending nothing. It now posts to `/leads`.
  const [leadForm, setLeadForm] = useState({ name: "", email: "", phone: "", landArea: "" });
  const [leadError, setLeadError] = useState<string | null>(null);
  const createLead = useCreateLead();

  const content = useContentBundle();
  const plans = content.data?.servicePlans ?? [];

  function openLeadModal() {
    setModalOpen(true);
    setStep(0);
    setLeadError(null);
    setLeadForm({ name: "", email: "", phone: "", landArea: "" });
  }

  function submitLead() {
    setLeadError(null);
    createLead.mutate(
      {
        name: leadForm.name.trim(),
        email: leadForm.email.trim(),
        phone: leadForm.phone.trim(),
        landArea: leadForm.landArea.trim(),
        locale: lang,
      },
      {
        // Only reach the thank-you step once the enquiry is actually stored, so the promise on that
        // screen is backed by something.
        onSuccess: () => {
          setStep(2);
          setLeadForm({ name: "", email: "", phone: "", landArea: "" });
        },
        onError: (error) => {
          setLeadError(
            error instanceof Error ? error.message : "Could not send your request. Please try again.",
          );
        },
      },
    );
  }

  /**
   * Whether a plan is quote-only is decided by `priceValue === null`, not by its index.
   *
   * The previous version hardcoded `i === 2`, so reordering the plans in the database would have
   * silently attached the consultation flow to the wrong card.
   */
  const isQuoteOnly = (priceValue: number | null) => priceValue === null;

  return (
    <div className="max-w-[960px] mx-auto px-6 py-16" style={{ fontFamily: font }}>
      <h1
        className="text-[24px] text-[#1A1A1A] text-center mb-2"
        style={{ fontFamily: font, fontWeight: 400 }}
      >
        {s.title}
      </h1>
      <p className="text-[14px] text-[#9CA3AF] text-center mb-12" style={{ fontFamily: font }}>
        {s.subtitle}
      </p>

      {content.isError && (
        <p className="text-[13px] text-center text-[#FF6B35]">
          {content.error instanceof Error ? content.error.message : "Could not load plans."}
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const unit = L(plan.unit);
          const badge = L(plan.badge);
          return (
            <div key={plan.id} className="border border-[#EAECF0] rounded-lg p-6 flex flex-col">
              <h3 className="text-[16px] text-[#1A1A1A] mb-4" style={{ fontWeight: 500 }}>
                {L(plan.title)}
              </h3>

              {plan.priceValue !== null ? (
                <p
                  className="text-[36px] text-[#1A1A1A] mb-1"
                  style={{ fontFamily: "JetBrains Mono", fontWeight: 400 }}
                >
                  {plan.priceValue.toLocaleString("en-US")}{" "}
                  <span className="text-[14px] text-[#9CA3AF]">{unit}</span>
                </p>
              ) : (
                <p className="text-[18px] text-[#6B7280] mb-1" style={{ fontFamily: font }}>
                  {s.tailored}
                </p>
              )}

              {badge && (
                <span
                  className="inline-block mt-2 mb-4 px-3 py-1 text-[11px] text-[#6B7280] bg-[#F3F4F6] rounded-full w-fit"
                  style={{ fontFamily: font }}
                >
                  {badge}
                </span>
              )}

              <p className="text-[13px] text-[#9CA3AF] mb-6 flex-1">{L(plan.description)}</p>

              <button
                onClick={() => {
                  if (isQuoteOnly(plan.priceValue)) {
                    setBookingModal(true);
                  } else {
                    openLeadModal();
                  }
                }}
                className={`text-[14px] text-[#00A859] hover:text-[#009150] transition-colors ${
                  isRTL ? "text-right" : "text-left"
                }`}
                style={{ fontWeight: 400 }}
              >
                {plan.priceValue !== null ? s.getStarted : s.contactUs}
              </button>
            </div>
          );
        })}
      </div>

      {/* Lead capture Modal */}
      {/*
        WARNING: this form does not submit anywhere. The inputs are uncontrolled and there is no
        leads endpoint on the API, so reaching the final step shows "we'll be in touch" without
        anything having been captured or sent. It is preserved as-is rather than silently faked
        further; wiring it needs a product decision about the fields and who is notified.
      */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-[#EAECF0] w-full max-w-[520px] p-8 relative">
            <button
              onClick={() => setModalOpen(false)}
              className={`absolute top-4 ${isRTL ? "left-4" : "right-4"} text-[#9CA3AF] hover:text-[#4A4A4A]`}
            >
              <X size={18} strokeWidth={1.5} />
            </button>
            <div className="flex gap-2 mb-8">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i === step ? "bg-[#00A859]" : "bg-[#EAECF0]"}`}
                />
              ))}
            </div>
            {step === 0 && (
              <div className="flex flex-col gap-6">
                <div>
                  <label
                    className="text-[12px] text-[#9CA3AF] mb-2 block"
                    style={{ fontFamily: font }}
                  >
                    {s.step1.name}
                  </label>
                  <input
                    value={leadForm.name}
                    onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))}
                    disabled={createLead.isPending}
                    className="w-full h-[48px] border-b border-[#EAECF0] outline-none text-[15px] bg-transparent"
                    style={{ fontFamily: font, textAlign: isRTL ? "right" : "left" }}
                  />
                </div>
                <div>
                  <label
                    className="text-[12px] text-[#9CA3AF] mb-2 block"
                    style={{ fontFamily: font }}
                  >
                    {s.step1.email}
                  </label>
                  <input
                    value={leadForm.email}
                    onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={createLead.isPending}
                    className="w-full h-[48px] border-b border-[#EAECF0] outline-none text-[15px] bg-transparent"
                    type="email"
                    dir="ltr"
                  />
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="flex flex-col gap-6">
                <div>
                  <label
                    className="text-[12px] text-[#9CA3AF] mb-2 block"
                    style={{ fontFamily: font }}
                  >
                    {s.step2.phone}
                  </label>
                  <input
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))}
                    disabled={createLead.isPending}
                    className="w-full h-[48px] border-b border-[#EAECF0] outline-none text-[15px] bg-transparent"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label
                    className="text-[12px] text-[#9CA3AF] mb-2 block"
                    style={{ fontFamily: font }}
                  >
                    {s.step2.landArea}
                  </label>
                  <input
                    value={leadForm.landArea}
                    onChange={(e) => setLeadForm((f) => ({ ...f, landArea: e.target.value }))}
                    disabled={createLead.isPending}
                    className="w-full h-[48px] border-b border-[#EAECF0] outline-none text-[15px] bg-transparent"
                    style={{ fontFamily: "JetBrains Mono" }}
                    dir="ltr"
                  />
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="flex flex-col gap-4 items-center text-center py-4">
                <div className="w-12 h-12 rounded-full bg-[#F0FDF4] flex items-center justify-center text-[#00A859] text-[20px]">
                  ✓
                </div>
                <p className="text-[16px] text-[#1A1A1A]" style={{ fontFamily: font }}>
                  {s.thankyou}
                </p>
                <p className="text-[13px] text-[#9CA3AF]" style={{ fontFamily: font }}>
                  {s.thankyouSub}
                </p>
              </div>
            )}
            {leadError && (
              <p className="text-[12px] mt-4 text-[#FF6B35]" role="alert">
                {leadError}
              </p>
            )}

            {step < 2 && (
              <button
                onClick={() => (step === 1 ? submitLead() : setStep(step + 1))}
                disabled={createLead.isPending}
                className="mt-8 px-6 py-2.5 bg-[#00A859] text-white rounded-full text-[14px] hover:bg-[#009150] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ fontWeight: 500 }}
              >
                {step === 1 ? (createLead.isPending ? "…" : s.submit) : s.next}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Booking Modal for the quote-only plan */}
      {bookingModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="relative w-full max-w-[700px] my-8">
            <button
              onClick={() => setBookingModal(false)}
              className={`absolute top-4 ${isRTL ? "left-4" : "right-4"} z-10 w-8 h-8 flex items-center justify-center text-[#9CA3AF] hover:text-[#4A4A4A] bg-white rounded-full border border-[#EAECF0]`}
            >
              <X size={16} strokeWidth={1.5} />
            </button>
            <ConsultationBooking />
          </div>
        </div>
      )}
    </div>
  );
}
