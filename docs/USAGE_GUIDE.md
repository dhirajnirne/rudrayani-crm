# Rudrayani Fintech CRM - User Guide

**Version:** Phase 7 (Allocation Lifecycle, Discrepancy Review, Customer 360 & Granular Reporting)  
**Last Updated:** 2026-07-07

---

## Table of Contents

1. [For Agency Admins](#for-agency-admins)
2. [For Operations Managers](#for-operations-managers)
3. [For Team Leaders](#for-team-leaders)
4. [For Field Agents & Telecallers](#for-field-agents--telecallers)
5. [Feature Guide - All Users](#feature-guide---all-users)
6. [Troubleshooting](#troubleshooting)

---

## For Agency Admins

### Dashboard Access & Permissions

**You can:**
- View all customers across all companies and teams
- Import allocation files
- Review and approve discrepancies (additions/removals)
- Manage bucket canonical mappings
- Generate all reports and exports
- View team leader performance metrics
- Manage users, roles, and permissions

**You cannot:**
- Modify customer data directly (only via imports)
- Log calls or create PTPs (agent responsibility)
- Allocate customers to agents (team leader responsibility)

### Key Workflows

#### 1. Setting Up a New Lender (Company)

```
Step 1: Create the company
  Navigate to: Admin > Companies
  Click: "Add New Company"
  Fill: Name (e.g., "Hero Fincorp"), Agency (yours)
  Save

Step 2: Prepare allocation file
  Get lender's allocation file (Excel format)
  Columns can vary by lender (they provide template)
  Ensure: loan_number, customer_name, bucket, emi, due_amount

Step 3: Import first allocation
  Navigate to: Imports
  Upload the file
  Map columns: customize if needed
    Example:
      Hero's "Bkt" column → our "bucket"
      Hero's "loan_agreement_no" → our "loan_number"
  Select detail fields (optional): branch, state, zone, etc.
  Save as template (for future imports)
  Commit import

Step 4: Configure buckets
  Navigate to: Admin > Buckets
  Edit each bucket, set "Canonical" number:
    X (current) → 0
    30-60 DPD → 1
    60-90 DPD → 2
    90+ DPD / NPA → 3
  Save

Step 5: Verify setup
  Dashboard: should show allocated count = number of loans in file
  Allocations: all loans visible
  You're ready for field operations!
```

#### 2. Approving Repeat Imports (Mid-Month Refreshes)

```
When lender sends updated file mid-month:

Step 1: Upload and map (same as above)
  Usually same template as before

Step 2: Commit import
  Preview shows:
    "2 additions pending review" (new loans)
    "1 removal pending review" (loan no longer in file)
    "7 will be updated" (existing loans with new buckets/amounts)

Step 3: Review queue
  Navigate to: Import Review (badge shows "3 Pending")
  Table shows:
    Type | Loan# | Customer | Bucket | Amount | File | Age
    ---|---|---|---|---|---|---
    Add | HERO-999 | New Cust | 1 | 30,000 | hero-jul-refresh.xlsx | 2 min
    Rem | HERO-123 | Old Cust | 2 | 25,000 | hero-jul-1.xlsx | 12 hours
    Upd | (automatic, not in review)

Step 4: Make decisions
  For each pending item:
    ✓ Click "Approve" (addition inserted, removal recalled)
    ✓ OR "Reject" (addition stays pending, removal reverts)
    ✓ OR "Bulk Approve Selected" (if multiple items)

Step 5: Verify
  Allocations page:
    New customers appear with "Active" status
    Removed customers show "Recalled" status (orange tag)
```

#### 3. Investigating Bucket Discrepancies

```
Scenario: Your team reports "X says current but customer is 45 days overdue"

Step 1: Check Bucket Mismatches
  Dashboard: Card "Bucket Mismatches (DPD Cross-Check)"
  Live report (today's data, not month-scoped)
  Shows loans where lender's bucket ≠ computed DPD-implied bucket

Step 2: Example mismatch
  HERO-456 | Ajay Kumar | X (canonical 0) | 2026-05-15 | DPD=45 | Canonical 1 (mismatch!)
  
  Interpretation:
    Lender says: "current" (not yet due)
    Reality: 45 days overdue (should be bucket "1")
    Action: Contact lender, request file correction

Step 3: Root cause analysis
  Customer drawer: click on HERO-456
  Check:
    • Last payment date (Did they pay recently?)
    • Call history (What did agent last discuss?)
    • Promised To Pay (Was PTP scheduled?)
    • EMI (How much are they supposed to pay?)

Step 4: Document & follow up
  Create note in CRM (or email lender)
  Re-import once lender corrects file
  Verify discrepancy disappears
```

#### 4. Exporting Data for Stakeholders

```
Step 1: Apply filters
  Month: Select reporting month
  Company: Filter to specific lender (if multi-company)
  Other filters: Product, Bucket, Team, Agent (optional)

Step 2: Download report
  Dashboard: "Export to Excel" button
  Workbook contains 8 sheets:
    1. Summary: headline metrics + month snapshot
    2. Agents: per-agent performance
    3. Breakdown: by product (e.g., CVL collected 5L, LPL collected 3L)
    4. Trail: call activity, PTP conversion
    5. Recalls: customers recalled this month
    6. Bucket Movements: detected (payment) + confirmed (allocation) transitions
    7. Bucket Mismatches: DPD discrepancies
    8. Raw Data: (optional) all snapshots/calls/payments

Step 3: Share with stakeholders
  CEO: Summary sheet only
  Lender: Breakdown + Trail sheets
  Internal: All sheets, no sensitive agent names if needed

Pro tip: Use same filters each month for month-on-month comparisons
```

---

## For Operations Managers

### Primary Responsibilities

- **Approve/Reject** import discrepancies (additions/removals/reactivations)
- **Oversee** field team performance
- **Manage** team leaders and their teams
- **Monitor** escalations and exceptions

### Key Workflows

#### 1. Daily Import Review

```
Every morning (or when alerted):

Step 1: Check pending items
  Navigate to: Import Review
  Filter by: Status=Pending
  Badge shows count (e.g., "5 Pending")

Step 2: Review each item
  For Addition:
    "Is this a new, legitimate customer for us?"
    • Check: Company name, phone, location
    • If YES → Approve
    • If DUPLICATE → Reject (note: "duplicate of HERO-123")
    • If FRAUD → Reject (note: "flagged for fraud investigation")

  For Removal:
    "Why is lender pulling this back?"
    • Check: Last payment, last call, current arrears
    • If PAID OFF → Approve (good outcome)
    • If TRANSFERRED → Approve (note: "transferred to other agency")
    • If DISPUTED → Reject (note: "customer disputes debt, legal review needed")

  For Reactivation:
    "Was the customer previously recalled? Can we recollect?"
    • Check: Prior call history, reason for recall
    • If GOOD CONTACT → Approve
    • If NO ANSWER → Reject (note: "unreachable, no new contact info")

Step 3: Bulk actions
  If 10+ items same type (all removals):
    ☑ Check all removal items
    Click: "Approve Selected"
    Confirm: "Approve 10 removals?"
    Done in one action

Step 4: Monitor bottlenecks
  If "8 Pending" for 3 days:
    Red flag! Follow up with ops team
    Allocations stalled for new customers
    Revenue impact if backlog grows
```

#### 2. Team Performance Dashboards

```
Step 1: View summary
  Navigate to: Dashboard
  Filter by: Team=Your Team(s)
  See:
    • Allocated Count (your team's book)
    • Collected This Month (sum of all agent payments)
    • Resolution % (collected / (collected + arrears) × 100)
    • Target vs Achievement

Step 2: Drill down by agent
  Breakdown table: Filter dimension=Agent
  See each agent's:
    • Allocated count
    • Amount collected
    • Resolution %
    • PTP conversion %
    • By-bucket performance (who's best with NPA cases?)

Step 3: Identify outliers
  Example analysis:
    Agent A: 8% resolution (below target of 20%)
    Agent B: 35% resolution (above target of 20%)
    
    Actions:
      • Agent A: provide coaching, review call scripts
      • Agent B: showcase as peer mentor, replicate approach

Step 4: Generate team report
  Apply filters: Team=X, Month=This Month
  Export to Excel
  Share with team leader for discussion
  Use for incentive calculations (if applicable)
```

#### 3. Escalation Management

```
Scenario: "Customer calling in, says they were double-charged"

Step 1: Customer lookup
  Dashboard: Search or navigate to customer
  Click customer: Opens detail drawer
  Review:
    • Payment history (when was last payment? how much?)
    • Call log (previous disputes?)
    • Promised To Pay (any pending promises?)

Step 2: Investigate
  Example: HERO-456 Ajay Kumar
    • Payment 1: 2026-07-01, 5000 (for June EMI)
    • Payment 2: 2026-07-01, 5000 (duplicate for June EMI)
    Conclusion: Double-charged

Step 3: Document
  In CRM (or email trail):
    "Customer HERO-456 double-charged. Two payments on same date. 
     Recommend reversal of Payment-2. Awaiting finance approval."

Step 4: Follow up
  Finance team: Process reversal
  Call customer back: Confirm reversal within 2-3 days
  Log resolution: "Case closed - refunded 5000"
```

---

## For Team Leaders

### Primary Responsibilities

- **Allocate** customers to agents under your team
- **Monitor** your team's daily performance
- **Coach** agents on collection techniques
- **Escalate** difficult cases to operations manager

### Key Workflows

#### 1. Allocating New Customers

```
When new customers arrive (from import):

Step 1: See unallocated list
  Navigate to: Allocations
  Filter by: Status=Active, Unallocated
  Shows: All active customers with no assigned agent

Step 2: Allocate to agent
  For each customer:
    Click: "Assign to Agent"
    Select: Agent name (your team only)
    Confirm: "Assign HERO-123 to Agent Rajesh?"
    → Allocation log created
    → Customer added to Rajesh's worklist

Step 3: Balance workload
  Consider:
    • Each agent's current allocated count
    • Agent's expertise (who's better with NPA cases?)
    • Geographic proximity (if applicable)
    • Agent's collection history this month

  Ideally: 30-50 active cases per agent

Step 4: Monitor allocation flow
  Next day: Review new allocations
  Verify: Each agent got ~same number of new customers
  Adjust: If one agent got 50 and another got 10, re-allocate
```

#### 2. Performance Coaching

```
Scenario: Agent Priya has 8% resolution, below target of 20%

Step 1: Review performance
  Dashboard: Filter Agent=Priya, Month=Current
  Details:
    • 120 allocated customers
    • Collected 9,600 (only 9.6k out of 120k)
    • 10 PTPs, 3 kept (30% conversion)

Step 2: Drill into call data
  Customer detail: Pick low-performing case
  Click: Call log
  See: Priya called 3 times, no PTP yet, no promises

  Analysis: Low call frequency? Poor follow-up?

Step 3: Coaching conversation
  With Priya:
    "Your resolution % is 8%, peers are at 20%+"
    "What are blockers?" (No contact? Abusive? Genuine hardship?)
    "How can I help?" (Script coaching? Role-play calls? Different bucket assignment?)

Step 4: Document & follow up
  Set goal: "Achieve 15% resolution next month"
  Weekly check-ins
  Provide additional training if needed
  Recognize improvement publicly

Step 5: Re-allocate if necessary
  If Priya is consistently low:
    Some customers → Agent performing well
    Focus Priya on high-contact cases (callbacks, follow-ups)
```

#### 3. Handling Difficult Cases

```
Scenario: "Abusive customer, Agent refuses to call"

Step 1: Review history
  Customer detail: See all prior calls
  Check: Previous agent, what happened?
  Example: "Agent 1 tried 5 times, customer yelled, threw phone"

Step 2: Assess
  Consider:
    • Risk to agent safety?
    • Customer has genuine grievance?
    • Customer in valid hardship?

  Decision options:
    A. Email/WhatsApp outreach (less confrontational)
    B. Legal action (if genuine dispute)
    C. Escalate to operations (if beyond team capability)
    D. Recall (if uncollectable, free up agent time)

Step 3: Document
  Case note: "Escalated to Ops due to abusive behavior. Recommend:
   (1) Legal review of account validity
   (2) If valid, attempt email PTP
   (3) If still uncooperative, consider recall"

Step 4: Escalate
  Email to Operations Manager with above summary
  Flag in CRM: Status=On Hold (or similar)
  Unallocate from agent
  Free agent to focus on productive cases
```

---

## For Field Agents & Telecallers

### Primary Responsibilities

- **Log calls** to customers
- **Create** and **track** promised-to-pay commitments
- **Record** payments (if authorized)
- **Gather** disposition codes (follow-up, PTP needed, payment issue, etc.)
- **Update** customer contact information

### Key Workflows

#### 1. Daily Worklist Routine

**On Mobile App:**

```
Step 1: Log in
  Open app
  Enter phone, password
  See your team leader's name at top

Step 2: View worklist
  "Worklist" tab
  Shows: All customers allocated to you
  Each card shows:
    • Name, Loan Number
    • Bucket (X, 1, 2, NPA)
    • Due amount, EMI
    • Last call date (e.g., "3 days ago")
    • "Normalized (pending)" badge if applicable

Step 3: Prioritize calls
  Strategy 1 (by delinquency):
    Call NPA (90+ days) → 60-90 DPD → 30-60 DPD → Current
  
  Strategy 2 (by last contact):
    Call those not contacted in 30+ days first
  
  Strategy 3 (by amount):
    Focus on high-value cases first

Step 4: Make a call
  Tap: Customer card
  See: Full detail screen (history, PTPs, etc.)
  Tap: "Log Call" (bottom FAB)
  Form:
    Date: (pre-filled today)
    Time: (pre-filled now)
    Duration: 5 (minutes)
    Action Code: FU (follow-up) / PTP (promised to pay) / CALLBACK (call back) / OTHER
    Result Code: P (promise kept) / F (failed, customer refused) / B (busy) / A (abandoned call)
    Remarks: "Customer said will pay by 15th"
    Disposition codes:
      ☑ needs_followup (yes, call back tomorrow)
      ☑ needs_ptp (yes, created PTP for 15-07-2026)
      ☐ needs_payment (no, customer willing to pay soon)
  Save

Step 5: Remark composition
  System auto-suggests remarks based on disposition codes:
    "Customer to pay on 15-07-2026"
    "Follow-up scheduled for 14-07-2026"
  You can edit before saving

Step 6: Create PTP (if needed)
  Tap: "New PTP" button
  Form:
    Amount: 5000 (customer commits to this)
    Date: 15-07-2026 (promise date)
    Time: 10:00 (promise time, optional)
    Remarks: "Agreed after salary credit"
  Save
  → PTP appears in customer's PTP list
  → System tracks if kept or broken

Step 7: End of day
  Check: Worklist badge shows "3 new" (new allocations)
  Review your calls today (count should be 5-15 depending on team size)
  Ensure: Remarks are clear, PTPs created where promised
```

#### 2. Creating & Tracking Promises

```
Scenario: Customer says "I'll pay 5000 next Friday"

Step 1: Create PTP
  In Call Log (or dedicated PTP button):
    Amount: 5000 (amount promised)
    Date: 15-07-2026 (Friday)
    Time: Anytime (or specific if customer said so)
    Remarks: "Agreed after salary, customer confident"
  Save

Step 2: System tracking
  PTP status = "Pending" (not yet fulfilled)
  If payment received on/before 15-07 for ≥5000:
    Status auto-changes to "Kept"
    Agent sees: Green checkmark
    Team leader's PTP conversion increases
  
  If 15-07 passes and no payment:
    Status = "Broken"
    You should: Call again, ask why, create new PTP

Step 3: Follow-up
  PTP reminder (next day or day before):
    If TL enabled notifications: "HERO-456 PTP tomorrow"
  Call customer: "Just confirming, you said you'd pay tomorrow?"
  Update PTP: If customer says "I'll pay next week instead"
    → Delete old PTP
    → Create new PTP for new date

Step 4: Escalation
  If >3 broken PTPs for same customer:
    Escalate to TL: "Customer not keeping promises"
    TL decision: Allocate to different agent? Escalate to ops?

Pro tip: Create realistic PTPs. A PTP kept is better for metrics than a promised amount never received.
```

#### 3. Recording Payments

**If you're authorized (Field Agent with payment access):**

```
Step 1: Receive payment
  Customer says: "I'm paying 5000 right now via bank transfer"
  Get: Payment reference/confirmation number

Step 2: Record in app
  Customer detail: "Record Payment" button
  Form:
    Amount: 5000
    Mode: Bank Transfer / Cash / Cheque (if applicable)
    Reference: TX-123456 (bank reference)
    Remarks: "Via NEFT, ref TX-123456"
  Save

Step 3: System processing
  Payment recorded in CRM
  If PTP existed and amount ≥ promised:
    PTP status → "Kept"
  If customer in bucket 1 and total paid this month ≥ threshold:
    Bucket movement event created → "Normalized" badge appears
  Agent's "Collected This Month" increases

Step 4: Verify
  Customer detail: Refresh
  Payment appears in "Payments" section
  Dashboard "Collected This Month" amount increases
  Collection team: Manager sees payment reflected in metrics

Important: Only record payments actually received. Don't "prepay" or "reserve" amounts.
```

#### 4. Handling Difficult Interactions

```
Scenario 1: Abusive customer
  Action:
    • Stay professional, don't escalate back
    • Document what customer said
    • Note disposition: "needs_escalation" (or TL contact)
    • End call with: "I'll escalate to my manager, they'll reach out soon"
  After call:
    • Tell TL immediately (don't wait for app)
    • TL decides: re-allocate or escalate to ops

Scenario 2: Customer claims they already paid
  Action:
    • Check payment history in app
    • If found: "You're right, payment was [DATE]"
    • If not found: "Let me check, I'll call you back in an hour"
    • Don't argue, be helpful
  Escalate if unsure:
    • Tell TL: "Customer says paid 5000 on [DATE], not showing in system"
    • TL checks with finance, investigates delay

Scenario 3: Customer in hardship
  Action:
    • Listen without judgment
    • Note details: "Medical emergency", "Job loss", etc.
    • Offer: "Let me see if we can adjust the PTP or payment plan"
    • Escalate to TL
  TL will:
    • Discuss with ops: Can we give 30-day moratorium?
    • Offer: Smaller PTP, longer payment plan, etc.

Pro tip: Empathy increases collection rates. Customers willing to negotiate pay more than those in conflict.
```

#### 5. Using the Normalized Badge

```
Scenario: You see "Normalized (pending confirmation)" badge

Meaning:
  Customer was in delinquent bucket (1, 2, or NPA)
  Payments received this month cleared arrears
  System bumped them to "current" status
  Waiting for next allocation file to confirm (that's where badge comes from)

Your action:
  Reassure customer: "Great news! Your account is now current."
  Make note: "Discussed normalization, customer understood"
  Follow-up: Next month's import will confirm or refund if lender still shows delinquent

This badge helps team leaders understand: Which customers are improving due to their calls?
```

---

## Feature Guide - All Users

### Import System

#### Understanding the Allocation Lifecycle

```
Timeline for Hero Fincorp allocation, "July" reporting month:

Week 1 (July 1-7): First import
  ✓ Ops manager: Upload "hero-allocation-july.xlsx" (8 loans)
  ✓ Preview: "8 will be inserted"
  ✓ Commit: 8 inserted, 0 pending
  ✓ Team leader: Allocate to agents
  ✓ Agents: Start calling

Mid-week (July 10-15): Repeat import (refresh)
  Hero Fincorp sends updated file:
    • LOAN-004 no longer in file (customer paid off? transferred?)
    • LOAN-009 is new
    • Other loans updated (amounts, buckets changed)
  
  ✓ Ops manager: Upload "hero-allocation-july-refresh.xlsx"
  ✓ Preview: "1 addition pending, 1 removal pending, 7 updating"
  ✓ Commit: 0 inserted (pending), 7 updated (direct)
  ✓ Import Review: 2 pending items
    - Approve removal (LOAN-004) → status=recalled
    - Approve addition (LOAN-009) → status=active, allocated
  
  ✓ LOAN-004 disappears from worklist (recalled)
  ✓ LOAN-009 appears in worklist (new allocation)

End of month (July 28-31): Month closes
  No more imports for "July" month
  All data frozen for reporting

Next month (Aug 1+): New allocation month starts
  Fresh file, same process repeats
  Old month's data for comparison (transition metrics, rollbacks, etc.)
```

**Key insight:** Don't expect "first and only" files. Always prepare for mid-month refreshes.

### Dashboard Metrics

#### Understanding the Numbers

```
Scenario: Dashboard shows:
  Allocated Count: 120
  Allocated Amount: 1,200,000
  Collected This Month: 180,000
  Resolution %: 15%

Calculation:
  Resolution % = Collected / (Collected + Remaining Arrears) × 100
  = 180,000 / (180,000 + 1,020,000) × 100
  = 15%

Interpretation:
  • Team collected 180k this month
  • Still owe 1,020k (1.02M)
  • If current pace continues, would take 5+ months to collect

Action:
  • Collect more? Increase agent calls, improve PTP conversion
  • Accelerate? Escalate high-value, high-probability cases
  • Accept? This may be realistic for your customer base
```

#### Bucket Breakdown

```
Example: Breakdown by Bucket
  Bucket X (current): 50 allocated, 180k collected (target 20k/month) → 90% resolution
  Bucket 1 (30-60 DPD): 40 allocated, 0 collected (target 5k/month) → 0% resolution
  Bucket 2 (60-90 DPD): 20 allocated, 0 collected (target 2k/month) → 0% resolution
  Bucket NPA (90+ DPD): 10 allocated, 0 collected (target 1k/month) → 0% resolution

Insight:
  ✓ Current bucket customers are responsive (paying)
  ✗ Delinquent buckets getting no traction (all customers refusing/unavailable)
  
Action:
  • Allocate delinquent cases to different agents?
  • Try different collection strategies (escalation, legal threat, settlement)?
  • Recall "stuck" customers, focus on collectable ones?
```

### Bucket Mismatches (DPD Cross-Check)

#### When to Trust, When to Verify

```
Scenario 1: Mismatch = Lender says "X" but due date is 45 days old
  Trust: Your due_date calculation (lender may have lags in updates)
  Action: Contact lender
    "Our records show LOAN-456 is 45 days overdue as of [DATE].
     Your file still shows 'current'. Please verify and update."
  
  Expected outcome: Lender corrects next file

Scenario 2: Mismatch = Lender says "NPA" but due date is only 20 days old
  Question: When did lender assign to NPA? Maybe it's recent, your due_date is stale.
  Action: Check what you know
    • Did customer promise payment? (Check PTP list)
    • Is there recent payment? (Check payment history)
    • Did agent reach them? (Check call log)
  
  If customer is engaged/responsive:
    Likely a lender lag → file updated next month
  If customer is silent:
    Lender is probably right (silent customers can be NPA even if technically <90 days)

Scenario 3: No mismatch
  Lender's bucket aligns perfectly with due_date
  Continue as normal
  This customer is likely managed correctly
```

### Recalled Status

#### What "Recalled" Means

```
Recalled ≠ Closed

Definition:
  Lender pulled the customer back from your agency
  Customer no longer your responsibility to collect
  But it's not the same as "closed" (customer paid in full)

Status journey:
  Active (you're collecting)
    ↓
  [Some event: non-payment, transfer to another agency, etc.]
    ↓
  Recalled (lender pulled back; still owe money, but not your problem now)
    ↓
  Closed (if later: paid in full, written off, legally resolved, etc.)

Implications:
  ✓ No more calls to recalled customers (not your book anymore)
  ✓ Recalled customers don't count toward your resolution %
  ✓ But they appear in "Recalled" report (for transparency with lender)
  ✓ If customer reappears in later file: reactivation (back to active status)

Agent behavior:
  If allocated customer becomes "Recalled":
    • Remove from your call list
    • Contact TL to confirm
    • TL will unallocate from you
    • Focus on remaining active customers
```

### Customer 360 View

#### All Customer Data in One Place

```
When you click a customer, you see:

Section 1: IDENTITY
  Loan Number, Customer Name, Company, Phone, Address
  Bucket (current), Due Amount, EMI, Status (Active/Recalled/Closed)

Section 2: DETAIL FIELDS (from import template)
  Branch, Zone, State, District (examples)
  Populated during import if lender file had these columns
  Shows "-" if missing

Section 3: TRAIL HISTORY (last 50 calls)
  Timeline of every call:
    Date | Time | Agent | Action | Result | Remarks
    2026-07-05 10:30 | Rajesh | FU | P | "Will pay next week"
    2026-07-03 14:15 | Priya | PTP | F | "Customer not answering"
  
  Quick insights:
    How many calls this month?
    Any pattern (certain agent always gets refusals)?
    What was the last outcome?

Section 4: PTPS (Promised To Pay)
  All PTPs for this customer:
    Amount | Date | Status | Agent
    5000 | 15-07-2026 | Pending | Rajesh
    3000 | 20-07-2026 | Pending | Rajesh
    10000 | 25-06-2026 | Broken | Priya (promise date passed, not kept)

Section 5: PAYMENTS
  All payments received:
    Date | Amount | Reference | Mode
    2026-07-01 | 5000 | TX-123456 | Bank Transfer
    2026-06-15 | 3000 | CHQ-789 | Cheque
  
  Running total: 8000 collected so far
  Arrears = Due - Collected = Depends on EMI, current month

Section 6: BUCKET MOVEMENTS
  Events when bucket changed:
    Date | From | To | Trigger | Reason
    2026-07-01 | 1 (30-60) | X (current) | Payment | Paid arrears (5k ≥ threshold)
    2026-06-01 | X | 1 | Allocation | Missed EMI, lender moved bucket
  
  Interpretation:
    Customer was current, missed payment → moved to 30-60 bucket
    Paid up → system detected normalization (waiting for allocation to confirm)

Section 7: ALLOCATION HISTORY
  How has this customer been assigned:
    Date | From Agent | To Agent | Reason
    2026-07-10 | Unallocated | Rajesh | Assigned by Team Leader
    2026-07-01 | Priya | Rajesh | Reassigned (performance)
  
  Team leader visibility: Understand who's been working this customer

Section 8: MONTH SNAPSHOTS
  Historical state for each month:
    Month | Bucket | Due Amount | EMI | Collected
    2026-07 | 1 | 50,000 | 5,000 | 5,000 (partial)
    2026-06 | X | 40,000 | 5,000 | 5,000 (full)
    2026-05 | X | 35,000 | 5,000 | 5,000
  
  Trend analysis:
    Is customer's amount increasing or decreasing?
    Is bucket improving or worsening?
    When did they stop responding?
```

---

## Troubleshooting

### "I can't see a customer I'm supposed to call"

**Possible reasons:**

1. **Customer not allocated to you yet**
   - TL hasn't assigned the new customer
   - Solution: Ask TL, "Can you allocate HERO-456 to me?"

2. **Customer was recalled**
   - Lender pulled the customer back mid-month
   - Solution: Confirmed, stop calling
   - Remove from your notes

3. **You're looking at the wrong month**
   - Dashboard filtered to a past month
   - Solution: Switch month to current month in filter

4. **Customer status is "Closed" or "Recalled"**
   - Status filter might be excluding them
   - Solution: Check filter "Status" and adjust

5. **Offline mode (mobile only)**
   - Your worklist was synced before going offline
   - New allocations won't show until you're online again
   - Solution: Go online, refresh

### "My collection number isn't updating"

**Possible reasons:**

1. **Payment recorded but not synced**
   - You recorded it offline
   - Solution: Ensure app is online, refresh

2. **Payment pending approval (if required)**
   - Some companies require TL/admin approval of agent-recorded payments
   - Solution: Check with TL if payment is pending their approval

3. **Wrong month filter**
   - You're viewing a past month
   - Solution: Filter to current month

4. **System cache**
   - Dashboard has a 5-minute cache
   - Solution: Wait or refresh page (web) / pull down (mobile)

### "Dashboard shows 'Recalled' status but I don't see a reason why"

**Possible scenarios:**

1. **Lender pulled customer (recall notification sent)**
   - Mid-month import marked customer as recalled
   - You may not have received formal notification
   - Solution: Check import review logs (ops manager can see)

2. **Customer disputed the debt**
   - Lender pulled while investigating
   - Solution: TL should explain context

3. **Administrative error**
   - TL manually recalled by mistake
   - Solution: Ask TL to reactivate if mistake

### "I logged a call but it's not showing"

**Possible reasons:**

1. **Offline mode (mobile)**
   - Call logged locally, not synced yet
   - Solution: Go online, ensure sync completes (check status bar)

2. **Network error**
   - Upload failed silently
   - Solution: Manually tap "Sync" button (if available) or retry logging

3. **Wrong customer**
   - You logged against the wrong customer
   - Solution: Check call log for all your customers

4. **App didn't save**
   - You closed form without confirming
   - Solution: Re-enter the call details

### "I created a PTP but the reminder didn't notify me"

**Possible reasons:**

1. **Notifications disabled**
   - App settings: Notifications OFF
   - Solution: Enable in app settings

2. **PTP date is far in future**
   - Reminder may trigger only 1 day before
   - Solution: Manual check your PTP list

3. **Mobile app closed**
   - App must be running (or backgrounded) to send notifications
   - Solution: Keep app in background on your phone

### "Team leader can't see my team's performance"

**Possible reasons:**

1. **TL doesn't have the Team Leader role**
   - System requires specific role assignment
   - Solution: Admin needs to assign "Team Leader" capability to this user

2. **Agents not assigned to TL's team**
   - Agents exist but are in a different organizational group
   - Solution: Admin needs to move agents under TL's team

3. **No data for the period**
   - Might be a fresh team with no allocations yet
   - Solution: Wait for allocations to come through imports

### "PTP was kept but status still shows Pending"

**Possible reasons:**

1. **Payment recorded but amount < promised**
   - Customer promised 5000 but paid 3000
   - System won't mark PTP as kept unless payment ≥ promised amount
   - Solution: Create new PTP for remaining 2000 or update original

2. **Sync delay**
   - Payment recorded but dashboard cache not updated
   - Solution: Refresh page / refresh mobile app

3. **Wrong customer**
   - Payment went against different customer
   - Solution: Check payment customer_id matches PTP customer_id

### "Bucket Mismatches showing me as "unmapped" — what do I do?"

**You (agent) see:** Report shows "UNMAPPED" bucket warning

**Actually:** This is for ops/admin team, not agents

**Why:** Admin hasn't set canonical number for a bucket

**What happens:** Payment-driven bucket movements are skipped for this bucket (system can't detect normalization)

**Action for you:** Report to TL or ops, ask them to "Map bucket X to canonical 2" in Admin > Buckets

---

## FAQ

### Q: How often should I call a customer?

**A:** Depends on bucket and response:
- **Bucket X (Current):** Monthly touch-in (monthly EMI reminder)
- **Bucket 1 (30-60 DPD):** Weekly (escalate collection effort)
- **Bucket 2 (60-90 DPD):** Bi-weekly (urgent)
- **Bucket NPA (90+ DPD):** Weekly or escalate (very urgent)

If customer is responsive: increase frequency.
If customer refuses: escalate to TL after 3-5 attempts.

### Q: What should I do if customer says they can't pay?

**A:** Don't argue. Empathize.

Example response:
"I understand this is difficult. Let's find a solution.
- Can you pay a portion (3000 instead of 5000)?
- Can you pay on a specific date when you have funds?
- Should I connect you with my supervisor for a payment plan?"

Escalate to TL if customer is in genuine hardship.

### Q: If I call and customer says they already paid, what do I do?

**A:** Don't argue. Investigate.

1. Check app payment history (does it show the payment?)
2. If yes: "You're absolutely right, payment on [DATE]. Thank you!"
3. If no: "Let me check with my team. I'll call back in an hour." (Don't pretend to check on the phone)
4. Escalate to TL: "Customer says paid 5000 on [DATE], not in our system yet."

TL or Finance will investigate. Maybe payment is in transit, maybe there's a discrepancy.

### Q: What counts toward my "Collection" metric?

**A:** Only actual payments received.

Not counted:
- Promised To Pay (only counts if kept)
- Partial payments against future months
- Refunds or reversals

Counted:
- Full payment toward current month EMI
- Advance payments (counts immediately)
- Cheque received (counts on date received, not cleared date)

### Q: I logged a PTP for next week, but customer called back and says "Actually, I'll pay today." What do I do?

**A:** Delete old PTP, create new PTP for today.

1. Customer detail: PTP section
2. Swipe/delete the old one
3. Tap "New PTP" for today's date
4. Once payment is received today, PTP auto-marked "Kept"

### Q: My TL says "Customer is now 'Recalled'", does that mean don't call anymore?

**A:** Yes, exactly.

Recalled means the lender pulled the customer back. You're no longer responsible for collection. Remove from your call list.

If lender sends the customer back in a future import (reactivation), your TL will re-allocate and you'll see them again.

### Q: Can I change a customer's bucket manually?

**A:** No. Only the lender file can change the bucket.

If you think a bucket is wrong:
1. Document your concern in the call remarks
2. Tell TL: "LOAN-456 should be in bucket 2, not 1"
3. TL escalates to ops
4. Ops contacts lender, requests correction in next file

System respects the lender's bucket as authoritative.

### Q: How do I know if I'm on track to meet my target?

**A:** Check your "My Performance" dashboard.

- Target: $X to collect (set by TL)
- Achievement: $Y collected so far
- % of Month Complete: If 15 days into 30-day month, you're 50% through.
- You need to collect: Target × (Days Remaining / Days in Month)

Example:
- Target: 50k, Days Remaining: 10, Days in Month: 30
- Need to collect: 50k × (10/30) = 16.7k in last 10 days
- If collected 35k so far: Already exceeded target (on track for 50k+)

---

## Sign-Off

- **User Roles Covered:** Agency Admin, Operations Manager, Team Leader, Field Agent, Telecaller
- **Features Documented:** Allocation, Import Review, DPD Cross-Check, Bucket Movements, Recalled Status, Customer 360, Dashboard, Worklist, PTP, Payments
- **Edge Cases Covered:** Offline sync, duplicate payments, PTP broken, recalled reactivation, bucket mismatches
- **Last Updated:** 2026-07-07
- **Status:** ✅ Ready for Production

For additional support, contact your administrator or refer to TESTING_GUIDE.md for technical details.

