# Business Finance Tracker — Requirements

Scope definition for a self-hosted web application that tracks a business's income,
expenses, customer invoices, and supplier bills, used by a team with distinct roles.

Status: **draft for review**. Nothing is built yet. Open questions are listed at the end.

---

## 1. Decisions already made

| Decision | Choice |
|---|---|
| Primary jobs | Income & expense tracking, invoicing (receivables), bills (payables) |
| Users | A team, with per-role permissions |
| Data entry | Manual entry only (no bank feed, no CSV import in v1) |
| Deployment | Web app, self-hosted |
| Bookkeeping model | Double-entry ledger underneath, simple forms on top |

### Why double-entry

Every transaction is recorded twice — once as a debit, once as a credit — and the two
sides must sum to zero. This is not bureaucracy; it is what makes the following possible:

- A **balance sheet** that is guaranteed to balance, so errors surface immediately
  instead of silently corrupting a year of records.
- Correct handling of things that are neither income nor expense: loans, owner
  contributions, equipment purchases, money owed but not yet paid.
- Books an accountant can accept without re-keying.

The user never sees debits and credits. They fill in a form that says
"Paid $200 rent from Checking" and the system writes both sides.

---

## 2. Domain model

### Core ledger

**Account** — the chart of accounts. Every amount lands in one of these.
- `code` (e.g. `1000`), `name`, `type` (asset / liability / equity / income / expense),
  `parent_id` for grouping, `is_active`
- Seeded with a sensible default chart the business can rename and extend.

**JournalEntry** — one financial event.
- `date`, `description`, `reference`, `status` (draft / posted / voided),
  `created_by`, `posted_at`, `source` (manual, invoice, bill, payment)

**JournalLine** — the individual debits and credits.
- `entry_id`, `account_id`, `debit`, `credit`, `memo`, `contact_id`
- Hard constraint: for any posted entry, `sum(debit) == sum(credit)`.

### Parties and documents

**Contact** — a customer, a supplier, or both.
- `name`, `is_customer`, `is_supplier`, `email`, `phone`, `address`,
  `payment_terms_days`, `notes`

**Invoice** (money owed *to* the business)
- `number`, `contact_id`, `issue_date`, `due_date`, `status`
  (draft / sent / partially_paid / paid / overdue / voided), `subtotal`, `tax_total`,
  `total`, `amount_paid`, `balance_due`, `notes`
- **InvoiceLine**: `description`, `quantity`, `unit_price`, `income_account_id`,
  `tax_rate_id`, `line_total`

**Bill** (money the business owes)
- Mirror of Invoice: `contact_id` (supplier), `bill_number`, `issue_date`, `due_date`,
  `status`, totals, `balance_due`
- **BillLine**: `description`, `quantity`, `unit_price`, `expense_account_id`,
  `tax_rate_id`, `line_total`

**Payment** — money actually moving.
- `date`, `direction` (received / sent), `contact_id`, `amount`, `bank_account_id`,
  `method` (bank transfer / card / cash / cheque / other), `reference`
- **PaymentAllocation**: splits one payment across one or more invoices or bills, so a
  customer paying three invoices with one transfer is handled correctly, as is a partial
  payment.

### Supporting

**TaxRate** — `name`, `percentage`, `tax_account_id`, `is_active`.
**User**, **Role**, **AuditLog** — see below.
**Period** — accounting periods that can be locked once closed.

---

## 3. How documents hit the ledger

These postings happen automatically; they are the whole reason for the double-entry core.

| Event | Debit | Credit |
|---|---|---|
| Invoice issued | Accounts Receivable | Revenue (+ Tax Payable) |
| Customer pays invoice | Bank | Accounts Receivable |
| Bill received | Expense (+ Tax Receivable) | Accounts Payable |
| Bill paid | Accounts Payable | Bank |
| Direct expense (no bill) | Expense | Bank |
| Direct income (no invoice) | Bank | Revenue |
| Owner puts money in | Bank | Owner's Equity |

---

## 4. Roles and permissions

Four roles, chosen so that the person entering data is not the person who can also
approve and hide it.

| Capability | Owner / Admin | Bookkeeper | Staff | Accountant (read-only) |
|---|:--:|:--:|:--:|:--:|
| View all reports | ✓ | ✓ | — | ✓ |
| Export data | ✓ | ✓ | — | ✓ |
| Create / edit invoices | ✓ | ✓ | — | — |
| Create / edit bills | ✓ | ✓ | draft only | — |
| Submit an expense | ✓ | ✓ | ✓ | — |
| Approve an expense or bill | ✓ | ✓ | — | — |
| Record payments | ✓ | ✓ | — | — |
| Post journal entries | ✓ | ✓ | — | — |
| Void a posted entry | ✓ | ✓ | — | — |
| Edit chart of accounts | ✓ | ✓ | — | — |
| Manage users and roles | ✓ | — | — | — |
| Close / reopen a period | ✓ | — | — | — |
| View audit log | ✓ | ✓ | — | ✓ |

