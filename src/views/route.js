/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _                      = require('underscore');
    const moment                 = require('moment');
    const i18n                   = require('i18next');

    const p13n                   = require('app/p13n');
    const models                 = require('app/models');
    const SMSpinner              = require('app/spinner');
    const base                   = require('app/views/base');
    const RouteSettingsView      = require('app/views/route-settings');
    const {LoadingIndicatorView} = require('app/views/loading-indicator');

    class RouteView extends base.SMLayout {
        static initClass() {
            this.prototype.id = 'route-view-container';
            this.prototype.className = 'route-view';
            this.prototype.template = 'route';
            this.prototype.regions = {
                routeSettingsRegion: '.route-settings',
                routeSummaryRegion: '.route-summary',
                routeLoadingIndicator: '#route-loading-indicator'
            };
            this.prototype.events = {
                'click a.collapser.route': 'toggleRoute',
                'click .show-map': 'showMap'
            };
        }
        initialize(options) {
            this.parentView = options.parentView;
            this.selectedUnits = options.selectedUnits;
            this.selectedPosition = options.selectedPosition;
            this.route = options.route;
            this.routingParameters = options.routingParameters;
            // Debounce to avoid flooding the OTP server on small time input change.
            this.listenTo(this.routingParameters, 'complete', _.debounce(_.bind(this.requestRoute, this), 300));
            this.listenTo(p13n, 'change', this.changeTransitIcon);
            this.listenTo(this.route, 'change:plan', route => {
                if (route.has('plan')) {
                    this.routingParameters.set('route', this.route);
                    return this.showRouteSummary(this.route);
                }
            });
            return this.listenTo(p13n, 'change', (path, val) => {
                // if path[0] == 'accessibility'
                //     if path[1] != 'mobility'
                //         return
                // else if path[0] != 'transport'
                //     return
                return this.requestRoute();
            });
        }

        serializeData() {
            return {transit_icon: this.getTransitIcon()};
        }

        getTransitIcon() {
            const setModes = _.filter(_.pairs(p13n.get('transport')), function(...args) { const [k, v] = Array.from(args[0]); return v === true; });
            const mode = setModes.pop()[0];
            const modeIconName = mode.replace('_', '-');
            return `icon-icon-${modeIconName}`;
        }

        changeTransitIcon() {
            const $iconEl = this.$el.find('#route-section-icon');
            return $iconEl.removeClass().addClass(this.getTransitIcon());
        }

        toggleRoute(ev) {
            const $element = $(ev.currentTarget);
            if ($element.hasClass('collapsed')) {
                return this.showRoute();
            } else {
                return this.hideRoute();
            }
        }

        showMap(ev) {
            return this.parentView.showMap(ev);
        }

        showRoute() {
            // Route planning
            //
            const lastPos = p13n.getLastPosition();
            // Ensure that any user entered position is the origin for the new route
            // so that setting the destination won't overwrite the user entered data.
            this.routingParameters.ensureUnitDestination();
            this.routingParameters.setDestination(this.model);
            const previousOrigin = this.routingParameters.getOrigin();
            if (lastPos) {
                if (!previousOrigin) {
                    this.routingParameters.setOrigin(lastPos,
                        {silent: true});
                }
                this.requestRoute();
            } else {
                this.listenTo(p13n, 'position', pos => {
                    return this.requestRoute();
                });
                this.listenTo(p13n, 'position_error', () => {
                    return this.showRouteSummary(null);
                });
                if (!previousOrigin) {
                    this.routingParameters.setOrigin(new models.CoordinatePosition);
                }
                p13n.requestLocation(this.routingParameters.getOrigin());
            }

            this.routeSettingsRegion.show(new RouteSettingsView({
                model: this.routingParameters,
                unit: this.model
            })
            );

            return this.showRouteSummary(null);
        }

        showRouteSummary(route) {
            return this.routeSummaryRegion.show(new RoutingSummaryView({
                model: this.routingParameters,
                noRoute: (route == null)
            })
            );
        }

        requestRoute() {
            if (!this.routingParameters.isComplete()) {
                return;
            }

            const spinner = new SMSpinner({
                container:
                    this.$el.find('#route-details .route-spinner').get(0)
            });

            spinner.start();
            this.listenTo(this.route, 'change:plan', plan => {
                return spinner.stop();
            });
            this.listenTo(this.route, 'error', () => {
                return spinner.stop();
            });

            this.routingParameters.unset('route');

            const opts = {};

            // TODO: verify parameters exist, pass them on to OTP
            if (p13n.getAccessibilityMode('mobility') === 'wheelchair') {
                opts.wheelchair = true;
                opts.walkReluctance = 5;
                opts.walkBoardCost = 12*60;
                opts.walkSpeed = 0.75;
                opts.minTransferTime = (3*60)+1;
            }

            if (p13n.getAccessibilityMode('mobility') === 'reduced_mobility') {
                opts.walkReluctance = 5;
                opts.walkBoardCost = 10*60;
                opts.walkSpeed = 0.5;
            }

            if (p13n.getAccessibilityMode('mobility') === 'rollator') {
                opts.wheelchair = true;
                opts.walkReluctance = 5;
                opts.walkSpeed = 0.5;
                opts.walkBoardCost = 12*60;
            }

            if (p13n.getAccessibilityMode('mobility') === 'stroller') {
                opts.walkBoardCost = 10*60;
                opts.walkSpeed = 1;
            }

            if (p13n.getTransport('bicycle')) {
                opts.bicycle = true;
            }
                // TODO: take/park bike

            if (p13n.getTransport('car')) {
                opts.car = true;
            }

            if (p13n.getTransport('public_transport')) {
                const publicTransportChoices = p13n.get('transport_detailed_choices').public;
                const selectedVehicles = _(publicTransportChoices)
                    .chain()
                    .pairs().filter(_.last).map(_.first)
                    .value();
                if (selectedVehicles.length === _(publicTransportChoices).values().length) {
                    opts.transit = true;
                } else {
                    opts.transit = false;
                    opts.modes = selectedVehicles;
                }
            }

            const datetime = this.routingParameters.getDatetime();
            opts.date = moment(datetime).format('YYYY-MM-DD');
            opts.time = moment(datetime).format('HH:mm');
            opts.arriveBy = this.routingParameters.get('time_mode') === 'arrive';

            const from = this.routingParameters.getOrigin().otpSerializeLocation({
                forceCoordinates: opts.car});
            const to = this.routingParameters.getDestination().otpSerializeLocation({
                forceCoordinates: opts.car});

            this.cancelToken = app.request('requestTripPlan', from, to, opts);
            this.listenTo(this.cancelToken, 'canceled', (model, value) => {
                return this.$el.find('#route-details').collapse('hide');
            });
            return this.routeLoadingIndicator.show(new LoadingIndicatorView({model: this.cancelToken}));
        }

        hideRoute() {
            return this.route.clear();
        }
    }
    RouteView.initClass();


    var RoutingSummaryView = (function() {
        let NUMBER_OF_CHOICES_SHOWN = undefined;
        let LEG_MODES = undefined;
        let MODES_WITH_STOPS = undefined;
        RoutingSummaryView = class RoutingSummaryView extends base.SMItemView {
            static initClass() {
                //childView: LegSummaryView
                //childViewContainer: '#route-details'
                this.prototype.template = 'routing-summary';
                this.prototype.className = 'route-summary';
                this.prototype.events = {
                    'click .route-selector a': 'switchItinerary',
                    'click .accessibility-viewpoint': 'setAccessibility'
                };
    
                NUMBER_OF_CHOICES_SHOWN = 3;
    
                LEG_MODES = {
                    WALK: {
                        icon: 'icon-icon-by-foot',
                        colorClass: 'transit-walk',
                        text: i18n.t('transit.walk')
                    },
                    BUS: {
                        icon: 'icon-icon-bus',
                        colorClass: 'transit-default',
                        text: i18n.t('transit.bus')
                    },
                    BICYCLE: {
                        icon: 'icon-icon-bicycle',
                        colorClass: 'transit-bicycle',
                        text: i18n.t('transit.bicycle')
                    },
                    CAR: {
                        icon: 'icon-icon-car',
                        colorClass: 'transit-car',
                        text: i18n.t('transit.car')
                    },
                    TRAM: {
                        icon: 'icon-icon-tram',
                        colorClass: 'transit-tram',
                        text: i18n.t('transit.tram')
                    },
                    SUBWAY: {
                        icon: 'icon-icon-subway',
                        colorClass: 'transit-subway',
                        text: i18n.t('transit.subway')
                    },
                    RAIL: {
                        icon: 'icon-icon-train',
                        colorClass: 'transit-rail',
                        text: i18n.t('transit.rail')
                    },
                    FERRY: {
                        icon: 'icon-icon-ferry',
                        colorClass: 'transit-ferry',
                        text: i18n.t('transit.ferry')
                    },
                    WAIT: {
                        icon: '',
                        colorClass: 'transit-default',
                        text: i18n.t('transit.wait')
                    }
                };
    
                MODES_WITH_STOPS = [
                    'BUS',
                    'FERRY',
                    'RAIL',
                    'SUBWAY',
                    'TRAM'
                ];
            }

            initialize(options) {
                this.itineraryChoicesStartIndex = 0;
                this.detailsOpen = false;
                this.skipRoute = options.noRoute;
                return this.route = this.model.get('route');
            }

            serializeData() {
                if (this.skipRoute) {
                    return {skip_route: true};
                }

                window.debugRoute = this.route;

                const itinerary = this.route.getSelectedItinerary();
                if (itinerary == null) { return; }
                const filteredLegs = _.filter(itinerary.legs, leg => leg.mode !== 'WAIT');

                const mobilityAccessibilityMode = p13n.getAccessibilityMode('mobility');
                let mobilityElement = null;
                if (mobilityAccessibilityMode) {
                    mobilityElement = p13n.getProfileElement(mobilityAccessibilityMode);
                } else {
                    mobilityElement = LEG_MODES['WALK'];
                }

                const legs = _.map(filteredLegs, (leg, index) => {
                    let icon, startLocation, text;
                    const steps = this.parseSteps(leg);

                    if (leg.mode === 'WALK') {
                        ({ icon } = mobilityElement);
                        if (mobilityAccessibilityMode === 'wheelchair') {
                            text = i18n.t('transit.mobility_mode.wheelchair');
                        } else {
                            text = i18n.t('transit.walk');
                        }
                    } else {
                        ({ icon } = LEG_MODES[leg.mode]);
                        ({ text } = LEG_MODES[leg.mode]);
                    }
                    if (leg.from.bogusName) {
                        startLocation = i18n.t(`otp.bogus_name.${leg.from.name.replace(' ', '_') }`);
                    }
                    if (index === 0) {
                        startLocation = i18n.t("transit.start_location");
                    }
                    return {
                        start_time: moment(leg.startTime).format('LT'),
                        start_location: startLocation || p13n.getTranslatedAttr(leg.from.translatedName) || leg.from.name,
                        distance: this.getLegDistance(leg, steps),
                        icon,
                        transit_color_class: LEG_MODES[leg.mode].colorClass,
                        transit_mode: text,
                        route: this.getRouteText(leg),
                        transit_destination: this.getTransitDestination(leg),
                        steps,
                        has_warnings: !!_.find(steps, step => step.warning)
                    };
                });

                const end = {
                    time: moment(itinerary.endTime).format('LT'),
                    name: p13n.getTranslatedAttr(this.route.get('plan').to.translatedName) || this.route.get('plan').to.name,
                    address: p13n.getTranslatedAttr(
                        this.model.getDestination().get('street_address')
                    )
                };

                const route = {
                    duration: Math.round(itinerary.duration / 60) + ' min',
                    walk_distance: (itinerary.walkDistance / 1000).toFixed(1) + 'km',
                    legs,
                    end
                };
                const choices = this.getItineraryChoices();

                return {
                    skip_route: this.route.get('plan').itineraries.length === 0,
                    profile_set: _.keys(p13n.getAccessibilityProfileIds(true)).length,
                    itinerary: route,
                    itinerary_choices: choices,
                    selected_itinerary_index: this.route.get('selected_itinerary'),
                    details_open: this.detailsOpen,
                    current_time: moment(new Date()).format('YYYY-MM-DDTHH:mm')
                };
            }

            parseSteps(leg) {
                const steps = [];

                // if leg.mode in ['WALK', 'BICYCLE', 'CAR']
                //     for step in leg.steps
                //         warning = null
                //         if step.bogusName
                //             step.streetName = i18n.t "otp.bogus_name.#{step.streetName.replace ' ', '_' }"
                //         else if p13n.getTranslatedAttr step.translatedName
                //             step.streetName = p13n.getTranslatedAttr step.translatedName
                //         text = i18n.t "otp.step_directions.#{step.relativeDirection}",
                //             {street: step.streetName, postProcess: "fixFinnishStreetNames"}
                //         if 'alerts' of step and step.alerts.length
                //             warning = step.alerts[0].alertHeaderText.someTranslation
                //         steps.push(text: text, warning: warning)
                if (Array.from(MODES_WITH_STOPS).includes(leg.mode) && leg.intermediateStops) {
                    if ('alerts' in leg && leg.alerts.length) {
                        for (let alert of Array.from(leg.alerts)) {
                            steps.push({
                                text: "",
                                warning: alert.alertHeaderText.someTranslation
                            });
                        }
                    }
                    for (let stop of Array.from(leg.intermediateStops)) {
                        steps.push({
                            text: p13n.getTranslatedAttr(stop.translatedName) || stop.name,
                            time: moment(stop.arrival).format('LT')
                        });
                    }
                }
                steps;

                return steps;
            }

            getLegDistance(leg, steps) {
                if (Array.from(MODES_WITH_STOPS).includes(leg.mode)) {
                    const stops = _.reject(steps, step => 'warning' in step);
                    return `${stops.length} ${i18n.t('transit.stops')}`;
                } else {
                    return (leg.distance / 1000).toFixed(1) + 'km';
                }
            }

            getTransitDestination(leg) {
                if (Array.from(MODES_WITH_STOPS).includes(leg.mode)) {
                    return `${i18n.t('transit.toward')} ${leg.trip.tripHeadsign}`;
                } else {
                    return '';
                }
            }

            getRouteText(leg) {
                if (leg.route == null) { return; }
                let route = (leg.route.shortName != null ? leg.route.shortName.length : undefined) < 5 ? leg.route.shortName : '';
                if (leg.mode === 'FERRY') {
                    route = '';
                }
                return route;
            }

            getItineraryChoices() {
                const numberOfItineraries = this.route.get('plan').itineraries.length;
                const start = this.itineraryChoicesStartIndex;
                const stop = Math.min(start + NUMBER_OF_CHOICES_SHOWN, numberOfItineraries);
                return _.range(start, stop);
            }

            switchItinerary(event) {
                event.preventDefault();
                this.detailsOpen = true;
                return this.route.set('selected_itinerary', $(event.currentTarget).data('index'));
            }

            setAccessibility(event) {
                event.preventDefault();
                return p13n.trigger('user:open');
            }
        };
        RoutingSummaryView.initClass();
        return RoutingSummaryView;
    })();


    return RouteView;
});
