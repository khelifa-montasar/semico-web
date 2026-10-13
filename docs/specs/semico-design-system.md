Generate a minimalist, world‑class UI design for "Semico", an Algerian AgriTech smart irrigation platform. The aesthetic must be ultra‑minimalist, high‑precision, and "agri‑premium"—think Dieter Rams meets a modern environmental dashboard.

—

Core Design System:
• Palette: Stark whites, deep "Soil" charcoals, and light concrete greys. Use a single Vivid Semico Green (#00A859) exclusively for primary CTAs and success indicators. Use Smart Blue (#0077B6) sparingly for secondary links and interactive accents. Critical warnings use Energy Orange (#FF6B35) only when absolutely necessary.
• Typography: Inter, weights 400 (regular) and 500 (medium) only. Avoid bold text; use color and size for hierarchy. Body text at 16px with 1.5 line‑height. Headings at 24px/20px. Monospaced font (e.g., JetBrains Mono) for data values (moisture %, timestamps, voltage) to emphasize technical precision.
• Grid: A rigorous, visible Swiss‑style grid. Use thin 1px borders (`#EAECF0` light / `#1E2A44` dark) to separate sections, giving the interface a "sturdy" and structured feel. Generous gutters (24px minimum).
• Icons: Lucide outline, stroke width 1.5px. Use `#4A4A4A` (light) / `#B0C4DE` (dark).
• Buttons: Pill‑shaped (`border-radius: 40px`), subtle hover states. Primary: solid Semico Green. Secondary: transparent with 1px border.
• Cards: Zero or extremely light box‑shadow (`0px 2px 8px rgba(0,0,0,0.02)`). 1px border for definition. Border radius: 8px.
• Charts & Data: Clean Recharts style – no grid lines, soft gradients, tooltips with frosted glass background.

—

Global Layout (Airy & Centered):

• Navbar (Public): Transparent background, height 72px. Left: Semico logo (water droplet + electronic wave mark) and "Semico" in medium weight. Center: navigation links (Home, Services, Products, Blog, About). Right: "Log in" text link only (no button). 1px bottom border.
• Footer: Ultra‑minimal – only slogan "When Technology Meets Nature – Made in Algeria." and three social icons in a single centered row. No background.
• Sidebar (Authenticated): Expanded by default (240px) with icons + labels. 1px right border. Background: `#FFFFFF` / `#0B1120`. Collapses to icons only on mobile (60px).
• Support Widget: A simple floating circle (Semico Green with white droplet icon) fixed bottom‑right. Opens a minimal chat panel with soft rounded corners (8px).
• Spacing system: Multiples of 8px (8, 16, 24, 32, 48, 64, 80).

—

Public Pages (Pre‑Login) – Minimalist Execution:

1. Home Page (`/`)
   - Hero: Centered, max‑width 800px. Headline "Smart Irrigation – Made in Algeria." in 48px regular weight, tracking tight. Subheadline "Save water, increase yield, control your farm from anywhere." in 18px secondary grey. Single primary CTA: "Book a free consultation" (pill button). Below, an abstract water wave graphic or clean line‑art illustration.
   - ROI Calculator Card: A minimal card (1px border) containing a single slider labeled "Your land area (m²/ha)". Live result displayed in large, thin Semico Green numerals (48px, monospaced): "12,500 DZD/year". No extra text.
   - Booking Widget: Embedded Google Meet calendar with soft border. Showing 30‑min slots for Africa/Algiers timezone.
   - Testimonials: Two‑column layout. Each a subtle quote in 18px regular, followed by name and farm in small monospaced caps.

2. Services Page (`/services`)
   - Three cards in a row, equal height, 1px border, no header backgrounds.
   - Residential: Large thin numerals `XX DA / m²`. Badge "1 Month Free Trial" in subtle grey pill. "Get started →" text link.
   - Farm: Large thin numerals `XX DA / ha`. Badge "1 Month Free Trial". "Get started →" text link.
   - Custom: "Tailored solutions" text. "Contact us →" text link (opens booking modal).
   - Multi‑step form modal: Centered, wide inputs (48px height), thin bottom border only. Steps indicator with minimal dots.

3. Products Page (`/products`)
   - Grid of product cards (image, title, one‑sentence description). "Learn more" as subtle text link.

4. Blog Page (`/blog`)
   - Two filter pills (subtle grey background, no border). Post cards: date small above title in monospaced, clean 1px separator between posts.

5. About Page (`/about`)
   - Mission/Vision in two columns, thin vertical rule between.
   - Team photos: circular, grayscale, Semico Green border on hover (1px).
   - Achievement counters: large thin numerals (monospaced), small label underneath.
   - Embedded Google Maps (mock) with 1px border.
   - Footer CTA: "Book a consultation" pill button.

6. Login / Register
   - Centered card (max‑width 440px). Tabs: Sign In / Sign Up (thin underline indicator).
   - Inputs with bottom border only (1px). OAuth buttons as simple outlined pills (icon + provider name).
   - Register: role selector (Farm Owner / Worker). If Worker, show "Farm Owner Code" field with monospaced input.

—

Authenticated Pages (Post‑Login) – Dashboard Minimalism:

1. Dashboard (`/dashboard`)
   - Status Cards: Five minimal cards in a row. Each shows a circular SVG donut gauge with large monospaced percentage in center. No card title – icon + value only. Subtle 1px border. Color border left (green for >60%, orange for 30‑60%, red for <30%). Pulse animation on critical (<30%).
   - Main Chart: Dual‑line chart (Root moisture `#0077B6`, Surface moisture `#00A859`). Zero gridlines. Axes in light grey. Red dashed horizontal line at 40% threshold. Semi‑transparent vertical bands for irrigation events. Tooltip: frosted glass card.
   - Weather Card: Single line: icon, temp, short forecast. No background.
   - Impact Summary: "Water saved: XX liters", "Autonomous irrigations: X times" in monospaced numerals.
   - Recent Alerts: Simple list with red dot (unread). Timestamp in monospaced.

2. System Health (`/system-health`)
   - Component Grid: Cards with icon, component name, value (monospaced), and a small colored dot (green/orange/red). Clicking a card expands a diagnostic sheet with troubleshooting steps (monospaced for technical instructions).
   - Error Log Table: Minimal row dividers (1px). Timestamp in monospaced. Columns: Component, Message, Suggested Action.

3. Activity Log (`/activity`)
   - Log Table: Entries like "System opened valve automatically" with monospaced timestamp. Geotag icon on manual actions (hover shows location in tooltip).
   - Filters: single dropdown, minimal border.
   - Calendar View: Monthly grid, dots for irrigation days (Semico Green).

4. Analytics & Reports (`/analytics`)
   - Period comparison: two minimal date pickers side by side.
   - Irrigation Heatmap: GitHub‑style squares, color scale from light grey to Semico Green.
   - Soil Drying Rate Chart: clean line chart.
   - What‑If Simulator: slider "Simulate rainfall (mm)" updating the chart.
   - Export buttons: text links with download icon (PDF, Excel).

5. Settings (`/settings`)
   - Sections divided by thin horizontal rules (1px).
   - User Management (Admin only): table with simple rows, avatar initials in circle, role badge (subtle pill).
   - Threshold Sliders: track in light grey, filled portion Semico Green.
   - Toggle switches: minimal, no "on/off" label.
   - Manual Override: "Open Valve for X min" with monospaced input + pill button; "Close Valve Now" outlined pill.

—

Responsive Behavior:

- Mobile: Single column, generous padding (16px). Sidebar becomes bottom navigation bar (icons only). Status cards stack vertically. Charts use full width.
- Tablet: Sidebar icons only (60px width).

—

Figma Deliverables:

- Create separate frames for every page (Desktop 1440px wide, Mobile 375px wide).
- Use Auto Layout with consistent spacing (gap: 16px, 24px, 32px).
- Provide a "UI Kit" page with all components: buttons, inputs, cards, gauges, chart styles, and both light/dark color tokens.
- Include both Light and Dark mode variants (use Figma variable modes).
- Name all layers semantically and group them logically.

This design should feel like a premium, modern SaaS product – calm, focused, and effortlessly usable. It should appeal to international audiences while subtly reflecting the Semico brand through the Semico Green and Smart Blue accents. Every element must serve a purpose; remove everything that is not essential.