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

export type DueMember = {
  member_id: number;
  full_name: string;
  age: number;
  preferred_channel: string;
  risk_flags: string[];
  days_since_last_contact: number | null; // null = no contact record yet
  last_outcome: string | null;
  priority_score: number;
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

// No contact record -> no gap bonus (assumption documented in the README).
export function calculatePriorityScore(
  member: Member,
  daysSinceLastContact: number | null,
  lastOutcome: string | null,
): number {
  let score = 0;
  if (member.risk_flags.includes("recent_discharge")) score += 3;
  if (member.risk_flags.includes("lives_alone")) score += 2;
  if (member.age >= 80) score += 1;
  if (lastOutcome === "no_answer") score += 1;
  if (daysSinceLastContact !== null) score += daysSinceLastContact / 7;
  return score;
}

export function recommendedWindow(age: number): "morning" | "afternoon" {
  return age >= 80 ? "morning" : "afternoon";
}

// Returns every due member, highest priority first. On a holiday nobody is due.
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
    dueMembers.push({
      ...member,
      days_since_last_contact: days,
      last_outcome: outcome,
      priority_score: calculatePriorityScore(member, days, outcome),
      recommended_window: recommendedWindow(member.age),
    });
  }

  // Highest score first; equal scores fall back to member_id so the order is stable.
  return dueMembers.sort(
    (a, b) => b.priority_score - a.priority_score || a.member_id - b.member_id,
  );
}
