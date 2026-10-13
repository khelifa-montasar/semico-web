Generate a minimalist, farmer‑centric Dashboard for "Semico", the Algerian AgriTech smart irrigation platform. The design must be ultra‑clean, spacious, and immediately understandable by a non‑technical farmer. Follow the established Semico design system: Inter and Noto Sans Arabic fonts, 8px grid, 1px borders, pill‑shaped buttons. Support light/dark modes and bilingual (English/Arabic) with RTL mirroring.

—

## Dashboard Layout (Desktop 1440px)

The dashboard uses a two‑column layout with generous spacing (32px page padding, 24px column gap).

- **Main Column (70% width):** Core crop status and historical trend.
- **Right Sidebar (30% width):** Contextual intelligence and recent activity.

—

## Component Specifications

### 1. Top Row (Main Column) – Status & Savings

A horizontal flex row with two cards, gap 24px.

**Card A: Moisture Gauge (Flex: 2)**
- **Visual:** Large circular SVG donut gauge (160x160px).
- **Center content:**
  - Large emoji representing crop status:
    - 😊 (green, `#00A859`) when moisture >60%
    - 😐 (orange, `#FF6B35`) when 30‑60%
    - 😟 (red, `#FF6B35`) when <30%
  - Below emoji: current moisture percentage (monospaced, 32px, e.g., "68%").
- **Label:** Small monospaced text beneath gauge: "Root moisture" / "رطوبة الجذور".
- **Animation:** A subtle red pulse border on the gauge when value <30%.
- **Card styling:** 1px border, 24px padding, no shadow.

**Card B: Daily Savings (Flex: 1)**
- **Content:** Centered vertically.
- **Main value:** Large monospaced numerals in Semico Green `#00A859` (48px, e.g., "450 DZD").
- **Label:** "Saved today vs. traditional" / "وفرت اليوم مقارنة بالتقليدي" (16px, secondary gray).
- **Icon:** Small leaf icon next to the number.
- **Card styling:** Same as above.

—

### 2. Main Chart Card (Main Column, Full Width)

- **Title:** "Soil moisture trend · Last 7 days" / "اتجاه رطوبة التربة · آخر 7 أيام" (20px medium).
- **Chart (Recharts style):**
  - Single smooth line (Semico Green `#00A859`, 2px stroke).
  - Light green area fill under the line (opacity 0.08).
  - Red dashed horizontal line at 40% threshold (stroke `#FF6B35`, dash array 4,4).
  - **No gridlines.** X and Y axes in light gray (`#9CA3AF`), minimal tick labels.
  - Tooltip on hover: frosted glass card showing date, moisture value.
- **Height:** 280px.
- **Card styling:** 1px border, 24px padding.

—

### 3. Right Sidebar Cards (Stacked, gap 24px)

**Card C: Smart Weather Forecast**
- **Title:** "Weather forecast" / "توقعات الطقس" with cloud icon (Lucide "Cloud").
- **Content:**
  - Current temperature (large, e.g., "26°C") + condition icon (Sun/Cloud/Rain).
  - Short description (e.g., "Partly cloudy").
  - **Smart advice box:** A subtle green background (opacity 0.1) with text:
    - "Rain expected tomorrow. No irrigation needed." / "أمطار متوقعة غداً. لا داعي للري."
  - **Valve status line:** Small monospaced text: "Valve: Closed" / "الصمام: مغلق" (or "Open for X min").
- **Card styling:** 1px border, 24px padding.

**Card D: Last Activity (Non‑Technical)**
- **Title:** "Last activity" / "آخر نشاط" with history icon (Lucide "History").
- **Content:**
  - "Last irrigation: Today 06:00 AM" / "آخر ري: اليوم 06:00 صباحاً"
  - "System check: All devices online" / "فحص النظام: جميع الأجهزة متصلة"
  - Use a water droplet icon next to the irrigation line.
- **Text style:** Monospaced for times, regular for text.

—

### 4. Floating Action Button (Manual Irrigation)

- **Position:** Fixed, bottom 32px, right 32px (LTR) / left 32px (RTL).
- **Design:** Pill‑shaped container with light background (white/dark surface), 1px border, 16px padding.
- **Content:**
  - Decrement button `[-]` (minimal, text only).
  - Duration display: "10 min" / "10 دقائق" (monospaced, 18px).
  - Increment button `[+]`.
  - Primary action button: "Irrigate now" / "اسقِ الآن" (solid Semico Green, pill, white text).
- **Interaction:** Clicking +/- adjusts duration. Clicking "Irrigate now" triggers action.

—

## Responsive Behavior

- **Tablet (<1024px):** Right sidebar moves below main column. Sidebar cards become a two‑column grid.
- **Mobile (<768px):**
  - Top row stacks vertically.
  - Chart height 200px.
  - Floating button becomes full‑width, fixed to bottom of viewport.
  - Sidebar cards stack.

—

## Bilingual & RTL Support

- Provide both English (LTR) and Arabic (RTL) as separate frames (or use Figma variables to switch).
- In RTL:
  - Layout mirrors: Main column moves to right, sidebar to left.
  - Floating button moves to bottom left.
  - Text alignment flips to right.
  - Icons that imply direction (e.g., arrow) mirror.

—

## Dark Mode

- Use Figma variable modes to show both light and dark themes.
- In dark mode: background `#0B1120`, cards `#1A2538`, text `#E2E8F0`, borders `#1E2A44`.
- Chart colors remain consistent; adjust opacity fills for visibility.

—

## Figma Deliverables

- A single high‑fidelity frame for Desktop (1440px) showing the complete Dashboard in **Light Mode**.
- A second frame showing **Dark Mode**.
- Show the chart tooltip on hover (mock state).
- Show the floating button with the duration selector expanded.
- Use Auto Layout for all containers. Name layers semantically (e.g., "Dashboard/MainColumn", "Dashboard/GaugeCard", "Dashboard/FloatingButton").
- Provide a separate mobile frame (375px) showing the stacked layout.

This dashboard translates complex irrigation data into immediate, actionable peace of mind for the Algerian farmer—exactly what Semico stands for.