function truncateString(str, maxLength) {
    if (str.length <= maxLength) {
        return str;
    } else {
        return str.substring(0, maxLength - 3) + "...";
    }
}

/**
 * Format time for display - FullCalendar uses UTC-coercion for named timezones
 * @param {*} date - Date object from FullCalendar (UTC-coerced)
 * @returns
 */
function formatTime(date) {
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();

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
    // additional <a> tag is because of a bug in FullCalendar:
    // see https://github.com/fullcalendar/fullcalendar/issues/6133
    let eventElement = `
            <div className="break-normal whitespace-normal">
            ${isDayGridMonth ? "" : `<a href=${eventInfo.event.url}></a>`}
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
                            ? truncateString(eventInfo.event.title, 14)
                            : eventInfo.event.title
                    }
                </span>
            </div>
        `;

    if (isDayGridMonth) {
        // make a pretty decent alpha numeric uuid string
        // https://stackoverflow.com/a/8084248
        const uuid = Math.random().toString(36).substr(2, 9);
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
    const desktopView = "dayGridMonth";
    const mobileView = "listWeek";
    const mobileBreakpoint = 768; // pixels
    const views = {};
    views[desktopView] = {};
    views[mobileView] = {};

    const calendar = new FullCalendar.Calendar(calendarEl, {
        timeZone: "America/Los_Angeles",
        contentHeight: "auto",
        initialView: desktopView,
        // Add responsive views
        views,
        headerToolbar: {
            left: "prev",
            center: "title",
            right: "next",
        },

        // Add window resize handler for responsive behavior
        windowResize: function (view) {
            if (window.innerWidth < mobileBreakpoint) {
                calendar.changeView(mobileView);
            } else {
                calendar.changeView(desktopView);
            }
        },

        // requires js/parse_calendar.js to be run as a cron job on the server
        // only runs intermittently (calendars don't change often) and is more efficient
        events: "/api/calendar.json",
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

    // Set initial view based on screen size
    if (window.innerWidth < mobileBreakpoint) {
        calendar.changeView(mobileView);
    }

    calendar.render();
});
