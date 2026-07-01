---
name: Sacred Assembly
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbd9d9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#eae8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#44474d'
  inverse-surface: '#303030'
  inverse-on-surface: '#f2f0f0'
  outline: '#75777e'
  outline-variant: '#c5c6ce'
  surface-tint: '#4f5f7b'
  primary: '#04162e'
  on-primary: '#ffffff'
  primary-container: '#1a2b44'
  on-primary-container: '#8292b0'
  inverse-primary: '#b6c7e7'
  secondary: '#5f5e5a'
  on-secondary: '#ffffff'
  secondary-container: '#e5e2dc'
  on-secondary-container: '#656460'
  tertiary: '#1f1400'
  on-tertiary: '#ffffff'
  tertiary-container: '#392700'
  on-tertiary-container: '#af8c47'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#b6c7e7'
  on-primary-fixed: '#091c34'
  on-primary-fixed-variant: '#374762'
  secondary-fixed: '#e5e2dc'
  secondary-fixed-dim: '#c9c6c1'
  on-secondary-fixed: '#1c1c18'
  on-secondary-fixed-variant: '#474743'
  tertiary-fixed: '#ffdea5'
  tertiary-fixed-dim: '#e9c176'
  on-tertiary-fixed: '#261900'
  on-tertiary-fixed-variant: '#5d4201'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e2'
typography:
  display-lg:
    fontFamily: Source Serif 4
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Source Serif 4
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Source Serif 4
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Source Serif 4
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Source Sans 3
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Source Sans 3
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Source Sans 3
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  caption:
    fontFamily: Source Sans 3
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1280px
---

## Brand & Style

This design system is built to serve faith communities through a visual language that balances liturgical tradition with modern accessibility. The brand personality is **solemn yet welcoming**, designed to feel like a digital extension of a physical sanctuary—quiet, intentional, and grounded.

The design style leans into **Corporate Modernism with a Tactile twist**. It prioritizes clarity and trust through a professional, clean interface while using warm tones and soft geometry to avoid feeling institutional or cold. The emotional response should be one of peace and reliability, ensuring that administrators and congregants alike feel a sense of "home" within the application.

- **Minimalism:** Used to reduce cognitive load during complex administrative tasks.
- **Professionalism:** High-quality typography and balanced proportions to signal stewardship and integrity.
- **Warmth:** A shift away from "tech-blue" toward a more organic, hospitable palette.

## Colors

The color palette is rooted in a sense of history and warmth. 

- **Primary (Deep Navy):** Represents stability, tradition, and the depth of faith. Used for headers, primary navigation, and high-importance actions.
- **Secondary (Warm Cream):** The "Canvas" of the system. Replaces pure white to reduce eye strain and provide a softer, more inviting atmosphere reminiscent of parchment or stone.
- **Tertiary (Gold):** Used sparingly as a "divine highlight" for special call-outs, active states, or celebratory milestones.
- **Neutral:** A range of soft charcoals and warm greys for body text and borders, ensuring high legibility without the harshness of pure black.

## Typography

The typographic pairing is a dialogue between the old and the new.

**Source Serif 4** provides the authoritative, literary backbone of the system. Use it for headings and titles to evoke the feeling of scripture or traditional hymnals. It conveys wisdom and permanence.

**Source Sans 3** is the functional workhorse. Its high x-height and clear terminals make it exceptionally readable for data-heavy church management tasks, such as attendance tracking and financial reporting. 

**Hierarchy Rules:**
- All major page titles use the serif.
- Form labels and navigation items use the sans-serif in a slightly heavier weight for clarity.
- Use generous line-heights (1.5x minimum for body) to maintain a feeling of "breath" and calm.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model. Content is contained within a centered 1280px max-width container on desktop to prevent lines of text from becoming too long, while the background color (Warm Cream) extends to the edges.

A strict **8px grid** governs all spacing. 
- **Whitespace:** Use whitespace aggressively to separate different functional areas (e.g., separating a "Giving" summary from a "Prayer Requests" list). This creates a sense of order and peace.
- **Desktop:** 12-column grid with 24px gutters.
- **Mobile:** Single column with 16px side margins. Cards should span the full width of the safe area.

## Elevation & Depth

To maintain a "welcoming" feel, this design system avoids harsh, deep shadows. Instead, it uses **Ambient Tonal Layering**.

- **Level 0 (Base):** The secondary color (Cream) is the background.
- **Level 1 (Cards):** Pure white surfaces with a very soft, diffused shadow (`0px 4px 12px rgba(26, 43, 68, 0.05)`). This creates a subtle "lift" that makes activity summaries feel like tangible slips of paper or stationery.
- **Level 2 (Modals/Popovers):** A slightly more defined shadow with a Gold tint in the ambient occlusion to suggest importance and warmth.
- **Outlines:** Use 1px borders in a muted version of the Navy (`rgba(26, 43, 68, 0.1)`) for input fields and dividers to maintain structure without introducing visual noise.

## Shapes

The shape language is defined by **Softened Rectangles**. By using a `0.5rem` (8px) base radius, we remove the "aggressive" sharpness of professional software and replace it with a friendlier, more human touch.

- **Buttons:** 8px radius for a standard look.
- **Cards:** Use `rounded-lg` (16px) to make summaries of church activities feel approachable.
- **Input Fields:** 8px radius to match buttons, creating a cohesive form-entry experience.

## Components

### Buttons
Primary buttons use the Deep Navy background with White text. Secondary buttons use a Navy outline with a transparent background. Action links use the Gold tertiary color to draw the eye without being overwhelming.

### Cards
Cards are the primary container for "Activity Summaries" (e.g., Upcoming Services, Recent Donations). They should feature a White background, the `rounded-lg` radius, and a subtle Navy-tinted shadow. Headers within cards should use the Serif font.

### Form Fields
Inputs must feel "sturdy" and trustworthy. Use a White background with a 1px Navy-tinted border. On focus, the border should transition to Gold. Labels must always be visible (never use placeholder-only labels) to ensure accessibility for all age groups in the congregation.

### Chips & Tags
Use soft, desaturated versions of the Primary color for categorizing members (e.g., "Volunteer," "New Member"). Text inside chips should be Sans-serif, Bold, and all-caps for distinctness.

### Navigation
Icons should be "Linear" and "Open" style (no heavy fills) to keep the UI light. Use the Navy color for the active state and a muted Grey for inactive states.