# LIVE SETUP — FOLLOW IN ORDER

### 1 — Supabase database
1. Open your Supabase project.
2. SQL Editor → New query.
3. Copy all of `supabase/schema.sql` into the editor.
4. Run it once.

### 2 — Your admin account
1. Supabase → Table Editor → `profiles`.
2. Find your own login email.
3. Set `role` to `admin`.

### 3 — Edge Function
1. Supabase → Edge Functions.
2. Create a function named exactly `create-user`.
3. Replace its code with all of `supabase/functions/create-user/index.ts`.
4. Deploy it.
5. Do not paste a service-role key into the website.

### 4 — Website files
Upload these together to your static website host:
- `index.html`
- `portal.html`
- `portal.js`
- `portal.css`
- `config.js`
- your original `haus-of-assistants-logo.png`

### 5 — Test admin login
Open the live website → Portal Login → sign in with your existing admin account.
You should see Overview, Tasks, Chat, Files, Invoices, Clients and Account.

### 6 — Test client creation
Clients → + Create Client → use a brand-new test email → enter name/package/hours → Create Client.
A temporary password should appear.

If an email already exists, the portal now gives a clear message instead of the old generic 400.

### 7 — Test client login
Use a private/incognito window. Log in with the new client email and temporary password. The client should not see Clients. In Account, change the password.

### 8 — Test everything
Client: create task, set priority/status, send chat, upload file.
Admin: confirm task/chat/file, create invoice, manage client.

### If anything fails
Stop. Do not change several files. Send the exact step and exact error and fix that one item only.
