/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const Backbone                 = require('backbone');
    const Marionette               = require('backbone.marionette');
    const $                        = require('jquery');
    const i18n                     = require('i18next');
    const iexhr                    = require('iexhr');
    const L                        = require('leaflet');

    const Models                   = require('app/models');
    const AppState                 = require('app/app-state');
    const p13n                     = require('app/p13n');
    const MapView                  = require('app/map-view');
    const landingPage              = require('app/landing');
    const ColorMatcher             = require('app/color');
    const tour                     = require('app/tour');
    const debug                    = require('app/debug');
    const ServiceCartView          = require('app/views/service-cart');
    const NavigationLayout         = require('app/views/navigation');
    const PersonalisationView      = require('app/views/personalisation');
    const LanguageSelectorView     = require('app/views/language-selector');
    const titleViews               = require('app/views/title');
    const FeedbackFormView         = require('app/views/feedback-form');
    const FeedbackConfirmationView = require('app/views/feedback-confirmation');
    const TourStartButton          = require('app/views/feature-tour-start');
    const disclaimers              = require('app/views/service-map-disclaimers');
    const ExportingView            = require('app/views/export');
    const sm                       = require('app/base');
    const widgets                  = require('app/widgets');
    const BaseControl              = require('app/control');
    const BaseRouter               = require('app/router');
    const exportUtils              = require('app/util/export');
    const Analytics                = require('app/analytics');
    const CancelToken              = require('app/cancel-token');
    const {isFrontPage}            = require('app/util/navigation');

    const DEBUG_STATE = appSettings.debug_state;
    const VERIFY_INVARIANTS = appSettings.verify_invariants;

    const LOG = debug.log;

    const addBackgroundLayerAsBodyClass = () => {
        const $body = $('body');
        const isLanding = $('body').hasClass('landing');
        $body.removeClass().addClass(`maplayer-${p13n.get('map_background_layer')}`);
        if (isLanding) {
            return $body.addClass('landing');
        }
    };

    class AppControl extends BaseControl {
        initialize(appModels) {
            super.initialize(appModels);
            //_.extend @, Backbone.Events

            this.route = appModels.route;
            // Selected events (always of length one)
            this.selectedEvents = appModels.selectedEvents;

            this._resetPendingFeedback(appModels.pendingFeedback);

            this.listenTo(p13n, 'change', function(path, val) {
                addBackgroundLayerAsBodyClass();
                if (path[path.length - 1] === 'city') {
                    return this._reFetchAllServiceUnits();
                }
            });

            if (DEBUG_STATE) {
                return this.eventDebugger = new debug.EventDebugger(appModels);
            }
        }

        _resetPendingFeedback(o) {
            if (o != null) {
                this.pendingFeedback = o;
            } else {
                this.pendingFeedback = new Models.FeedbackMessage();
            }
            appModels.pendingFeedback = this.pendingFeedback;
            return this.listenTo(appModels.pendingFeedback, 'sent', () => {
                return app.getRegion('feedbackFormContainer').show(new FeedbackConfirmationView(appModels.pendingFeedback.get('unit')));
            });
        }

        atMostOneIsSet(list) {
            return _.filter(list, o => o.isSet()).length <= 1;
        }

        _verifyInvariants() {
            if (!this.atMostOneIsSet([this.services, this.searchResults])) {
                return new Error("Active services and search results are mutually exclusive.");
            }
            if (!this.atMostOneIsSet([this.selectedPosition, this.selectedUnits])) {
                return new Error("Selected positions/units/events are mutually exclusive.");
            }
            if (!this.atMostOneIsSet([this.searchResults, this.selectedPosition])) {
                return new Error("Search results & selected position are mutually exclusive.");
            }
            return null;
        }

        reset() {
            this._setSelectedUnits();
            this._clearRadius();
            this.selectedPosition.clear();
            this.selectedDivision.clear();
            this.route.clear();
            this.units.reset([]);
            this.services.reset([], {silent: true});
            this.selectedEvents.reset([]);
            return this._resetSearchResults();
        }

        isStateEmpty() {
            return this.selectedPosition.isEmpty() &&
            this.services.isEmpty() &&
            this.selectedEvents.isEmpty();
        }

        _resetSearchResults() {
            this.searchResults.query = null;
            this.searchResults.reset([]);
            if (this.selectedUnits.isSet()) {
                return this.units.reset([this.selectedUnits.first()]);
            } else if (!this.units.isEmpty()) {
                return this.units.reset();
            }
        }

        clearUnits(opts) {
            // Only clears selected units, and bbox units,
            // not removed service units nor search results.
            this.route.clear();
            if (this.searchResults.isSet()) {
                return;
            }
            if (opts != null ? opts.all : undefined) {
                this.units.clearFilters();
                this.units.reset([], {bbox: true});
                return;
            }
            if (this.services.isSet()) {
                return;
            }
            if (this.selectedPosition.isSet() && 'distance' in this.units.filters) {
                return;
            }
            if (((opts != null ? opts.bbox : undefined) === false) && 'bbox' in this.units.filters) {
                return;
            } else if ((opts != null ? opts.bbox : undefined) && !('bbox' in this.units.filters)) {
                return;
            }
            this.units.clearFilters();
            const resetOpts = {bbox: (opts != null ? opts.bbox : undefined)};
            if (opts.silent) {
                resetOpts.silent = true;
            }
            if (opts != null ? opts.bbox : undefined) {
                resetOpts.noRefit = true;
            }
            if (this.selectedUnits.isSet()) {
                return this.units.reset([this.selectedUnits.first()], resetOpts);
            } else {
                return this.units.reset([], resetOpts);
            }
        }

        highlightUnit(unit) {
            return this.units.trigger('unit:highlight', unit);
        }

        clearSelectedUnit() {
            this.route.clear();
            this.selectedUnits.each(u => u.set('selected', false));
            this._setSelectedUnits();
            this.clearUnits({all: false, bbox: false});
            return sm.resolveImmediately();
        }

        selectEvent(event) {
            this._clearRadius();
            const unit = event.getUnit();
            const select = () => {
                event.set('unit', unit);
                if (unit != null) {
                    this.setUnit(unit);
                }
                return this.selectedEvents.reset([event]);
            };
            if (unit != null) {
                return unit.fetch({
                    success: select});
            } else {
                return select();
            }
        }

        clearSelectedPosition() {
            this.selectedDivision.clear();
            this.selectedPosition.clear();
            return sm.resolveImmediately();
        }

        resetPosition(position) {
            if (position == null) {
                position = this.selectedPosition.value();
                if (position == null) {
                    position = new models.CoordinatePosition({
                        isDetected: true});
                }
            }
            position.clear();
            this.listenToOnce(p13n, 'position', position => {
                return this.selectPosition(position);
            });
            return p13n.requestLocation(position);
        }

        clearSelectedEvent() {
            this._clearRadius();
            return this.selectedEvents.set([]);
        }
        removeUnit(unit) {
            this.units.remove(unit);
            if (unit === this.selectedUnits.first()) {
                return this.clearSelectedUnit();
            }
        }
        removeUnits(units) {
            this.units.remove(units,
                {silent: true});
            return this.units.trigger('batch-remove',
                {removed: units});
        }

        _clearRadius() {
            const pos = this.selectedPosition.value();
            if (pos != null) {
                const hasFilter = pos.get('radiusFilter');
                if (hasFilter != null) {
                    pos.set('radiusFilter', null);
                    return this.units.reset([]);
                }
            }
        }

        _reFetchAllServiceUnits() {
            if (this.services.length > 0) {
                this.units.reset([]);
                return this.services.each(s => this._fetchServiceUnits(s));
            }
        }


        removeService(serviceId) {
            const service = this.services.get(serviceId);
            this.services.remove(service);
            if (service.get('units') == null) {
                return;
            }
            const otherServices = this.services.filter(s => s !== service);
            const unitsToRemove = service.get('units').reject(unit => {
                return (this.selectedUnits.get(unit) != null) ||
                _(otherServices).find(s => (s.get('units').get(unit) != null));
            });
            this.removeUnits(unitsToRemove);
            if (this.services.size() === 0) {
                if (this.selectedPosition.isSet()) {
                    this.selectPosition(this.selectedPosition.value());
                    this.selectedPosition.trigger('change:value', this.selectedPosition, this.selectedPosition.value());
                }
            }
            return sm.resolveImmediately();
        }


        clearSearchResults() {
            this.searchResults.query = null;
            if (!this.searchResults.isEmpty()) {
                this._resetSearchResults();
            }
            return sm.resolveImmediately();
        }

        closeSearch() {
            if (this.isStateEmpty()) { this.home(); }
            return sm.resolveImmediately();
        }

        composeFeedback(unit) {
            let viewOpts;
            if (unit != null) {
                viewOpts = {
                    model: this.pendingFeedback,
                    unit
                };
            } else {
                this.pendingFeedback.set('internal_feedback', true);
                viewOpts = {
                    model: this.pendingFeedback,
                    unit: null,
                    opts: {
                        internalFeedback: true
                    }
                };
            }
            app.getRegion('feedbackFormContainer').show(
                new FeedbackFormView(viewOpts)
            );
            $('#feedback-form-container').on('shown.bs.modal', function() {
                return $(this).children().attr('tabindex', -1).focus();
            });
            return $('#feedback-form-container').modal('show');
        }

        closeFeedback() {
            this._resetPendingFeedback();
            return _.defer(() => app.getRegion('feedbackFormContainer').empty());
        }

        showServiceMapDescription() {
            app.getRegion('feedbackFormContainer').show(new disclaimers.ServiceMapDisclaimersView());
            return $('#feedback-form-container').modal('show');
        }

        showAccessibilityStampDescription() {
            return window.location.href = `http://palvelukartta.hel.fi/documentation/accessibility/${p13n.getLanguage()}.html`;
        }

        showExportingView() {
            app.getRegion('feedbackFormContainer').show(new ExportingView(appModels));
            return $('#feedback-form-container').modal('show');
        }

        printMap() {
            return app.getRegion('map').currentView.print();
        }

        home() {
            return this.reset();
        }

        activateMeasuringTool() {
            app.getRegion('map').currentView.turnOnMeasureTool();
            __guard__($(__guard__(app.getRegion('navigation').currentView, x1 => x1.$el)), x => x.one('click', this.deactivateMeasuringTool));
            return __guard__($(__guard__(app.getRegion('tourStart').currentView, x3 => x3.$el)), x2 => x2.one('click', this.deactivateMeasuringTool));
        }

        deactivateMeasuringTool() {
            app.getRegion('map').currentView.turnOffMeasureTool();
            __guard__($(__guard__(app.getRegion('navigation').currentView, x1 => x1.$el)), x => x.off('click', this.deactivateMeasuringTool));
            if (app.getRegion('tourStart').$el) {
                return __guard__($(__guard__(app.getRegion('tourStart').currentView, x3 => x3.$el)), x2 => x2.off('click', this.deactivateMeasuringTool));
            }
        }
    }

    var app = new Marionette.Application();
    var appModels = new AppState();

    let cachedMapView = null;
    const makeMapView = function(mapOpts) {
        if (!cachedMapView) {
            const opts = {
                units: appModels.units,
                services: appModels.selectedServices,
                selectedUnits: appModels.selectedUnits,
                searchResults: appModels.searchResults,
                selectedPosition: appModels.selectedPosition,
                selectedDivision: appModels.selectedDivision,
                route: appModels.route,
                divisions: appModels.divisions,
                dataLayers: appModels.dataLayers,
                statistics: appModels.statistics
            };
            cachedMapView = new MapView({opts, mapOpts, embedded: false});
            window.mapView = cachedMapView;
            const { map } = cachedMapView;
            const pos = appModels.routingParameters.pendingPosition;
            pos.on('request', ev => cachedMapView.requestLocation(pos));
            app.getRegion('map').show(cachedMapView);
            const f = () => landingPage.clear();
            cachedMapView.map.addOneTimeEventListener({
                'zoomstart': f,
                'mousedown': f
            });
            app.request('setMapProxy', cachedMapView.getProxy());
        }
        return cachedMapView;
    };

    const setSiteTitle = function(routeTitle) {
        // Sets the page title. Should be called when the view that is
        // considered the main view changes.
        let title = `${i18n.t('general.site_title')}`;
        if (routeTitle) {
            title = `${p13n.getTranslatedAttr(routeTitle)} | ` + title;
        }
        return $('head title').text(title);
    };

    class AppRouter extends BaseRouter {
        initialize(options) {
            super.initialize(options);

            this.appModels = options.models;
            const refreshServices = () => {
                const ids = this.appModels.selectedServices.pluck('id').join(',');
                if (ids.length) {
                    return `unit?treenode=${ids}`;
                } else {
                    if (this.appModels.selectedPosition.isSet()) {
                        return this.fragmentFunctions.selectPosition();
                    } else {
                        return "";
                    }
                }
            };
            const blank = () => "";

            return this.fragmentFunctions = {
                selectUnit: () => {
                    const { id } = this.appModels.selectedUnits.first();
                    return `unit/${id}`;
                },
                search: params => {
                    const query = params[0];
                    return `search?q=${query}`;
                },
                selectPosition: () => {
                    const slug = this.appModels.selectedPosition.value().slugifyAddress();
                    return `address/${slug}`;
                },
                addService: refreshServices,
                removeService: refreshServices,
                setService: refreshServices,
                clearSelectedPosition: blank,
                clearSelectedUnit: blank,
                clearSearchResults: blank,
                closeSearch: blank,
                home: blank,
                cancel: blank
            };
        }

        _getFragment(commandString, parameters) {
            return (typeof this.fragmentFunctions[commandString] === 'function' ? this.fragmentFunctions[commandString](parameters) : undefined);
        }

        navigateByCommand(commandString, parameters) {
            const fragment = this._getFragment(commandString, parameters);
            if (fragment != null) {
                this.navigate(fragment);
                return p13n.trigger('url');
            }
        }

        onPostRouteExecute(context) {
            super.onPostRouteExecute(context);
            if (isFrontPage() && !p13n.get('skip_tour') && !p13n.get('hide_tour')) {
                return tour.startTour();
            }
        }
    }

    app.addRegions({
        navigation: '#navigation-region',
        personalisation: '#personalisation',
        languageSelector: '#language-selector',
        serviceCart: '#service-cart',
        landingLogo: '#landing-logo',
        logo: '#persistent-logo',
        map: '#app-container',
        tourStart: '#feature-tour-start',
        feedbackFormContainer: '#feedback-form-container',
        disclaimerContainer: '#disclaimers'
    });

    app.addInitializer(function(opts) {

        let cancelToken;
        window.debugAppModels = appModels;
        appModels.services.fetch({
            data: {
                level: 0
            }
        });

        const appControl = new AppControl(appModels);
        const router = new AppRouter({models: appModels, controller: appControl, makeMapView});
        appControl.router = router;

        const COMMANDS = [
            "addService",
            "removeService",
            "setService",

            "selectUnit",
            "highlightUnit",
            "clearSelectedUnit",

            "selectPosition",
            "clearSelectedPosition",
            "resetPosition",

            "selectEvent",
            "clearSelectedEvent",

            "toggleDivision",
            "showDivisions",

            "setUnits",
            "setUnit",
            "addUnitsWithinBoundingBoxes",

            "activateMeasuringTool",
            "deactivateMeasuringTool",

            "search",
            "clearSearchResults",
            "closeSearch",

            "setRadiusFilter",
            "clearRadiusFilter",

            "home",
            "printMap",

            "composeFeedback",
            "closeFeedback",

            "showServiceMapDescription",

            "showAccessibilityStampDescription",
            "showExportingView",

            "setMapProxy",
            "addDataLayer",
            "removeDataLayer",

            "displayMessage",

            "requestTripPlan"
        ];
        const reportError = function(position, command) {
            const e = appControl._verifyInvariants();
            if (e) {
                const message = `Invariant failed ${position} command ${command}: ${e.message}`;
                LOG(appModels);
                e.message = message;
                throw e;
            }
        };

        const commandInterceptor = (comm, parameters) => {
            Analytics.trackCommand(comm, parameters);
            const args = Array.prototype.slice.call(parameters);
            cancelToken = new CancelToken();
            let savedAppState = null;
            cancelToken.on('activated', () => {
                savedAppState = appModels.clone();
                return cancelToken.addHandler(() => {
                    return appModels.setState(savedAppState);
                });
            });
            args.push(cancelToken);
            const deferred = appControl[comm].apply(appControl, args);
            appModels.cancelToken.wrap(cancelToken);
            __guardMethod__(deferred, 'done', o => o.done(() => {
                let navigate = true;
                if (parameters.length > 0) {
                    if (__guard__(parameters[parameters.length-1], x => x.navigate) === false) { navigate = false; }
                }
                if (navigate !== false) {
                    return router.navigateByCommand(comm, parameters);
                }
            }));
            return cancelToken;
        };

        const makeInterceptor = function(comm) {
            if (DEBUG_STATE) {
                return function() {
                    LOG(`COMMAND ${comm} CALLED`);
                    cancelToken = commandInterceptor(comm, arguments);
                    LOG(appModels);
                    return cancelToken;
                };
            } else if (VERIFY_INVARIANTS) {
                return function() {
                    LOG(`COMMAND ${comm} CALLED`);
                    reportError("before", comm);
                    cancelToken = commandInterceptor(comm, arguments);
                    reportError("after", comm);
                    return cancelToken;
                };
            } else {
                return function() {
                    return commandInterceptor(comm, arguments);
                };
            }
        };

        for (let comm of Array.from(COMMANDS)) {
            this.reqres.setHandler(comm, makeInterceptor(comm));
        }

        const navigation = new NavigationLayout(appModels);

        this.getRegion('navigation').show(navigation);
        this.getRegion('landingLogo').show(new titleViews.LandingTitleView);
        this.getRegion('logo').show(new titleViews.TitleView);

        const personalisation = new PersonalisationView;
        this.getRegion('personalisation').show(personalisation);

        const languageSelector = new LanguageSelectorView({
            p13n});
        this.getRegion('languageSelector').show(languageSelector);

        const serviceCart = new ServiceCartView({
            collection: appModels.selectedServices,
            selectedDataLayers: appModels.selectedDataLayers
        });
        this.getRegion('serviceCart').show(serviceCart);

        // The colors are dependent on the currently selected services.
        this.colorMatcher = new ColorMatcher(appModels.selectedServices);

        const f = () => landingPage.clear();
        $('body').one("keydown", f);
        $('body').one("click", f);

        Backbone.history.start({
            pushState: true,
            root: appSettings.url_prefix
        });

        // Prevent empty anchors from appending a '#' to the URL bar but
        // still allow external links to work.
        $('body').on('click', 'a', function(ev) {
            const target = $(ev.currentTarget);
            if (!target.hasClass('external-link') && !target.hasClass('force')) {
                return ev.preventDefault();
            }
        });

        this.listenTo(app.vent, 'site-title:change', setSiteTitle);

        const showButton = () => {
            const tourButtonView = new TourStartButton();
            app.getRegion('tourStart').show(tourButtonView);
            return this.listenToOnce(tourButtonView, 'close', () => app.getRegion('tourStart').empty());
        };
        if (p13n.get('skip_tour')) {
            showButton();
        }
        this.listenTo(p13n, 'tour-skipped', () => {
            return showButton();
        });

        // This one-time callback ensures the feature tour popup
        // automatically disappears once the user clicks somewhere
        // outside it.
        $(document).one('click', event => {
            if (!$(event.target).closest('.popover.tour').length) {
                if ($('.popover.tour').is(':visible')) {
                    return tour.endTour();
                }
            }
        });

        return app.getRegion('disclaimerContainer').show(new disclaimers.ServiceMapDisclaimersOverlayView);
    });

    app.addInitializer(widgets.initializer);

    window.app = app;

    // We wait for p13n/i18next to finish loading before firing up the UI
    return $.when(p13n.deferred).done(function() {
        $('html').attr('lang', p13n.getLanguage());
        app.start();
        if (isFrontPage()) {
            $('body').addClass('landing');
        }
        addBackgroundLayerAsBodyClass();
        return p13n.setVisited();
    });
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}
