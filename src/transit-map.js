/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function() {

    // Original structure from:
    // https://github.com/reitti/reittiopas/blob/90a4d5f20bed3868b5fb608ee1a1c7ce77b70ed8/web/js/utils.coffee
    let TransitMapMixin;
    const hslColors = {
        //walk: '#9ab9c9' # walking; HSL official color is too light #bee4f8
        walk: '#7a7a7a', // changed from standard for legibility
        wait: '#999999', // waiting time at a stop
        1:    '#007ac9', // Helsinki internal bus lines
        2:    '#00985f', // Trams
        3:    '#007ac9', // Espoo internal bus lines
        4:    '#007ac9', // Vantaa internal bus lines
        5:    '#007ac9', // Regional bus lines
        6:    '#ff6319', // Metro
        7:    '#00b9e4', // Ferry
        8:    '#007ac9', // U-lines
        12:   '#64be14', // Commuter trains
        21:   '#007ac9', // Helsinki service lines
        22:   '#007ac9', // Helsinki night buses
        23:   '#007ac9', // Espoo service lines
        24:   '#007ac9', // Vantaa service lines
        25:   '#007ac9', // Region night buses
        36:   '#007ac9', // Kirkkonummi internal bus lines
        38:   '#007ac9', // Undocumented, assumed bus
        39:   '#007ac9' // Kerava internal bus lines
    };

    const googleColors = {
        WALK: hslColors.walk,
        CAR: hslColors.walk,
        BICYCLE: hslColors.walk,
        WAIT: hslColors.wait,
        BUS: hslColors[1],
        FERRY: hslColors[7],
        TRAM: hslColors[2],
        SUBWAY: hslColors[6],
        RAIL: hslColors[12]
    };
        // 0: hslColors[2] # tram
        // 1: hslColors[6] # metro
        // 2: hslColors[12] # commuter trains
        // 3: hslColors[5] # regional bus lines
        // 4: hslColors[7] # ferry
        // 109: hslColors[12] # commuter trains

    return (TransitMapMixin = class TransitMapMixin {
        initializeTransitMap(opts) {
            this.listenTo(opts.route, 'change:plan', route => {
                if (route.has('plan')) {
                    return this.drawItinerary(route);
                } else {
                    return this.clearItinerary();
                }
            });
            if (opts.selectedUnits != null) {
                this.listenTo(opts.selectedUnits, 'reset', this.clearItinerary);
            }
            if (opts.selectedPosition != null) {
                return this.listenTo(opts.selectedPosition, 'change:value', this.clearItinerary);
            }
        }

        // Renders each leg of the route to the map
        createRouteLayerFromItinerary(itinerary) {
            let leg, point;
            if (itinerary == null) { return; }
            const routeLayer = L.featureGroup();
            const alertLayer = L.featureGroup();
            const { legs } = itinerary;

            const sum = xs => _.reduce(xs, ((x, y) => x+y), 0);
            const totalWalkingDistance = sum((() => {
                const result = [];
                for (leg of Array.from(legs)) {                     if (leg.distance && (leg.routeType == null)) {
                        result.push(leg.distance);
                    }
                }
                return result;
            })());
            const totalWalkingDuration = sum((() => {
                const result1 = [];
                for (leg of Array.from(legs)) {                     if (leg.distance && (leg.routeType == null)) {
                        result1.push(leg.duration);
                    }
                }
                return result1;
            })());

            const routeIncludesTransit = _.any((() => {
                const result2 = [];
                for (leg of Array.from(legs)) {                     result2.push((leg.routeType != null));
                }
                return result2;
            })());

            const mins = Math.ceil(itinerary.duration/1000/60);
            const walkMins = Math.ceil(totalWalkingDuration/1000/60);
            const walkKms = Math.ceil(totalWalkingDistance/100)/10;

            for (leg of Array.from(legs)) {
                const points = ((() => {
                    const result3 = [];
                    for (point of Array.from(leg.legGeometry.points)) {                         result3.push(new L.LatLng(point[0], point[1]));
                    }
                    return result3;
                })());

                var polyline = new L.Polyline(points, this._getLegStyle(leg));

                // Make zooming to the leg via click possible.
                polyline.on('click', function(e) {
                    this._map.fitBounds(polyline.getBounds());
                    if (marker != null) {
                        return marker.openPopup();
                    }
                });
                polyline.addTo(routeLayer);

                if (leg.alerts) {
                    const style = {
                        color: '#ff3333',
                        opacity: 0.2,
                        fillOpacity: 0.4,
                        weight: 5,
                        clickable: true
                    };
                    for (let alert of Array.from(leg.alerts)) {
                        if (alert.geometry) {
                            const alertpoly = new L.geoJson(alert.geometry, {style});
                            if (alert.alertDescriptionText) {
                                alertpoly.bindPopup(alert.alertDescriptionText.someTranslation, {closeButton: false});
                            }
                            alertpoly.addTo(alertLayer);
                        }
                    }
                }

                // Always show route and time information at the leg start position
                if (false) {
                    const stop = leg.from;
                    const lastStop = leg.to;
                    point = {y: stop.lat, x: stop.lon};
                    const icon = L.divIcon({className: "navigator-div-icon"});
                    const label = `<span style='font-size: 24px;'><img src='static/images/${google_icons[leg.routeType != null ? leg.routeType : leg.mode]}' style='vertical-align: sub; height: 24px'/><span>${leg.route}</span></span>`;

                    var marker = L.marker(new L.LatLng(point.y, point.x), {icon}).addTo(routeLayer)
                        .bindPopup(`<b>Time: ${moment(leg.startTime).format("HH:mm")}&mdash;${moment(leg.endTime).format("HH:mm")}</b><br /><b>From:</b> ${stop.name || ""}<br /><b>To:</b> ${lastStop.name || ""}`);
                }
            }

            return {route: routeLayer, alerts: alertLayer};
        }

        drawItinerary(route) {
            if (this.routeLayer != null) {
                this.clearItinerary();
            }
            const obj = this.createRouteLayerFromItinerary(route.getSelectedItinerary());
            if (obj == null) { return; }
            ({route: this.routeLayer, alerts: this.alertLayer} = obj);
            this.skipMoveend = true;
            this.map.refitAndAddLayer(this.routeLayer);
            return this.map.addLayer(this.alertLayer);
        }
            //_.defer => window.mapView.fitItinerary(@routeLayer)

        clearItinerary() {
            if (this.routeLayer) {
                this.map.removeLayer(this.routeLayer);
                this.map.adapt();
            }
            if (this.alertLayer) {
                this.map.removeLayer(this.alertLayer);
            }
            this.routeLayer = null;
            return this.alertLayer = null;
        }

        _getLegStyle(leg) {
            const color = googleColors[leg.routeType != null ? leg.routeType : leg.mode];
            const style = {
                color: this._shouldDisplayDashedLine(leg) ? '#ffffff' : color,
                stroke: true,
                fill: false,
                opacity: this._shouldDisplayDashedLine(leg) ? 1 : 0.8,
                dashArray: this._shouldDisplayDashedLine(leg) ? '6,15' : undefined,
                lineCap: this._shouldDisplayDashedLine(leg) ? 'round' : undefined
            };
            return style;
        }

        _shouldDisplayDashedLine(leg) {
            const background = p13n.get('map_background_layer');
            return (background === 'ortographic') && (leg.mode === 'WALK');
        }
    });
});
