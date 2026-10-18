// Times are shown in GMT+0 for everyone, whatever time zone the device is set to,
// and "now" comes from the server so a PC with a wrong clock still shows correct ages.

let clockOffsetMs = 0; // server time minus this device's time

/** Reads the server's clock once (same-origin Date header) to correct a wrong device clock. */
function syncClock() {
  fetch('/login', { method: 'HEAD', cache: 'no-store' })
    .then((res) => {
      const serverDate = res.headers.get('date');
      if (serverDate) clockOffsetMs = new Date(serverDate).getTime() - Date.now();
    })
    .catch(() => {});
}
if (typeof window !== 'undefined') syncClock();

/** The current time according to the server. */
export function now(): Date {
  return new Date(Date.now() + clockOffsetMs);
}

/**
 * A Date whose *local* fields equal the GMT+0 wall-clock time of `value`, so date-fns
 * `format(gmt(x), 'HH:mm')` prints GMT+0 regardless of the device's time zone.
 * Only use the result for display.
 */
export function gmt(value: string | number | Date): Date {
  const d = new Date(value);
  return new Date(d.getTime() + d.getTimezoneOffset() * 60_000);
}
