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

    // Create DOM elements safely
    const container = document.createElement('div');
    container.className = 'break-normal whitespace-normal';

    // Add link for non-month view (FullCalendar bug workaround)
    if (!isDayGridMonth) {
        const link = document.createElement('a');
        // Validate URL protocol
        const url = eventInfo.event.url || '';
        if (url.startsWith('http://') || url.startsWith('https://')) {
            link.href = url;
        }
        container.appendChild(link);
    }

    // Add time
    const timeElement = document.createElement('b');
    timeElement.textContent = formatTime(
        eventInfo.event.start ? eventInfo.event.start : null
    );
    container.appendChild(timeElement);

    // Add spacer
    const spacer = document.createElement('span');
    spacer.className = 'pr-1';
    container.appendChild(spacer);

    // Add line break
    container.appendChild(document.createElement('br'));

    // Add title
    const titleElement = document.createElement('span');
    const titleText = eventInfo.event.title || '';
    titleElement.textContent = isDayGridMonth
        ? truncateString(titleText, 14)
        : titleText;
    container.appendChild(titleElement);

    if (isDayGridMonth) {
        // make a pretty decent alpha numeric uuid string
        // https://stackoverflow.com/a/8084248
        const uuid = Math.random().toString(36).substr(2, 9);
        const popoverId = `popover-${uuid}`;

        const wrapper = document.createElement('div');
        wrapper.className = 'popover';
        wrapper.id = popoverId;
        wrapper.appendChild(container);

        return { domNodes: [wrapper] };
    }
    return { domNodes: [container] };
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

                // Create safe DOM content for tippy
                const contentDiv = document.createElement('div');

                const titleDiv = document.createElement('div');
                titleDiv.className = 'text-center';
                titleDiv.textContent = ev.event.title || '';
                contentDiv.appendChild(titleDiv);

                const timeDiv = document.createElement('div');
                timeDiv.className = 'text-center';
                const timeItalic = document.createElement('i');
                timeItalic.textContent = `${startStr} - ${endStr}`;
                timeDiv.appendChild(timeItalic);
                contentDiv.appendChild(timeDiv);

                popover = tippy(`#${element.id}`, {
                    content: contentDiv,
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
