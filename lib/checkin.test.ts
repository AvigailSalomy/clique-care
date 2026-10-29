import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePriorityScore,
  getDueMembers,
  parseCsv,
  parseReferenceDate,
  parseTop,
  recommendedWindow,
  scoreBreakdown,
  toMembers,
  type Contact,
  type Member,
} from "./checkin.ts";
import { loadData } from "./data.ts";
import { prepareCheckinMessage } from "./templates.ts";

const NOW = new Date("2025-11-06T00:00:00Z");

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    member_id: 1,
    full_name: "Test Member",
    age: 70,
    preferred_channel: "call",
    risk_flags: [],
    ...overrides,
  };
}

function contactDaysAgo(member_id: number, days: number, outcome = "ok"): Contact {
  const date = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  return { member_id, last_contact_utc: date.toISOString(), outcome };
}

test("parses CSV with Windows line endings and converts rows to members", () => {
  const csv =
    "member_id,full_name,age,preferred_channel,risk_flags\r\n" +
    "3,Sarah Adler,90,whatsapp,lives_alone;recent_discharge\r\n" +
    "4,Danny Israel,68,call,\r\n";
  const [sarah, danny] = toMembers(parseCsv(csv));

  assert.deepEqual(sarah, {
    member_id: 3,
    full_name: "Sarah Adler",
    age: 90,
    preferred_channel: "whatsapp",
    risk_flags: ["lives_alone", "recent_discharge"],
  });
  assert.deepEqual(danny.risk_flags, []); // empty last column, no leftover "\r"
});

test("calculates the priority score and recommended window", () => {
  const member = makeMember({ age: 85, risk_flags: ["recent_discharge", "lives_alone"] });
  // 3 (discharge) + 2 (alone) + 1 (age) + 1 (no_answer) + 14/7 (gap) = 9
  assert.equal(calculatePriorityScore(scoreBreakdown(member, 14, "no_answer")), 9);

  assert.equal(recommendedWindow(80), "morning");
  assert.equal(recommendedWindow(79), "afternoon");
});

test("score breakdown lists only the factors that apply, and adds up to the score", () => {
  const member = makeMember({ age: 85, risk_flags: ["lives_alone"] });
  const breakdown = scoreBreakdown(member, 10.5, "no_answer");

  assert.deepEqual(breakdown, [
    { label: "Lives alone", points: 2 },
    { label: "Age 80+", points: 1 },
    { label: "No answer last time", points: 1 },
    { label: "10 days since last contact", points: 1.5 },
  ]);
  assert.equal(calculatePriorityScore(breakdown), 2 + 1 + 1 + 1.5);

  // no contact record -> no time factor
  assert.deepEqual(scoreBreakdown(makeMember(), null, null), []);
});

test("7-day rule: under 7 days is not due, exactly 7 days is due", () => {
  const members = [makeMember({ member_id: 1 }), makeMember({ member_id: 2 })];
  const contacts = [contactDaysAgo(1, 6.9), contactDaysAgo(2, 7)];
  const due = getDueMembers(members, contacts, [], NOW);
  assert.deepEqual(due.map((m) => m.member_id), [2]);
});

test("member with no contact record is due with no gap bonus, and is not forced to the top", () => {
  const neverContacted = makeMember({ member_id: 1, age: 85 }); // score 1 (age only)
  const longGap = makeMember({ member_id: 2 }); // score 14/7 = 2
  const due = getDueMembers([neverContacted, longGap], [contactDaysAgo(2, 14)], [], NOW);

  assert.deepEqual(due.map((m) => m.member_id), [2, 1]);
  assert.equal(due[1].days_since_last_contact, null);
  assert.equal(due[1].priority_score, 1);
});

test("nobody is due on a holiday, and invalid channels are skipped", () => {
  assert.deepEqual(getDueMembers([makeMember()], [], ["2025-11-06"], NOW), []);

  const members = [
    makeMember({ member_id: 1, preferred_channel: "" }),
    makeMember({ member_id: 2, preferred_channel: "fax" }),
    makeMember({ member_id: 3, preferred_channel: "whatsapp" }),
  ];
  const due = getDueMembers(members, [], [], NOW);
  assert.deepEqual(due.map((m) => m.member_id), [3]);
});

test("results are sorted by score descending, ties by member_id", () => {
  const members = [
    makeMember({ member_id: 3 }),
    makeMember({ member_id: 1 }),
    makeMember({ member_id: 2, risk_flags: ["recent_discharge"] }),
  ];
  const due = getDueMembers(members, [], [], NOW);
  assert.deepEqual(due.map((m) => m.member_id), [2, 1, 3]);
});

test("parses the top and date URL parameters", () => {
  assert.equal(parseTop(null), 5);
  assert.equal(parseTop("3"), 3);
  assert.equal(parseTop("0"), null);
  assert.equal(parseTop("abc"), null);

  assert.equal(parseReferenceDate("2025-11-06")?.toISOString(), "2025-11-06T00:00:00.000Z");
  assert.equal(parseReferenceDate("06/11/2025"), null);
  assert.equal(parseReferenceDate("2025-13-01"), null);
  assert.equal(parseReferenceDate("2025-02-30"), null); // impossible date
  assert.equal(parseReferenceDate("2024-02-29")?.toISOString(), "2024-02-29T00:00:00.000Z"); // leap year
});

test("prepares a channel-specific message using only the first name", () => {
  assert.match(prepareCheckinMessage("Ruth Cohen", "sms"), /^Hi Ruth, /);
  assert.match(prepareCheckinMessage("Ruth Cohen", "whatsapp"), /^Hi Ruth! /);
  assert.match(prepareCheckinMessage("Ruth Cohen", "call"), /^Hello Ruth, .*\[your name\]/);
  assert.doesNotMatch(prepareCheckinMessage("Ruth Cohen", "sms"), /Cohen/);
});

test("real data files load and produce a sorted due list", () => {
  const { members, contacts, holidays } = loadData();
  assert.equal(members.length, 50);
  assert.equal(contacts.length, 50);

  const due = getDueMembers(members, contacts, holidays, NOW);
  assert.equal(due.length, 35);
  assert.equal(due[0].member_id, 2); // Isaac Regev: discharge + alone + no_answer + long gap

  // 2025-11-07 is listed in holidays.json
  assert.deepEqual(getDueMembers(members, contacts, holidays, new Date("2025-11-07T12:00:00Z")), []);
});
