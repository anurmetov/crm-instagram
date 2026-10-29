# Potok

An Instagram CRM demo built with **React + TypeScript + Vite** for testing the UI/UX on desktop and mobile. The original mockup, `index (1).html`, is kept as a reference file and is not included in the build.

## How the Demo Works

When you open the app, it loads 20 sample contacts across all pipeline stages. You can create, edit, and delete contacts, and update their stages, notes, amounts, products, and priorities. Search, filters, sorting, history, and analytics work with the current data.

**Changes are stored in memory only, until the page is reloaded.** Navigating between sections preserves them. Reloading the page or reopening the app restores the original sample data; each browser tab has its own data.

The server, database, API, Instagram integration, and automations have been removed. The “Instagram” and “ManyChat” values on contact cards are source labels used only to test the interface and analytics. Contacts are added manually. The app does not use localStorage/sessionStorage or read previously saved data.

Initial metrics: 15 active leads, 3 payments, 2 lost leads, €630 in revenue, €2,950 in potential revenue, and a 15% conversion rate. Metrics are recalculated whenever contact cards change.

## Running Locally

Requires Node.js 22.18+ (24 LTS recommended).

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. To test on a phone connected to the same Wi-Fi network, use the Network URL displayed by Vite.

```sh
npm run build       # TypeScript check + production build in dist/
npm run preview     # preview the production build
npm test            # CRM rules and in-memory data
npm run test:e2e     # build and run browser tests against the production version
```

Browser tests cover desktop and mobile emulation using an installed copy of Google Chrome. If Chrome is not installed, install Chromium with `npx playwright install chromium` and remove `channel: 'chrome'` from `playwright.config.ts`.

## Deploying to Vercel

The project root includes a `vercel.json` file configured for a static Vite build. Connect the repository to Vercel and select:

- **Root Directory:** the root of this project.
- **Framework Preset:** Vite.
- **Build Command:** `npm run build`.
- **Output Directory:** `dist`.
- **Environment Variables:** none required.

Then click **Deploy**. The build includes HTML, CSS, JavaScript, fonts, and icons; no server functions or external database are required. See the [Vercel documentation for Vite](https://vercel.com/docs/frameworks/frontend/vite).

Navigation uses `/#overview`, `/#pipeline`, `/#leads`, and `/#analytics`, so no additional rewrites are needed. Icons and a web manifest allow you to add a shortcut to your home screen. Full offline caching is not available.

## Project Structure

```text
src/
  App.tsx                 app shell, navigation, notifications
  components/             pipeline, cards, form, analytics
  hooks/useCrm.ts          current session state
  lib/domain.ts           types, data schemas, filters, and CRM rules
  data/seed.ts            20 demo contacts
  services/leads.ts       in-memory data only
  styles.css              desktop, tablet, mobile, safe-area support
public/                   icons and web manifest
tests/                    unit and browser test scenarios
vercel.json               static build configuration for Vercel
```
