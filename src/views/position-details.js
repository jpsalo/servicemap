/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _              = require('underscore');
    const $              = require('jquery');
    const Backbone       = require('backbone');
    const moment         = require('moment');

    const models         = require('app/models');
    const MapView        = require('app/map-view');
    const base           = require('app/views/base');
    const RouteView      = require('app/views/route');
    const DetailsView    = require('app/views/details');
    const {getIeVersion} = require('app/base');

    const UNIT_INCLUDE_FIELDS = 'name,root_ontologytreenodes,location,street_address';
    const SORTED_DIVISIONS = [
        'postcode_area',
        'neighborhood',
        'health_station_district',
        'maternity_clinic_district',
        'income_support_district',
        'lower_comprehensive_school_district_fi',
        'lower_comprehensive_school_district_sv',
        'upper_comprehensive_school_district_fi',
        'upper_comprehensive_school_district_sv',
        'rescue_area',
        'rescue_district',
        'rescue_sub_district',
    ];
    // the following ids represent
    // rescue related service points
    // such as emergency shelters
    const EMERGENCY_UNIT_SERVICES = [26214, 26210, 26208];

    class PositionDetailsView extends DetailsView {
        static initClass() {
            this.prototype.type = 'position';
            this.prototype.className = 'navigation-element limit-max-height';
            this.prototype.template = 'position';
            this.prototype.regions = {
                'areaServices': '.area-services-placeholder',
                'areaEmergencyUnits': '#area-emergency-units-placeholder',
                'adminDivisions': '.admin-div-placeholder'
            };
            this.prototype.events = {
                'click .icon-icon-close': 'selfDestruct',
                'click #reset-location': 'resetLocation',
                'click #add-circle': 'addCircle'
            };
        }
        isReady() {
            return this.ready;
        }
        signalReady() {
            this.ready = true;
            return this.trigger('ready');
        }
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            _.extend(this.events, DetailsView.prototype.events);
            _.extend(this.regions, DetailsView.prototype.regions);
            super(...Array.from(args || []));
        }
        initialize(options) {
            this.ready = false;
            super.initialize(options);
            this.parent = options.parent;
            this.hiddenDivisions =
                {emergency_care_district: true};

            this.divList = new models.AdministrativeDivisionList();
            this.divList.comparator = (a, b) => {
                const indexA = _.indexOf(SORTED_DIVISIONS, a.get('type'));
                const indexB = _.indexOf(SORTED_DIVISIONS, b.get('type'));
                if (indexA < indexB) { return -1; }
                if (indexB < indexA) { return 1; }
                if (indexA === indexB) {
                    const as = a.get('start');
                    const ae = a.get('end');
                    const bs = b.get('start');
                    if (!as && !ae) { return 0; }
                    if (as) {
                        if (!bs) { return 1; }
                        if (as < bs) { return -1;
                        } else { return 1; }
                    } else {
                        if (bs) { return -1;
                        } else { return 0; }
                    }
                }
                return 0;
            };
            const deferreds = [];
            this.rescueUnits = {};
            const getDivs = coords => {
                deferreds.push(this.fetchDivisions(coords));
                for (let serviceId of Array.from(EMERGENCY_UNIT_SERVICES)) {
                    const coll = new models.UnitList();
                    this.rescueUnits[serviceId] = coll;
                    deferreds.push(this.fetchRescueUnits(coll, serviceId, coords));
                }
                return $.when(...Array.from(deferreds || [])).done(() => {
                    const street = this.model.get('street');
                    if (street != null) {
                        this.signalReady();
                        return;
                    }
                    return this.listenTo(this.model, 'change:street', this.signalReady);
                });
            };
            const coords = this.model.get('location').coordinates;
            this.listenTo(this.model, 'change:location', (p, location) => {
                if ((location != null ? location.coordinates : undefined) != null) {
                    return getDivs(location.coordinates);
                }
            });
            if (coords != null) {
                return getDivs(coords);
            }
        }

        fetchRescueUnits(coll, sid, coords) {
            coll.pageSize = 5;
            let distance = 1000;
            if (sid === 26214) {
                coll.pageSize = 1;
                distance = 5000;
            }
            return coll.fetch({
                data: {
                    service: `${sid}`,
                    lon: coords[0],
                    lat: coords[1],
                    distance,
                    include: `${UNIT_INCLUDE_FIELDS},services`
                }
            });
        }
        fetchDivisions(coords) {
            if (coords == null) { return $.Deferred().resolve().promise(); }
            const opts = {
                data: {
                    lon: coords[0],
                    lat: coords[1],
                    unit_include: UNIT_INCLUDE_FIELDS,
                    type: (_.union(SORTED_DIVISIONS, ['emergency_care_district'])).join(','),
                    geometry: 'true'
                },
                reset: true
            };
            if (appSettings.school_district_active_date != null) {
                opts.data.date = moment(appSettings.school_district_active_date).format('YYYY-MM-DD');
            }
            this.divList.pageSize = 40;
            return this.divList.fetch(opts);
        }
        serializeData() {
            const data = super.serializeData();
            data.icon_class = (() => { switch (this.model.origin()) {
                case 'address': return 'icon-icon-address';
                case 'detected': return 'icon-icon-you-are-here';
                case 'clicked': return 'icon-icon-address';
            } })();
            data.origin = this.model.origin();
            data.neighborhood = this.divList.findWhere({type: 'neighborhood'});
            data.postcode = this.divList.findWhere({type: 'postcode_area'});
            data.name = this.model.humanAddress();
            data.collapsed = this.collapsed;
            return data;
        }

        resetLocation() {
            return app.request('resetPosition', this.model);
        }

        addCircle() {
            return app.request('setRadiusFilter', 750);
        }

        onDomRefresh() {
            // Force this to fix scrolling issues with collapsing divs
            return app.getRegion('navigation').currentView.updateMaxHeights();
        }

        onShow() {
            super.onShow();
            return this.renderAdminDivs();
        }

        renderAdminDivs() {
            const divsWithUnits = this.divList.filter(x => x.has('unit'));
            const emergencyDiv = this.divList.find(x => x.get('type') === 'emergency_care_district');
            if (divsWithUnits.length > 0) {
                const units = new Backbone.Collection(
                    divsWithUnits.map(function(x) {
                        // Ugly hack to allow duplicate
                        // units in listing.
                        const unit = new models.Unit(x.get('unit'));
                        const unitData = unit.attributes;
                        const storedId = unitData.id;
                        delete unitData.id;
                        unitData.storedId = storedId;
                        unitData.area = x;
                        if (x.get('type') === 'health_station_district') {
                            unitData.emergencyUnitId = emergencyDiv.getEmergencyCareUnit();
                        }
                        return new Backbone.Model(unitData);})
                );
                this.areaServices.show(new UnitListView({
                    collection: units})
                );
                if (this.areaEmergencyUnits != null) {
                    this.areaEmergencyUnits.show(new EmergencyUnitLayout({
                    rescueUnits: this.rescueUnits})
                );
                }
                return (this.adminDivisions != null ? this.adminDivisions.show(new DivisionListView({
                    collection: new models.AdministrativeDivisionList(
                        this.divList.filter(d => !this.hiddenDivisions[d.get('type')])
                    )
                })
                ) : undefined);
            }
        }

        selfDestruct(event) {
            event.stopPropagation();
            return app.request('clearSelectedPosition');
        }
    }
    PositionDetailsView.initClass();

    class DivisionListItemView extends base.SMItemView {
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.handleClick = this.handleClick.bind(this);
            this.initialize = this.initialize.bind(this);
            super(...args);
        }

        static initClass() {
            this.prototype.events =
                {'click': 'handleClick'};
            this.prototype.tagName = 'li';
            this.prototype.template = 'division-list-item';
        }
        handleClick() {
            return app.request('toggleDivision', this.model);
        }
        initialize() {
            return this.listenTo(this.model, 'change:selected', this.render);
        }
    }
    DivisionListItemView.initClass();

    class DivisionListView extends base.SMCollectionView {
        static initClass() {
            this.prototype.tagName = 'ul';
            this.prototype.className = 'division-list sublist';
            this.prototype.childView = DivisionListItemView;
        }
    }
    DivisionListView.initClass();

    class EmergencyUnitLayout extends base.SMLayout {
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.initialize = this.initialize.bind(this);
            super(...args);
        }

        static initClass() {
            this.prototype.tagName = 'div';
            this.prototype.className = 'emergency-units-wrapper';
            this.prototype.template = 'position-emergency-units';
        }
        _regionName(service) {
            return `service${service}`;
        }
        initialize({rescueUnits}) {
            this.rescueUnits = rescueUnits;
            return (() => {
                const result = [];
                for (let k in this.rescueUnits) {
                    const coll = this.rescueUnits[k];
                    if (coll.size() > 0) {
                        var region;
                        result.push(region = this.addRegion(this._regionName(k), `.emergency-unit-service-${k}`));
                    } else {
                        result.push(undefined);
                    }
                }
                return result;
            })();
        }
        serializeData() {
            return _.object(_.map(this.rescueUnits, (coll, key) => [`service${key}`, coll.size() > 0])
            );
        }
        onShow() {
            return (() => {
                const result = [];
                for (let k in this.rescueUnits) {
                    const coll = this.rescueUnits[k];
                    if (coll.size() < 1) { continue; }
                    const view = new UnitListView({collection: coll});
                    result.push(this.getRegion(this._regionName(k)).show(view));
                }
                return result;
            })();
        }
    }
    EmergencyUnitLayout.initClass();

    class UnitListItemView extends base.SMItemView {
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.handleInnerClick = this.handleInnerClick.bind(this);
            this.handleClick = this.handleClick.bind(this);
            super(...args);
        }

        static initClass() {
            this.prototype.events = {
                'click #emergency-unit-notice a': 'handleInnerClick',
                'click': 'handleClick'
            };
            this.prototype.tagName = 'li';
            this.prototype.template = 'unit-list-item';
        }
        serializeData() {
            if (!this.model.get('storedId')) {
                return super.serializeData();
            }
            let data = this.model.toJSON();
            data.id = this.model.get('storedId');
            this.model = new models.Unit(data);
            data = super.serializeData();
            data.start = data.area.get('start');
            data.end = data.area.get('end');
            return data;
        }
        handleInnerClick(ev) {
            return (ev != null ? ev.stopPropagation() : undefined);
        }
        handleClick(ev) {
            if (ev != null) {
                ev.preventDefault();
            }
            app.request('setUnit', this.model);
            return app.request('selectUnit', this.model, {});
        }
    }
    UnitListItemView.initClass();

    class UnitListView extends base.SMCollectionView {
        static initClass() {
            this.prototype.tagName = 'ul';
            this.prototype.className = 'unit-list sublist';
            this.prototype.childView = UnitListItemView;
        }
    }
    UnitListView.initClass();

    return PositionDetailsView;
});
