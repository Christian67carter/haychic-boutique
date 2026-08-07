# Setting up real checkout (Stripe)

The storefront (this repo) is hosted on GitHub Pages, which only serves
static files — it can't run the server code needed to talk to Stripe
securely. So the `api/create-checkout-session.js` function in this repo
gets deployed separately to Vercel (free), while GitHub Pages keeps serving
the site exactly as it does now at haychicboutique.com. Same codebase, two
free hosts, nothing else changes about how the site works day to day.

## One-time setup

### 1. Create a Stripe account
Go to https://dashboard.stripe.com/register and sign up (free). In the
dashboard, go to **Developers → API keys** and copy the **Secret key**
(`sk_test_...` while testing, `sk_live_...` once ready for real payments).
Keep this private — never share it or paste it into chat/email.

### 2. Make the Stripe checkout page look like HAYCHIC
Stripe's payment page is hosted on stripe.com, not our site, so it needs its
own branding set once:
- In the Stripe Dashboard, go to **Settings → Branding**.
- Set **Brand color** to `#C1836A` (HAYCHIC dusty rose).
- Set **Accent color** (buttons) to `#B08655` (HAYCHIC gold) or the same rose.
- Upload the HAYCHIC logo (the same file used for the site header/about page)
  as the **Icon** and **Logo**.
- Save. Every checkout session will now use these colors automatically —
  nothing to configure per-order.

### 3. Create a Vercel account
Go to https://vercel.com/signup (free tier is plenty). Signing up with
GitHub makes step 4 easier.

### 4. Deploy this repo to Vercel
- In the Vercel dashboard, click **Add New → Project**.
- Import the `haychic-boutique` GitHub repo (the same one the site lives in).
- Vercel auto-detects the `/api` folder as serverless functions — leave
  build settings as default.
- Before clicking Deploy, open **Environment Variables** and add:
  - `STRIPE_SECRET_KEY` = the secret key from step 1
- Click **Deploy**. (Vercel will also serve a copy of the static site at its
  own `.vercel.app` URL — that's fine, ignore it. GitHub Pages stays the real
  site at haychicboutique.com.)

### 5. Get your deployed URL and wire it in
Vercel gives you a URL like:

    https://haychic-boutique.vercel.app

Your checkout endpoint is that URL plus `/api/create-checkout-session`:

    https://haychic-boutique.vercel.app/api/create-checkout-session

In `script.js`, find:

```js
const CHECKOUT_API = '';
```

and set it to that URL. Save and push — checkout is live.

## Before going live, give every product a real price

Some products in `products.json` still show the placeholder `$XX.XX`. The
checkout function checks prices on the server and refuses to sell anything
priced at $0 or unreadable — update each listing with its real price in the
admin panel (`/admin/index.html`) first.

## Testing before going live

Use the Stripe **test** secret key (`sk_test_...`) and card number
`4242 4242 4242 4242` (any future expiry, any CVC) to run a full checkout
without moving real money. Switch to the **live** secret key
(`sk_live_...`) in Vercel's environment variables when ready for real orders.

## What this does and doesn't include

This gets you a working shopping bag and secure checkout. It does **not**
include inventory tracking (nothing stops two people from buying the last of
something), shipping cost calculation (currently $0 shipping), or abandoned
cart emails — those would each need to be built separately, or you'd get
them out of the box by moving to a full platform like Shopify.
