function truncateString(str, maxLength) {
    if (str.length <= maxLength) {
        return str;
    } else {
        return str.substring(0, maxLength - 3) + "...";
    }
}
function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes();

    let formattedTime;

    if (hours >= 12) {
        formattedTime = `${hours > 12 ? hours - 12 : hours}:${
            minutes < 10 ? "0" + minutes : minutes
        }PM`;
    } else {
        formattedTime = `${hours}:${minutes < 10 ? "0" + minutes : minutes}AM`;
    }

    return formattedTime;
}

function renderEventContent(eventInfo) {
    let isDayGridMonth = eventInfo.view.type == "dayGridMonth";
    // additional <a> tag is because of a bug in FullCalendar: see https://github.com/fullcalendar/fullcalendar/issues/6133
    let eventElement = `
            <div className="break-normal whitespace-normal">
            ${isDayGridMonth ? "" : "<a href={eventInfo.event.url}></a>"}
                <b>
                    ${formatTime(
                        eventInfo.event.start ? eventInfo.event.start : null
                    )}
                </b>
                <span className="pr-1"></span>
                <br></br>
                <span>
                    ${
                        isDayGridMonth
                            ? truncateString(eventInfo.event.title, 12)
                            : eventInfo.event.title
                    }
                </span>
            </div>
        `;

    if (isDayGridMonth) {
        const uuid = self.crypto.randomUUID();
        const popoverId = `popover-${uuid}`;
        eventElement = `
            <div class="popover" id="${popoverId}">
                ${eventElement}
            </div>
     `;
    }
    return { html: eventElement };
}

document.addEventListener("DOMContentLoaded", function () {
    const calendarEl = document.getElementById("calendar-view");
    const calendar = new FullCalendar.Calendar(calendarEl, {
        plugins: [
            FullCalendar.createPlugin(FullCalendar.DayGrid),
            FullCalendar.createPlugin(FullCalendar.ICalendar),
        ],
        contentHeight: "auto",
        initialView: "dayGridMonth",
        headerToolbar: {
            left: "prev",
            center: "title",
            right: "next",
        },
        // // TODO: switch to using /calendar.json once deployed
        // // will require js/parse_calendar.js to be run as a cron job on the server
        // events: '/calendar.json',
        events: {
            // TODO: templatize this
            url: "https://feeds.bookwhen.com/ical/x3ixm04f5wj7/yf23z4/public.ics",
            format: "ics",
        },
        eventDisplay: "list-item",
        eventContent: renderEventContent,
        eventDidMount: function (ev) {
            let element = ev.el.querySelectorAll(".popover");
            if (element.length > 0) {
                element = element[0];

                const startStr = !!ev.event.start
                    ? formatTime(ev.event.start)
                    : "";
                const endStr = !!ev.event.end ? formatTime(ev.event.end) : "";
                popover = tippy(`#${element.id}`, {
                    content: `
                        <div class="text-center">${ev.event.title}</div>
                        <div class="text-center">
                            <i>
                                ${startStr} - ${endStr}
                            </i>
                        </div>
                    `,
                    allowHTML: true,
                });
            }
        },
    });
    calendar.render();
});
