"use client"; // runs in the browser: it has state and fetches from the API

import { Fragment, useEffect, useState } from "react";
import { prepareCheckinMessage } from "../lib/templates.ts";

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
    preferred_channel: string;
    score_breakdown: { label: string; points: number }[];
  }[];
};

const TOP_OPTIONS = [5, 10, 20, 50];
// name: shown next to the Prepare button; messageLabel: shown above the prepared message
const CHANNELS: Record<string, { name: string; messageLabel: string }> = {
  call: { name: "Call", messageLabel: "Call script" },
  sms: { name: "SMS", messageLabel: "SMS message" },
  whatsapp: { name: "WhatsApp", messageLabel: "WhatsApp message" },
};
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
  const [prepareId, setPrepareId] = useState<number | null>(null); // member whose message is shown
  const [scoreId, setScoreId] = useState<number | null>(null); // member whose score breakdown is shown
  const [copiedId, setCopiedId] = useState<number | null>(null); // member whose message was copied

  // Only one message and one breakdown are open at a time; clicking again closes them.
  function togglePrepare(memberId: number) {
    setPrepareId(prepareId === memberId ? null : memberId);
    setCopiedId(null);
  }

  function toggleScore(memberId: number) {
    setScoreId(scoreId === memberId ? null : memberId);
  }

  // Remembers which member was copied, so "Copied ✓" never shows on another member's message.
  // If copying fails (e.g. clipboard blocked), the button stays "Copy" and the text can be selected manually.
  function copyMessage(memberId: number, text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopiedId(memberId))
      .catch(() => setCopiedId(null));
  }

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
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => {
                  const isPrepareOpen = prepareId === member.member_id;
                  const isScoreOpen = scoreId === member.member_id;
                  const message = prepareCheckinMessage(member.full_name, member.preferred_channel);

                  // Fragment lets each member render up to three rows: the member, and
                  // (optionally) the score breakdown and the prepared message below it.
                  return (
                    <Fragment key={member.member_id}>
                      <tr className={isPrepareOpen || isScoreOpen ? "open" : undefined}>
                        <td className="muted">#{member.member_id}</td>
                        <td className="name">{member.full_name}</td>
                        <td>
                          <div className="score">
                            <span className="score-value">{member.priority_score.toFixed(1)}</span>
                            <button
                              className="icon-button"
                              onClick={() => toggleScore(member.member_id)}
                              aria-label="Show score breakdown"
                              aria-expanded={isScoreOpen}
                            >
                              ⓘ
                            </button>
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
                        <td>
                          <div className="actions">
                            <span className="channel">{CHANNELS[member.preferred_channel].name}</span>
                            <button className="button small" onClick={() => togglePrepare(member.member_id)}>
                              {isPrepareOpen ? "Close" : "Prepare check-in"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isScoreOpen && (
                        <tr className="panel-row">
                          <td colSpan={5}>
                            <div className="panel">
                              <span className="label">Score breakdown</span>
                              <ul className="breakdown">
                                {member.score_breakdown.map((factor) => (
                                  <li key={factor.label}>
                                    <span>{factor.label}</span>
                                    <span>+{factor.points.toFixed(1)}</span>
                                  </li>
                                ))}
                                <li className="breakdown-total">
                                  <span>Priority score</span>
                                  <span>{member.priority_score.toFixed(1)}</span>
                                </li>
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                      {isPrepareOpen && (
                        <tr className="panel-row">
                          <td colSpan={5}>
                            <div className="panel">
                              <div className="panel-header">
                                <span className="label">{CHANNELS[member.preferred_channel].messageLabel}</span>
                                <button className="button small" onClick={() => copyMessage(member.member_id, message)}>
                                  {copiedId === member.member_id ? "Copied ✓" : "Copy"}
                                </button>
                              </div>
                              <p className="prepare-text">{message}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
