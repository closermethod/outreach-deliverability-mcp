# Outreach Deliverability MCP

**The channel-safety layer for cold outreach. Volume discipline, sender setup, spam auditing — so good messages actually arrive.**

> **Disclaimer.** Platform limits and filtering behavior change frequently; values are conservative practitioner ranges as of last verification, not platform guarantees. Legal notes (CAN-SPAM / GDPR / PECR / CASL) are orientation, not legal advice.

---

## Why This Exists

Most outbound fails before the copy is ever read. Burned domains, throttled LinkedIn accounts, and spam-foldered sends kill campaigns that any message audit would have passed. AI agents make this worse: they can generate 500 perfect emails an hour, and sending them is exactly how you lose the domain.

This MCP is the layer that keeps the channel alive. It does NOT send anything — it returns rules, checklists, and audits that an agent consults BEFORE and DURING a campaign.

The core diagnostic it encodes: **deliverability problems masquerade as copy problems.** A 1% reply rate usually isn't a bad hook — it's a foldered send. Fix order: infrastructure → list → message.

## 6 Tools

| Tool | What it returns |
|---|---|
| `get_channel_rules` | Safe daily volumes, account setup, warmup protocol, kill signals, personalization floor, and legal basics per channel: email, LinkedIn, Instagram DM, X DM |
| `get_sender_setup_checklist` | The 10-step cold-email infrastructure checklist: lookalike domains, SPF, DKIM, DMARC, mailboxes, warmup, list verification, tracking, compliance, monitoring |
| `audit_spam_triggers` | Copy audit: 30+ flagged phrases, all-caps, exclamations, link count, attachments, money symbols, fake Re:/Fwd: — with a 0-100 risk score |
| `interpret_benchmark` | Healthy/warning ranges for open rate, reply rate, bounce rate, LinkedIn acceptance, DM reply — with an optional direct read of your observed value |
| `diagnose_campaign` | Given your observed metrics, names the failure layer (infrastructure vs list vs message) and the fix order |
| `get_full_pack` | The complete library as one payload for full agent context |

## Sample Use

```typescript
// Campaign feels dead. Copy problem or channel problem?
mcp.call("diagnose_campaign", {
  channel: "email", open_rate: 31, reply_rate: 0.8, bounce_rate: 4.2
});
// Returns: failure layer = LIST. Bounce 4.2% > 3% is actively damaging the
// domain; open 31% says sends are being foldered. Fix infrastructure and
// list BEFORE touching the copy.

mcp.call("audit_spam_triggers", { text: "URGENT: Don't miss this LIMITED TIME offer!!! Click here..." });
// Returns: HIGH RISK, phrase + structural hits itemized.
```

## Works With

Pair with [outbound-engine-mcp](https://github.com/closermethod/outbound-engine-mcp): that one makes the message worth sending; this one makes sure it lands.

## Built By

[Elisabeth Hitz](https://www.linkedin.com/in/elisabethhitz) — 10+ years of B2B enterprise sales experience across ad-tech, SaaS, media, and global hiring. Now building MCP servers for the AI agent ecosystem.

License: MIT
