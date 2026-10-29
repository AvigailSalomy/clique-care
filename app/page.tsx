"use client"; // runs in the browser: it has state and fetches from the API

import { useEffect, useState } from "react";

// The shape of the JSON returned by GET /due (see app/due/route.ts).
type DueResponse = {
  date: string;
  is_holiday: boolean;
  total_due: number;
  members: {
    member_id: number;
    full_name: string;
    priority_score: number;
    recommended_window: "morning" | "afternoon";
  }[];
};

const TOP_OPTIONS = [5, 10, 20, 50];
const SAMPLE_DATE = "2025-11-06"; // the provided data files are from Oct–Nov 2025

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="message">
      <p className="message-title">{title}</p>
      <p className="muted">{text}</p>
    </div>
  );
}

export default function Dashboard() {
  const [top, setTop] = useState(5);
  const [date, setDate] = useState(""); // "" means today
  const [data, setData] = useState<DueResponse | null>(null);
  const [error, setError] = useState("");

  // Re-fetch from the API whenever the controls change.
  useEffect(() => {
    let ignore = false; // ignore a slow response if the controls changed in the meantime

    const query = new URLSearchParams({ top: String(top) });
    if (date) query.set("date", date);

    async function load() {
      const response = await fetch(`/due?${query}`);
      const body = await response.json();
      if (ignore) return;
      if (response.ok) {
        setData(body);
        setError("");
      } else {
        setError(body.error);
      }
    }

    load().catch(() => {
      if (!ignore) setError("Could not reach the server. Please try again.");
    });

    return () => {
      ignore = true;
    };
  }, [top, date]);

  // Used to size the score bars relative to the highest score shown.
  const maxScore = data ? Math.max(1, ...data.members.map((m) => m.priority_score)) : 1;

  return (
    <main className="page">
      <header className="header">
        <div className="brand">
          <span className="logo">C</span>
          Clique Care
        </div>
        <h1>Check-ins due</h1>
        <p className="muted">Members who need a check-in, ranked by priority.</p>
      </header>

      <section className="card controls">
        <label className="field">
          <span className="label">Reference date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="date-buttons">
          <button className="button" onClick={() => setDate("")} disabled={date === ""}>
            Today
          </button>
          <button className="button" onClick={() => setDate(SAMPLE_DATE)} disabled={date === SAMPLE_DATE}>
            Demo Date
          </button>
        </div>
        <label className="field">
          <span className="label">Show top</span>
          <select value={top} onChange={(e) => setTop(Number(e.target.value))}>
            {TOP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} members
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="stats">
        <div className="card stat">
          <span className="label">Due for check-in</span>
          <span className="stat-value">{data ? data.total_due : "–"}</span>
        </div>
        <div className="card stat">
          <span className="label">Showing</span>
          <span className="stat-value">{data ? data.members.length : "–"}</span>
        </div>
        <div className="card stat">
          <span className="label">Date</span>
          <span className="stat-value stat-date">{data ? formatDate(data.date) : "–"}</span>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Priority list</h2>
          <span className="muted">Highest priority first</span>
        </div>

        {error ? (
          <Message title="Something went wrong" text={error} />
        ) : !data ? (
          <Message title="Loading…" text="Fetching members due for a check-in." />
        ) : data.is_holiday ? (
          <Message
            title="It's a holiday"
            text={`No check-ins are scheduled on ${formatDate(data.date)}. Enjoy the day!`}
          />
        ) : data.members.length === 0 ? (
          <Message title="Everyone is up to date" text="No members need a check-in on this date." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Priority score</th>
                  <th>Recommended window</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.member_id}>
                    <td className="muted">#{member.member_id}</td>
                    <td className="name">{member.full_name}</td>
                    <td>
                      <div className="score">
                        <span className="score-value">{member.priority_score.toFixed(1)}</span>
                        <span className="score-bar">
                          <span style={{ width: `${(member.priority_score / maxScore) * 100}%` }} />
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${member.recommended_window}`}>
                        {member.recommended_window}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
