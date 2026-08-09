# Setting up order tracking

This wires up: **customer pays → order is saved automatically → you paste
in a tracking number from Pirate Ship → customer gets emailed and can look
up their order any time on the site.**

## How it works

1. A customer pays on your site (same Stripe Checkout as before).
2. The `/api/order-notify` webhook (already set up for shipping alerts)
   now *also* saves a copy of the order to Firestore, in a new `orders`
   collection — customer name, email, Instagram handle if given, address,
   items, and an empty `trackingNumber`/`trackingCarrier`/`status`.
3. In the admin panel's new **Orders** tab, each order has a "Tracking"
   section — paste in the number and carrier once you've bought the label
   on Pirate Ship, set status to Shipped, and click **Save & Notify
   Customer**. That updates Firestore and emails the customer their
   tracking number (if you've set up the tracking email template — see
   below).
4. Customers can also check on their own, any time, at
   `haychicboutique.com/track-order.html` — they enter their order number
   (shown on the thank-you page and in their confirmation) and the email
   they checked out with.

No new environment variables or Vercel setup needed — this reuses the same
public Firebase Web API key already in `assets/js/firebase-config.js`.

## One-time setup

### 1. Add a Firestore rule for the `orders` collection

Firestore access here isn't gated by a secret key — it's gated by
**security rules**, the same way `leads` and `activity` already work
without any sign-in. Go to the [Firebase Console](https://console.firebase.google.com/)
→ your `haychic-boutique` project → **Firestore Database** → **Rules**,
and make sure there's a rule for `orders` alongside whatever's already
there for `leads`/`activity`/`access_codes`. If your existing rules look
like this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{id} { allow read, write: if true; }
    match /activity/{id} { allow read, write: if true; }
    match /access_codes/{id} { allow read, write: if true; }
  }
}
```

Add:

```
    match /orders/{id} { allow read, write: if true; }
```

Click **Publish**. (If your rules already have something broader like
`match /{document=**} { allow read, write: if true; }` covering the whole
database, you don't need to change anything.)

This is the same open-access model the rest of the admin tools already
use — fine for a small boutique, but worth knowing: anyone who found your
Firebase project ID could technically read the `orders` collection
directly. The `/api/track-order` endpoint customers actually use doesn't
expose full addresses either way — it only returns status, tracking, and
item info, and only after the email matches.

### 2. Create the tracking EmailJS template

You already have one EmailJS template for sending access passwords. Add a
**second** template for tracking numbers:

- In [EmailJS](https://www.emailjs.com/) → **Email Templates** → **Create
  New Template**.
- Use these merge fields in the subject/body: `{{to_name}}`, `{{to_email}}`,
  `{{order_id}}`, `{{tracking_number}}`, `{{tracking_carrier}}`,
  `{{site_url}}`.
- Example body:

  > Hi {{to_name}},
  >
  > Your HAYCHIC order ({{order_id}}) is on its way! 💐
  >
  > Tracking number: {{tracking_number}} ({{tracking_carrier}})
  >
  > You can also check your order status any time at {{site_url}}/track-order.html
  >
  > — Hayden

- Save it and copy the **Template ID** (starts with `template_`).
- In the admin panel → **Email Settings** tab, paste it into the new
  "EmailJS Template ID (tracking email)" field and click **Save
  Settings**. This uses the same EmailJS Public Key and Service ID you
  already set up — no need to re-enter those.

### 3. Test it

1. Place a real (or Stripe test-mode) order.
2. Open the admin panel → **Orders** tab — the order should appear within
   a few seconds of the webhook firing.
3. Click **Tracking**, enter a tracking number and carrier, set status to
   Shipped, click **Save & Notify Customer**.
4. Confirm the customer received the tracking email, and that
   `haychicboutique.com/track-order.html` shows the same status when you
   enter that order's number and email.

## Using it day to day

Nothing changes about how you buy labels — you still get the order alert
from Make/Pirate Ship the same way as before (see SHIPPING-SETUP.md).
Once you've bought the label and have a tracking number, just paste it
into the Orders tab and hit **Save & Notify Customer**. That's the only
new step.
