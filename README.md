# Clique Care — Check-in Dashboard

A Next.js and TypeScript app that shows which members need a check-in, ranked by priority.

The app includes a dashboard, a `GET /due` API, a breakdown of each priority score, and a Prepare Check-in feature that generates a message based on the member's preferred contact channel.

## How to Run

Requires Node.js 22.18 or newer.

```bash
npm install
npm run dev
```

- Dashboard: http://localhost:3000
- API: http://localhost:3000/due?top=5
- Run tests: `npm test`

The sample data is from October–November 2025. To view the intended demo results, click **Demo Date** on the dashboard or use `&date=2025-11-06` in the API URL.

## Assumptions

- **Missing contact records:** Members without a previous contact are due, but receive no time-based bonus because there is no known contact date.
- **Today's date:** The current date is used by default. An optional `date` parameter (`YYYY-MM-DD`) is available for testing.
- **UTC:** Dates and holidays use UTC. No check-ins are due on holidays.
- **7-day rule:** Based on exact elapsed time, not calendar days.
- **Valid channels:** Only `call`, `sms`, and `whatsapp` are supported.
- **`escalate` outcome:** Adds no points because the assignment does not define a scoring rule for it.
- **Scores:** Displayed to one decimal place, but sorted using exact values. Ties are broken by `member_id`.
- **Prepare Check-in:** Messages include only the member's first name, never risk details, and are not sent automatically.

## Future Improvements

- Use the community's local timezone instead of UTC.
- Allow coordinators to mark check-ins as completed and store data in a database.
- Add Hebrew message templates and dashboard UI tests.