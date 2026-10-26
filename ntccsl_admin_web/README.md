# NTCCSL React admin portal

This Vite + React application is served by the existing Google Apps Script web app. It uses the current `adminApi()` function through `google.script.run`, so the React UI does not make cross-origin requests to the Apps Script JSON endpoint.

## Development

```sh
npm install
npm run dev
```

For local sign-in and live spreadsheet data, create `.env.local` in this folder:

```ini
VITE_GAS_EXEC_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Use your deployed Apps Script `/exec` URL without `?panel=1`, then restart Vite. The development server proxies API calls to `doPost`, avoiding browser cross-origin restrictions. Never put passwords, Cashfree keys, or other credentials in this file. Without this setting, API calls only work inside the deployed Apps Script HTML-service page.

## Build and deploy

```sh
npm run typecheck
npm run build
```

The build writes a self-contained `Admin.html` in this directory. Keep the generated file beside `Code.gs` in the bound Apps Script project, then deploy a new web-app version. Open the deployment URL with `?panel=1` to use the React portal.

The Apps Script project must include the current `Code.gs`, its existing Sheets/Drive setup, and the appropriate Cashfree Script Properties when enabling payments. The server remains authoritative for login, roles, permissions, validation, loan calculations, and payment verification.

## Included portal pages

Sign in and member registration, dashboard, bank ledger, FD/RD/DRD schedules, users, role permissions, loan master and scheme management, personal loans, gold loans, approved loans and schedules, member installment payments, profile/password updates, and support.

Each screen lives in its own component under [`src/pages`](./src/pages), shared form/table components live in [`src/components/ui.tsx`](./src/components/ui.tsx), and `src/App.tsx` handles role-aware navigation and page selection.

The dashboard summarizes ledger, deposit, and loan data with responsive overview cards and recent activity tables. Use **Refresh** to reload the latest dashboard data.

Data-backed screens show a shared, accessible portal loader while requests are pending and retain retry/error states when they fail. Form submissions, payment steps, permission updates, and repayment schedule actions also show progress while in flight.

App notifications use accessible success, information, warning, and error toasts. They can be dismissed manually and close automatically after 4.5 seconds.

On **My profile**, use **Change photo** to preview and save a JPG, PNG, or WebP profile photo, or choose **Remove** to clear it. Images larger than the 300 KB server limit are resized in the browser before upload; the Apps Script backend stores the saved photo in Drive. Saved profile photos also appear in the **Users** table, with an initial shown if a photo is missing or cannot be loaded.

## Navigation

Use the top-left menu button to collapse or expand the sidebar on desktop. On mobile, it opens and closes the navigation drawer; choosing a page closes the drawer. The desktop sidebar choice is remembered in local storage. Use the account menu in the top-right corner to open your profile or sign out.

## Appearance

Use **Appearance** at the bottom of the navigation to choose **System**, **Light**, or **Dark**. System follows the browser/device color-scheme preference, including changes while the app is open. The selection is saved in local storage for the next visit.

The portal uses a shared blue-and-indigo color palette across pages, with separate semantic colors for success, warnings, and errors.
