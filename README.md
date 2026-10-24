# Nyago Cargo Portal — public booking release candidate

This package adapts the portal for **public customer bookings without login**. Booking submissions call a Supabase Edge Function, which validates input, calculates server-side charges, assigns a tracking ID and inserts the shipment. The browser must never receive the Supabase service-role key.

## Important before production

This is a release candidate, not a verified live deployment. Your provided schema has no `insured` column, and `shipments` requires pricing and estimated-delivery fields. This package maps insurance to `insurance_fee_sar`, removes the nonexistent `insured` database column, and calculates the required fields in the Edge Function. Rates (air 23 SAR/kg, sea 13 SAR/kg, handling 25 SAR, insurance 2%) are copied from the current UI and must be confirmed by the business owner. Delivery estimates (7 days air / 28 sea) are placeholders.

The Edge Function assumes `cargo_type` accepts `Air Freight` and `Sea Freight`, `payment_status` accepts `Pending`, and the supplied table columns/types match the schema you shared. Verify CHECK constraints before deploying. The SQL migration replaces the public read/insert policies and defines a minimal tracking RPC. Review existing policy names and admin dashboard behavior before applying it.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local`, fill the Supabase project URL and publishable/anon key.
3. `npm run dev`
4. In Supabase CLI, link the project, then set the function secret and deploy:

   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   supabase functions deploy create-shipment-booking
   ```

   `SUPABASE_URL` is available to deployed Supabase functions; if not, set it as a function secret too. Never put the service role key in `.env.local`, Vercel browser variables, source control, or this package.
5. Apply `supabase/migrations/202610240001_secure_public_tracking.sql` to **staging first** after reviewing current policies and constraints. Do not blindly run it in production.
6. Run `npm run test:contracts`, `npm run build`, and browser tests. To run live staging API tests, set `RUN_BOOKING_API_TESTS=true` with the test project URL and publishable key, then run `npm run test:e2e`.
7. Import the repo into Vercel as a Vite app, build command `npm run build`, output `dist`; configure only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.

## Integration acceptance tests

- Anonymous customer creates a valid booking without signing in.
- Invalid/zero/negative weight and invalid package count are rejected.
- Browser-supplied price/payment status cannot override server calculation; payment starts `Unpaid` (or `Pay on Delivery` only when explicitly selected).
- Public tracking returns status/timeline and no phone, address, Iqama, declared value, or payment fields.
- Anonymous REST SELECT/INSERT/UPDATE/DELETE against `shipments` is denied.
- Admin can read/update/delete shipment rows; non-admin cannot.
- Duplicate/random tracking IDs are handled; booking errors are logged server-side without returning private database details.
- Test CORS and rate limiting before production; consider CAPTCHA or abuse controls because public booking is intentionally anonymous.

## Caveats

The original UI also references `profiles` and a profile-based saved contacts feature. The realtime subscription has been corrected to remove a `shipments.user_id` filter because that column is absent from the current schema. Those don't appear in the schema you provided and need separate alignment. Anonymous bookings have no authenticated owner; do not enable owner-based realtime until you introduce a safe ownership model. UI syntax and build still need to be verified in your environment, and no deployment/database change has been performed by this package generation.
