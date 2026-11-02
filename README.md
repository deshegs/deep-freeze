# Deep freeze

Track what's in your household's deep freezer, so you stop forgetting food and buying it again. Each household gets its own private, live-shared list, and using something up takes one tap.

It installs on your phone like an app, works with several people at once, and still shows your list when the signal doesn't reach the freezer.

Built with Vite, React, TypeScript and Supabase.

## Deploy your own private copy

You don't need to be a developer. This takes about 30 minutes and uses free plans. You'll need a GitHub account, and either your own domain name or a Gmail account for sending sign-in emails.

### 1. Create the database

1. Go to [supabase.com](https://supabase.com), sign up, and click **New project**.
2. Choose a name and the region closest to you. Save the database password somewhere safe, then wait for the project to finish setting up.
3. Click **SQL Editor** in the left sidebar, then **New query**.
4. Open [supabase/setup.sql](supabase/setup.sql) here on GitHub and click **Copy raw file**.
5. Paste it into the query box and click **Run**. You should see **Success. No rows returned**.
6. Click **Connect** at the top of the page. Copy the **project URL** and the **publishable key** (it may be called the anon key) somewhere handy for step 2.

### 2. Put the app online

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdeshegs%2Fdeep-freeze&env=VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY&envDescription=The%20project%20URL%20and%20publishable%20key%20from%20Connect%20in%20Supabase&envLink=https%3A%2F%2Fgithub.com%2Fdeshegs%2Fdeep-freeze%23deploy-your-own-private-copy&project-name=deep-freeze&repository-name=deep-freeze)

1. Click the button above and sign in to Vercel with GitHub.
2. Paste your two values from step 1 when asked, then click **Deploy**.
3. When it finishes, copy your new web address, such as `https://your-freezer.vercel.app`.
4. In Supabase, go to **Authentication > URL Configuration**. Set **Site URL** to that address, add it under **Redirect URLs**, and save.

### 3. Set up sign-in emails

Supabase's built-in email only reaches your own account and sends a few an hour, so everyone else needs a real sender. Choose one.

