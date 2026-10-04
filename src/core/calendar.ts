// Builds a Google Calendar "new event" link. No API key or sign-in is needed here: Google opens the
// event pre-filled and the user confirms it. Times are written as local time in the given time zone.
const p2 = (n: number) => String(n).padStart(2, '0')
const stamp = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`
}

export function googleCalendarUrl(e: { title: string; startMs: number; endMs: number; details?: string; tz?: string }) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${stamp(e.startMs)}/${stamp(e.endMs)}` })
  if (e.details) q.set('details', e.details)
  if (e.tz) q.set('ctz', e.tz)
  return `https://calendar.google.com/calendar/render?${q}`
}
