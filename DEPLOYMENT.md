# Deploying your Wedding ERP — step by step

No coding needed for this. Two stops: **GitHub** (to hold the code) and **Render**
(to run it, for free). About 10 minutes total.

## Part 1 — Put the code on GitHub

1. Go to [github.com](https://github.com) and sign up if you don't already have an
   account (free).
2. Once logged in, click the **+** icon top-right → **New repository**.
3. Name it `wedding-erp` (any name works). Leave everything else as default. Do **not**
   check "Add a README" — we already have one. Click **Create repository**.
4. On the next page, look for the small text link that says **"uploading an existing
   file"** (it's in the paragraph under the quick-setup box).
5. Unzip the file we sent you on your computer. Then **drag the entire unzipped folder's
   contents** (all files and the `public`, `src`, `scripts` folders together — select
   everything inside the unzipped folder, not the folder itself) into the GitHub upload
   box. Modern browsers preserve the folder structure automatically.
6. Scroll down, add a commit message like "Initial upload" if you like, and click
   **Commit changes**. Wait for the upload to finish — it's all small text files, so
   this takes seconds.
7. Confirm it worked: you should see folders named `public`, `src`, `scripts`, and files
   like `render.yaml` and `README.md` listed in your new repository.

## Part 2 — Deploy it on Render

1. Go to [render.com](https://render.com) and sign up — the **"Sign up with GitHub"**
   option is easiest, since Render will need permission to read your new repository
   anyway.
2. Once logged in, click **New +** (top right) → **Blueprint**.
3. Render will ask you to connect a GitHub repository. Pick the `wedding-erp` repo you
   just created. (If it's not listed, click "Configure account" and grant Render access
   to it.)
4. Render automatically finds the `render.yaml` file in the repo and shows you a preview:
   one web service (`wedding-erp`) with a 1 GB persistent disk attached. You don't need
   to change anything here.
5. Click **Apply** (or **Create New Resources**). Render will build and start the app —
   watch the **Logs** tab; you're looking for the line `Wedding ERP running at
   http://localhost:...` and, just above it, `Seeding Wedding ERP demo data...` (that
   second line should only ever appear on this very first deploy).
6. When it says **Live**, click the URL at the top of the page (something like
   `https://wedding-erp-xxxx.onrender.com`). Your site is now public and shareable.

That's it — no command line, no `npm install`, nothing else to configure. The `SESSION_SECRET`
Render generated for you and the persistent disk are already wired up correctly via
`render.yaml`.

## Part 3 — First things to do once it's live

1. **Log in** with the demo Super Admin account: `admin@wedding.test` / `password123`.
2. **Change that password immediately** — go to **Settings → My account**. While you're
   there, add real accounts for you, your husband, and your brother-in-law under
   **Settings → Team & roles** (Super Admin can add teammates and pick their role), and
   either change or delete the other four demo logins (`finance@`, `guests@`, `vendors@`,
   `viewer@wedding.test`) if you won't use them.
3. **Clear out the demo data** — the 10 sample vendors, 30 sample guests, etc. exist so
   you could see the app working end-to-end. Delete what you don't need from **Vendors**,
   **Guests**, **Rooms → Hotels**, **Expenses**, and **Functions/Events**, then start
   entering your brother-in-law's real wedding details from **Wedding Details** in the
   sidebar.
4. **Add your hotels** — go to **Rooms → Add Hotel**. Fill in the hotel's name and, in
   the "Generate rooms automatically" section, enter how many of each room type it has
   (Single, Double, Twin, Triple, Suite, Family) and the nightly rate for each — the app
   creates and numbers every room for you. You can add more rooms to an existing hotel
   later from that hotel's **Edit** page.
5. **Share guest portal links** — **Guests → Guest Portal Links** lists a unique,
   private link per guest. Send each guest their own link (WhatsApp is easiest) so they
   can confirm attendance and submit their Aadhaar number for room allocation, without
   needing a login.

## Updating the app later

Made a change to the code (or asked us for one)? Upload the changed files to the same
GitHub repository the same way as Part 1, step 5 (GitHub lets you drag a replacement
file onto an existing one). Render watches the repo and redeploys automatically within a
minute or two. Your data is untouched — it lives on the persistent disk, not in the code
repository, and `scripts/start.sh` only seeds demo data when the database doesn't exist
yet.

## If something goes wrong

- **Blueprint doesn't show `render.yaml`** — double-check that file was actually
  uploaded to the root of the GitHub repo (not inside a subfolder) in Part 1.
- **Site loads but looks empty / errors on load** — open the **Logs** tab on Render and
  check for the `Seeding Wedding ERP demo data... / Seed complete.` lines; if the disk
  didn't attach correctly you'd see a database error instead. Render's free disks are
  reliable, but if this happens, delete and re-run the Blueprint from Part 2.
- **Free plan spins down when idle** — Render's free web services sleep after periods of
  inactivity and take ~30–50 seconds to wake up on the next visit. If that's a problem
  as the wedding gets closer (e.g. many guests using it at once), upgrade the service
  to a paid "Starter" plan from the Render dashboard — no code changes needed.