**If you own a domain, use [Resend](https://resend.com) (free plan):**

1. Create an account, click **Domains > Add domain**, and enter your domain.
2. Add the DNS records it shows at the company where you bought your domain, and wait for **Verified**.
3. Click **API Keys > Create API key** and copy the key.
4. Use these settings below: host `smtp.resend.com`, username `resend`, password your API key, and a sender such as `freezer@yourdomain.com`.

**If you don't, use a Gmail account:**

1. In your Google account, turn on **2-Step Verification**.
2. Search your Google account settings for **App passwords**, create one named `Deep freeze`, and copy it.
3. Use these settings below: host `smtp.gmail.com`, username your Gmail address, password the app password, and your Gmail address as the sender.

**Then, in either case:**

1. In Supabase, go to **Authentication > Emails > SMTP Settings** and turn on **Enable custom SMTP**.
2. Enter your settings, with port `465` and sender name `Deep freeze`, and save.
3. Go to the **Templates** tab of the same page. Open **Magic Link**, switch to the source view, replace everything with the contents of [supabase/email-template.html](supabase/email-template.html), and save.
4. Do the same for **Confirm signup**, which is the one new users receive.

The code in the template matters: on an iPhone, the installed app can only be signed in with the code, not the link.

### 4. Sign in

Open your web address, enter your email, and type the code you receive. Create your household, then add the app to your phone from **☰ > Share, QR code and install**. To invite others, see [Invite people to your household](#invite-people-to-your-household).

## Choose who can sign up

The same app works both ways, and you can switch at any time.

**Shared service (the default):** anyone with your address can sign up and create their own separate households. Nobody can see another household's data.

**Private copy:** only people you add can sign in.

1. Sign in and create your household first, because this also blocks your own first sign-in.
2. In Supabase, go to **Authentication > Sign In / Providers** and turn off **Allow new users to sign up**.
3. To add someone, go to **Authentication > Users > Add user > Create new user**. Enter their email and any long password, which they'll never need, and tick **Auto Confirm User**.
4. They can then sign in and join with an invite as usual. Anyone else sees "This is a private freezer."

## Keep it running

- **Free Supabase projects pause** after about a week without use. If your app stops loading data, open your project in Supabase and click **Restore**. Nothing is lost. Using the app at least weekly avoids this.
- **Updates:** your copy doesn't update by itself. On your GitHub copy, click **Sync fork** if it's offered, or follow the [changes in this project](https://github.com/deshegs/deep-freeze). New files in `supabase/migrations` need running once in the SQL Editor, in number order.

## Run it locally

For developers. You need [Node.js](https://nodejs.org) 22 or newer and a Supabase project set up as above.

1. Copy `.env.example` to `.env.local` and fill in your two values. Never put a secret or service role key in this file.
2. In Supabase, add `http://localhost:5173` under **Authentication > URL Configuration > Redirect URLs**.
3. Run these in this folder:

```bash
npm install
```

```bash
npm run dev
```

4. Open the address it prints. To try it on a phone on the same Wi-Fi, use the **Network** address. Offline features need https, so they only work once deployed.

Run the tests with:

```bash
npm test
```

Database changes go in a new numbered file in `supabase/migrations`. `npm run build` joins them into `supabase/setup.sql`, so commit that file too. They can also be applied with the Supabase CLI.

## Invite people to your household

1. Open the menu (☰ at the top right) and tap **Invite people and manage household**.
2. Tap **Create invite link**, then **Copy link**, and send the link to the person you're inviting.
3. They open it, sign in with their email, and tap **Join household**. They can also paste the link or code on the welcome screen.

Links last 7 days and work for up to 10 people. Any member can create one. Only the owner can cancel invites, remove people, rename the household, or delete it. If the owner leaves, the longest-standing member becomes the owner.

## Install it and use it offline

Open **☰ > Share, QR code and install** for the home screen steps and a printable QR code.

The app opens without a connection and shows the last saved list and photos. Changes need a connection, for now. Saved copies stay on the phone and are removed when you sign out, and all the real data is on the server.

## Back up, restore and delete

Open **☰ > Export and restore** to save a household as a JSON backup or a CSV spreadsheet. Photos aren't included in either.

To restore, choose a JSON backup. You'll see how many items would be added before anything changes, and restoring the same backup twice never creates duplicates. Restoring into a different household works too, but those items come back without their photos.

Anyone can delete their account from **☰ > Privacy and account**. Households where they were the only member are deleted with their items and photos. Shared households carry on, and the longest-standing member takes over if they were the owner.

## Change the limits

The server enforces these, so they live in the database. In Supabase, click **Table Editor**, open **app_limits**, and edit the row:

- `max_items_per_household`: 500
- `max_invites_per_hour`: 10
- `invite_days`: 7
- `invite_max_uses`: 10
- `deleted_item_days`: 30

Deleted items and their photos are removed for good after `deleted_item_days`. This happens the next time any member opens that household, so there's no scheduled job to set up.

The 5 MB photo limit is set on the `item-photos` bucket, under **Storage**.

## Check that households are private

[tests/rls.sql](tests/rls.sql) acts as four pretend people and tries to reach data it shouldn't, across items, photos, events, invites and members, both signed in and signed out.

1. In Supabase, click **SQL Editor**, then **New query**.
2. Paste the whole file and click **Run**.
3. You should see an error reading **ALL 59 CHECKS PASSED**. That error is deliberate: it undoes everything, so no test data is saved. Anything starting with **FAILED** lists what needs fixing.

## Future options

- Google sign-in. All sign-in code is in `src/lib/auth.ts`. Accounts must only ever be merged on verified emails.
- A self-contained backend, such as Docker with SQLite. Not part of v1.
- Queuing changes made offline, so they sync when the signal returns.
- A backup ZIP that includes the photos.
