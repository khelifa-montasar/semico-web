Generate a minimalist, high‑precision "Free Consultation Booking" component for the Semico AgriTech platform. This component must integrate seamlessly into the Home page, About page, and appear as a modal when "Contact us" is clicked on the Custom service card. The aesthetic must follow the established Semico design language: ultra‑minimalist, structured, and "agri‑premium"—think Dieter Rams meets a precision environmental dashboard.

—

Core Design System (Semico):
• Palette: Stark whites, deep "Soil" charcoals, light concrete greys. Vivid Semico Green (#00A859) used exclusively for primary CTAs and selected time slots. Smart Blue (#0077B6) for secondary links. Energy Orange (#FF6B35) only for critical availability warnings. Light mode background: #FAFAFA; Dark mode background: #0B1120.
• Typography: Inter, weights 400 (regular) and 500 (medium) only. Body 16px, headings 24px/20px. Monospaced font (JetBrains Mono) for dates, times, and timezone metadata to reinforce technical precision.
• Grid & Spacing: Rigorous 8px grid. Generous vertical whitespace (minimum 48px between major sections). Thin 1px borders (#EAECF0 light / #1E2A44 dark) for all dividers and card boundaries.
• Border Radius: 8px on cards; 40px (pill) on buttons.
• Icons: Lucide outline, stroke width 1.5px.

—

Booking Component Structure (Verdi‑Inspired, Semico‑Refined):

The component is presented as a clean, centered card with maximum width 680px (Desktop). It consists of four distinct, vertically stacked sections separated by 1px horizontal rules.

1. Header Section:
   - Left‑aligned headline: "Free Irrigation Automation Consultation" in 24px regular weight, Dark Gray (#4A4A4A).
   - Subheadline: "April 2026" in 16px monospaced, secondary grey (#9CA3AF).
   - A subtle 1px border separates the header from the calendar.

2. Calendar Section (Month View):
   - A minimal, Swiss‑style calendar grid.
   - Weekday headers (SUN, MON, TUE, WED, THU, FRI, SAT) in small monospaced caps, secondary grey.
   - Day cells: Square, 48px height. Dates in Inter regular 16px. Inactive/past dates in light grey.
   - The selected date (e.g., "23") is displayed as a solid Semico Green pill (border-radius 40px) with white text.
   - Hover state on available dates: light Semico Green background (opacity 0.1).

3. Meeting Details Section:
   - Two lines, minimal styling.
   - "Meeting location" with "Google Meet" aligned right (monospaced).
   - "Meeting duration" with "30 mins" aligned right (monospaced).
   - Separated by a thin 1px rule.

4. Time Slot Selection Section:
   - Headline: "What time works best?" in 16px medium weight.
   - Subhead: "Showing times for April 23, 2026" and "UTC +01:00 (Africa) Central European Time" in small monospaced secondary grey.
   - Time slots displayed as a clean grid (2 or 3 columns). Each slot is a pill‑shaped button (border-radius 40px) with 1px border and transparent background. Text in Dark Gray, monospaced (e.g., "2:30 pm").
   - Hover state: border becomes Semico Green.
   - Selected state: solid Semico Green background, white text.
   - Disabled/unavailable slots: light grey text, no border, not clickable.

—

Placement & Interaction:

• Home Page: The booking component appears below the ROI Calculator and above the Testimonials section. It is a standalone card with the headline "Ready to Automate Your Farm?" (24px) and a supporting paragraph: "Reduce labor, improve efficiency, and achieve unprecedented control. Install in minutes, not months." Followed by the booking component as described.

• About Page: The booking component appears at the very bottom of the page, just above the Footer. It is introduced by a minimal section title "Book a Free Consultation" (24px). The component is identical to the Home version.

• Custom Service "Contact us" Modal: When the user clicks "Contact us →" on the Custom service card, a centered modal (overlay with backdrop blur) opens containing the exact same booking component. The modal has a subtle close (X) icon in the top right.

—

Guarantee Statement (Verdi‑Inspired Trust Element):
Immediately above the booking component (on Home and About pages), include a minimal, centered statement in 18px regular weight:
"Guaranteed Results: Semico is risk‑free. If you're not satisfied, we'll take it back. No stress. No risk. Just results."
This text should be set in Dark Gray (light mode) and have generous vertical padding (32px) above and below it. No icon, no badge—just clean typography.

—

Technical Execution (Figma Auto Layout):
• The entire component is a single Auto Layout frame with vertical direction, spacing 0, padding 24px.
• Each internal section (Header, Calendar, Meeting Details, Time Slots) is an Auto Layout frame with spacing 16px.
• Ensure all text layers use the correct font styles (Inter and JetBrains Mono).
• Create component variants for light and dark mode using Figma variables.
• Provide the component as a reusable Figma component that can be placed on any page.

—

Responsive Behavior:
• On mobile (375px), the calendar grid adjusts to 7 columns with smaller day cells (40px). Time slots stack vertically in a single column.

—

Figma Deliverable:
Provide a single, high‑fidelity frame showing the complete booking component as it appears on the Home page (Desktop 1440px), including the preceding headline and guarantee statement. Additionally, show the modal variant for the Custom service flow. Both light and dark mode versions must be included.