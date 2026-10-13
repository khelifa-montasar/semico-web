import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLocalized } from "../../hooks/useLocalized";
import { ConsultationBooking } from "../ConsultationBooking";
import { useContentBundle } from "../../../features/content/useContent";

/**
 * Estimated annual saving per square metre, in DZD.
 *
 * A MODELLED figure, not a measured one — there is no flow-meter baseline behind it. It is a
 * business assumption hardcoded in the client rather than served by the API, so if the number
 * needs to change per region or per plan it should move server-side.
 */
const SAVINGS_PER_M2_DZD = 25;

export function Home() {
  const [landArea, setLandArea] = useState(500);
  const savings = Math.round(landArea * SAVINGS_PER_M2_DZD);
  const { t, isRTL, font } = useLanguage();
  const L = useLocalized();
  const h = t.home;
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  const content = useContentBundle();
  const testimonials = content.data?.testimonials ?? [];

  return (
    <div className="flex flex-col items-center" style={{ fontFamily: font }}>
      {/* Hero */}
      <section className="max-w-[800px] mx-auto text-center px-6 pt-20 pb-16">
        <h1
          className="text-[36px] md:text-[48px] text-[#1A1A1A] tracking-tight"
          style={{ fontFamily: font, fontWeight: 400, lineHeight: isRTL ? 1.4 : 1.1 }}
        >
          {h.headline1}
          <br />
          {h.headline2}
        </h1>
        <p
          className="mt-5 text-[16px] md:text-[18px] text-[#6B7280]"
          style={{ fontFamily: font, fontWeight: 400, lineHeight: 1.6 }}
        >
          {h.subheadline}
        </p>
        <Link
          to="/services"
          className="inline-flex items-center gap-2 mt-8 px-8 py-3 bg-[#00A859] text-white rounded-full text-[14px] hover:bg-[#009150] transition-colors"
          style={{ fontWeight: 500 }}
        >
          {h.cta}
        </Link>

        {/* Wave graphic */}
        <svg className="mt-12 w-full max-w-[600px] mx-auto" viewBox="0 0 600 80" fill="none">
          <path d="M0 40C100 10 200 70 300 40C400 10 500 70 600 40" stroke="#00A859" strokeWidth="1" opacity="0.3" />
          <path d="M0 50C100 20 200 80 300 50C400 20 500 80 600 50" stroke="#0077B6" strokeWidth="0.5" opacity="0.2" />
        </svg>
      </section>

      {/* ROI Calculator */}
      <section className="w-full max-w-[560px] mx-auto px-6 pb-16">
        <div className="border border-[#EAECF0] rounded-lg p-8">
          <label
            className="text-[13px] text-[#6B7280] block mb-4"
            style={{ fontFamily: font, fontWeight: 400 }}
          >
            {h.roiLabel}
          </label>
          <input
            type="range"
            min={100}
            max={10000}
            step={100}
            value={landArea}
            onChange={(e) => setLandArea(Number(e.target.value))}
            className="w-full accent-[#00A859] mb-2"
            dir="ltr"
          />
          <div
            className="flex justify-between text-[12px] text-[#9CA3AF] mb-6"
            style={{ fontFamily: "JetBrains Mono" }}
          >
            <span>100 m²</span>
            <span>{landArea.toLocaleString()}</span>
            <span>10,000 m²</span>
          </div>
          <p
            className="text-[48px] text-[#00A859] text-center"
            style={{ fontFamily: "JetBrains Mono", fontWeight: 400, lineHeight: 1 }}
          >
            {savings.toLocaleString()}{" "}
            <span className="text-[18px] text-[#9CA3AF]">{h.roiUnit}</span>
          </p>
        </div>
      </section>

      {/* Guarantee Statement */}
      <section className="w-full max-w-[680px] mx-auto px-6 pb-8 text-center">
        <p
          className="text-[18px] text-[#4A4A4A] py-8"
          style={{ fontFamily: font, fontWeight: 400, lineHeight: 1.6 }}
        >
          {t.booking.guarantee}
        </p>
      </section>

      {/* Consultation Booking */}
      <section className="w-full max-w-[680px] mx-auto px-6 pb-16">
        <ConsultationBooking />
      </section>

      {/* Testimonials — served content, both languages, so toggling locale needs no refetch */}
      <section className="w-full max-w-[960px] mx-auto px-6 pb-20">
        {content.isError && (
          <p className="text-[13px] text-center text-[#FF6B35]">
            {content.error instanceof Error ? content.error.message : "Could not load testimonials."}
          </p>
        )}
        <div className="grid md:grid-cols-2 gap-8">
          {testimonials.map((item) => (
            <div key={item.id} className="border border-[#EAECF0] rounded-lg p-6">
              <p
                className="text-[16px] md:text-[18px] text-[#4A4A4A]"
                style={{ fontFamily: font, fontWeight: 400, lineHeight: 1.6 }}
              >
                &ldquo;{L(item.quote)}&rdquo;
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[12px] text-[#9CA3AF]" style={{ fontFamily: "JetBrains Mono" }}>
                  {item.authorName} — {L(item.farm)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="w-full bg-[#FAFAFA] py-16 text-center">
        <p className="text-[20px] text-[#1A1A1A] mb-6" style={{ fontFamily: font, fontWeight: 400 }}>
          {h.readyCta}
        </p>
        <Link
          to="/services"
          className="inline-flex items-center gap-2 px-8 py-3 bg-[#00A859] text-white rounded-full text-[14px] hover:bg-[#009150] transition-colors"
          style={{ fontWeight: 500 }}
        >
          {h.getStarted} <ArrowIcon size={16} strokeWidth={1.5} />
        </Link>
      </section>
    </div>
  );
}
