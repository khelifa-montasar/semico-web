Extend the Settings page of the Semico platform with an advanced "Profile & Biography" section. This section allows the user (both Admin and Worker) to manage their account avatar, personal details, professional experience, education, and additional biographical information. The design must remain ultra‑minimalist, high‑precision, and fully bilingual (English / Arabic), seamlessly integrating with the existing Semico design system.

—

Core Design System (Semico – Unchanged):
• Palette: Semico Green (#00A859) for primary actions and focus states. Smart Blue (#0077B6) for secondary links. Dark Gray (#4A4A4A) for text. Energy Orange (#FF6B35) for validation errors only. Light mode background: #FAFAFA; Dark mode background: #0B1120.
• Typography: Inter (Latin) and Noto Sans Arabic (Arabic), weights 400 and 500. Body 16px, headings 20px. Monospaced (JetBrains Mono) for structured data like dates and labels.
• Grid & Spacing: Rigorous 8px grid. Padding within cards: 24px. Section spacing: 32px. Thin 1px borders (#EAECF0 light / #1E2A44 dark) for dividers.
• Border Radius: 8px on cards; 40px (pill) on buttons.
• Icons: Lucide outline, stroke width 1.5px.

—

Profile Section Layout (Within Settings Page):

The Settings page already contains tabs or sections. This new "Profile" section should appear as the first or a prominent section, separated from others by a thin horizontal rule. It consists of three logical sub‑sections stacked vertically with generous spacing.

---

1. Avatar & Basic Information Card

A horizontal card (or flex row) combining the avatar upload and essential fields.

• Avatar Area:
  - A large circular area (96x96px) displaying the current profile picture.
  - Default state: a minimal gray circle with a user icon (Lucide "User").
  - Hover overlay: a semi‑transparent black layer (opacity 0.3) with a camera icon and text "Change photo" (English) / "تغيير الصورة" (Arabic). Clicking opens a system file picker (mock in Figma).
  - The avatar uses a subtle 1px border and no shadow.

• Basic Fields (Right of Avatar):
  - Full Name (text input, width 100%, placeholder e.g., "Ahmed Benali")
  - Email (read‑only or disabled input, as it's tied to authentication)
  - Phone Number (text input with country code prefix, e.g., "+213")
  - Location: Wilaya (dropdown) and Commune (text input) inline.

All inputs use the established minimal style: bottom border only (1px), 48px height, 16px font. Labels are small, monospaced caps above each field.

---

2. Professional Experience Section

A clean, repeatable list of experience entries. Each entry is a card with minimal styling.

• Section Title: "Experience" / "الخبرات" (20px medium), with an "Add experience" text link (+ icon) aligned right.
• Entry Card (for each position):
  - Job Title (e.g., "Chief Agronomist") – 18px medium.
  - Company / Farm Name – 16px regular, secondary text.
  - Date Range: "Start Date – End Date" (or "Present") in monospaced small caps.
  - Description: A multi‑line text area (minimal border) for a brief description.
  - A subtle "Edit" (pencil) and "Delete" (trash) icon group appears on hover.
• Empty State: A minimal card with dashed border and text "Add your professional experience to build trust with the Semico community." / "أضف خبراتك المهنية لبناء الثقة مع مجتمع سيميكو."

---

3. Education & Certifications Section

Similar to Experience, a repeatable list of education entries.

• Section Title: "Education" / "التعليم" with "Add education" link.
• Entry Card:
  - Degree / Certification Name (e.g., "M.Sc. in Agricultural Engineering")
  - Institution Name (e.g., "École Nationale Supérieure Agronomique, Alger")
  - Year of Completion (dropdown or text, monospaced)
• Same minimal edit/delete controls on hover.

---

4. Biography / About Section

A dedicated area for a longer narrative.

• Section Title: "About" / "نبذة عني"
• Description: A multi‑line textarea with a subtle character count (e.g., "0/500"). Placeholder text: "Share your story, expertise, or why you're passionate about smart farming..." / "شارك قصتك أو خبرتك أو شغفك بالزراعة الذكية..."
• Minimal styling: 1px border, 16px padding, 8px border radius.

---

5. Action Buttons

At the bottom of the profile section, two pill‑shaped buttons aligned right (LTR) / left (RTL):
• "Save Changes" – solid Semico Green.
• "Cancel" – transparent with 1px border.
A subtle success toast appears upon save.

---

Bilingual & RTL Considerations:

• All text must exist in both English and Arabic. Provide a language toggle in the top bar.
• In Arabic (RTL), the avatar moves to the right, labels and inputs align right, and the order of elements (e.g., Wilaya then Commune) may need to reflect Arabic natural order (Commune then Wilaya). In this design, we keep the same field order but ensure text alignment is RTL.
• Icons such as camera, edit, trash, and add must be mirrored appropriately in RTL mode if they imply direction (e.g., an arrow pointing left in LTR becomes an arrow pointing right in RTL).

—

Figma Deliverables:

• Provide a single high‑fidelity frame of the Settings page scrolled to the "Profile" section, in both English (LTR) and Arabic (RTL) versions (Desktop 1440px).
• Show the hover states for the avatar upload overlay and the experience card controls.
• Include the empty state for Experience and Education.
• Use Auto Layout for all containers, ensuring spacing and alignment adhere to the 8px grid.
• Name layers semantically: "Profile/Avatar", "Profile/ExperienceCard", "Profile/AddButton", etc.
• Both light and dark mode variants should be represented (via Figma variable modes).

This addition transforms the Semico profile from a basic login account into a rich, trust‑building professional identity—essential for an AgriTech platform where expertise and local knowledge matter.