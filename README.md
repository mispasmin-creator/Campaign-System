# Campaign Life FMS

Frontend-only React web application for tracking refractory campaigns of rotary kilns in sponge-iron plants.

Built strictly according to the reference UI mockup (`campaign-life-ui-samples.html`), featuring an industrial design system with **Barlow Condensed**, **IBM Plex Sans**, **IBM Plex Mono**, dark/light theme support, and a mobile-first inspector layout.

---

## 🚀 How to Run Locally

### 1. Prerequisites
- Node.js (v18+)
- npm or pnpm

### 2. Start Development Server
```bash
# Run from root directory:
npm run dev

# Or from inside Campaign/ folder:
cd Campaign
npm run dev
```

### 3. Run Unit Tests (Vitest)
Unit tests verify the Sunday-skipping working day engine (`WORKDAY.INTL`), delay rules, and averages:
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
```

---

## 🗄️ Where Data is Stored

- **Browser Storage**: All records are stored directly in your browser's `localStorage` under the key:
  ```text
  campaign-life-fms-v1
  ```
- **Async API Contract**: Every data function in `src/services/storage.js` returns a `Promise`. The entire UI treats data access as asynchronous.
- **Seeded Demo Workspace**:
  - 6 sponge-iron companies
  - 13 kilns across varying capacities (80 TPD, 100 TPD, 120 TPD, 150 TPD, 250 TPD, 350 TPD)
  - 12 service orders (`CN-01` to `CN-12`) representing every phase of the workflow (on-time, due today, late)
  - 4 per-service-order customer contacts for KYC
  - Multi-campaign historical refractory wear and shell temperature data
  - Call logs with all 3 statuses (`yes`, `no`, `forgot`)
- **Image Compression**: Photos are client-side resized using an HTML5 Canvas to a maximum dimension of 800px before base64 encoding to prevent hitting browser storage limits.

---

## 💾 Backups & Restores

1. **Export Backup (JSON)**:
   - Go to **6 · Settings** tab.
   - Click **↓ Export JSON Backup**. A JSON file containing all companies, kilns, service orders, tasks, inspections, call logs, and KYC contacts will download automatically.
2. **Import Backup (JSON)**:
   - In Settings, click **↑ Import JSON Backup** and select any previously exported JSON file.
3. **Reset Demo Data**:
   - In Settings, click **Reset demo data** to wipe custom changes and restore the realistic initial dataset.

---

## ⚙️ 5-Step Workflow Lifecycle

Each Service Order (`CN-01`, `CN-02`...) transitions strictly through 5 operational steps:

```
[1. Company Visit] (Sales)
       │
       ▼ (Start Date + 7 Working Days)
[2. Running Kiln Inspection] (Sanjay)
       │
       ▼ (Expected Shutdown - 3 Working Days)
[3. Take Shut Down Date / Call Tracker] (Sanjay)
       ├── Status "yes"    ──► [4. Shutdown Inspection] (Sanjay) ──► [5. Restart Process] (CRM)
       ├── Status "no"     ──► Stays in Call Tracker (next call date updated)
       └── Status "forgot" ──► Skips Step 4 ──► [5. Restart Process] (CRM)
```

1. **Company Visit** (Sales Co-ordinator):
   - Site visit record, auto `CN-XX` generation, kiln sizing, start date.
   - Schedules Step 2 (+7 working days).
2. **Running Kiln Inspection** (Sanjay Singh):
   - Inner temperature + photo, 9 outer zone shell temperatures.
   - Live average temperature calculation, days running since start.
   - Schedules Step 3 (-3 working days from expected shutdown).
3. **Take Shut Down Date** (Call Tracker):
   - Outbound call logs with exactly 3 status choices:
     - `no`: Order remains in queue, `nextCallDate` updated (> today), call count increments.
     - `yes`: Finalizes shutdown date, schedules Step 4 on shutdown date and Step 5 at (+2 working days).
     - `forgot`: Shutdown inspection is skipped; directly schedules Step 5 at (+2 working days).
4. **Shutdown Inspection** (Sanjay Singh):
   - Refractory thickness remaining (mm) across 9 zones, live average.
   - Zones under 160 mm trigger critical wear indicators.
   - Schedules Step 5 (+2 working days).
5. **Restart the Process** (CRM):
   - Reuses the visit form: selects old order to close, creates new campaign service order, repeats cycle.

---

## 📅 Working Days & Delay Rules (`src/utils/workflow.js`)

- **Sunday Off Rule**:
  - Identical to Excel's `WORKDAY.INTL(date, n, "0000001")`.
  - Sunday is the only off day. Monday to Saturday are working days.
  - `n = 0` leaves the date unchanged.
  - `n > 0` steps forward skipping Sundays.
  - `n < 0` steps backward skipping Sundays.
- **Delay Calculation**:
  - Completed task: `delay = actualDate > plannedDate ? (actualDate - plannedDate) : 0`.
  - Pending task: `delay = today > plannedDate ? (today - plannedDate) : 0`.
  - Early or on-time tasks show 0 delay.

---

## 🔌 Future Backend Migration

The application follows the **Repository/Service pattern**. To connect a real backend (Node.js/Express, Go, Python, Supabase, Firebase, or PostgreSQL):

1. Open `src/services/storage.js`.
2. Replace localStorage calls with HTTP `fetch` or SDK calls:
   ```javascript
   export async function getData() {
     const res = await fetch('/api/campaigns');
     return res.json();
   }

   export async function saveData(data) {
     const res = await fetch('/api/campaigns', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(data)
     });
     return res.json();
   }
   ```
3. Keep the function signatures and return types identical. **No changes to any component or page file will be needed.**
