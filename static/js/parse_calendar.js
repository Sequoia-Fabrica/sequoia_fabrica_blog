async function fetchAndParseICS(url) {
    const response = await fetch(url);
    const text = await response.text();

    const events = [];
    const lines = text.split(/\r?\n/);
    let currentEvent = null;
    let timezoneInfo = null;
    let currentTimezone = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Handle line continuations (RFC 5545: lines starting with space/tab are continuations)
        while (lines[i + 1] && /^[ \t]/.test(lines[i + 1])) {
            line += lines[++i].trim();
        }

        if (line === "BEGIN:VEVENT") {
            currentEvent = {};
        } else if (line === "END:VEVENT") {
            if (currentEvent) {
                events.push({
                    title: currentEvent.SUMMARY || "No title",
                    start: formatDate(
                        currentEvent.DTSTART,
                        currentEvent.DTSTART_RAW
                    ),
                    end: formatDate(currentEvent.DTEND, currentEvent.DTEND_RAW),
                    allDay: isAllDay(currentEvent.DTSTART),
                    url: currentEvent.URL,
                });
                currentEvent = null;
            }
        } else if (line === "BEGIN:VTIMEZONE") {
            timezoneInfo = {};
        } else if (line === "END:VTIMEZONE") {
            // Timezone parsing complete
        } else if (line.startsWith("TZID:")) {
            if (timezoneInfo) {
                timezoneInfo.id = line.split(":")[1];
            }
        } else if (line === "BEGIN:DAYLIGHT") {
            currentTimezone = "daylight";
        } else if (line === "BEGIN:STANDARD") {
            currentTimezone = "standard";
        } else if (line === "END:DAYLIGHT" || line === "END:STANDARD") {
            currentTimezone = null;
        } else if (line.startsWith("TZOFFSETTO:") && currentTimezone) {
            const value = line.split(":")[1];
            if (timezoneInfo) {
                if (!timezoneInfo[currentTimezone])
                    timezoneInfo[currentTimezone] = {};
                timezoneInfo[currentTimezone].offset = value;
            }
        } else if (currentEvent) {
            const [rawKey, ...rest] = line.split(":");
            const value = rest.join(":");
            const key = rawKey.split(";")[0]; // Strip off parameters for key

            // Store the full raw key with parameters for date fields
            if (key === "DTSTART" || key === "DTEND") {
                currentEvent[key] = value;
                currentEvent[`${key}_RAW`] = rawKey; // Store the full raw key with timezone info
            } else {
                currentEvent[key] = value;
            }
        }
    }

    return events;
}

function formatDate(icsDate, rawKey) {
    if (!icsDate) return null;

    if (icsDate.length === 8) {
        // Format: YYYYMMDD — all-day event
        return `${icsDate.slice(0, 4)}-${icsDate.slice(4, 6)}-${icsDate.slice(
            6,
            8
        )}`;
    }

    if (icsDate.includes("T")) {
        // Format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
        const year = icsDate.slice(0, 4);
        const month = icsDate.slice(4, 6);
        const day = icsDate.slice(6, 8);
        const hour = icsDate.slice(9, 11);
        const minute = icsDate.slice(11, 13);
        const second = icsDate.slice(13, 15);

        // Check if this has timezone info in the raw key
        if (rawKey && rawKey.includes("TZID=America/Los_Angeles")) {
            // This is Pacific time - determine correct offset based on date
            const dateNum = parseInt(year + month + day);
            const isDST = dateNum >= 20250309 && dateNum <= 20251102; // Rough DST period
            const offset = isDST ? "-07:00" : "-08:00";
            return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
        } else if (icsDate.endsWith("Z")) {
            // This is UTC time - keep the Z to indicate UTC
            return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
        } else {
            // No timezone specified - assume Pacific time with current season offset
            const now = new Date();
            const isDST = now.getMonth() >= 2 && now.getMonth() <= 10; // March to November
            const offset = isDST ? "-07:00" : "-08:00";
            return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
        }
    }
    return icsDate;
}

function isAllDay(icsDate) {
    return icsDate && icsDate.length === 8;
}

// Export for use as module
module.exports = fetchAndParseICS;

// 🔁 Example usage
// (async () => {
//     const fs = require('fs')
//     const icsUrl = "http://feeds.bookwhen.com/ical/x3ixm04f5wj7/yf23z4/public.ics"; // Replace with your .ics feed
//     const events = await fetchAndParseICS(icsUrl);
//     // console.log(JSON.stringify(events, null, 2));
//     fs.writeFileSync('static/calendar.json', JSON.stringify(events, null, 2), 'utf-8');
// })();
