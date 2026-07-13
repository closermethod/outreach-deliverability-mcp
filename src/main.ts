#!/usr/bin/env node
/**
 * Outreach Deliverability MCP Server v1.0
 * By Elisabeth Hitz — the channel-safety layer for cold outreach.
 *
 * 6 tools for AI agents (and humans) running outbound on email, LinkedIn,
 * Instagram DM, or X DM. Volume discipline, sender setup, spam-trigger auditing,
 * and benchmark interpretation — so good messages actually arrive.
 *
 * The premise: most outbound fails before the copy is ever read. Burned domains,
 * throttled accounts, and spam-foldered sends kill campaigns that the message
 * audit would have passed. This MCP is the layer that keeps the channel alive.
 *
 * This MCP does NOT send anything. It returns rules, checklists, and audits.
 *
 * DISCLAIMER: Platform limits and filtering behavior change frequently; values
 * here are conservative practitioner ranges as of last_verified, not platform
 * guarantees. Legal notes are orientation, not legal advice.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// =====================================================
// SERVER METADATA
// =====================================================
const MCP_META = {
  server: "outreach-deliverability-mcp",
  version: "1.0.0",
  last_verified: "2026-Q3",
  author: "Elisabeth Hitz",
  homepage: "https://elisabethhitz.com",
  github: "https://github.com/closermethod/outreach-deliverability-mcp",
  volatility_note: "Platform limits and filter behavior drift. Treat numbers as conservative practitioner ranges as of last_verified — when in doubt, send less, warm longer.",
  jurisdiction_caveat: "CAN-SPAM / GDPR / PECR / CASL notes are orientation only, not legal advice. B2C cold email is heavily restricted in many regions; check your jurisdiction."
} as const;

// =====================================================
// CHANNEL RULES
// =====================================================
const CHANNEL_RULES: Record<string, any> = {
  email: {
    safe_daily_volume: "20-40 cold sends/day per mailbox once warmed. New mailboxes: start at 5-10/day, ramp over 3-4 weeks.",
    account_setup: "NEVER send cold from your main domain. Use 1-2 lookalike domains (yourbrand-hq.com), 2-3 mailboxes each, all with SPF/DKIM/DMARC configured.",
    warmup: "2-4 weeks of warmup (peer-to-peer sends, replies, marked-important) before any cold volume. Keep warmup running at low volume alongside campaigns.",
    kill_signals: "Bounce rate >3% (list quality problem — stop and re-verify), spam-complaint rate >0.1%, open rate falling off a cliff mid-campaign (you've been foldered).",
    personalization_floor: "First line must be target-specific. Identical bodies across hundreds of sends pattern-match to bulk filters even with rotated openers.",
    legal_basics: "CAN-SPAM (US B2B): physical address + working unsubscribe. GDPR/PECR (EU/UK): legitimate-interest B2B outreach is arguable but narrow — B2C cold email is effectively off-limits. CASL (Canada): consent-based, strictest of the three."
  },
  linkedin: {
    safe_daily_volume: "Connection requests: ~15-20/day (under 100/week hard ceiling). Messages to existing connections: ~30-50/day. New/low-SSI accounts: half that.",
    account_setup: "Warm accounts only — aged profile, real activity, completed profile, 500+ connections before automation-scale outreach. One account per human; parallel fake profiles get banned in clusters.",
    warmup: "2 weeks of manual-feeling activity (viewing, commenting, accepting) before ramping connection volume on a fresh or dormant account.",
    kill_signals: "Connection acceptance rate <25% (targeting problem — pause and re-segment), 'we've restricted your account' warning (STOP for 1-2 weeks, halve volume on return).",
    personalization_floor: "Blank connection requests often out-perform pitchy notes. If you add a note: hook only, no pitch, no link.",
    legal_basics: "Automation violates LinkedIn ToS — account risk, not legal risk. Weigh tooling against the cost of losing the account."
  },
  instagram_dm: {
    safe_daily_volume: "Cold DMs to non-followers: ~20-30/day on aged accounts, 5-10 on newer ones. DMs land in Requests — assume most are never seen.",
    account_setup: "Real, active creator account. Engagement (story replies, comment threads) before the DM lifts land rate — the DM after a real interaction is 'warm', not cold.",
    warmup: "Comment/engage with targets for days before the DM. Cold DM to total stranger = Requests folder purgatory.",
    kill_signals: "'Action blocked' warnings, DMs silently undelivered, sudden follow/unfollow restrictions. Any of these: stop all outbound for 5-7 days.",
    personalization_floor: "Reference their specific post/story in line one. Voice notes and video DMs (where appropriate) massively out-perform text walls.",
    legal_basics: "Meta ToS prohibits automation outside approved API partners. Business messaging via API only applies after the user initiates."
  },
  x_dm: {
    safe_daily_volume: "Open-DM accounts only, ~20-30/day. Non-mutuals without open DMs are unreachable — engage publicly instead.",
    account_setup: "Active account with real posting history. Blue-check status affects DM access tiers and reply visibility.",
    warmup: "Public engagement first (replies to their posts that add value). A DM after two good public interactions is warm.",
    kill_signals: "DM restrictions, shadow-throttled replies. X's spam heuristics weight account age and follower/following ratio heavily.",
    personalization_floor: "Reference their specific post. X culture tolerates directness more than other channels — get to the point in 2 sentences.",
    legal_basics: "ToS restricts bulk automated DMs. Same account-risk calculus as LinkedIn."
  }
};

// =====================================================
// SENDER SETUP CHECKLIST (email infrastructure)
// =====================================================
const SENDER_SETUP = [
  { step: 1, item: "Lookalike domain(s)", detail: "Buy 1-2 variants of your brand domain for cold sends. Your main domain's reputation is not a gambling chip." },
  { step: 2, item: "SPF record", detail: "Authorize your sending service in DNS. One SPF record per domain (multiple records = auto-fail)." },
  { step: 3, item: "DKIM signing", detail: "Enable in your email provider; verify the selector in DNS. Unsigned mail is presumed guilty in 2026." },
  { step: 4, item: "DMARC policy", detail: "Start p=none with reporting; move to p=quarantine once reports are clean. No DMARC = major providers throttle you." },
  { step: 5, item: "Mailbox provisioning", detail: "2-3 mailboxes per sending domain, human names, real photos, signatures. Google/Microsoft-hosted inboxes inherit provider trust." },
  { step: 6, item: "Warmup", detail: "2-4 weeks automated warmup before cold volume. Keep it running at reduced volume during campaigns." },
  { step: 7, item: "List verification", detail: "Verify every list before sending (bounce risk <3%). Catch-all addresses are lower-confidence; send to them from your most disposable mailbox." },
  { step: 8, item: "Custom tracking domain", detail: "If you must track opens/clicks, use a custom tracking domain — shared tracking domains carry other senders' sins. Better: skip open tracking entirely, measure replies." },
  { step: 9, item: "Unsubscribe + address", detail: "Working opt-out and a physical address in footer (CAN-SPAM). For plain-text one-to-one style sends, an 'if not relevant, tell me and I'll stop' line works and reads human." },
  { step: 10, item: "Monitoring", detail: "Weekly: check DMARC reports, blacklist status (MXToolbox-class tools), reply rate vs open rate divergence. Deliverability dies quietly; look at it on purpose." }
];

// =====================================================
// SPAM TRIGGER AUDIT
// =====================================================
const SPAM_PHRASES = [
  "act now", "limited time", "100% free", "risk-free", "guarantee", "guaranteed",
  "make money", "earn money fast", "no obligation", "click here", "click below",
  "buy now", "order now", "special promotion", "exclusive deal", "winner",
  "congratulations", "urgent", "final notice", "last chance", "don't miss",
  "increase your revenue", "boost your sales", "double your", "10x your",
  "this is not spam", "no strings attached", "free trial", "cheap", "discount",
  "$$$", "!!!", "dear friend", "dear sir"
];
const STRUCTURAL_SPAM_CHECKS = [
  { id: "all_caps_words", test: (t: string) => (t.match(/\b[A-Z]{4,}\b/g) || []).length > 0, detail: "ALL-CAPS words trip content filters and read as shouting." },
  { id: "excessive_exclamations", test: (t: string) => (t.match(/!/g) || []).length > 1, detail: "More than one exclamation mark in a cold email raises spam scoring." },
  { id: "excessive_links", test: (t: string) => (t.match(/https?:\/\//g) || []).length > 1, detail: "Multiple links in a cold send is a classic bulk-mail signature. Zero or one." },
  { id: "image_or_attachment_refs", test: (t: string) => /\b(attached|attachment|see image|banner)\b/i.test(t), detail: "First-touch attachments/images hurt inbox placement. Plain text wins cold." },
  { id: "money_symbols", test: (t: string) => /[$€£]\s?\d/.test(t), detail: "Currency amounts in cold email raise both spam score and method violations (no money in the cold message)." },
  { id: "spammy_subject_shape", test: (t: string) => /^(re:|fwd:)/i.test(t.trim()), detail: "Fake 'Re:'/'Fwd:' subjects are deceptive (CAN-SPAM issue) and pattern-matched by filters." }
];

function auditSpamTriggers(text: string) {
  const lower = text.toLowerCase();
  const phrase_hits = SPAM_PHRASES.filter(p => lower.includes(p));
  const structural_hits = STRUCTURAL_SPAM_CHECKS.filter(c => c.test(text)).map(c => ({ check: c.id, detail: c.detail }));
  const score = phrase_hits.length * 2 + structural_hits.length * 3;
  return {
    spam_phrase_hits: phrase_hits,
    structural_hits,
    risk_score: Math.min(100, score * 5),
    verdict: score === 0 ? "CLEAN" : score <= 3 ? "LOW RISK — fix the flagged items" : score <= 7 ? "MODERATE RISK — rewrite before sending" : "HIGH RISK — this reads like bulk mail to both filters and humans",
    principle: "The same things that trip filters repel humans: hype, pressure, links, money talk. Write like one professional emailing another."
  };
}

// =====================================================
// BENCHMARK INTERPRETATION
// =====================================================
const BENCHMARKS: Record<string, any> = {
  email_open_rate: {
    healthy: "50-70% on small, verified, personalized B2B lists (post-2024 privacy inflation included)",
    warning: "<40% suggests deliverability trouble, not copy trouble — check domain health before touching subject lines",
    note: "Apple MPP and image-proxy inflation make opens directional at best. Reply rate is the metric that pays."
  },
  email_reply_rate: {
    healthy: "5-15% on tight lists with real personalization; the best small-batch campaigns exceed 20%",
    warning: "<2% = list/targeting problem or foldered sends. Audit deliverability first, then the hook.",
    note: "Positive-reply rate matters more than raw reply rate. 'Not interested' replies still prove you hit the inbox."
  },
  email_bounce_rate: {
    healthy: "<2% verified lists",
    warning: ">3% actively damages sender reputation — stop the campaign, re-verify the list",
    note: "One bad batch can poison a domain for weeks. Verification is cheaper than a new domain."
  },
  linkedin_acceptance_rate: {
    healthy: "30-50% with tight targeting",
    warning: "<25% — pause, re-segment, review profile-to-audience fit",
    note: "Acceptance is a targeting metric; reply is a message metric. Diagnose them separately."
  },
  dm_reply_rate: {
    healthy: "10-25% on genuinely researched, engagement-warmed DMs (IG/X)",
    warning: "<5% means you're DMing cold strangers at bulk cadence — warm with public engagement first",
    note: "DM channels punish volume and reward pre-touch engagement more than email does."
  }
};

// =====================================================
// MCP SERVER
// =====================================================
const server = new Server({ name: "outreach-deliverability-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_channel_rules",
      description: "Get safe volume limits, account setup, warmup protocol, kill signals, personalization floor, and legal basics for an outreach channel. Channels: email, linkedin, instagram_dm, x_dm.",
      inputSchema: {
        type: "object",
        properties: { channel: { type: "string", enum: Object.keys(CHANNEL_RULES) } },
        required: ["channel"]
      }
    },
    {
      name: "get_sender_setup_checklist",
      description: "Returns the 10-step cold-email infrastructure checklist: lookalike domains, SPF, DKIM, DMARC, mailbox provisioning, warmup, list verification, tracking domains, compliance footer, monitoring.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "audit_spam_triggers",
      description: "Audit outreach copy (subject + body) for spam-filter triggers: flagged phrases, all-caps, exclamation marks, multiple links, attachments, money symbols, fake Re:/Fwd: subjects. Returns hits, a 0-100 risk score, and a verdict.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "The full outreach copy to audit (include the subject line)" } },
        required: ["text"]
      }
    },
    {
      name: "interpret_benchmark",
      description: "Interpret an outreach metric against practitioner benchmarks: email_open_rate, email_reply_rate, email_bounce_rate, linkedin_acceptance_rate, dm_reply_rate. Returns healthy range, warning threshold, and the diagnostic note.",
      inputSchema: {
        type: "object",
        properties: {
          metric: { type: "string", enum: Object.keys(BENCHMARKS) },
          observed_value: { type: "number", description: "Optional: your observed value (percent) for a direct read" }
        },
        required: ["metric"]
      }
    },
    {
      name: "diagnose_campaign",
      description: "Given observed campaign metrics (any of: open_rate, reply_rate, bounce_rate, acceptance_rate as percents), returns the most likely failure layer (infrastructure vs list vs message) and the fix order. Deliverability problems masquerade as copy problems — this tool tells you which one you have.",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: Object.keys(CHANNEL_RULES) },
          open_rate: { type: "number" },
          reply_rate: { type: "number" },
          bounce_rate: { type: "number" },
          acceptance_rate: { type: "number" }
        },
        required: ["channel"]
      }
    },
    {
      name: "get_full_pack",
      description: "Returns the complete deliverability library: channel rules, sender setup, spam triggers, benchmarks. Useful for full agent context.",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as any;
  const wrap = (obj: any) => ({ content: [{ type: "text" as const, text: JSON.stringify({ ...obj, _meta: MCP_META }, null, 2) }] });

  if (name === "get_channel_rules") {
    const data = CHANNEL_RULES[a.channel];
    if (!data) return wrap({ error: "Unknown channel. See enum." });
    return wrap({ channel: a.channel, ...data });
  }

  if (name === "get_sender_setup_checklist") {
    return wrap({
      rule: "Infrastructure before copy. The best message in the world converts at 0% from the spam folder.",
      checklist: SENDER_SETUP
    });
  }

  if (name === "audit_spam_triggers") {
    if (!a.text || typeof a.text !== "string") return wrap({ error: "Provide the outreach copy as 'text'." });
    return wrap(auditSpamTriggers(a.text));
  }

  if (name === "interpret_benchmark") {
    const data = BENCHMARKS[a.metric];
    if (!data) return wrap({ error: "Unknown metric. See enum." });
    let reading;
    if (typeof a.observed_value === "number") {
      const v = a.observed_value;
      if (a.metric === "email_bounce_rate") reading = v <= 2 ? "HEALTHY" : v <= 3 ? "ELEVATED — re-verify before next batch" : "CRITICAL — stop sending, re-verify list";
      else if (a.metric === "email_open_rate") reading = v >= 50 ? "HEALTHY" : v >= 40 ? "SOFT — watch domain health" : "WARNING — likely deliverability, not copy";
      else if (a.metric === "email_reply_rate") reading = v >= 5 ? "HEALTHY" : v >= 2 ? "SOFT — tighten targeting/hook" : "WARNING — audit deliverability first";
      else if (a.metric === "linkedin_acceptance_rate") reading = v >= 30 ? "HEALTHY" : v >= 25 ? "SOFT" : "WARNING — pause and re-segment";
      else if (a.metric === "dm_reply_rate") reading = v >= 10 ? "HEALTHY" : v >= 5 ? "SOFT" : "WARNING — add pre-touch engagement";
    }
    return wrap({ metric: a.metric, observed_value: a.observed_value, reading, ...data });
  }

  if (name === "diagnose_campaign") {
    if (!CHANNEL_RULES[a.channel]) return wrap({ error: "Unknown channel. See enum." });
    const findings: string[] = [];
    let layer = "message";
    if (typeof a.bounce_rate === "number" && a.bounce_rate > 3) { layer = "list"; findings.push(`Bounce rate ${a.bounce_rate}% > 3%: list quality failure. Stop sending and re-verify — this damages the domain with every batch.`); }
    if (typeof a.open_rate === "number" && a.open_rate < 40 && a.channel === "email") { if (layer === "message") layer = "infrastructure"; findings.push(`Open rate ${a.open_rate}% < 40%: sends are likely being foldered. Check SPF/DKIM/DMARC, blacklists, and volume ramp before touching copy.`); }
    if (typeof a.acceptance_rate === "number" && a.acceptance_rate < 25 && a.channel === "linkedin") { layer = "list"; findings.push(`Acceptance ${a.acceptance_rate}% < 25%: targeting/profile-fit problem, not message.`); }
    if (typeof a.reply_rate === "number" && a.reply_rate < 2) {
      if (findings.length === 0) findings.push(`Reply rate ${a.reply_rate}% with no infrastructure red flags: this is a message/targeting problem. Audit the hook (is it specific?), the ask (is it soft?), and list tightness.`);
      else findings.push(`Low reply rate (${a.reply_rate}%) is downstream of the issues above — fix those first, then re-measure before rewriting copy.`);
    }
    if (findings.length === 0) findings.push("No red flags in the provided metrics. If results still feel weak, tighten targeting before increasing volume — volume amplifies whatever quality you already have.");
    return wrap({
      channel: a.channel,
      most_likely_failure_layer: layer,
      fix_order: ["1. infrastructure (domain/account health)", "2. list (verification, targeting)", "3. message (hook, ask, length)"],
      findings
    });
  }

  if (name === "get_full_pack") {
    return wrap({
      pack: "Outreach Deliverability MCP — Complete Library v1.0",
      author: "Elisabeth Hitz",
      modules: {
        channel_rules: CHANNEL_RULES,
        sender_setup: SENDER_SETUP,
        spam_phrases: SPAM_PHRASES,
        benchmarks: BENCHMARKS
      }
    });
  }

  return wrap({ error: "Unknown tool" });
});

const transport = new StdioServerTransport();
await server.connect(transport);
