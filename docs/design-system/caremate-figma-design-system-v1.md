# CareMate Figma Design System v1

Figma file: https://www.figma.com/design/PimxwSSAN8rg864YvaWTke

This system is built for two connected experiences:

- Elderly user app: voice-first, large touch areas, high contrast, simple language.
- Caregiver dashboard: dense status scanning, fast access to health, medication, location, schedule, and alert details.

## Figma Build Status

Created in Figma:

- `CareMate Primitives` variable collection with raw color, space, radius, touch size, and stroke tokens.
- `CareMate Semantic` variable collection with high-contrast product tokens.
- Text styles using `Noto Sans KR`.
- Effect styles for senior cards, guardian cards, and floating voice actions.

Blocked by Figma Starter plan MCP limit:

- Documentation page layout.
- Local component sets.
- Screen examples.

When Figma MCP calls are available again, continue from this spec and the token file at `docs/design-system/caremate-tokens.json`.

## Foundations

### Color Roles

Use semantic roles in design files and code references. Primitive colors should remain hidden from normal design pickers.

| Role | Value | Usage |
| --- | --- | --- |
| `color/bg/senior` | `#EEF4FF` | Elderly home and calm primary surfaces |
| `color/bg/senior-warm` | `#F4EFE6` | Low-stress elderly setup and reading screens |
| `color/bg/guardian` | `#F8FAFC` | Caregiver dashboards |
| `color/surface/default` | `#FFFFFF` | Cards and panels |
| `color/surface/warm` | `#FFFDF8` | Elderly reading cards |
| `color/text/primary` | `#111827` | Default high-contrast text |
| `color/text/senior` | `#16213E` | Elderly primary text |
| `color/text/secondary` | `#475569` | Supporting text |
| `color/action/primary` | `#4F7CFF` | Elderly primary actions |
| `color/action/guardian` | `#05B547` | Caregiver positive/status actions |
| `color/state/danger-action` | `#DC2626` | Emergency and destructive actions |

### Typography

Use `Noto Sans KR` for Korean readability.

| Style | Size / Line | Weight | Usage |
| --- | ---: | --- | --- |
| `Senior/Display` | 34 / 42 | Bold | First-screen greeting |
| `Senior/Title` | 32 / 40 | Bold | Elderly page titles |
| `Senior/Heading` | 24 / 32 | Bold | Elderly card titles |
| `Senior/Body Large` | 21 / 30 | Medium | Primary elderly instructions |
| `Senior/Body` | 18 / 28 | Regular | Elderly body copy |
| `Senior/Button` | 22 / 30 | Bold | Large action labels |
| `Guardian/Title` | 24 / 32 | Bold | Dashboard headings |
| `Guardian/Section` | 20 / 28 | Bold | Dashboard card headings |
| `Guardian/Metric` | 24 / 32 | Bold | Stat values |
| `Guardian/Body` | 15 / 22 | Regular | Dense dashboard copy |
| `Common/Label` | 14 / 20 | Medium | Badges, labels |
| `Common/Caption` | 13 / 18 | Regular | Metadata, timestamps |

### Touch And Spacing

- Absolute minimum touch target: `48px`.
- Default elderly action height: `56px`.
- Comfortable primary action height: `64px`.
- Main voice button: `210px` circular target.
- Default screen padding: `20px`.
- Default card padding: `20px`.
- Use at least `16px` between conflicting actions such as "cancel" and "emergency call".

## Accessibility Rules

- Keep senior-facing body copy at `18px` or larger.
- Use color and text together for status. Do not rely on color alone.
- Use a visible focus ring with `color/border/focus` and `2px` stroke.
- Keep line length short in elderly screens. Prefer 1 sentence per block.
- Avoid long modals for elderly users. Prefer direct confirmation cards.
- Emergency actions must use clear labels: `119 전화`, `보호자에게 연락`.

## Copy Rules

Use direct, short Korean sentences.

Good:

- `버튼을 눌러 말씀하세요`
- `약 먹을 시간이에요`
- `보호자에게 연락해요`
- `위치를 다시 확인하세요`

Avoid:

- `복약 스케줄이 도래했습니다`
- `현재 상태 데이터가 동기화되지 않았습니다`
- `위치 갱신 요청을 전송하시겠습니까`

## Component Scope

### Elderly App Components

`SeniorButton`

- Variants: `Style=Primary | Secondary | Danger`, `State=Default | Pressed | Disabled`.
- Minimum height: `64px`.
- Text style: `Senior/Button`.
- Primary background: `color/action/primary`.
- Danger background: `color/state/danger-action`.

`VoiceCTA`

- Circular 210px target.
- Icon size: 96-112px.
- Label below: `버튼을 눌러 말씀하세요`.
- Uses `Elevation/Floating Action`.

`SeniorCard`

- Background: `color/surface/default` or `color/surface/warm`.
- Radius: `radius/card`.
- Padding: `20px`.
- Text: `Senior/Heading` and `Senior/Body`.

`MedicationReminderCard`

- States: `Scheduled`, `Due`, `Done`, `Missed`.
- Due and missed states must show both color and text.
- Primary action label: `먹었어요`.

`ScheduleCard`

- Shows time first, then event title.
- Keep event title to one line when possible.

### Caregiver Dashboard Components

`GuardianStatusHeader`

- Parent name, age/gender, live status, care status badge.
- Uses guardian title and metric styles.

`StatCard`

- Variants: `Type=Health | Location | Schedule | Medication`.
- Full card is tappable when it opens detail.
- Minimum touch height: `132px`.

`StatusBadge`

- Variants: `Tone=Success | Warning | Danger | Neutral`.
- Text must include the state, not just an icon.

`AlertListItem`

- Shows severity, message, time, and chevron.
- Danger alerts use danger text and a danger background chip.

`LocationPreviewCard`

- Map preview area plus latest update time.
- Include refresh/request location button at 48px minimum.

## Screen Examples To Build In Figma

### Elderly Home

First viewport:

- Greeting: `안녕하세요!`
- Subtitle with agent name.
- Settings icon button, 58px.
- Guardian message card.
- 210px voice CTA.
- Two summary cards: `오늘 일정`, `먹을 약`.
- Emergency actions below the main content.

### Caregiver Dashboard

First viewport:

- Parent status header.
- Four stat cards: health, location, today schedule, medication completion.
- Location preview.
- Parent information card.
- Recent alert list.
- Menu grid for conversation summary, voice question, letter, hospital schedule, alert history, information edit.

## Handoff Notes

- Keep token names slash-separated in Figma and convert to code names during implementation.
- Do not create separate icon variants for every icon. Use icon slots or instance swap properties.
- Do not shrink elderly screens to fit dense information. Move secondary detail below the fold.
- Guardian screens can be denser, but every tappable card still needs at least `48px` hit area.
