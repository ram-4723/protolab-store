# ProtoLab backend setup

ProtoLab uses Vercel serverless functions, Supabase Auth/Postgres, and optional Resend email. The static GitHub Pages copy cannot run API functions; use the Vercel deployment for customer requests, order requests, and the admin panel.

## 1. Create and prepare Supabase

1. Create a Supabase project and keep its database password somewhere safe.
2. Open **SQL Editor** in the Supabase dashboard and run `supabase/migrations/20261029000100_customer_requests.sql`.
3. Run `supabase/migrations/20261029000200_customer_accounts.sql` to link requests to optional customer accounts and add customer-facing replies.
4. Run `supabase/migrations/20261030000100_store_orders.sql` to create the private store-order table.
5. In **Authentication → Users**, create the admin account you will use to sign in at `/admin.html`.
6. Copy that user's UUID, then run the following in SQL Editor, replacing the UUID:

   ```sql
   insert into public.admin_users (id)
   values ('00000000-0000-0000-0000-000000000000');
   ```

7. From **Project Settings → API**, copy the project URL, anon/publishable key, and service-role/secret key. The service-role key is private and must only be added to Vercel server environment variables.

## 2. Deploy with Vercel

Import `ram-4723/protolab-store` into Vercel (or link this repository to the existing Vercel project). In **Project → Settings → Environment Variables**, add these for Production, Preview, and Development as appropriate:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_...`); server only |
| `APP_URL` | Public site origin, e.g. `https://protolab-store.vercel.app` (no trailing slash) |

The API also accepts legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` variables if your project only shows those older keys. Prefer the publishable/secret pair when available.

Redeploy after adding or changing environment variables. Open the Vercel site and submit a test request, then confirm it appears in `/admin.html` after signing in.

## 3. Enable Google sign-in

The account page includes Google OAuth, but Supabase needs Google OAuth credentials before the button can authenticate users:

1. In Supabase, open **Authentication → Sign In / Providers → Google** and copy the callback URL shown there. It will look like `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Google Cloud Console, create an OAuth client ID for a **Web application**. Add the Supabase callback URL as an **Authorized redirect URI**.
3. Copy the Google client ID and client secret into Supabase's Google provider settings, enable the provider, and save.
4. In Supabase, open **Authentication → URL Configuration**. Set the Site URL to `https://protolab-store.vercel.app` and add `https://protolab-store.vercel.app/account.html` to the Redirect URLs allowlist. Add your local development URL too if testing locally, such as `http://localhost:8000/account.html`.
5. Redeploy if you changed `APP_URL`, then try **Continue with Google** on `/account.html`.

For production email/password sign-up, configure a custom SMTP provider in Supabase **Authentication → SMTP Settings**. Supabase's built-in sender is restricted and intended for testing.

## 4. Optional email replies and notifications

Create a Resend API key and verify a sending domain in Resend. Add these Vercel environment variables, then redeploy:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender, such as `ProtoLab <requests@example.com>` |
| `ADMIN_NOTIFICATION_EMAIL` | Inbox that should receive new request alerts |

Without Resend, requests are still saved and manageable in the admin inbox. “Save & email estimate” saves the quote; the admin inbox indicates if email was unavailable.

## Request workflow

- Project and part forms post to `/api/requests` and store validated submissions in `customer_requests`.
- `/account.html` lets customers create an account or sign in, then see their submitted requests, estimates, statuses, and customer-facing messages.
- `/admin.html` uses Supabase password authentication and only permits users listed in `admin_users`.
- Admins can search/filter requests, move them through statuses, set cost/build-time estimates, send customer-facing updates, add private notes, and email estimates when email is configured.
- Checkout requires a signed-in customer, verifies each product and price on the server, and stores an order snapshot in `store_orders`. Customers can see their order status and tracking number on `/account.html`; admins can manage status, payment state, tracking, and customer email updates in `/admin.html`.
- Database browser roles (`anon` and `authenticated`) have no table access. Server API functions use the private service-role key.

Order requests do not charge customers. Admins confirm stock, delivery cost, and payment instructions manually. Online payment processing, automated shipping labels, and stock reservation are not configured yet. Keep the storefront's priced products aligned with `data/components.json`; the server uses that file as the price authority.
