Extend the Settings page of the Semico platform with two comprehensive sections: (1) Advanced Profile & Biography for all users (Admin and Worker), and (2) Worker Management for Farm Owners (Admins) only. The design must remain ultra‑minimalist, high‑precision, fully bilingual (English/Arabic), and respect both light and dark modes. Follow the established Semico design system strictly.

—

## Core Design System (Semico – Unchanged)

• Palette: Semico Green (#00A859) for primary actions. Smart Blue (#0077B6) for links. Dark Gray (#4A4A4A) for text. Energy Orange (#FF6B35) for errors only. Light mode background: #FAFAFA; Dark mode background: #0B1120.
• Typography: Inter (Latin) and Noto Sans Arabic (Arabic), weights 400, 500. Body 16px, headings 20px. Monospaced (JetBrains Mono) for structured data.
• Grid & Spacing: 8px grid. Card padding: 24px. Section gap: 32px. 1px borders (#EAECF0 light / #1E2A44 dark).
• Border Radius: 8px (cards), 40px (buttons).
• Icons: Lucide outline, 1.5px stroke.

—

## Section A: Profile & Biography (Available to All Users)

This section appears first in Settings. It allows any authenticated user (Admin or Worker) to manage their personal identity and professional background.

### A1. Avatar & Basic Information Card

Horizontal layout: large avatar (96px circle) on the left (LTR) / right (RTL), followed by basic fields.

- **Avatar:** Default user icon in gray circle. Hover overlay: semi‑transparent black with camera icon + "Change photo" / "تغيير الصورة". Click triggers file picker (mock).
- **Fields:** Full Name (editable), Email (read‑only), Phone (editable with country code), Location: Wilaya (dropdown) and Commune (text) inline.
- **Input Style:** Bottom border only, 48px height, small monospaced label above.

### A2. Professional Experience

Repeatable list of experience entries. Section title "Experience" / "الخبرات" with "Add experience" / "أضف خبرة" link.

- **Entry Card:** Job Title (18px medium), Company/Farm (16px regular secondary), Date Range (monospaced small caps), Description (multi‑line minimal border textarea).
- **Controls:** Edit (pencil) and Delete (trash) icons appear on hover.
- **Empty State:** Dashed card with placeholder text.

### A3. Education & Certifications

Similar to Experience. Title "Education" / "التعليم". Fields: Degree/Certification, Institution, Year (monospaced).

### A4. Biography / About

Title "About" / "نبذة عني". Multi‑line textarea with character count (0/500). Placeholder text encouraging sharing expertise or passion.

### A5. Action Buttons

"Save Changes" (solid green pill) and "Cancel" (outlined pill). Success toast on save.

—

## Section B: Worker Management (Admin / Farm Owner Only)

This section appears below Profile (or in a separate tab). It allows the Farm Owner to manage all workers associated with their farm. **Two distinct worker types** are defined, with precise permission controls.

### B1. Worker Type Definitions

| Type | Label (EN/AR) | Capabilities |
|------|---------------|--------------|
| **Operator** | "Operator" / "مشغّل" | Can view dashboard and system health. **Can manually open/close valves** when granted temporary permission by Owner. Owner can toggle valve control access per operator at any time. |
| **Observer** | "Observer" / "مراقب" | Read‑only access to dashboard, system health, and activity logs. **Cannot operate valves.** Expected to monitor system and report faults or offline components to the Owner. |

### B2. Worker Management Table

A minimal table displaying all workers. Columns:

- **Worker:** Avatar (small circle), Full Name, Email.
- **Role:** Badge displaying type (Operator / Observer). Subtle background: gray for Observer, Smart Blue outline for Operator.
- **Valve Control:** For Operator type only. A toggle switch (Semico Green when active). When toggled ON, the operator can manually open/close valves. Owner can revoke this permission instantly. Default is OFF.
- **Status:** Active / Invited (monospaced).
- **Actions:** Three‑dot menu with "Edit", "Reset Password", "Remove".

### B3. Invite New Worker

A card with a pill button "Invite Worker" / "دعوة عامل". Click opens a centered modal:

- **Full Name** (text input)
- **Email** (text input)
- **Worker Type:** Radio or segmented control: "Operator" / "مراقب"
- **Valve Control Permission:** Checkbox (only visible if Operator is selected): "Grant valve control permission immediately" / "منح صلاحية التحكم بالصمامات فوراً".
- **Send Invite** button (solid green). Cancel link.

### B4. Permission Revocation & Temporary Access

For each Operator, the Owner can toggle valve control permission ON/OFF at any time. This provides temporary, revocable access. The Activity Log captures when permission was granted/revoked and by whom.

For Observers, no valve control toggle appears.

### B5. Empty State

If no workers exist, show a minimal illustration and text: "You haven't invited any workers yet. Invite an operator or observer to help manage your farm." / "لم تدعُ أي عامل بعد. قم بدعوة مشغّل أو مراقب للمساعدة في إدارة مزرعتك."

—

## Bilingual & RTL Support

• All text strings provided in English and Arabic. Language switcher affects both Profile and Worker Management sections.
• RTL: Layout flips. In Worker table, columns reorder appropriately (e.g., Worker name appears on the right).
• Icons mirror where directional (e.g., chevron, arrow).

—

## Figma Deliverables

• Provide **one comprehensive frame** of the Settings page (Desktop 1440px) showing both the Profile section (for a logged‑in user) and the Worker Management section (for an Admin). Show both English (LTR) and Arabic (RTL) versions.
• Show the "Invite Worker" modal in both languages.
• Include hover states for avatar overlay, experience cards, and table row actions.
• Both light and dark mode variants via Figma variables.
• Use Auto Layout throughout; name layers semantically (e.g., "Settings/Profile/ExperienceCard", "Settings/WorkerTable/OperatorRow").

This unified Settings experience empowers Farm Owners to build a trusted team while giving every user a professional identity—key to Semico's mission of bringing world‑class smart irrigation to Algeria.