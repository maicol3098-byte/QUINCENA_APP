# Quincena

A payday-based personal finance tracker: budgets per pay period, a draft for every account and card that you match against the bank, sinking funds that always equal what your savings accounts hold, interest tracking, and a dashboard that shows the effect of a movement before you save it.

Node.js (Express) + PostgreSQL. No build step: the front end is plain HTML, CSS and JavaScript in `public/`.

## What is in the box

| Path | What it is |
|---|---|
| `server/index.js` | The web server and every API route |
| `server/auth.js` | Passwords, sessions and the sign-in cookie |
| `server/db.js` | Database connection and schema (tables are created on start) |
| `public/` | The app itself (`index.html`, `app.js`, `app.css`, and the spreadsheet reader in `vendor/`) |
| `test/smoke.js` | An API test that runs against a real database |

## Accounts and sign-in

- **The first account created is the administrator.** After that, sign-up is closed unless you set `ALLOW_SIGNUP=true`.
- Administrators add people under **Setup, People**: create an account with a temporary password, change roles, disable, reset a password, or delete someone (which deletes their data).
- Every person's settings, drafts and movements are separate. Nobody, including an administrator, can see another person's money through the app.
- **Keep me signed in** stores a 30-day cookie that renews while you keep using the app. Without it, the session ends when the browser closes (12 hours at most).
- Passwords are hashed with bcrypt. Sessions are random tokens stored hashed in the database, sent as an `HttpOnly`, `SameSite=Lax` cookie that is HTTPS-only in production. Changing your password signs out your other devices.

## Deploy to Railway from GitHub

1. Create an empty repository on GitHub and push this folder to it:
   ```bash
   git init && git add . && git commit -m "Quincena"
   git branch -M main
   git remote add origin https://github.com/<you>/quincena.git
   git push -u origin main
   ```
2. In Railway: **New Project, Deploy from GitHub repo**, and pick the repository.
3. In the same project: **New, Database, Add PostgreSQL**.
4. Open the app service, **Variables**, and add:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `NODE_ENV` | `production` |
   | `ALLOW_SIGNUP` | `false` |
5. Open the app service, **Settings, Networking, Generate Domain**.
6. Open the domain and create the first account. That account is the administrator.

Every push to `main` redeploys. `railway.json` tells Railway to start with `npm start` and to use `/healthz` as the health check. The tables are created automatically on first start; there is nothing to run by hand.

## Run it on your own machine

```bash
npm install
createdb quincena
DATABASE_URL=postgres://localhost/quincena npm start
# open http://localhost:3000
```

`npm test` runs the API test. Point it at an empty scratch database, because it creates and deletes accounts:

```bash
createdb quincena_test
DATABASE_URL=postgres://localhost/quincena_test npm test
```

## Bringing your data in

- **From the earlier Quincena (inside Claude):** in the old app open Setup and press "Copy a backup of everything". In this app open **Setup, Backup and restore**, paste the text, and press Restore.
- **From the Google Sheets budget:** in Google Sheets choose File, Download, Microsoft Excel (.xlsx). In this app open **Setup, History from your Google Sheet** and choose the file. It is read in your browser; you get a preview that compares every account and fund with the sheet before anything is saved.
- **Backups:** Setup, Backup and restore, "Download a backup" gives one JSON file with everything of yours.

## Exchange rate

Setup, Preferences has "Use today's reference rate", which asks the server for the Costa Rican central bank's dollar sell rate as republished by the Ministerio de Hacienda (`https://api.hacienda.go.cr/indicadores/tc`). Tick "Update it automatically each day" to refresh it the first time you open the app each day. Each movement keeps the colón value from the day it was recorded, so changing the rate never rewrites history.

## Settings reference

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `NODE_ENV` | `development` | `production` makes the cookie HTTPS-only |
| `ALLOW_SIGNUP` | `false` | `true` lets anyone with the link create an account |
| `PORT` | `3000` | Railway sets this itself |
| `PGSSLMODE` | unset | `require` to force TLS to the database |
