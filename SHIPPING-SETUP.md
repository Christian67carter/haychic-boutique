# Setting up shipping label automation

Right now, every paid order goes into your Stripe Dashboard, but nothing
tells you a new order came in or hands you a ready-to-ship address. This
wires up: **customer pays → you get notified automatically with the
address and items → you paste that into Pirate Ship, buy the label, and
print.**

Pirate Ship (pirateship.com) doesn't have a public integration for custom
Stripe stores, so full one-click "no human touches it" automation into
Pirate Ship itself isn't possible — but this gets you as close as it gets:
the order lands in front of you instantly, fully formatted, so buying the
label is just paste-and-click instead of digging through Stripe.

## How it works

1. A customer pays on your site.
2. Stripe fires a webhook to a new endpoint on your site
   (`/api/order-notify`) the instant checkout completes.
3. That endpoint pulls together the customer's name, shipping address,
   shipping method, and items, and sends it to a Make (Integromat) webhook.
4. Your Make scenario takes it from there — email or text you the order,
   and/or add it as a row to a Google Sheet you can bulk-import into
   Pirate Ship.

## One-time setup

### 1. Build the Make scenario

In Make (make.com):

- Create a **new scenario**.
- Add a **Webhooks → Custom webhook** module as the trigger. Click
  "Add," name it something like "HAYCHIC New Order," and copy the webhook
  URL it gives you — you'll need this in step 3.
- Send yourself a test order later (step 4) so Make can learn the data
  shape, then add whatever modules you want after the trigger. Two good
  options, and you can use both:
  - **Email or SMS module** (Gmail / Google Chat / SMS provider) — sends
    you a message with the customer name, address, and items so you can
    manually punch it into Pirate Ship.
  - **Google Sheets → Add a Row** — appends the order to a running sheet
    with columns matching Pirate Ship's CSV import template (Name,
    Address 1, Address 2, City, State, Zip, Country). Export that sheet
    as CSV whenever you're ready to batch-buy labels in Pirate Ship's
    "Import Orders" tool.
- Turn the scenario **on**.

### 2. Add environment variables in Vercel

Same place as always: `haychic-boutique` project → **Settings →
Environment Variables**.

- `MAKE_WEBHOOK_URL` = the webhook URL you copied from Make in step 1.
- `STRIPE_WEBHOOK_SECRET` = you'll get this in step 3 below — come back
  and add it once you have it.

(`STRIPE_SECRET_KEY` is already set from the checkout setup — no change
needed there.)

### 3. Register the webhook in Stripe

- Go to the Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
- Endpoint URL: `https://haychic-boutique.vercel.app/api/order-notify`
- Events to send: select **`checkout.session.completed`**.
- Click **Add endpoint**.
- Click into the new endpoint and reveal the **Signing secret** (starts
  with `whsec_...`). Copy it.
- Add it to Vercel as `STRIPE_WEBHOOK_SECRET` (from step 2), then redeploy
  the project if it doesn't happen automatically.

### 4. Send a test order

From the Stripe webhook page you just created, click **Send test webhook**
and choose `checkout.session.completed` — or just place a real test
purchase on the site. Check that:

- The Stripe webhook shows a `200` response (not an error).
- Your Make scenario's history shows the run.
- You got the email/text/sheet row you set up.

## Using it day to day

Once it's live, every completed order automatically lands wherever you
told Make to send it — no need to check Stripe manually. From there:

1. Open the notification (email/text) or your import sheet.
2. Go to [pirateship.com](https://www.pirateship.com), paste in the
   address (or import the CSV for a batch), pick a package, buy the label
   at the discounted rate, and print.

If you ever want to change what Make does with each order (add a Slack
ping, auto-create a packing slip, whatever), you don't need to touch any
code — just edit the scenario in Make. The website side only ever sends
the same order data to the same webhook URL.
