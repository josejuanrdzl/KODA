# Lessons Learned: KODA Module Implementation & Stabilization

This document summarizes critical bugs and configuration issues encountered during the implementation of the Weather, FX-Rates, and Familia modules (March 2026).

## 1. Authentication & API Keys
### Issue
Environment variables set in production (Fly.io) were found to contain hidden characters or trailing spaces. This caused `401 Unauthorized` errors even when the keys were "correct."
### Prevention
- **Always trim keys**: In every handler using external APIs, use `.trim()` on the environment variable.
- **Verification**: Use a small debug script to log the `.length` and hex representation of keys if auth fails unexpectedly.

## 2. Module Access & Plan Permissions
### Issue
New modules (e.g., `weather`, `shopping`) were implemented code-wise but returned "user lacks access" because they weren't registered in the database or linked to the user's plan.
### Prevention
- **Registration Script**: Every module must have a registration entry in the `modules` table (slug, name, is_public).
- **Plan Linking**: New modules must be linked to plans in the `plan_modules` table. 
- **Testing Phase**: For development/testing, ensure all modules are linked to all active plans (using a script like `grant_all_access.js`).

## 3. Date Handling & Timezone Shifts
### Issue
Dates (birthdays, reminders) were saved or displayed one day early. This was caused by mixing local date strings with UTC-based methods like `.toISOString()`.
### Prevention
- **Avoid ISO for date-only**: Do not use `toISOString().split('T')[0]` for calendar dates (YYYY-MM-DD). It converts to UTC first, which shifts the day if local time is before midnight UTC.
- **Local Parsing**: Use `new Date(dateStr + 'T00:00:00')` to ensure a date string is interpreted at midnight local time.
- **Precise Age Calculation**: Compare the full month and day against the current date to determine if a birthday has passed in the current year.

## 4. Action Parsing (LLM integration)
### Issue
Using `:` as a delimiter in `actionParser.js` failed when the content itself contained colons (like ISO timestamps in reminders).
### Prevention
- **Robust Regex**: Use regex that captures parameters specifically (e.g., greedy vs. non-greedy matches) or use unique delimiters like `|` when parameters are likely to contain special characters.
- **Fallback logic**: Always provide a fallback for parsing failures to avoid breaking the entire response stream.

## 5. Deployment Checks
### Issue
Deployment without a full rebuild sometimes missed configuration changes.
### Prevention
- **Remote Builds**: Use `fly deploy --remote-only` to ensure a consistent build environment and always watch logs immediately after deployment to catch 401s or permission errors.
