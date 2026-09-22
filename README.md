# Haus Of Assistants

Production-ready static website + Supabase client portal.

## Stack
- Vercel: static hosting
- GitHub: source control and automatic Vercel deploys
- Supabase: Auth, Postgres, Storage, Realtime and Edge Function

## 1. Supabase database
Open Supabase > SQL Editor > New query. Paste the complete contents of `supabase/schema.sql` and run it once. The script is designed to be safe to re-run.

## 2. Admin account
Create/sign up your admin Auth user in Supabase, then ensure that user has a row in `public.profiles`. If your existing project already has your profile, keep it. Set its `role` to `admin` in Table Editor.

If an Auth user exists but no profile row exists, insert one in SQL Editor, replacing the email:

```sql
insert into public.profiles (id,email,full_name,role)
select id,email,'Brigette Slattery','admin'
from auth.users
where email='YOUR_ADMIN_EMAIL'
on conflict (id) do update set role='admin';
```

## 3. Storage
Running `supabase/schema.sql` creates/updates the private `client-files` bucket and its RLS policies.

## 4. Edge Function
Create/deploy a Supabase Edge Function named exactly `create-user` using `supabase/functions/create-user/index.ts`.

The function needs these Supabase secrets/environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key must stay in Supabase only. Never put it in GitHub, Vercel browser files or `config.js`.

The included `supabase/config.toml` sets `verify_jwt = false` because the function performs its own authenticated-user check and verifies the caller is an admin before using the service role.

## 5. Browser config
`config.js` contains only the Supabase project URL and publishable key. These are public browser credentials and are protected by Row Level Security. Never add a service-role key here.

## 6. GitHub
Create a new GitHub repository and upload/commit the contents of this folder at the repository root.

Recommended first commit:

```bash
git init
git add .
git commit -m "Launch Haus Of Assistants website"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## 7. Vercel
In Vercel choose **Add New > Project**, import the GitHub repository, and deploy it as a static site.

- Framework preset: Other
- Build command: leave empty
- Output directory: leave empty
- Root directory: repository root

`vercel.json` supplies basic security headers. Every push to `main` will then redeploy automatically.

## 8. Supabase Auth URLs
In Supabase > Authentication > URL Configuration:
- Set **Site URL** to your final Vercel/custom domain.
- Add the production URL to **Redirect URLs**.
- While testing, also add your Vercel preview URL if password-reset links need to work there.

## 9. Test checklist
1. Open homepage and submit an enquiry. Confirm a row appears in `public.enquiries`.
2. Open `portal.html` and sign in as admin.
3. Create a test client. Confirm the temporary password appears once.
4. Sign in as the client in an incognito/private window.
5. Create/update a task.
6. Send chat messages in both directions.
7. Upload and download a file.
8. Create an invoice as admin and confirm the client can see it.
9. Update the test client's package/hours and confirm the correct client row changes.
10. Test password reset from the production domain.

## Security notes
- RLS is enabled on all client data tables.
- Client files are stored in a private bucket and downloaded using short-lived signed URLs.
- Client creation is admin-only and handled server-side by the Edge Function.
- Never commit a Supabase service-role key.
