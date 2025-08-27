async function fetchAndParseICS(url) {
    const response = await fetch(url);
    const text = await response.text();

    const events = [];
    const lines = text.split(/\r?\n/);
    let currentEvent = null;

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
                    start: formatDate(currentEvent.DTSTART),
                    end: formatDate(currentEvent.DTEND),
                    allDay: isAllDay(currentEvent.DTSTART),
                    url: currentEvent.URL
                });
                currentEvent = null;
            }
        } else if (currentEvent) {
            const [rawKey, ...rest] = line.split(":");
            const value = rest.join(":");
            const key = rawKey.split(";")[0]; // Strip off parameters
            currentEvent[key] = value;
        }
    }

    return events;
}

function formatDate(icsDate) {
    if (!icsDate) return null;
    if (icsDate.length === 8) {
        // Format: YYYYMMDD — all-day event
        return `${icsDate.slice(0, 4)}-${icsDate.slice(4, 6)}-${icsDate.slice(
            6,
            8
        )}`;
    }
    if (icsDate.includes("T")) {
        // Format: YYYYMMDDTHHMMSSZ
        const year = icsDate.slice(0, 4);
        const month = icsDate.slice(4, 6);
        const day = icsDate.slice(6, 8);
        const hour = icsDate.slice(9, 11);
        const minute = icsDate.slice(11, 13);
        const second = icsDate.slice(13, 15);
        return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
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
