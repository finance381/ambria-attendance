# How the Notification System Works — The Logic

This explains the *logic* behind the notification + push system: how a real-world
event turns into a phone notification, and why each piece exists.

---

## The one core idea

> **Every notification is a single row in one `notifications` table.**
> App code never sends a push directly. It only ever causes a row to exist.
> The database decides *who* gets notified, and a separate step turns each row
> into an actual push.

Everything below is just the mechanics around that idea.

---

## The flow (event → phone)

```
1. Something happens
   e.g. admin assigns a task, employee raises an issue, a fix is approved
        │
        ▼
2. A database TRIGGER on that table creates rows in `notifications`
   - one row per recipient
   - each row records: type, what it's about, and WHO it's for (for_user)
        │
        ├───────────────► 3a. The in-app BELL reads rows where for_user = me
        │                     → badge count updates (live, via realtime)
        │
        ▼
3b. Inserting a row triggers the `send-push` function
        │
        ▼
4. send-push looks up that user's registered devices and sends a Web Push
        │
        ▼
5. The phone shows the banner — even if the app is closed
```

The two branches (3a bell, 3b push) are **independent**. The bell works even
if push is broken, and vice-versa. Both are driven by the same row.

---

## Why the database creates the notification (not the frontend)

The trigger lives in the database, so the notification fires **no matter what
caused the change** — the app, an admin action, a background job, or even a
manual SQL edit. If the frontend created notifications instead, anything that
changed data outside the app would silently skip notifying people.

This also means there is **exactly one place** that creates notifications. If you
*also* let the frontend insert them, you get **duplicate notifications** (this was
a real bug we hit and removed).

### Deciding *who* to notify

- **Events aimed at one person** (task assigned, approved, sent back) → the trigger
  creates one row for that person (`for_user = the assignee`).
- **Events aimed at admins** (employee submitted work, raised an issue, new repair
  request) → a helper (`notify_admins`) inserts **one row per admin** who is allowed
  to see that property. Super-admins see everything; property admins see only their
  property; the actor who caused the event is never notified of their own action.

---

## Why there's a separate "push" step

Creating a database row does **not** by itself send anything to a phone. A push
must be **cryptographically signed with a secret key** and sent to Google's
(Android) or Apple's (iPhone) push servers. That secret can never live in the
browser, so it lives in a small server function (`send-push`).

So the moment a `notifications` row is inserted, one mechanism calls `send-push`:

- `send-push` reads the new row → finds the recipient's registered devices
  (`push_subscriptions`) → sends a signed Web Push to each → the OS shows the banner.
- If a device's registration is dead, `send-push` deletes it so it stops trying.

There must be **exactly one** thing that calls `send-push` per row (a Supabase
Database Webhook, *or* a DB trigger — never both, or you double-push).

---

## How a phone becomes "reachable" (subscriptions)

A phone only receives push after it **subscribes** once:

1. User opens the app and taps "enable notifications."
2. The browser asks the OS for a unique push "address" for that device.
3. The app saves that address in `push_subscriptions` (tied to the user).

Now `send-push` has somewhere to send. **No subscription = no push** (the bell
still works, but no banner). This is why every user must enable notifications once
on each device.

---

## The keys (why push can silently fail)

Push uses a **VAPID key pair** — a public key and a private key, generated together:

- The **public** key is built into the app; the phone subscribes using it.
- The **private** key lives only in the server function; it signs each push.

They must be **two halves of the same pair**. If they don't match — or if the
public key is missing from the app build — the phone subscribes but **every push
is silently rejected.** ("Subscribed, but nothing arrives" is almost always this.)

---

## The two layers, side by side

| | In-app bell | OS push (banner) |
|---|---|---|
| Source | rows in `notifications` | the same rows |
| How it reaches you | app reads them (realtime + polling) | server signs & sends to your device |
| Works when app is closed? | no | **yes** |
| Needs a device subscription? | no | **yes** |
| Needs the secret key? | no | **yes** |

---

## Platform logic — Android vs iPhone

Same system, but the phones behave differently:

- **Android:** works in a normal browser, any modern version. Easy.
- **iPhone:** Apple only allows web push if **(a)** the phone is on **iOS 16.4+**,
  and **(b)** the app was **added to the Home Screen and opened from that icon**
  (a normal Safari tab can't receive push). Miss either and nothing arrives.

So "iPhone doesn't get notifications" is almost always: old iOS, not installed to
the Home Screen, permission not granted, the key problem above, or an expired
subscription.

---

## Things that make it break (and the logic behind each)

1. **Subscriptions expire.** A device's push address rotates/expires over time.
   When it dies, that phone stops getting banners until the app is re-opened
   (which re-subscribes). The bell keeps working the whole time — that's the tell.

2. **Duplicates.** Two things creating the row, or two things sending the push.
   Rule: **one** creator (the DB triggers) and **one** sender (one webhook/trigger).

3. **Keys / build config.** Public key missing from the production build, or the
   public/private keys aren't a matching pair → subscribed but no delivery.

4. **Delivery delay.** Phones batch low-priority pushes to save battery; sending
   them at "high urgency" makes them arrive immediately.

---

## Summary in one paragraph

An event fires a **database trigger**, which writes one **notification row per
recipient** into a single table. That row instantly shows up in the recipient's
**in-app bell** (via realtime), and separately triggers a small **server function**
that signs a **Web Push** with a secret key and sends it to that user's
**registered devices**, so the phone shows a banner even when the app is closed.
The database is the single source of truth; the frontend never sends pushes
itself; and delivery depends on the device having subscribed and the keys being a
matching pair.