Staff see only records they created themselves.

---

## 5. Reports

Each report is viewable on screen, filterable by date range, and exportable to CSV.

- **Profit & Loss** — income less expenses over a period, by category, with
  period-over-period comparison.
- **Balance Sheet** — assets, liabilities and equity as of a date.
- **Cash position** — balance of each bank/cash account, and how it moved over time.
- **Accounts Receivable aging** — who owes you, bucketed current / 1–30 / 31–60 / 61–90 / 90+ days.
- **Accounts Payable aging** — the same for what you owe, so nothing is missed.
- **General Ledger** — every transaction in an account, with running balance.
- **Trial Balance** — all account balances, proving debits equal credits.

---

## 6. Rules the system must enforce

These are the things that separate working software from a spreadsheet that quietly
goes wrong.

1. **Money is stored as integer minor units** (cents), never as a floating-point
   number. Floats produce rounding errors that make books fail to balance.
2. **Posted entries are never edited or deleted.** Corrections are made by posting a
   reversing entry. The original stays visible. This is what makes the records
   defensible.
3. **Every posted entry must balance.** Enforced at the database level, not only in
   application code.
4. **Closed periods are locked.** Once a month or year is closed, no one but the Owner
   can reopen it, and reopening is logged.
5. **Everything is audit-logged** — who, what, when, before and after values — for any
   change to a financial record, user, or role.
6. **Invoice numbers are sequential and gapless**, generated by the system.
7. **All dates and amounts are validated on entry** — no invoice due before its issue
   date, no negative quantities, no posting to an inactive account.

---

## 7. Non-functional requirements

- **Authentication** — email and password, hashed with a modern algorithm, with session
  management and forced logout on role change.
- **Backups** — an automated nightly database dump plus a documented, *tested* restore
  procedure. Untested backups are not backups.
- **Data export** — full export of all data in open formats, so you are never locked in.
- **Deployment** — a single `docker compose up` brings up the app and its database on
  any Linux box, with configuration through environment variables.
- **HTTPS** — required, with setup documented; financial data must not travel in clear.

---

## 8. Recommended technology

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | One language across UI and server; strong typing catches money-handling bugs at compile time |
| Framework | Next.js (App Router) | UI and API in one deployable process — simplest possible self-host |
| Database | PostgreSQL | Real transactions, decimal precision, and constraints that can enforce the balance rule |
| ORM | Prisma | Type-safe queries and versioned schema migrations |
| Auth | Auth.js with credentials | Self-hosted, no third-party dependency |
| UI | Tailwind CSS + shadcn/ui | Fast to build the dense tables and forms this app is mostly made of |
| Packaging | Docker Compose | One command to run, easy to move between servers |

If you would rather have a batteries-included admin interface out of the box and are
comfortable with Python, Django is a strong alternative for this specific kind of app.

---

## 9. Suggested build order

Each phase produces something usable, so you are never waiting on a big-bang release.

1. **Foundation** — project setup, database schema, authentication, users and roles.
2. **Ledger** — chart of accounts, manual journal entries, general ledger and trial balance.
3. **Money in and out** — bank/cash accounts, direct income and expense entry, cash position report.
4. **Receivables** — contacts, invoices, payment recording and allocation, AR aging.
5. **Payables** — bills, approval flow for staff-submitted bills, payments, AP aging.
6. **Reporting** — Profit & Loss, Balance Sheet, CSV export of everything.
7. **Hardening** — audit log surfaced in the UI, period locking, backups, deployment docs.

Phases 1–3 give you a working books system. Phases 4–5 are what make it a business tool.

---

## 10. Deliberately out of scope for v1

Designed for, but not built yet. Each can be added later without reworking the schema.

- Bank CSV / OFX import with de-duplication
- Live bank feeds (Plaid, TrueLayer, etc.)
- Receipt image and PDF attachments
- Multi-currency
- Payroll
- Inventory / stock
- Recurring invoices and automatic payment reminders
- Emailing invoices directly from the system

---

## 11. Open questions

These need answers before or during Phase 1.

1. **Sales tax / VAT.** You did not select tax reporting, but the schema above includes
   tax rates on invoice and bill lines anyway. Adding tax *after* invoices exist means
   reissuing historical documents, so the fields are cheap now and expensive later.
   Confirm: does the business charge sales tax or VAT on what it sells?
2. **Currency.** Which single currency? (Multi-currency is out of scope for v1.)
3. **Financial year end.** Which month does the accounting year close? This drives
   period locking and report defaults.
4. **Delivering invoices.** Should an invoice produce a downloadable PDF, or is a
   printable on-screen view enough for now? Emailing is out of scope for v1 either way.
5. **Opening balances.** Is this a new business starting from zero, or does it have
   existing books whose closing balances need to be entered as a starting point?
6. **Team size and roles.** Roughly how many people, and does the four-role split above
   match how the business actually works?
7. **Hosting target.** Which machine or provider will run this? It affects the backup
   and HTTPS instructions written in Phase 7.
