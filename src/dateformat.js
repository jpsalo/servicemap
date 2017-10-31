/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const moment = require('moment');

    const isMultiDayEvent = function(...args) {
        const [start, end] = Array.from(args[0]);
        return (end != null) && !start.isSame(end, 'day');
    };
    const isMultiYearEvent = function(...args) {
        const [start, end] = Array.from(args[0]);
        return (end != null) && !start.isSame(end, 'year');
    };
    const isMultiMonthEvent = function(...args) {
        const [start, end] = Array.from(args[0]);
        return (end != null) && !start.isSame(end, 'month');
    };

    const getLanguage = () => moment.locale();

    // TODO move to locale
    const clockWord = {
        'fi': 'klo',
        'sv': 'kl.',
        'en-gb': 'at'
    };

    const dateFormat = function(specs, includeMonth, includeYear) {
        if (includeMonth == null) { includeMonth = true; }
        if (includeYear == null) { includeYear = false; }
        const format = [];
        const add = x => format.push(x);
        if (specs.includeWeekday) {
            add(specs.format.weekday);
        }
        if (true) {
            add(specs.format.dayOfMonth);
        }
        if (includeMonth) {
            add(specs.format.month);
        }
        if (includeYear) {
            add(specs.format.year);
        }
        return format;
    };

    const humanize = function(m) {
        let day = m.calendar();
        // todo: Swedish?
        day = day.replace(/( (klo|at))* \d{1,2}[:.]\d{1,2}$/, '');
        return day;
    };

    const formatEventDatetime = function(start, end, specs) {
        let endDate, includeMonth, includeYear, startDate;
        const results = {};
        let format = dateFormat(specs,
            (includeMonth = specs.includeStartTime || specs.includeFirstMonth),
            (includeYear = specs.includeFirstYear));

        if (specs.humanize) {
            startDate = humanize(start);
        } else {
            startDate = start.format(format.join(' '));
        }

        const startTime = start.format(specs.format.time);
        if (isMultiDayEvent([start, end])) {
            format = dateFormat(specs, (includeMonth=true), (includeYear=specs.includeLastYear));
            if (!specs.includeLastYear && specs.includeStartTime) {
                startDate += ` ${startTime}`;
            }
            endDate = end.format(format.join(' '));
            if (!specs.includeLastYear && specs.includeEndTime) {
                endDate += ` ${end.format(specs.format.time)}`;
            }
        } else {
            if (specs.includeStartTime) {
                results.startTime = startTime;
            }
            if (specs.includeEndTime) {
                results.endTime = end.format(specs.format.time);
            }
        }
        const sod = moment().startOf('day');
        const diff = start.diff(sod, 'days', true);
        if (specs.humanizeNotice && (diff < 2) && (diff > -1)) {
            // Add an extra notice for "yesterday" and "tomorrow"
            // in addition to the explicit datetime
            results.notice = humanize(start);
        }
        if (results.startTime) {
            results.time = `${clockWord[getLanguage()]} ${results.startTime}`;
            delete results.startTime;
        }
        if (results.endTime) {
            results.time += `&nbsp;${results.endTime}`;
            delete results.endTime;
        }
        results.date = [startDate, endDate];
        return results;
    };

    const formatSpecs = function(language, space) {
        const weekday =
            space === 'large' ?
                'dddd'
            :
                getLanguage() === 'en-gb' ? 'ddd'
                : 'dd';
        const month =
            space === 'large' ?
                getLanguage() === 'fi' ? 'MMMM[ta]'
                : 'MMMM'
            :
                getLanguage() === 'fi' ? 'Mo'
                : getLanguage() === 'sv' ? 'M[.]'
                : getLanguage() === 'en-gb' ? 'MMM'
                : 'M';
        const dayOfMonth =
            getLanguage() === 'sv' ? 'D[.]'
            : getLanguage() === 'en-gb' ? 'D'
            : 'Do';

        return {
            time: 'LT',
            year: 'YYYY',
            weekday,
            month,
            dayOfMonth
        };
    };

    const humanizeSingleDatetime = datetime => humanizeEventDatetime(datetime, null, 'small');

    var humanizeEventDatetime = function(start, end, space) {
        // space is 'large' or 'small'
        const hasStartTime = start.length > 11;
        let hasEndTime = hasStartTime && ((end != null ? end.length : undefined) > 11);

        start = moment(start);
        if (end != null) {
            end = moment(end);
        }
        const now = moment();

        const ev = [start, end];
        if (isMultiDayEvent(ev && !hasStartTime)) {
            hasEndTime = false;
        }

        const specs = {};
        specs.includeFirstYear =
            isMultiYearEvent(ev);
        specs.includeLastYear =
            (!now.isSame(end, 'year')) || isMultiYearEvent(ev);
        specs.includeFirstMonth =
            isMultiMonthEvent(ev);
        if ((space === 'large') && isMultiDayEvent(ev)) {
            specs.includeWeekday = true;
        }
        specs.includeStartTime =
            hasStartTime && (((space === 'large') && hasEndTime) || !isMultiDayEvent(ev));
        specs.includeEndTime =
            hasEndTime && (space === 'large');

        if (!isMultiDayEvent(ev)) {
            specs.includeFirstMonth = true;
            const sod = now.startOf('day');
            const diff = start.diff(sod, 'days', true);
            const _humanize = (diff > -7) && (diff <= 7);
            if (space === 'large') {
                specs.humanizeNotice = _humanize;
            } else {
                specs.humanize = _humanize;
            }
            if (!specs.humanize) {
                specs.includeWeekday = true;
            }
        }

        specs.format = formatSpecs(getLanguage(), space);
        const result = formatEventDatetime(start, end, specs);
        return result;
    };

    return {
        humanizeEventDatetime,
        humanizeSingleDatetime
    };
});

    // Test moments
    // a = moment('2014-07-15T12:00:00')
    // b = moment('2014-07-15T14:00:00')
    // c = moment('2014-07-16T10:00:00')
    // d = moment('2014-07-15T23:59:59')
    // e = moment('2014-07-16T00:00:00')
    // f = moment('2015-07-16T00:00:00')
    // g = moment('2014-08-15T00:00:00')
    // h = moment()
    // i = moment().add 2, 'hours'
    // j = moment().add 2, 'days'
    // k = moment().add 1, 'year'
