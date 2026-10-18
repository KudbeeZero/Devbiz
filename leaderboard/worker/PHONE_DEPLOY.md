# Deploy the leaderboard Worker from a phone

No computer needed. The Worker ships as one file, `dist/worker.single.js`,
which you paste into the Cloudflare dashboard. Everything below is done in
Safari on iPhone.

## 1. Check the database is empty (D1 → devbiz → Console)

Run:

```sql
SELECT name FROM sqlite_master WHERE type = 'table';
```

If the list is empty, go on. If it shows `scores` or `saves`, stop and ask
before running anything.

## 2. Create the tables (same Console)

Open `leaderboard/worker/schema.sql` on GitHub (the mobile site works), copy
the whole file, paste it into the Console, and run it. Running it again later
is harmless.

## 3. Create the Worker

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Start with Hello World!**
2. Name it `kudbee-leaderboard` (this sets the address
   `kudbee-leaderboard.kudbee.workers.dev`), then **Deploy**.
3. Open the Worker → **Edit code**.
4. Open `leaderboard/worker/dist/worker.single.js` on GitHub and tap **Raw**.
   Select all, copy.
5. Back in the code editor, select everything in the file pane, paste over it,
   then **Deploy**.

## 4. Connect the database

Worker → **Settings** → **Bindings** → **Add** → **D1 database**:

- Variable name: `DB`
- Database: `devbiz`

Save, then **Deploy** again so the binding takes effect.

## 5. Check it

Open `https://kudbee-leaderboard.kudbee.workers.dev/api/health` in Safari.
It should respond with a success result, not an error page.

## Updating later

When the Worker code changes, the file in `dist/` is rebuilt and checked by the
tests. Repeat step 3 (copy the new Raw file, paste, Deploy). The database and
bindings stay as they are.

If `npm run test:leaderboard` fails with "dist is stale", the sources changed
without a rebuild. Run `node worker/build-single.mjs` (on a computer), commit
the new file, and re-paste it.
