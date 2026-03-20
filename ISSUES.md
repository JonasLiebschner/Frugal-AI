# Proposed GitHub issues

1) Frontend unit tests cannot run  
   - Evidence: `pnpm test` fails with `Cannot find module 'karma-jasmine'` (Angular test builder `@angular/build:karma` expects Karma/Jasmine tooling).  
   - Impact: CI and local test runs are broken, so regressions cannot be caught.  
   - Fix: Add the missing Karma/Jasmine dev dependencies (e.g., `karma`, `karma-chrome-launcher`, `karma-jasmine`, `karma-jasmine-html-reporter`, `@types/jasmine`) and a Karma config, or switch the Angular test target to the current recommended test runner.

2) Chat submit POST has no backend endpoint  
   - Evidence: `dashboard/frontend/src/app/app.component.ts` calls `this.http.post(this.apiBaseUrl, payload)` in `sendPrompt`, but `dashboard/backend/Controllers/RequestsController.cs` only exposes GET routes (`/api/requests` and `/api/requests/comparison-models`).  
   - Impact: The chat window always fails with “Failed to submit request.” (HTTP 404/405), so users cannot create new requests from the dashboard.  
   - Fix: Implement a POST `/api/requests` endpoint (or adjust the frontend to the correct route/service) to accept and persist new requests.

3) Default time filter hides all sample data  
   - Evidence: The frontend initializes `startDateTimeInput` to “now minus 60 minutes” and `endDateTimeInput` to “now” (`getDefaultLocalDateTimeInput` in `dashboard/frontend/src/app/app.component.ts`). The backend sample data is timestamped around `2026-03-20T08:05Z–11:37Z` (`DashboardDataService`), so the initial API call includes `since`/`until` that exclude every record.  
   - Impact: The dashboard loads empty by default, making the app look broken until users manually widen the date range.  
   - Fix: Use a wider default window (e.g., last 24 hours), make the initial request unbounded, or align the seed data timestamps with the default filter.
