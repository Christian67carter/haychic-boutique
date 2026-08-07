# Setting up the new admin login

The product admin panel (`/admin/index.html`) used to ask for a raw GitHub
access token to be pasted into the browser every time — that token could
write to the whole repo, and anyone who saw it (or opened dev tools) could
have used it. It's now a normal username + password login instead. The
GitHub token still exists, but it lives only on the server (the same Vercel
project already deployed for checkout) and is never sent to the browser.

## One-time setup

All four of these are added the same way as `STRIPE_SECRET_KEY` was: in the
Vercel dashboard → your `haychic-boutique` project → **Settings →
Environment Variables**.

### 1. Create a GitHub token for the server to use
- Go to github.com → your profile photo → **Settings**.
- Scroll to **Developer settings** (bottom of the left sidebar).
- **Personal access tokens → Fine-grained tokens → Generate new token.**
- Name it "HAYCHIC Admin Server". Under **Repository access**, choose "Only
  select repositories" and pick **haychic-boutique**.
- Under **Permissions → Repository permissions**, set **Contents** to
  "Read and write".
- Click **Generate token** and copy it.
- In Vercel, add environment variable `GITHUB_TOKEN` = that token.

### 2. Pick a username and password
The admin panel now has a single login for everything — listings, access
requests, and the CRM — using your email + a password (the CRM side has
always used Firebase email/password sign-in; this just reuses that same
login for listings too).

- Add `ADMIN_USERNAME` = the **same email** you use (or will create) to
  sign in on the admin login screen.
- Add `ADMIN_PASSWORD` = the **same password** as that account.

If you haven't created that login yet, go to `haychicboutique.com/admin/`
and click "Create your admin login" first, then come back and set these
two values to match exactly what you just signed up with.

### 3. Add a session secret
- Add `ADMIN_SECRET` = any long random string (mash the keyboard, 30+
  characters is plenty). This is only used internally to sign your login
  session — you'll never need to type it anywhere.

### 4. Redeploy
Vercel automatically redeploys when new environment variables are saved on
some plans, but if the admin panel still says "not configured on the
server yet," go to your project's **Deployments** tab and redeploy the
latest one manually.

## Using it

Go to `haychicboutique.com/admin/`, enter the email and password from
steps above, and you're in. Listings, Access Requests, All Leads/CRM, and
Email Settings are now tabs on that one page — the old separate
`admin/crm.html` page just redirects here now, so any old bookmark still
works.

If the Listings tab shows an error about not being configured yet, double
check `ADMIN_USERNAME`/`ADMIN_PASSWORD` in Vercel match your login exactly
— everything else (Access Requests, Leads, Email Settings) only needs your
Firebase login and works independently of the Vercel setup.

If you ever want to change your password, do it from Firebase (or just
sign up a new login) and update `ADMIN_PASSWORD` in Vercel to match.
