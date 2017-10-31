/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let exports;
    const Backbone  = require('backbone');
    const L         = require('leaflet');
    const graphUtil = require('app/util/graphql');

    // General functions taken from https://github.com/HSLdevcom/navigator-proto

    const modeMap = {
        tram: 'TRAM',
        bus: 'BUS',
        metro: 'SUBWAY',
        ferry: 'FERRY',
        train: 'RAIL'
    };

    // Route received from OTP is encoded so it needs to be decoded.
    // translated from https://github.com/ahocevar/openlayers/blob/master/lib/OpenLayers/Format/EncodedPolyline.js
    const decodePolyline = function(encoded, dims) {
        // Start from origo
        let i;
        const point = ((() => {
            let asc, end;
            const result1 = [];
            for (i = 0, end = dims, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                result1.push(0);
            }
            return result1;
        })());

        // Loop over the encoded input string
        i = 0;
        const points = (() => {
            const result2 = [];
            while (i < encoded.length) {
                for (let dim = 0, end1 = dims, asc1 = 0 <= end1; asc1 ? dim < end1 : dim > end1; asc1 ? dim++ : dim--) {
                    let result = 0;
                    let shift = 0;
                    while (true) {
                        const b = encoded.charCodeAt(i++) - 63;
                        result |= (b & 0x1f) << shift;
                        shift += 5;
                        if (!(b >= 0x20)) { break; }
                    }

                    point[dim] += result & 1 ? ~(result >> 1) : result >> 1;
                }

                // Keep a copy in the result list
                result2.push(point.slice(0));
            }
            return result2;
        })();

        return points;
    };

    // (taken from https://github.com/HSLdevcom/navigator-proto)
    // clean up oddities in routing result data from OTP
    const otpCleanup = function(data) {
        for (let itinerary of Array.from((data.plan != null ? data.plan.itineraries : undefined) || [])) {
            const { legs } = itinerary;
            const { length } = legs;
            const last = length-1;

            // if there's time past walking in either end, add that to walking
            // XXX what if it's not walking?
            if (!legs[0].routeType && (legs[0].startTime !== itinerary.startTime)) {
                legs[0].startTime = itinerary.startTime;
                legs[0].duration = legs[0].endTime - legs[0].startTime;
            }
            if (!legs[last].routeType && (legs[last].endTime !== itinerary.endTime)) {
                legs[last].endTime = itinerary.endTime;
                legs[last].duration = legs[last].endTime - legs[last].startTime;
            }

            const newLegs = [];
            let time = itinerary.startTime; // tracks when next leg should start
            for (let leg of Array.from(itinerary.legs)) {
                // Route received from OTP is encoded so it needs to be decoded.
                var waitTime;
                let points = decodePolyline(leg.legGeometry.points, 2);
                points = (Array.from(points).map((coords) => (Array.from(coords).map((x) => x * 1e-5))));
                leg.legGeometry.points = points;

                // if there's unaccounted time before a walking leg
                if (((leg.startTime - time) > 1000) && (leg.routeType === null)) {
                    // move non-transport legs to occur before wait time
                    waitTime = leg.startTime-time;
                    time = leg.endTime;
                    leg.startTime -= waitTime;
                    leg.endTime -= waitTime;
                    newLegs.push(leg);
                    // add the waiting time as a separate leg
                    newLegs.push(createWaitLeg(leg.endTime, waitTime,
                        _.last(leg.legGeometry.points), leg.to.name)
                    );
                // else if there's unaccounted time before a leg
                } else if ((leg.startTime - time) > 1000) {
                    waitTime = leg.startTime-time;
                    time = leg.endTime;
                    // add the waiting time as a separate leg
                    newLegs.push(createWaitLeg(leg.startTime - waitTime,
                        waitTime, leg.legGeometry.points[0], leg.from.name)
                    );
                    newLegs.push(leg);
                } else {
                    newLegs.push(leg);
                    time = leg.endTime; // next leg should start when this ended
                }
            }
            itinerary.legs = newLegs;
        }
        return data;
    };

    var createWaitLeg = function(startTime, duration, point, placename) {
        const leg = {
            mode: "WAIT",
            routeType: null, // non-transport
            route: "",
            duration,
            startTime,
            endTime: startTime + duration,
            legGeometry: {points: [point]},
            from: {
                lat: point[0],
                lon: point[1],
                name: placename
            }
        };
        leg.to = leg.from;
        return leg;
    };

    class Route extends Backbone.Model {
        initialize() {
            this.set('selected_itinerary', 0);
            this.set('plan', null);
            return this.listenTo(this, 'change:selected_itinerary', () => {
                return this.trigger('change:plan', this);
            });
        }

        abort() {
            if (!this.xhr) {
                return;
            }
            this.xhr.abort();
            return this.xhr = null;
        }

        requestPlan(from, to, opts, cancelToken) {
            opts = opts || {};

            if (this.xhr) {
                this.xhr.abort();
                this.xhr = null;
            }

            let modes = ['WALK'];
            if (opts.bicycle) {
                modes = ['BICYCLE'];
            }
            if (opts.car) {
                if (opts.transit) {
                    modes = ['CAR_PARK', 'WALK'];
                } else {
                    modes = ['CAR'];
                }
            }
            if (opts.transit) {
                modes.push('TRANSIT');
            } else {
                modes = _.union(modes,
                    _(opts.modes).map(m => modeMap[m]));
            }

            const data = {
                from,
                to,
                modes: modes.join(','),
                numItineraries: 3,
                locale: p13n.getLanguage()
            };

            data.wheelchair = false;
            if (opts.wheelchair) {
                data.wheelchair = true;
            }

            if (opts.walkReluctance) {
                data.walkReluctance = opts.walkReluctance;
            }

            if (opts.walkBoardCost) {
                data.walkBoardCost = opts.walkBoardCost;
            }

            if (opts.walkSpeed) {
                data.walkSpeed = opts.walkSpeed;
            }

            if (opts.minTransferTime) {
                data.minTransferTime = opts.minTransferTime;
            }

            if (opts.date && opts.time) {
                data.date = opts.date;
                data.time = opts.time;
            }

            if (opts.arriveBy) {
                data.arriveBy = true;
            }

            let cancelled = false;
            const args = {
                dataType: 'json',
                contentType: 'application/json',
                url: appSettings.otp_backend,
                method: 'POST',
                processData: false,
                data: JSON.stringify(graphUtil.planQuery(data)),
                success: ({data}) => {
                    if (cancelled) { return; }
                    this.xhr = null;
                    if ('error' in data) {
                        this.trigger('error');
                        cancelToken.complete();
                        return;
                    }
                    if (cancelled) { return; }
                    cancelToken.complete();
                    if (data.plan.itineraries.length === 0) {
                        this.set('no_itineraries', true);
                        return;
                    }
                    data = otpCleanup(data);
                    this.set('selected_itinerary', 0);
                    return this.set('plan', data.plan);
                },
                error: () => {
                    this.clear();
                    return this.trigger('error');
                }
            };

            cancelToken.set('status', 'fetching.transit');
            cancelToken.activate({local: true});
            this.xhr = $.ajax(args);
            cancelToken.addHandler(() => {
                this.xhr.abort();
                return cancelled = true;
            });
            return this.xhr;
        }

        getSelectedItinerary() {
            return this.get('plan').itineraries[this.get('selected_itinerary')];
        }

        clear() {
            return this.set('plan', null);
        }
    }

    return exports =
        {Route};
});
