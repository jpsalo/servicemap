/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const base                                   = require('app/views/base');
    const models                                 = require('app/models');
    const EventDetailsView                       = require('app/views/event-details');
    const ServiceTreeView                        = require('app/views/service-tree');
    const PositionDetailsView                    = require('app/views/position-details');
    const UnitDetailsView                        = require('app/views/unit-details');
    const SearchInputView                        = require('app/views/search-input');
    const SidebarRegion                          = require('app/views/sidebar-region');
    const MapView                                = require('app/map-view');
    const {SidebarLoadingIndicatorView}          = require('app/views/loading-indicator');
    const {SearchLayoutView, UnitListLayoutView} = require('app/views/search-results');
    const {InformationalMessageView}             = require('app/views/message');
    const {SearchResultsSummaryLayout, UnitListingView} = require('app/views/new-search-results.coffee');

    class NavigationLayout extends base.SMLayout {
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.updateMaxHeights = this.updateMaxHeights.bind(this);
            this.setMaxHeight = this.setMaxHeight.bind(this);
            super(...args);
        }

        static initClass() {
            this.prototype.className = 'service-sidebar';
            this.prototype.template = 'navigation-layout';
            this.prototype.regionClass = SidebarRegion;
            this.prototype.regions = {
                header: '#navigation-header',
                contents: '#navigation-contents'
            };
        }
        onShow() {
            this.navigationHeaderView = new NavigationHeaderView({
                layout: this,
                searchState: this.searchState,
                searchResults: this.searchResults,
                selectedUnits: this.selectedUnits
            });
            return this.header.show(this.navigationHeaderView);
        }
        initialize(appModels) {
            this.appModels = appModels;
            ({
                services: this.services,
                selectedServices: this.selectedServices,
                searchResults: this.searchResults,
                selectedUnits: this.selectedUnits,
                units: this.units,
                selectedEvents: this.selectedEvents,
                selectedPosition: this.selectedPosition,
                searchState: this.searchState,
                routingParameters: this.routingParameters,
                route: this.route,
                cancelToken: this.cancelToken,
                informationalMessage: this.informationalMessage
            } = this.appModels);
            this.breadcrumbs = []; // for service-tree view
            this.openViewType = null; // initially the sidebar is closed.
            this.addListeners();
            this.restoreViewTypeOnCancel = null;
            return this.changePending = false;
        }

        addListeners() {
            this.listenTo(this.cancelToken, 'change:value', () => {
                const wrappedValue = this.cancelToken.value();
                const activeHandler = (token, opts) => {
                    if (!token.get('active')) { return; }
                    this.stopListening(token, 'change:active');
                    if (token.local) { return; }
                    return this.change('loading-indicator');
                };
                this.listenTo(wrappedValue, 'change:active', activeHandler);
                this.listenTo(wrappedValue, 'complete', () => {
                    if (this.contents.currentView.isLoadingIndicator) {
                        return this.contents.empty();
                    }
                });
                wrappedValue.trigger('change:active', wrappedValue, {});
                return wrappedValue.addHandler(() => {
                    this.stopListening(wrappedValue);
                    if (this.restoreViewTypeOnCancel) {
                        if (!wrappedValue.local) { return this.change(this.restoreViewTypeOnCancel); }
                    } else if (this.appModels.isEmpty()) {
                        return this.change(null);
                    }
                });
            });
            this.listenTo(this.searchResults, 'ready', function() {
                return this.change('search');
            });
            this.listenTo(this.services, 'finished', function() {
                this.openViewType = null;
                return this.change('browse');
            });
            this.listenTo(this.selectedServices, 'reset', function(coll, opts) {
                if (opts != null ? opts.stateRestored : undefined) {
                    if (this.selectedServices.size() > 0) {
                        this.change('service-units');
                    }
                    return;
                }
                if (!(opts != null ? opts.skip_navigate : undefined)) { return this.change('browse'); }
            });
            this.listenTo(this.selectedPosition, 'change:value', function(w, value) {
                const previous = this.selectedPosition.previous('value');
                if (previous != null) {
                    this.stopListening(previous);
                }
                if (value != null) {
                    this.listenTo(value, 'change:radiusFilter', this.radiusFilterChanged);
                }
                if (this.selectedPosition.isSet()) {
                    if (!(value != null ? value.get('selected') : undefined)) { return; }
                    return this.change('position');
                } else if (this.openViewType === 'position') {
                    return this.closeContents();
                }
            });
            this.listenTo(this.selectedServices, 'add', function(service) {
                this.navigationHeaderView.updateClasses(null);
                this.service = service;
                return this.listenTo(this.service.get('units'), 'finished', () => {
                    return this.change('service-units');
                });
            });
            this.listenTo(this.selectedServices, 'remove', (service, coll) => {
                if (coll.isEmpty()) {
                    if (this.openViewType === 'service-units') {
                        return this.closeContents();
                    }
                } else {
                    return this.listenToOnce(this.units, 'batch-remove', () => {
                        return this.change('service-units');
                    });
                }
            });
            this.listenTo(this.selectedUnits, 'reset', function(unit, coll, opts) {
                const currentViewType = this.contents.currentView != null ? this.contents.currentView.type : undefined;
                if (currentViewType === 'details') {
                    if (this.searchResults.isEmpty() && this.selectedUnits.isEmpty()) {
                        this.closeContents();
                    }
                }
                if (!this.selectedUnits.isEmpty()) {
                    return this.change('details');
                }
            });
            this.listenTo(this.selectedUnits, 'remove', function(unit, coll, opts) {
                return this.change(null);
            });
            this.listenTo(this.selectedEvents, 'reset', function(unit, coll, opts) {
                if (!this.selectedEvents.isEmpty()) {
                    return this.change('event');
                }
            });
            this.listenTo(this.informationalMessage, 'change:messageKey', function(message) {
                return this.change('message');
            });
            this.contents.on('show', this.updateMaxHeights);
            $(window).resize(this.updateMaxHeights);
            return this.listenTo(app.vent, 'landing-page-cleared', this.setMaxHeight);
        }
        updateMaxHeights() {
            this.setMaxHeight();
            const currentViewType = this.contents.currentView != null ? this.contents.currentView.type : undefined;
            return MapView.setMapActiveAreaMaxHeight({
                maximize: !currentViewType || (currentViewType === 'search')});
        }
        setMaxHeight() {
            // Set the sidebar content max height for proper scrolling.
            const $limitedElement = this.$el.find('.limit-max-height');
            if (!$limitedElement.length) { return; }
            const maxHeight = $(window).innerHeight() - $limitedElement.offset().top;
            $limitedElement.css({'max-height': maxHeight});
            return this.$el.find('.map-active-area').css('padding-bottom', MapView.mapActiveAreaMaxHeight());
        }
        getAnimationType(newViewType) {
            const currentViewType = this.contents.currentView != null ? this.contents.currentView.type : undefined;
            if (currentViewType) {
                switch (currentViewType) {
                    case 'event':
                        return 'right';
                        break;
                    case 'details':
                        switch (newViewType) {
                            case 'event': return 'left'; break;
                            case 'details': return 'up-and-down'; break;
                            default: return 'right';
                        }
                        break;
                    case 'service-tree':
                        return this.contents.currentView.animationType || 'left';
                        break;
                }
            }
            return null;
        }

        closeContents() {
            this.change(null);
            this.openViewType = null;
            this.header.currentView.updateClasses(null);
            return MapView.setMapActiveAreaMaxHeight({maximize: true});
        }

        radiusFilterChanged(value) {
            if (value.get('radiusFilter') > 0) {
                return this.listenToOnce(this.units, 'finished', () => {
                    return this.change('radius');
                });
            }
        }

        change(type, opts) {
            let view;
            if (this.changePending) {
                 this.listenToOnce(this.contents, 'show', () => {
                     this.changePending = false;
                     return this.change(type, opts);
                 });
                 return;
             }
            // Don't react if browse is already opened
            if ((type === 'browse') && (this.openViewType === 'browse')) { return; }

            if (type === 'browse') {
                this.restoreViewTypeOnCancel = type;
            } else if ((this.openViewType === this.restoreViewTypeOnCancel) && ![this.openViewType, null, 'loading-indicator'].includes(type)) {
                this.restoreViewTypeOnCancel = null;
            }

            switch (type) {
                case 'browse':
                    view = new ServiceTreeView({
                        collection: this.services,
                        selectedServices: this.selectedServices,
                        breadcrumbs: this.breadcrumbs
                    });
                    break;
                case 'radius':
                    view = new UnitListingView({
                        model: new Backbone.Model({
                            collectionType: 'radius',
                            resultType: 'unit',
                            onlyResultType: true,
                            position: this.selectedPosition.value(),
                            count: this.units.length
                        }),
                        fullCollection: this.units,
                        collection: new models.UnitList()
                    });
                    break;

                case 'search':
                    view = new SearchResultsSummaryLayout({
                        collection: this.searchResults});
                    if (opts != null ? opts.disableAutoFocus : undefined) {
                        view.disableAutoFocus();
                    }
                    break;
                case 'service-units':
                    view = new UnitListingView({
                        model: new Backbone.Model({
                            collectionType: 'service',
                            resultType: 'unit',
                            onlyResultType: true,
                            count: this.units.length
                        }),
                        selectedServices: this.selectedServices,
                        collection: new models.UnitList(),
                        fullCollection: this.units,
                        services: this.services
                    });
                    break;
                case 'details':
                    view = new UnitDetailsView({
                        model: this.selectedUnits.first(),
                        route: this.route,
                        parent: this,
                        routingParameters: this.routingParameters,
                        searchResults: this.searchResults,
                        selectedUnits: this.selectedUnits,
                        selectedPosition: this.selectedPosition
                    });
                    break;
                case 'event':
                    view = new EventDetailsView({
                        model: this.selectedEvents.first()});
                    break;
                case 'position':
                    view = new PositionDetailsView({
                        model: this.selectedPosition.value(),
                        route: this.route,
                        selectedPosition: this.selectedPosition,
                        routingParameters: this.routingParameters
                    });
                    break;
                case 'message':
                    view = new InformationalMessageView({
                        model: this.informationalMessage});
                    break;
                case 'loading-indicator':
                    view = new SidebarLoadingIndicatorView({
                        model: this.cancelToken.value()});
                    break;
                default:
                    this.opened = false;
                    view = null;
                    this.contents.empty();
            }

            this.updatePersonalisationButtonClass(type);

            if (view != null) {
               if (this.changePending) {
                    this.listenToOnce(this.contents, 'show', () => {
                        this.changePending = false;
                        return this.change(type, opts);
                    });
                    return;
                }
               const showView = () => {
                    this.changePending = true;
                    this.listenToOnce(this.contents, 'show', () => this.changePending = false);
                    this.contents.show(view, {animationType: this.getAnimationType(type)});
                    this.openViewType = type;
                    this.opened = true;
                    return this.listenToOnce(view, 'user:close', ev => {
                        if (type === 'details') {
                            if (!this.selectedServices.isEmpty()) {
                                return this.change('service-units');
                            } else if ('distance' in this.units.filters) {
                                return this.change('radius');
                            }
                        }
                    });
                };
               if (view.isReady()) {
                    showView();
                } else {
                    this.listenToOnce(view, 'ready', () => showView());
                }
           }
            if (type !== 'details') {
                // TODO: create unique titles for routes that require it
                return app.vent.trigger('site-title:change', null);
            }
        }

        updatePersonalisationButtonClass(type) {
            // Update personalisation icon visibility.
            // Notice: "hidden" class only affects narrow media.
            if (['browse', 'search', 'details', 'event', 'position'].includes(type)) {
                return $('#personalisation').addClass('hidden');
            } else {
                return $('#personalisation').removeClass('hidden');
            }
        }
    }
    NavigationLayout.initClass();

    class NavigationHeaderView extends base.SMLayout {
        static initClass() {
            // This view is responsible for rendering the navigation
            // header which allows the user to switch between searching
            // and browsing.
            this.prototype.className = 'container';
            this.prototype.template = 'navigation-header';
            this.prototype.regions = {
                search: '#search-region',
                browse: '#browse-region'
            };
    
            this.prototype.events = {
                'click .header': 'open',
                'keypress .header': 'toggleOnKeypress',
                'click .action-button.close-button': 'close'
            };
        }

        initialize(options) {
            this.navigationLayout = options.layout;
            this.searchState = options.searchState;
            this.searchResults = options.searchResults;
            return this.selectedUnits = options.selectedUnits;
        }

        onShow() {
            const searchInputView = new SearchInputView({searchState: this.searchState, searchResults: this.searchResults, expandCallback: _.bind(this._expandSearch, this)});
            this.search.show(searchInputView);
            this.listenTo(searchInputView, 'open', () => {
                this.updateClasses('search');
                return this.navigationLayout.updatePersonalisationButtonClass('search');
            });
            return this.browse.show(new BrowseButtonView());
        }

        _expandSearch() {
            return this._open('search', {disableAutoFocus: true});
        }

        _open(actionType, opts) {
            this.updateClasses(actionType);
            return this.navigationLayout.change(actionType, opts);
        }

        open(event) {
            return this._open($(event.currentTarget).data('type'));
        }

        toggleOnKeypress(event) {
            const target = $(event.currentTarget).data('type');
            const isNavigationVisible = !!$('#navigation-contents').children().length;

            // An early return if the key is not 'enter'
            if (event.keyCode !== 13) { return; }
            // An early return if the element is search input
            if (target === 'search') { return; }

            if (isNavigationVisible) {
                return this._close(target);
            } else {
                return this._open(target);
            }
        }

        _close(headerType) {
            this.updateClasses(null);

            // Clear search query if search is closed.
            if (headerType === 'search') {
                this.$el.find('input').val('');
                app.request('closeSearch');
            }
            if ((headerType === 'search') && !this.selectedUnits.isEmpty()) {
                // Don't switch out of unit details when closing search.
                return;
            }
            return this.navigationLayout.closeContents();
        }

        close(event) {
            event.preventDefault();
            event.stopPropagation();
            if (!$(event.currentTarget).hasClass('close-button')) {
                return false;
            }
            const headerType = $(event.target).closest('.header').data('type');
            return this._close(headerType);
        }

        updateClasses(opening) {
            const classname = `${opening}-open`;
            if (this.$el.hasClass(classname)) {
                return;
            }
            this.$el.removeClass().addClass('container');
            if (opening != null) {
                return this.$el.addClass(classname);
            }
        }
    }
    NavigationHeaderView.initClass();

    class BrowseButtonView extends base.SMItemView {
        static initClass() {
            this.prototype.template = 'navigation-browse';
        }
    }
    BrowseButtonView.initClass();


    return NavigationLayout;
});
