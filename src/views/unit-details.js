/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const i18n                       = require('i18next');
    const _harvey                    = require('harvey');

    const p13n                       = require('app/p13n');
    const dateformat                 = require('app/dateformat');
    const draw                       = require('app/draw');
    const MapView                    = require('app/map-view');
    const base                       = require('app/views/base');
    const RouteView                  = require('app/views/route');
    const DetailsView                = require('app/views/details');
    const ResourceReservationListView= require('app/views/resource-reservation');
    const {AccessibilityDetailsView} = require('app/views/accessibility');
    const {getIeVersion}             = require('app/base');
    const {generateDepartmentDescription} = require('app/util/organization_hierarchy');

    class UnitDetailsView extends DetailsView {
        static initClass() {
            this.prototype.id = 'details-view-container';
            this.prototype.className = 'navigation-element';
            this.prototype.template = 'details';
            this.prototype.regions = {
                'accessibilityRegion': '.section.accessibility-section',
                'eventsRegion': '.event-list',
                'feedbackRegion': '.feedback-list',
                'resourceReservationRegion': '.section.resource-reservation-section'
            };
            this.prototype.events = {
                'click .back-button': 'userClose',
                'click .icon-icon-close': 'userClose',
                'click .map-active-area': 'showMap',
                'click .show-map': 'showMap',
                'click .mobile-header': 'showContent',
                'click .show-more-events': 'showMoreEvents',
                'click .disabled': 'preventDisabledClick',
                'click .set-accessibility-profile': 'openAccessibilityMenu',
                'click .leave-feedback': 'leaveFeedbackOnAccessibility',
                'click .section.main-info .description .body-expander': 'toggleDescriptionBody',
                'click .section.main-info .service-link': 'showServicesOnMap',
                'show.bs.collapse': 'scrollToExpandedSection',
                'hide.bs.collapse': '_removeLocationHash',
                'click .send-feedback': '_onClickSendFeedback'
            };
            this.prototype.type = 'details';
        }
        constructor(...args) {
          /*
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            */
            super(...Array.from(args || []));
            this._drawMarkerCanvas = this._drawMarkerCanvas.bind(this);
            this.updateEventsUi = this.updateEventsUi.bind(this);
            _.extend(this.events, DetailsView.prototype.events);
            _.extend(this.regions, DetailsView.prototype.regions);
        }
        initialize(options) {
            super.initialize(options);
            this.INITIAL_NUMBER_OF_EVENTS = 5;
            this.NUMBER_OF_EVENTS_FETCHED = 20;
            this.embedded = options.embedded;
            this.searchResults = options.searchResults;
            this.selectedUnits = options.selectedUnits;
            this.listenTo(this.searchResults, 'reset', this.render);

            if (this.model.isSelfProduced()) {
                const department = new models.Department(this.model.get('department'));
                return department.fetch({
                    data: { include_hierarchy: true
                },
                    success: () => {
                        return this.model.set('department', department);
                    }
                });
            }
        }

        _$getMobileHeader() {
            return this.$el.find('.mobile-header');
        }
        _$getDefaultHeader() {
            return this.$el.find('.content .main-info .header');
        }
        _hideHeader($header) {
            return $header.attr('aria-hidden', 'true');
        }
        _showHeader($header) {
            return $header.removeAttr('aria-hidden');
        }
        _attachMobileHeaderListeners() {
            Harvey.attach('(max-width:767px)', {
                on: () => {
                    this._hideHeader(this._$getDefaultHeader());
                    return this._showHeader(this._$getMobileHeader());
                }
            }
            );
            return Harvey.attach('(min-width:768px)', {
                on: () => {
                    this._hideHeader(this._$getMobileHeader());
                    return this._showHeader(this._$getDefaultHeader());
                }
            }
            );
        }
        _onClickSendFeedback(ev) {
            return app.request('composeFeedback', this.model);
        }

        _updateDepartment(department) {
            return this.$el.find('#department-specifier').text(generateDepartmentDescription(department) || '');
        }

        onShow() {
            super.onShow();
            this.listenTo(this.model, 'change:department', (_, department) => {
                return this._updateDepartment(department);
            });

            // TODO: break into domrefresh and show parts

            // Events
            //
            if (this.model.eventList.isEmpty()) {
                this.listenTo(this.model.eventList, 'reset', list => {
                    this.updateEventsUi(list.fetchState);
                    return this.renderEvents(list);
                });
                this.model.eventList.pageSize = this.INITIAL_NUMBER_OF_EVENTS;
                this.model.getEvents();
                this.model.eventList.pageSize = this.NUMBER_OF_EVENTS_FETCHED;
            } else {
                this.updateEventsUi(this.model.eventList.fetchState);
                this.renderEvents(this.model.eventList);
            }

            if (this.model.feedbackList.isEmpty()) {
                this.listenTo(this.model.feedbackList, 'reset', list => {
                    return this.renderFeedback(this.model.feedbackList);
                });
                this.model.getFeedback();
            } else {
                this.renderFeedback(this.model.feedbackList);
            }

            this.accessibilityRegion.show(new AccessibilityDetailsView({
                model: this.model})
            );

            const view = new ResourceReservationListView({model: this.model});
            this.listenTo(view, 'ready', () => {
                return this.resourceReservationRegion.$el.removeClass('hidden');
            });
            this.resourceReservationRegion.show(view);

            return app.vent.trigger('site-title:change', this.model.get('name'));
        }

        onDomRefresh() {
            let contextMobile;
            this._attachMobileHeaderListeners();

            const markerCanvas = this.$el.find('#details-marker-canvas').get(0);
            const markerCanvasMobile = this.$el.find('#details-marker-canvas-mobile').get(0);

            if (!this.collapsed) {
                const context = markerCanvas.getContext('2d');
                contextMobile = markerCanvasMobile.getContext('2d');
                this._drawMarkerCanvas(context);
                this._drawMarkerCanvas(contextMobile);

            } else {
                contextMobile = markerCanvasMobile.getContext('2d');
                this._drawMarkerCanvas(contextMobile);
            }


            return _.defer(() => {
                return this.$el.find('a').first().focus();
            });
        }

        _drawMarkerCanvas(context) {
            const conf = {
                size: 40,
                color: app.colorMatcher.unitColor(this.model) || 'rgb(0, 0, 0)',
                id: 0,
                rotation: 90
            };
            const marker = new draw.Plant(conf.size, conf.color, conf.id, conf.rotation);
            return marker.draw(context);
        }

        updateEventsUi(fetchState) {
            let shortText;
            const $eventsSection = this.$el.find('.events-section');

            // Update events section short text count.
            if (fetchState.count) {
                shortText = i18n.t('sidebar.event_count',
                    {count: fetchState.count});
            } else {
                // Handle no events -cases.
                shortText = i18n.t('sidebar.no_events');
                this.$('.show-more-events').hide();
                $eventsSection.find('.collapser').addClass('disabled');
            }
            $eventsSection.find('.short-text').text(shortText);

            // Remove show more button if all events are visible.
            if (!fetchState.next && (this.model.eventList.length === (this.eventsRegion.currentView != null ? this.eventsRegion.currentView.collection.length : undefined))) {
                return this.$('.show-more-events').hide();
            }
        }

        userClose(event) {
            event.stopPropagation();
            app.request('clearSelectedUnit');
            if (!this.searchResults.isEmpty()) {
                app.request('search', this.searchResults.query, {});
            }
            return this.trigger('user:close');
        }

        preventDisabledClick(event) {
            event.preventDefault();
            return event.stopPropagation();
        }

        getTranslatedProvider(providerType) {
            // TODO: this has to be updated.
            const SUPPORTED_PROVIDER_TYPES = [101, 102, 103, 104, 105];
            if (Array.from(SUPPORTED_PROVIDER_TYPES).includes(providerType)) {
                return i18n.t(`sidebar.provider_type.${ providerType }`);
            } else {
                return '';
            }
        }

        serializeData() {
            const { embedded } = this;
            const data = this.model.toJSON();
            // todo: implement new algorithm
            // data.provider = @getTranslatedProvider @model.get 'provider_type'
            if (!this.searchResults.isEmpty()) {
                data.back_to = i18n.t('sidebar.back_to.search');
            }
            const MAX_LENGTH = 20;
            const { description } = data;
            if (description) {
                const words = description.split(/[ ]+/);
                if (words.length > (MAX_LENGTH + 1)) {
                    data.description_ingress = words.slice(0, MAX_LENGTH).join(' ');
                    data.description_body = words.slice(MAX_LENGTH).join(' ');
                } else {
                    data.description_ingress = description;
                }
            }

            data.embedded_mode = embedded;
            data.feedback_count = this.model.feedbackList.length;
            data.collapsed = this.collapsed || false;

            const rx = (acc, service) => {
                const oRef = service.ontologyword_reference;
                acc[oRef] = (acc[oRef] || []).concat(service);
                return acc;
            };

            const servicesByOntologywordReference = _.reduce(data.services, rx, {});
            data.services = _.map(servicesByOntologywordReference, s => s[0]);

            return data;
        }

        renderEvents(events) {
            if ((events == null) || events.isEmpty()) { return; }
            this.$el.find('.section.events-section').removeClass('hidden');
            this.eventListView = this.eventListView || new EventListView({
                collection: events});
            return this.eventsRegion.show(this.eventListView);
        }

        _feedbackSummary(feedbackItems) {
            const count = feedbackItems.size();
            if (count) {
                return i18n.t('feedback.count', {count});
            } else {
                return '';
            }
        }

        renderFeedback(feedbackItems) {
            if (feedbackItems != null) {
                feedbackItems.unit = this.model;
                const feedbackSummary = this._feedbackSummary(feedbackItems);
                const $feedbackSection = this.$el.find('.feedback-section');
                $feedbackSection.find('.short-text').text(feedbackSummary);
                $feedbackSection.find('.feedback-count').text(feedbackSummary);
                return this.feedbackRegion.show(new FeedbackListView({
                    collection: feedbackItems})
                );
            }
        }

        showMoreEvents(event) {
            event.preventDefault();
            const options = {
                spinnerOptions: {
                    container: this.$('.show-more-events').get(0),
                    hideContainerContent: true
                }
            };
            if (this.model.eventList.length <= this.INITIAL_NUMBER_OF_EVENTS) {
                return this.model.getEvents({}, options);
            } else {
                options.success = () => {
                    return this.updateEventsUi(this.model.eventList.fetchState);
                };
                return this.model.eventList.fetchNext(options);
            }
        }

        toggleDescriptionBody(ev) {
            const $target = $(ev.currentTarget);
            $target.toggle();
            return $target.closest('.description').find('.body').toggle();
        }

        showServicesOnMap(event) {
            event.preventDefault();
            return app.request('setService',
                new models.Service({id: $(event.currentTarget).data('id')}));
        }

        openAccessibilityMenu(event) {
            event.preventDefault();
            return p13n.trigger('user:open');
        }
    }
    UnitDetailsView.initClass();


    class EventListRowView extends base.SMItemView {
        static initClass() {
            this.prototype.tagName = 'li';
            this.prototype.template = 'event-list-row';
            this.prototype.events =
                {'click .show-event-details': 'showEventDetails'};
        }

        serializeData() {
            const startTime = this.model.get('start_time');
            const endTime = this.model.get('end_time');
            const formattedDatetime = dateformat.humanizeEventDatetime(
                startTime, endTime, 'small');
            return {
                name: p13n.getTranslatedAttr(this.model.get('name')),
                datetime: formattedDatetime,
                info_url: p13n.getTranslatedAttr(this.model.get('info_url'))
            };
        }

        showEventDetails(event) {
            event.preventDefault();
            return app.request('selectEvent', this.model);
        }
    }
    EventListRowView.initClass();

    class EventListView extends base.SMCollectionView {
        static initClass() {
            this.prototype.tagName = 'ul';
            this.prototype.className = 'events';
            this.prototype.childView = EventListRowView;
        }
        initialize(opts) {
            return this.parent = opts.parent;
        }
    }
    EventListView.initClass();

    class FeedbackItemView extends base.SMItemView {
        static initClass() {
            this.prototype.tagName = 'li';
            this.prototype.template = 'feedback-list-row';
        }
        initialize(options) {
            return this.unit = options.unit;
        }
        serializeData() {
            const data = super.serializeData();
            data.unit = this.unit.toJSON();
            return data;
        }
    }
    FeedbackItemView.initClass();

    class FeedbackListView extends base.SMCollectionView {
        static initClass() {
            this.prototype.tagName = 'ul';
            this.prototype.className = 'feedback';
            this.prototype.childView = FeedbackItemView;
        }
        childViewOptions() {
            return {unit: this.collection.unit};
        }
    }
    FeedbackListView.initClass();

    return UnitDetailsView;
});

