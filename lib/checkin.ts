// Core check-in logic. These are pure functions: no file system and no Next.js.
// "now" is always passed in, so the same input always gives the same output (easy to test).

export type Member = {
  member_id: number;
  full_name: string;
  age: number;
  preferred_channel: string;
  risk_flags: string[];
};

export type Contact = {
  member_id: number;
  last_contact_utc: string;
  outcome: string;
};

export type ScoreFactor = {
  label: string;
  points: number;
};

export type DueMember = {
  member_id: number;
  full_name: string;
  age: number;
  preferred_channel: string;
  risk_flags: string[];
  days_since_last_contact: number | null; // null = no contact record yet
  last_outcome: string | null;
  priority_score: number;
  score_breakdown: ScoreFactor[];
  recommended_window: "morning" | "afternoon";
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_DAYS_BETWEEN_CHECKINS = 7;
const VALID_CHANNELS = ["call", "sms", "whatsapp"];

// Turns CSV text into one object per row, using the header line as keys.
// Splits on \r?\n because the data files use Windows line endings.
// Simple comma splitting is enough here: no field in the data contains a comma.
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((header) => header.trim());

  return lines
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const values = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((header, i) => {
        row[header] = (values[i] ?? "").trim();
      });
      return row;
    });
}

export function toMembers(rows: Record<string, string>[]): Member[] {
  return rows.map((row) => ({
    member_id: Number(row.member_id),
    full_name: row.full_name,
    age: Number(row.age),
    preferred_channel: row.preferred_channel,
    // "lives_alone;recent_discharge" -> ["lives_alone", "recent_discharge"], "" -> []
    risk_flags: row.risk_flags.split(";").filter((flag) => flag !== ""),
  }));
}

export function toContacts(rows: Record<string, string>[]): Contact[] {
  return rows.map((row) => ({
    member_id: Number(row.member_id),
    last_contact_utc: row.last_contact_utc,
    outcome: row.outcome,
  }));
}

// Compares the UTC calendar date of "now" (YYYY-MM-DD) with the holiday list.
// UTC is used because the contact timestamps in the data are UTC.
export function isHoliday(now: Date, holidays: string[]): boolean {
  return holidays.includes(now.toISOString().slice(0, 10));
}

// Fractional days, e.g. 7.5 = seven and a half days.
export function daysSince(dateUtc: string, now: Date): number {
  return (now.getTime() - Date.parse(dateUtc)) / MS_PER_DAY;
}

// If a member has several contact records, keep only the most recent one.
export function latestContactByMember(contacts: Contact[]): Map<number, Contact> {
  const latest = new Map<number, Contact>();
  for (const contact of contacts) {
    const current = latest.get(contact.member_id);
    if (!current || Date.parse(contact.last_contact_utc) > Date.parse(current.last_contact_utc)) {
      latest.set(contact.member_id, contact);
    }
  }
  return latest;
}

export function hasValidChannel(member: Member): boolean {
  return VALID_CHANNELS.includes(member.preferred_channel);
}

// Members with no contact record (null) are always due.
export function isDue(daysSinceLastContact: number | null): boolean {
  return daysSinceLastContact === null || daysSinceLastContact >= MIN_DAYS_BETWEEN_CHECKINS;
}

// The scoring rules, as a list of the factors that apply to this member.
// The gap bonus (days / 7) adds about one point per week without contact.
// No contact record -> no gap bonus, because there is no gap to measure. These members
// still appear in the list, but are ranked by their other factors instead of being
// forced to the top (assumption documented in the README).
export function scoreBreakdown(
  member: Member,
  daysSinceLastContact: number | null,
  lastOutcome: string | null,
): ScoreFactor[] {
  const factors: ScoreFactor[] = [];
  if (member.risk_flags.includes("recent_discharge")) factors.push({ label: "Recent discharge", points: 3 });
  if (member.risk_flags.includes("lives_alone")) factors.push({ label: "Lives alone", points: 2 });
  if (member.age >= 80) factors.push({ label: "Age 80+", points: 1 });
  if (lastOutcome === "no_answer") factors.push({ label: "No answer last time", points: 1 });
  if (daysSinceLastContact !== null) {
    factors.push({
      label: `${Math.floor(daysSinceLastContact)} days since last contact`,
      points: daysSinceLastContact / 7,
    });
  }
  return factors;
}

// The score is the sum of the factors, so the breakdown and the score can never disagree.
export function calculatePriorityScore(breakdown: ScoreFactor[]): number {
  let score = 0;
  for (const factor of breakdown) {
    score += factor.points;
  }
  return score;
}

export function recommendedWindow(age: number): "morning" | "afternoon" {
  return age >= 80 ? "morning" : "afternoon";
}

// URL parameter helpers. They return null for invalid input so the caller can respond with an error.

// Missing -> 5. Must be a whole number of at least 1.
export function parseTop(value: string | null): number | null {
  if (value === null) return 5;
  if (!/^\d+$/.test(value) || Number(value) < 1) return null;
  return Number(value);
}

// Missing -> the real current time. "YYYY-MM-DD" -> midnight UTC of that day (for testing / demos).
export function parseReferenceDate(value: string | null): Date | null {
  if (value === null) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  // JavaScript rolls impossible dates over (2025-02-30 becomes 2025-03-02),
  // so the date must still match the input to be valid.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

// Returns every due member, highest priority first.
// A member is due when all of these are true:
//   1. today is not a holiday (on a holiday nobody is due),
//   2. their preferred channel is one we can use,
//   3. they were last contacted 7+ days ago, or have no contact record at all.
// Slicing to "top" is left to the caller, so it can also show the total count.
export function getDueMembers(
  members: Member[],
  contacts: Contact[],
  holidays: string[],
  now: Date,
): DueMember[] {
  if (isHoliday(now, holidays)) return [];

  const latestContacts = latestContactByMember(contacts);
  const dueMembers: DueMember[] = [];

  for (const member of members) {
    if (!hasValidChannel(member)) continue;

    const contact = latestContacts.get(member.member_id);
    const days = contact ? daysSince(contact.last_contact_utc, now) : null;
    if (!isDue(days)) continue;

    const outcome = contact ? contact.outcome : null;
    const breakdown = scoreBreakdown(member, days, outcome);
    dueMembers.push({
      ...member,
      days_since_last_contact: days,
      last_outcome: outcome,
      priority_score: calculatePriorityScore(breakdown),
      score_breakdown: breakdown,
      recommended_window: recommendedWindow(member.age),
    });
  }

  // Highest score first; equal scores fall back to member_id so the order is stable.
  return dueMembers.sort(
    (a, b) => b.priority_score - a.priority_score || a.member_id - b.member_id,
  );
}
