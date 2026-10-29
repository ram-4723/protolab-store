# ProtoLab backend setup

The customer request workflow uses Vercel serverless functions, Supabase Auth/Postgres, and optional Resend email. The static GitHub Pages copy cannot run the API functions; deploy this repository to Vercel for the request forms and admin inbox to work.

## 1. Create and prepare Supabase

1. Create a Supabase project and keep its database password somewhere safe.
2. Open **SQL Editor** in the Supabase dashboard and run `supabase/migrations/20261029000100_customer_requests.sql`.
3. In **Authentication → Users**, create the admin account you will use to sign in at `/admin.html`.
4. Copy that user's UUID, then run the following in SQL Editor, replacing the UUID:

   ```sql
   insert into public.admin_users (id)
   values ('00000000-0000-0000-0000-000000000000');
   ```

5. From **Project Settings → API**, copy the project URL, anon/publishable key, and service-role/secret key. The service-role key is private and must only be added to Vercel server environment variables.

## 2. Deploy with Vercel

Import `ram-4723/protolab-store` into Vercel (or link this repository to the existing Vercel project). In **Project → Settings → Environment Variables**, add these for Production, Preview, and Development as appropriate:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role/secret key; server only |

Redeploy after adding or changing environment variables. Open the Vercel site and submit a test request, then confirm it appears in `/admin.html` after signing in.

## 3. Optional email replies and notifications

Create a Resend API key and verify a sending domain in Resend. Add these Vercel environment variables, then redeploy:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender, such as `ProtoLab <requests@example.com>` |
| `ADMIN_NOTIFICATION_EMAIL` | Inbox that should receive new request alerts |

Without Resend, requests are still saved and manageable in the admin inbox. “Save & email estimate” saves the quote; the admin inbox indicates if email was unavailable.

## Request workflow

- Project and part forms post to `/api/requests` and store validated submissions in `customer_requests`.
- `/admin.html` uses Supabase password authentication and only permits users listed in `admin_users`.
- Admins can move requests through statuses, add estimated cost/build time and notes, and email a quote when email is configured.
- Database browser roles (`anon` and `authenticated`) have no table access. Server API functions use the private service-role key.

This is the request/estimate workflow; online payments, shipping integrations, and inventory management are not configured by these files.
