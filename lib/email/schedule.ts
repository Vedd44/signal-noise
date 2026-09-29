export const DAILY_SIGNAL_TIME_ZONE = "America/New_York";
export const DAILY_SIGNAL_SEND_HOUR = 8;
export const DAILY_SIGNAL_SEND_MINUTE = 10;
export const DAILY_SIGNAL_SEND_WINDOW_MINUTES = 10;

export type DailySignalLocalTime = {
  localDate: string;
  hour: number;
  minute: number;
  displayDate: string;
  subjectDate: string;
};

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new Error(`Unable to determine ${type} in ${DAILY_SIGNAL_TIME_ZONE}`);
  }

  return value;
}

export function getDailySignalLocalTime(date = new Date()): DailySignalLocalTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_SIGNAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const year = getPart(parts, "year");
  const month = getPart(parts, "month");
  const day = getPart(parts, "day");

  return {
    localDate: `${year}-${month}-${day}`,
    hour: Number(getPart(parts, "hour")),
    minute: Number(getPart(parts, "minute")),
    displayDate: new Intl.DateTimeFormat("en-US", {
      timeZone: DAILY_SIGNAL_TIME_ZONE,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(date),
    subjectDate: new Intl.DateTimeFormat("en-US", {
      timeZone: DAILY_SIGNAL_TIME_ZONE,
      month: "long",
      day: "numeric"
    }).format(date)
  };
}

export function isDailySignalSendWindow(date = new Date()) {
  const local = getDailySignalLocalTime(date);
  return (
    local.hour === DAILY_SIGNAL_SEND_HOUR &&
    local.minute >= DAILY_SIGNAL_SEND_MINUTE &&
    local.minute < DAILY_SIGNAL_SEND_MINUTE + DAILY_SIGNAL_SEND_WINDOW_MINUTES
  );
}
