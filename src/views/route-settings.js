/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _                  = require('underscore');
    const moment             = require('moment');
    const datetimepicker     = require('bootstrap-datetimepicker');

    const p13n               = require('app/p13n');
    const models             = require('app/models');
    const search             = require('app/search');
    const base               = require('app/views/base');
    const accessibilityViews = require('app/views/accessibility');
    const geocoding          = require('app/geocoding');
    const jade               = require('app/jade');

    class RouteSettingsView extends base.SMLayout {
        static initClass() {
            this.prototype.template = 'route-settings';
            this.prototype.regions = {
                'headerRegion': '.route-settings-header',
                'routeControllersRegion': '.route-controllers',
                'accessibilitySummaryRegion': '.accessibility-viewpoint-part',
                'transportModeControlsRegion': '.transport_mode_controls'
            };
        }

        initialize(attrs) {
            this.unit = attrs.unit;
            return this.listenTo(this.model, 'change', this.updateRegions);
        }

        onShow() {
            this.headerRegion.show(new RouteSettingsHeaderView({
                model: this.model})
            );
            this.routeControllersRegion.show(new RouteControllersView({
                model: this.model,
                unit: this.unit
            })
            );
            this.accessibilitySummaryRegion.show(new accessibilityViews.AccessibilityViewpointView({
                filterTransit: true,
                template: 'accessibility-viewpoint-oneline'
            })
            );
            return this.transportModeControlsRegion.show(new TransportModeControlsView);
        }

        updateRegions() {
            this.headerRegion.currentView.render();
            this.accessibilitySummaryRegion.currentView.render();
            return this.transportModeControlsRegion.currentView.render();
        }
    }
    RouteSettingsView.initClass();


    class RouteSettingsHeaderView extends base.SMItemView {
        static initClass() {
            this.prototype.template = 'route-settings-header';
            this.prototype.events = {
                'click .settings-summary': 'toggleSettingsVisibility',
                'click .ok-button': 'toggleSettingsVisibility'
            };
        }

        serializeData() {
            const profiles = p13n.getAccessibilityProfileIds(true);

            const origin = this.model.getOrigin();
            let originName = this.model.getEndpointName(origin);
            if (
                ((origin != null ? origin.isDetectedLocation() : undefined) && !(origin != null ? origin.isPending() : undefined)) ||
                ((origin != null) && origin instanceof models.CoordinatePosition)
            ) {
                originName = originName.toLowerCase();
            }

            const transportIcons = [];
            const object = p13n.get('transport');
            for (let mode in object) {
                const value = object[mode];
                if (value) {
                    transportIcons.push(`icon-icon-${mode.replace('_', '-')}`);
                }
            }

            return {
                profile_set: _.keys(profiles).length,
                profiles: p13n.getProfileElements(profiles),
                origin_name: originName,
                origin_is_pending: this.model.getOrigin().isPending(),
                transport_icons: transportIcons
            };
        }

        toggleSettingsVisibility(event) {
            event.preventDefault();
            $('#route-details').toggleClass('settings-open');
            $('.bootstrap-datetimepicker-widget').hide();
            const $originEndpointEl = $('#route-details').find('.transit-start .endpoint');
            if ($originEndpointEl.is(':visible')) {
                return $originEndpointEl.focus();
            }
        }
    }
    RouteSettingsHeaderView.initClass();

    class TransportModeControlsView extends base.SMItemView {
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
            super(...args);
            this.onDomRefresh = this.onDomRefresh.bind(this);
        }

        static initClass() {
            this.prototype.template = 'transport-mode-controls';
            this.prototype.events =
                {'click .transport-modes a': 'switchTransportMode'};
        }

        onDomRefresh() {
            return _(['public', 'bicycle']).each(group => {
                return this.$el.find(`.${group}-details a`).click(ev => {
                    ev.preventDefault();
                    return this.switchTransportDetails(ev, group);
                });
            });
        }

        serializeData() {
            let transportModes = p13n.get('transport');
            let bicycleDetailsClasses = '';
            if (transportModes.public_transport) {
                bicycleDetailsClasses += 'no-arrow ';
            }
            if (!transportModes.bicycle) {
                bicycleDetailsClasses += 'hidden';
            }
            const selectedValues = modes => {
                return _(modes)
                    .chain()
                    .pairs()
                    .filter(v => v[1] === true)
                    .map(v => v[0])
                    .value();
            };
            transportModes = selectedValues(transportModes);
            const publicModes = selectedValues(p13n.get('transport_detailed_choices').public);

            return {
                transport_modes: transportModes,
                public_modes: publicModes,
                transport_detailed_choices: p13n.get('transport_detailed_choices'),
                bicycle_details_classes: bicycleDetailsClasses
            };
        }

        switchTransportMode(ev) {
            ev.preventDefault();
            const type = $(ev.target).closest('li').data('type');
            return p13n.toggleTransport(type);
        }

        switchTransportDetails(ev, group) {
            ev.preventDefault();
            const type = $(ev.target).closest('li').data('type');
            return p13n.toggleTransportDetails(group, type);
        }
    }
    TransportModeControlsView.initClass();

    class RouteControllersView extends base.SMItemView {
        static initClass() {
            this.prototype.template = 'route-controllers';
            this.prototype.events = {
                'click .preset.unlocked': 'switchToLocationInput',
                'click .preset-current-time': 'switchToTimeInput',
                'click .preset-current-date': 'switchToDateInput',
                'click .time-mode': 'setTimeMode',
                'click .swap-endpoints': 'swapEndpoints',
                'click .tt-suggestion'(e) {
                    return e.stopPropagation();
                },
                'click': 'undoChanges',
                // Important: the above click handler requires the following
                // to not disable the time picker widget.
                'click .time'(ev) { return ev.stopPropagation(); },
                'click .date'(ev) { return ev.stopPropagation(); }
            };
        }

        initialize(attrs) {
            window.debugRoutingControls = this;
            this.permanentModel = this.model;
            this.pendingPosition = this.permanentModel.pendingPosition;
            this.currentUnit = attrs.unit;
            return this._reset();
        }

        _reset() {
            this.stopListening(this.model);
            this.model = this.permanentModel.clone();
            this.listenTo(this.model, 'change', (model, options) => {
                // If the change was an interaction with the datetimepicker
                // widget, we shouldn't re-render.
                if (!(options != null ? options.alreadyVisible : undefined)) {
                    __guard__(this.$el.find('input.time').data("DateTimePicker"), x => x.hide());
                    __guard__(this.$el.find('input.time').data("DateTimePicker"), x1 => x1.destroy());
                    __guard__(this.$el.find('input.date').data("DateTimePicker"), x2 => x2.hide());
                    __guard__(this.$el.find('input.date').data("DateTimePicker"), x3 => x3.destroy());
                    return this.render();
                }
            });
            this.listenTo(this.model.getOrigin(), 'change', this.render);
            return this.listenTo(this.model.getDestination(), 'change', this.render);
        }

        onDomRefresh() {
            this.enableTypeahead('.transit-end input');
            this.enableTypeahead('.transit-start input');
            return this.enableDatetimePicker();
        }

        enableDatetimePicker() {
            const keys = ['time', 'date'];
            const other = key => {
                return keys[keys.indexOf(key) + (1 % keys.length)];
            };
            const inputElement = key => {
                return this.$el.find(`input.${key}`);
            };
            const otherHider = key => () => {
                return __guard__(inputElement(other(key)).data("DateTimePicker"), x => x.hide());
            };
            const valueSetter = key => ev => {
                const keyUpper = key.charAt(0).toUpperCase() + key.slice(1);
                this.model[`set${keyUpper}`].call(this.model, ev.date.toDate(),
                    {alreadyVisible: true});
                return this.applyChanges();
            };

            let closePicker = true;
            _.each(keys, key => {
                const $input = inputElement(key);
                if ($input.length > 0) {
                    const options = {};
                    const disablePick = ({
                        time: 'pickDate',
                        date: 'pickTime'
                    })[key];
                    options[disablePick] = false;

                    $input.datetimepicker(options);
                    $input.on('dp.show', () => {
                        // If a different picker is shown, don't close
                        // it immediately.
                        // TODO: get rid of unnecessarily complex open/close logic
                        if ((this.activateOnRender !== 'date') && (this.shown != null) && (this.shown !== key)) { closePicker = false; }
                        otherHider(key)();
                        return this.shown = key;
                    });
                    $input.on('dp.change', valueSetter(key));
                    const dateTimePicker = $input.data("DateTimePicker");
                    $input.on('click', () => {
                        if (closePicker) { this._closeDatetimePicker($input); }
                        return closePicker = !closePicker;
                    });
                    if (this.activateOnRender === key) {
                        dateTimePicker.show();
                        return $input.attr('readonly', this._isScreenHeightLow());
                    }
                }
            });
            return this.activateOnRender = null;
        }

        applyChanges() {
            this.permanentModel.set(this.model.attributes);
            return this.permanentModel.triggerComplete();
        }
        undoChanges() {
            this._reset();
            const origin = this.model.getOrigin();
            const destination = this.model.getDestination();
            return this.model.trigger('change');
        }

        enableTypeahead(selector) {
            this.$searchEl = this.$el.find(selector);
            if (!this.$searchEl.length) {
                return;
            }

            const geocoderBackend = new geocoding.GeocoderSourceBackend();
            const options = geocoderBackend.getDatasetOptions();
            options.templates.empty = ctx => jade.template('typeahead-no-results', ctx);
            this.$searchEl.typeahead(null, [options]);

            const selectAddress = (event, match) => {
                this.commit = true;
                switch ($(event.currentTarget).attr('data-endpoint')) {
                    case 'origin':
                        this.model.setOrigin(match);
                        break;
                    case 'destination':
                        this.model.setDestination(match);
                        break;
                }

                return this.applyChanges();
            };

            geocoderBackend.setOptions({
                $inputEl: this.$searchEl,
                selectionCallback: selectAddress
            });

            // # TODO figure out why focus doesn't work
            return this.$searchEl.focus();
        }

        _locationNameAndLocking(object) {
            return {
                name: this.model.getEndpointName(object),
                lock: this.model.getEndpointLocking(object)
            };
        }

        _isScreenHeightLow() {
            return $(window).innerHeight() < 700;
        }

        serializeData() {
            const datetime = moment(this.model.getDatetime());
            const today = new Date();
            const tomorrow = moment(today).add(1, 'days');
            // try to avoid opening the mobile virtual keyboard
            return {
                disable_keyboard: this._isScreenHeightLow(),
                is_today: !this.forceDateInput && datetime.isSame(today, 'day'),
                is_tomorrow: datetime.isSame(tomorrow, 'day'),
                params: this.model,
                origin: this._locationNameAndLocking(this.model.getOrigin()),
                destination: this._locationNameAndLocking(this.model.getDestination()),
                time: datetime.format('LT'),
                date: datetime.format('L'),
                time_mode: this.model.get('time_mode')
            };
        }

        swapEndpoints(ev) {
            ev.stopPropagation();
            this.permanentModel.swapEndpoints({
                silent: true});
            this.model.swapEndpoints();
            if (this.model.isComplete()) {
                return this.applyChanges();
            }
        }

        switchToLocationInput(ev) {
            ev.stopPropagation();
            this._reset();
            const position = this.pendingPosition;
            position.clear();
            switch ($(ev.currentTarget).attr('data-route-node')) {
                case 'start': this.model.setOrigin(position); break;
                case 'end': this.model.setDestination(position); break;
            }
            this.listenToOnce(position, 'change', () => {
                this.applyChanges();
                return this.render();
            });
            return position.trigger('request');
        }

        setTimeMode(ev) {
            ev.stopPropagation();
            const timeMode = $(ev.target).data('value');
            if (timeMode !== this.model.get('time_mode')) {
                this.model.setTimeMode(timeMode);
                return this.applyChanges();
            }
        }

        _closeDatetimePicker($input) {
            return $input.data("DateTimePicker").hide();
        }
        switchToTimeInput(ev) {
            ev.stopPropagation();
            this.activateOnRender = 'time';
            return this.model.setDefaultDatetime();
        }
        switchToDateInput(ev) {
            ev.stopPropagation();
            this.activateOnRender = 'date';
            this.forceDateInput = true;
            return this.model.trigger('change');
        }
    }
    RouteControllersView.initClass();

    return RouteSettingsView;
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
