// GET /due?top=5&date=YYYY-MM-DD
// Returns the top members who need a check-in. "date" is optional (defaults to today).
import type { NextRequest } from "next/server";
import { getDueMembers, isHoliday, parseReferenceDate, parseTop } from "../../lib/checkin.ts";
import { loadData } from "../../lib/data.ts";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const top = parseTop(params.get("top"));
  const now = parseReferenceDate(params.get("date"));

  if (top === null) {
    return Response.json({ error: "top must be a whole number of at least 1" }, { status: 400 });
  }
  if (now === null) {
    return Response.json({ error: "date must be a valid date in YYYY-MM-DD format" }, { status: 400 });
  }

  const { members, contacts, holidays } = loadData();
  const due = getDueMembers(members, contacts, holidays, now);

  return Response.json({
    date: now.toISOString().slice(0, 10),
    is_holiday: isHoliday(now, holidays),
    total_due: due.length,
    members: due.slice(0, top).map((member) => ({
      member_id: member.member_id,
      full_name: member.full_name,
      priority_score: Math.round(member.priority_score * 10) / 10, // one decimal, like the README example
      recommended_window: member.recommended_window,
    })),
  });
}
