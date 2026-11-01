# Deep freeze

Track what's in your household's deep freezer, so you stop forgetting food and buying it again. Each household gets its own private, live-shared list.

Built with Vite, React, TypeScript and Supabase. This README grows with each milestone.

## Run it locally

You need [Node.js](https://nodejs.org) 22 or newer (the LTS download).

1. Create a Supabase project: go to [supabase.com](https://supabase.com), click **New project**, choose a name and region, and save the database password somewhere safe.
2. Set up the database: in Supabase, click **SQL Editor**, then **New query**. Paste each file from `supabase/migrations/` in number order and click **Run** after each one.
3. Add the sign-in code to the emails: first complete [Set up sign-in emails](#set-up-sign-in-emails), because Supabase may lock its templates until a custom email sender is on. Then go to **Authentication > Emails**, open the **Magic Link** template, replace its body with the contents of `supabase/email-template.html`, and save. Do the same for the **Confirm signup** template, because new users receive that one.
4. Copy `.env.example` to `.env.local`.
5. Fill in `.env.local`: in Supabase, click **Connect** at the top of the page and copy the project URL and the publishable (or anon) key.
6. In a terminal, in this folder, run:

```bash
npm install
```

```bash
npm run dev
```

7. Open the address it prints. To try it on your phone, use the **Network** address while the phone is on the same Wi-Fi.

## Set up sign-in emails

Supabase's built-in email is only for testing, so a real sender is needed before inviting anyone. These steps use [Resend](https://resend.com), which has a free plan and needs a domain you own.

1. Create a Resend account, click **Domains > Add domain**, and enter your domain.
2. Add the DNS records Resend shows at the company where you bought your domain, then wait for Resend to show **Verified**.
3. In Resend, click **API Keys > Create API key** and copy the key.
4. In Supabase, go to **Authentication > Emails > SMTP Settings** and turn on **Enable custom SMTP**.
5. Enter these values, then save:
   - Sender email: `freezer@yourdomain.com`
   - Sender name: `Deep freeze`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your Resend API key

## Deploy it

1. Put this project in a GitHub repository.
2. In [Vercel](https://vercel.com), click **Add New > Project** and import the repository.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then click **Deploy**.
4. Copy your Vercel address. In Supabase, go to **Authentication > URL Configuration**, set **Site URL** to that address, and add it under **Redirect URLs**.

## Deploy your own private copy

Coming in milestone 9, with a one-click deploy button.

## Invite people to your household

Coming in milestone 2.

## Future options

- Google sign-in. All sign-in code is in `src/lib/auth.ts`. Accounts must only ever be merged on verified emails.
- A self-contained backend, such as Docker with SQLite. Not part of v1.
