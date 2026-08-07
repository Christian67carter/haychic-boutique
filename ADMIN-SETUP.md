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
- Add `ADMIN_USERNAME` = whatever you want to log in with (e.g. `hayden`).
- Add `ADMIN_PASSWORD` = a password you'll remember. This is what you'll
  type into the admin login screen from now on — nothing to paste, nothing
  to regenerate.

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

Go to `haychicboutique.com/admin/`, enter the username and password from
steps above, and you're in — same listing management as before, just no
more copying tokens around. Log in sessions last 24 hours before you'll
need to log in again.

If you ever want to change the password, just update `ADMIN_PASSWORD` in
Vercel — no code changes needed.
