import { useState } from "react";
import { ChevronLeft, ChevronRight, Video, Clock } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { farmDayLabelLong, farmMonthLabel, firstWeekdayOffsetSunday } from "../../lib/time";
import { useBookingAvailability, useCreateBooking } from "../../features/bookings/useBookings";

/**
 * Consultation booking.
 *
 * Was entirely hardcoded: a fixed April 2026, a literal `AVAILABLE_DAYS`, dead month chevrons, and
 * a Confirm button that set local state and told the visitor they were booked without sending
 * anything anywhere. It also collected no name or email, which the booking API requires.
 *
 * Now: availability comes from `/bookings/availability` for the month being displayed, and the
 * chosen day's slots from the same endpoint; confirming writes a real booking.
 */

/** The current farm-local month, as `YYYY-MM`. */
function currentMonthKey(): string {
  // UTC+1, no DST — the key is a calendar month, so the offset is applied before slicing.
  const farmNow = new Date(Date.now() + 60 * 60 * 1000);
  return farmNow.toISOString().slice(0, 7);
}

/** Shifts a `YYYY-MM` key by whole months. */
function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

export function ConsultationBooking() {
  const { t, lang, isRTL, font } = useLanguage();
  const b = t.booking;

  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const availability = useBookingAvailability({
    month: monthKey,
    ...(selectedDate ? { date: selectedDate } : {}),
  });
  const createBooking = useCreateBooking();

  const data = availability.data;
  const daysInMonth = data?.daysInMonth ?? 31;
  const availableDays = data?.availableDays ?? [];
  const slots = data?.slots ?? [];

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekdayOffsetSunday(monthKey) }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const ChevronStart = isRTL ? ChevronRight : ChevronLeft;
  const ChevronEnd = isRTL ? ChevronLeft : ChevronRight;

  /** Nothing before the current month is bookable, so the control is disabled rather than a no-op. */
  const canGoBack = monthKey > currentMonthKey();
  const confirmed = createBooking.data;

  function pickMonth(delta: number) {
    setMonthKey((key) => shiftMonth(key, delta));
    setSelectedDate(null);
    setSelectedTime(null);
    setError(null);
  }

  function pickDay(day: number) {
    setSelectedDate(`${monthKey}-${String(day).padStart(2, "0")}`);
    setSelectedTime(null);
    setError(null);
  }

  function submit() {
    if (!selectedDate || !selectedTime) return;
    setError(null);

    createBooking.mutate(
      {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        date: selectedDate,
        startTime: selectedTime,
        // Advisory only — the slot is still chosen in farm time.
        visitorTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      {
        onError: (mutationError) => {
          setError(
            mutationError instanceof Error ? mutationError.message : "Could not book that slot.",
          );
        },
      },
    );
  }

  return (
    <div
      className="w-full max-w-[680px] mx-auto border border-[#EAECF0] rounded-lg overflow-hidden bg-white"
      style={{ fontFamily: font }}
    >
      {/* Header */}
      <div className="p-6 pb-5">
        <p className="text-[24px] text-[#4A4A4A]" style={{ fontWeight: 400, lineHeight: 1.3 }}>
          {b.title}
        </p>
        <p className="text-[14px] text-[#9CA3AF] mt-1" style={{ fontFamily: "JetBrains Mono" }}>
          {farmMonthLabel(monthKey, lang)}
        </p>
      </div>
      <div className="h-px bg-[#EAECF0]" />

      {/* Calendar */}
      <div className="p-6 pb-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => pickMonth(-1)}
            disabled={!canGoBack}
            aria-label={b.prevMonth}
            className="text-[#9CA3AF] hover:text-[#4A4A4A] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronStart size={18} strokeWidth={1.5} />
          </button>
          <p className="text-[14px] text-[#4A4A4A]" style={{ fontWeight: 500 }}>
            {farmMonthLabel(monthKey, lang)}
          </p>
          <button
            onClick={() => pickMonth(1)}
            aria-label={b.nextMonth}
            className="text-[#9CA3AF] hover:text-[#4A4A4A] transition-colors"
          >
            <ChevronEnd size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {b.dayLetters.map((d, i) => (
            <div
              key={i}
              className="text-center text-[#9CA3AF] pb-2"
              style={{ fontFamily: "JetBrains Mono", fontSize: 10 }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />;
            const isAvailable = availableDays.includes(day);
            const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
            const isSelected = dateKey === selectedDate;

            return (
              <div key={day} className="flex items-center justify-center h-10">
                {isAvailable ? (
                  <button
                    onClick={() => pickDay(day)}
                    className="w-9 h-9 flex items-center justify-center rounded-full transition-colors text-[14px]"
                    style={
                      isSelected
                        ? { background: "#00A859", color: "#fff", fontWeight: 500 }
                        : { color: "#4A4A4A", background: "transparent" }
                    }
                    onMouseEnter={(e) => {
                      if (!isSelected)
                        (e.currentTarget as HTMLElement).style.background = "rgba(0,168,89,0.1)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected)
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    {day}
                  </button>
                ) : (
                  <span className="text-[14px] text-[#D1D5DB]">{day}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="h-px bg-[#EAECF0]" />

      {/* Meeting Details */}
      <div className="px-6 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] text-[#6B7280]">
            <Video size={15} strokeWidth={1.5} className="text-[#9CA3AF]" />
            <span>{b.meetingLocation}</span>
          </div>
          <span className="text-[13px] text-[#4A4A4A]" style={{ fontFamily: "JetBrains Mono" }}>
            {data?.meetingType ?? b.googleMeet}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] text-[#6B7280]">
            <Clock size={15} strokeWidth={1.5} className="text-[#9CA3AF]" />
            <span>{b.meetingDuration}</span>
          </div>
          <span className="text-[13px] text-[#4A4A4A]" style={{ fontFamily: "JetBrains Mono" }}>
            {data ? `${data.durationMin} ${b.minutes}` : b.minutes}
          </span>
        </div>
      </div>
      <div className="h-px bg-[#EAECF0]" />

      {/* Time Slots */}
      <div className="p-6">
        {confirmed ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-[#F0FDF4] flex items-center justify-center text-[#00A859] text-[20px]">
              ✓
            </div>
            <p className="text-[15px] text-[#1A1A1A]" style={{ fontWeight: 500 }}>
              {b.confirmed}
            </p>
            <p className="text-[14px] text-[#4A4A4A]" style={{ fontFamily: "JetBrains Mono" }}>
              {confirmed.startTime} — {farmDayLabelLong(confirmed.date, lang)}
            </p>
            <p className="text-[13px] text-[#9CA3AF]">{data?.timezone ?? b.timezone}</p>
          </div>
        ) : (
          <>
            <p className="text-[15px] text-[#1A1A1A] mb-1" style={{ fontWeight: 500 }}>
              {b.timeTitle}
            </p>
            <p className="text-[11px] text-[#9CA3AF] mb-1" style={{ fontFamily: "JetBrains Mono" }}>
              {selectedDate
                ? `${b.showingTimesFor} ${farmDayLabelLong(selectedDate, lang)}`
                : b.selectDay}
            </p>
            <p className="text-[10px] text-[#9CA3AF] mb-5" style={{ fontFamily: "JetBrains Mono" }}>
              {b.timezone}
            </p>

            {availability.isError && (
              <p className="text-[12px] mb-4 text-[#FF6B35]" role="alert">
                {availability.error instanceof Error
                  ? availability.error.message
                  : "Could not load availability."}
              </p>
            )}

            {/* Slots only exist for a chosen day, so nothing is shown until one is picked. */}
            {selectedDate && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.map((slot) => {
                  const isActive = selectedTime === slot.time;
                  return (
                    <button
                      key={slot.time}
                      disabled={!slot.available}
                      onClick={() => setSelectedTime(slot.time)}
                      title={slot.reason}
                      className="h-10 px-3 rounded-full text-[13px] border transition-colors"
                      style={
                        !slot.available
                          ? {
                              color: "#D1D5DB",
                              borderColor: "transparent",
                              cursor: "not-allowed",
                              fontFamily: "JetBrains Mono",
                            }
                          : isActive
                            ? {
                                background: "#00A859",
                                color: "#fff",
                                borderColor: "#00A859",
                                fontFamily: "JetBrains Mono",
                                fontWeight: 500,
                              }
                            : {
                                color: "#4A4A4A",
                                borderColor: "#EAECF0",
                                fontFamily: "JetBrains Mono",
                              }
                      }
                      onMouseEnter={(e) => {
                        if (slot.available && !isActive)
                          (e.currentTarget as HTMLElement).style.borderColor = "#00A859";
                      }}
                      onMouseLeave={(e) => {
                        if (slot.available && !isActive)
                          (e.currentTarget as HTMLElement).style.borderColor = "#EAECF0";
                      }}
                    >
                      {slot.time}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedDate && slots.length > 0 && slots.every((slot) => !slot.available) && (
              <p className="text-[12px] text-[#9CA3AF]">{b.noSlots}</p>
            )}

            {/* Details are collected only once a time is chosen — asking first and then refusing
                would waste the visitor's effort. */}
            {selectedTime && (
              <div className="flex flex-col gap-4 mt-6">
                {(
                  [
                    { key: "name" as const, label: b.nameLabel, type: "text", dir: undefined },
                    { key: "email" as const, label: b.emailLabel, type: "email", dir: "ltr" },
                    { key: "phone" as const, label: b.phoneLabel, type: "tel", dir: "ltr" },
                  ] as const
                ).map(({ key, label, type, dir }) => (
                  <div key={key}>
                    <label
                      className="text-[12px] text-[#9CA3AF] mb-2 block"
                      style={{ fontFamily: font }}
                    >
                      {label}
                    </label>
                    <input
                      type={type}
                      dir={dir}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      disabled={createBooking.isPending}
                      className="w-full h-[44px] border-b border-[#EAECF0] outline-none text-[15px] bg-transparent"
                      style={{ fontFamily: font }}
                    />
                  </div>
                ))}

                {error && (
                  <p className="text-[12px] text-[#FF6B35]" role="alert">
                    {error}
                  </p>
                )}

                <button
                  onClick={submit}
                  disabled={
                    createBooking.isPending || !form.name.trim() || !form.email.trim()
                  }
                  className="mt-2 px-8 py-2.5 bg-[#00A859] text-white rounded-full text-[14px] hover:bg-[#009150] transition-colors disabled:opacity-60 disabled:cursor-not-allowed self-start"
                  style={{ fontWeight: 500 }}
                >
                  {createBooking.isPending ? "…" : b.confirm}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
