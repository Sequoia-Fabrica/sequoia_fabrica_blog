const http = require("http");
const url = require("url");

/**
 * Make an HTTP GET request, parse JSON response, and return a promise
 */
async function makeRequest(reqUrl) {
    return new Promise((resolve, reject) => {
        http.get(reqUrl, (res) => {
            const { statusCode } = res;
            const contentType = res.headers["content-type"];

            let error;
            // Any 2xx status code signals a successful response but
            // here we're only checking for 200.
            if (statusCode !== 200) {
                error = new Error(
                    "Request Failed.\n" + `Status Code: ${statusCode}`
                );
            } else if (!/^application\/json/.test(contentType)) {
                error = new Error(
                    "Invalid content-type.\n" +
                        `Expected application/json but received ${contentType}`
                );
            }
            if (error) {
                // Consume response data to free up memory
                res.resume();
                reject(error.message);
            }

            // parse response as JSON if successful
            res.setEncoding("utf8");
            let rawData = "";
            res.on("data", (chunk) => {
                rawData += chunk;
            });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(rawData));
                } catch (e) {
                    reject(e.message);
                }
            });
        }).on("error", (e) => {
            reject(`Got error: ${e.message}`);
        });
    });
}

/**
 * Queries the BrightSky API for weather data for San Francisco
 * returns references to the weather icons for today, tomorrow, and the day after as a JSON object
 * @returns {Promise} Promise
 */
async function getWeather() {
    // const lat = 37.762;
    // const lon = -122.399;
    const wmo_station_id = 72494; // Station ID for San Francisco
    const tz = "America/Los_Angeles";
    const units = "dwd";

    let today = new Date();
    today.setHours(12, 0, 0);
    let tomorrow = new Date(+new Date(today) + 36e5 * 24);
    let day_after_t = new Date(+new Date(tomorrow) + 36e5 * 24);

    const weather = {};
    for (const obj of [
        { title: "today", time: today },
        { title: "tomorrow", time: tomorrow },
        { title: "day_after_t", time: day_after_t },
    ]) {
        const title = obj.title;
        const noon = obj.time;
        const one_pm = new Date(noon);
        one_pm.setHours(13, 0, 0);

        const req_url = url.parse(
            url.format({
                protocol: "http",
                hostname: "api.brightsky.dev",
                pathname: "/weather",
                query: {
                    wmo_station_id,
                    date: noon.toISOString(),
                    last_date: one_pm.toISOString(),
                    tz,
                    units,
                },
            })
        );
        try {
            const res = await makeRequest(req_url);
            weather[title + '_icon'] = res.weather ? res.weather[0].icon : "";
        } catch (e) {
            console.error(e);
        }
    }
    return weather;
}

module.exports = getWeather;
