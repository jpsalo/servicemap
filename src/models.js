/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const moment                     = require('moment');
    const _                          = require('underscore');
    const Raven                      = require('raven');
    const Backbone                   = require('backbone');
    const i18n                       = require('i18next');
    const URI                        = require('URI');

    const settings                   = require('app/settings');
    const SMSpinner                  = require('app/spinner');
    const alphabet                   = require('app/alphabet');
    const accessibility              = require('app/accessibility');
    const {mixOf, pad, withDeferred} = require('app/base');
    const dataviz                    = require('app/data-visualization');

    const BACKEND_BASE = appSettings.service_map_backend;
    const LINKEDEVENTS_BASE = appSettings.linkedevents_backend;
    const OPEN311_BASE = appSettings.open311_backend;
    const OPEN311_WRITE_BASE = appSettings.open311_write_backend + '/';

    // TODO: remove and handle in geocoder
    const MUNICIPALITIES = {
        49: 'espoo',
        91: 'helsinki',
        92: 'vantaa',
        235: 'kauniainen'
    };
    const MUNICIPALITY_IDS = _.invert(MUNICIPALITIES);

    Backbone.ajax = function(request) {
        request = settings.applyAjaxDefaults(request);
        return Backbone.$.ajax.call(Backbone.$, request);
    };

    class FilterableCollection extends Backbone.Collection {
        urlRoot() { return BACKEND_BASE; }
        initialize(options) {
            return this.filters = {};
        }
        setFilter(key, val) {
            if (!val) {
                if (key in this.filters) {
                    delete this.filters[key];
                }
            } else {
                this.filters[key] = val;
            }
            return this;
        }
        clearFilters(key) {
            if (key) {
                return delete this.filters[key];
            } else {
                return this.filters = {};
            }
        }
        hasFilters() {
            return _.size(this.filters) > 0;
        }
        setFilters(filterableCollection) {
            this.filters = _.clone(filterableCollection.filters);
            return this.filters;
        }
        url() {
            const obj = new this.model;
            const uri = URI(`${this.urlRoot()}/${obj.resourceName}/`);
            uri.search(this.filters);
            return uri.toString();
        }
    }

    class RESTFrameworkCollection extends FilterableCollection {
        parse(resp, options) {
            // Transform Django REST Framework response into PageableCollection
            // compatible structure.
            this.fetchState = {
                count: resp.count,
                next: resp.next,
                previous: resp.previous
            };
            return super.parse(resp.results, options);
        }
    }

    class WrappedModel extends Backbone.Model {
        initialize(model) {
            super.initialize();
            return this.wrap(model);
        }
        wrap(model) {
            return this.set('value', model || null);
        }
        value() {
            return this.get('value');
        }
        isEmpty() {
            return !this.has('value');
        }
        isSet() {
            return !this.isEmpty();
        }
        restoreState(other) {
            const value = other.get('value');
            this.set('value', value, {silent: true});
            return this.trigger('change:value', this, value);
        }
    }

    class GeoModel {
        getLatLng() {
            if (this.latLng != null) {
                this.latLng;
            }
            const coords = __guard__(this.get('location'), x => x.coordinates);
            if (coords != null) {
                return this.latLng = L.GeoJSON.coordsToLatLng(coords);
            } else {
                return null;
            }
        }

        getDistanceToLastPosition() {
            const position = p13n.getLastPosition();
            if (position != null) {
                const latLng = this.getLatLng();
                if (latLng != null) {
                    return position.getLatLng().distanceTo(latLng);
                } else {
                    return Number.MAX_VALUE;
                }
            }
        }

        otpSerializeLocation(opts) {
            const coords = this.get('location').coordinates;
            if (coords != null) {
                return {
                    lat: coords[1],
                    lon: coords[0]
                };
            }
            return null;
        }
    }

    class SMModel extends Backbone.Model {
        // FIXME/THINKME: Should we take care of translation only in
        // the view level? Probably.
        getText(attr) {
            const val = this.get(attr);
            if (Array.from(this.translatedAttrs).includes(attr)) {
                return p13n.getTranslatedAttr(val);
            }
            return val;
        }
        toJSON(options) {
            const data = super.toJSON();
            if (!this.translatedAttrs) {
                return data;
            }
            for (let attr of Array.from(this.translatedAttrs)) {
                if (!(attr in data)) {
                    continue;
                }
                data[attr] = p13n.getTranslatedAttr(data[attr]);
            }
            return data;
        }

        url() {
            let ret = super.url(...arguments);
            if (ret.substr(-1 !== '/')) {
                ret = ret + '/';
            }
            return ret;
        }

        urlRoot() {
            return `${BACKEND_BASE}/${this.resourceName}/`;
        }
    }

    class SMCollection extends RESTFrameworkCollection {
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.getComparator = this.getComparator.bind(this);
            this.comparatorWrapper = this.comparatorWrapper.bind(this);
            super(...args);
        }

        initialize(models, options) {
            this.currentPage = 1;
            if (options != null) {
                this.pageSize = options.pageSize || 25;
                if (options.setComparator) {
                    this.setDefaultComparator();
                }
            }
            return super.initialize(options);
        }

        isSet() {
            return !this.isEmpty();
        }

        fetchPaginated(options) {
            this.currentPage = 1;
            const deferred = $.Deferred();
            let xhr = null;
            let cancelled = false;
            const {cancelToken} = options;
            _.defaults(options, {
                success: () => {
                    if (cancelled === true) {
                        return;
                    }
                    options.onPageComplete();
                    if (cancelled === true) {
                        return;
                    }
                    const hasNext = this.fetchNext(options);
                    if (hasNext === false) {
                        return deferred.resolve(this);
                    } else {
                        cancelToken.set('progress', this.size());
                        cancelToken.set('total', this.fetchState.count);
                        cancelToken.set('unit', 'unit');
                        return xhr = hasNext;
                    }
                }
            }
            );
            const fetchType = options.fetchType || 'units';
            cancelToken.set('status', `fetching.${fetchType}`);
            xhr = this.fetch(options);
            options.cancelToken.addHandler(function() {
                xhr.abort();
                cancelled = true;
                return deferred.fail();
            });
            return deferred;
        }

        fetchNext(options) {
            if ((this.fetchState != null) && !this.fetchState.next) {
                return false;
            }

            this.currentPage++;
            const defaults = {reset: false, remove: false};
            if (options != null) {
                options = _.extend(options, defaults);
            } else {
                options = defaults;
            }
            return this.fetch(options);
        }

        fetch(options) {
            if (options != null) {
                options = _.clone(options);
            } else {
                options = {};
            }

            if (options.data == null) {
                options.data = {};
            }
            options.data.page = this.currentPage;
            options.data.page_size = this.pageSize;

            if (options.spinnerOptions != null ? options.spinnerOptions.container : undefined) {
                const spinner = new SMSpinner(options.spinnerOptions);
                spinner.start();

                const { success } = options;
                const { error } = options;

                options.success = function(collection, response, options) {
                    spinner.stop();
                    return (typeof success === 'function' ? success(collection, response, options) : undefined);
                };

                options.error = function(collection, response, options) {
                    spinner.stop();
                    return (typeof error === 'function' ? error(collection, response, options) : undefined);
                };
            }

            delete options.spinnerOptions;

            return super.fetch(options);
        }

        fetchFields(start, end, fields) {
            // Fetches more model details for a specified range
            // in the collection.
            if (!fields) {
                return $.Deferred().resolve().promise();
            }
            const filtered = _(this.slice(start, end)).filter(m => {
                for (let field of Array.from(fields)) {
                    if (m.get(field) === undefined) {
                        return true;
                    }
                }
                return false;
            });
            const idsToFetch = _.pluck(filtered, 'id');
            if (!idsToFetch.length) {
                return $.Deferred().resolve().promise();
            }
            return this.fetch({
                remove: false,
                data: {
                    page_size: idsToFetch.length,
                    id: idsToFetch.join(','),
                    include: fields.join(',')
                }
            });
        }

        getComparatorKeys() { return ['default', 'alphabetic', 'alphabetic_reverse']; }
        getComparator(key, direction) {
            switch (key) {
                case 'alphabetic':
                    return alphabet.makeComparator(direction);
                case 'alphabetic_reverse':
                    return alphabet.makeComparator(-1);
                case 'distance':
                    return x => x.getDistanceToLastPosition();
                case 'distance_precalculated':
                    return x => x.get('distance');
                case 'default':
                    return x => -x.get('score');
                case 'accessibility':
                    return x => x.getShortcomingCount();
                default:
                    return null;
            }
        }
        comparatorWrapper(fn) {
            if (!fn) {
                return fn;
            }
            if (fn.length === 2) {
                return (a, b) => {
                    return fn(a.getComparisonKey(), b.getComparisonKey());
                };
            } else {
                return fn;
            }
        }

        setDefaultComparator() {
            return this.setComparator(this.getComparatorKeys()[0]);
        }
        setComparator(key, direction) {
            const index = this.getComparatorKeys().indexOf(key);
            if (index !== -1) {
                this.currentComparator = index;
                this.currentComparatorKey = key;
                return this.comparator = this.comparatorWrapper(this.getComparator(key, direction));
            }
        }
        cycleComparator() {
            if (this.currentComparator == null) {
                this.currentComparator = 0;
            }
            this.currentComparator += 1;
            this.currentComparator %= this.getComparatorKeys().length;
            return this.reSort(this.getComparatorKeys()[this.currentComparator]);
        }
        reSort(key, direction) {
            this.setComparator(key, direction);
            if (this.comparator != null) {
                this.sort();
            }
            return key;
        }
        getComparatorKey() {
            return this.currentComparatorKey;
        }

        hasReducedPriority() {
            return false;
        }

        restoreState(other) {
            return this.reset(other.models, {stateRestored: true});
        }
    }

    class Unit extends mixOf(SMModel, GeoModel) {
        static initClass() {
            this.prototype.resourceName = 'unit';
            this.prototype.translatedAttrs = ['name', 'description', 'street_address'];
        }

        initialize(options) {
            super.initialize(options);
            this.eventList = new EventList();
            return this.feedbackList = new FeedbackList();
        }

        getEvents(filters, options) {
            if ((filters == null)) {
                filters = {};
            }
            if (!('start' in filters)) {
                filters.start = 'today';
            }
            if (!('sort' in filters)) {
                filters.sort = 'start_time';
            }
            filters.location = `tprek:${this.get('id')}`;
            this.eventList.filters = filters;
            if ((options == null)) {
                options =
                    {reset: true};
            } else if (!options.reset) {
                options.reset = true;
            }
            return this.eventList.fetch(options);
        }

        getFeedback(options) {
            this.feedbackList.setFilter('service_object_id', this.id);
            //@feedbackList.setFilter 'updated_after', '2015-05-20'
            options = options || {};
            _.extend(options, {reset: true});
            return this.feedbackList.fetch(options);
        }

        isDetectedLocation() {
            return false;
        }
        isPending() {
            return false;
        }

        // otpSerializeLocation: (opts) ->
        //     if opts.forceCoordinates
        //         coords = @get('location').coordinates
        //         "#{coords[1]},#{coords[0]}"
        //     else
        //         "poi:tprek:#{@get 'id'}"

        getSpecifierText(selectedServices) {
            let specifierText = '';
            const unitServices = this.get('services');
            if (unitServices == null) {
                return specifierText;
            }

            let services = unitServices;
            if ((selectedServices != null ? selectedServices.size() : undefined) > 0) {
                const selectedIds = selectedServices.pluck('id');
                services = _.filter(unitServices, s => {
                    return Array.from(selectedIds).includes(s.id);
                });
                if (services.length === 0) {
                    const roots = selectedServices.pluck('root');
                    services = _.filter(unitServices, s => {
                        return Array.from(roots).includes(s.root);
                    });
                }
                if (services.length === 0) {
                    services = unitServices;
                }
            }
            let level = null;
            for (let service of Array.from(services)) {
                if (!level || (service.level < level)) {
                    specifierText = service.name[p13n.getLanguage()];
                    ({ level } = service);
                }
            }
            return specifierText;
        }

        getComparisonKey() {
            return p13n.getTranslatedAttr(this.get('name'));
        }

        toJSON(options) {
            const data = super.toJSON();
            const openingHours = _.filter(this.get('connections'), c => (c.section_type === 'OPENING_HOURS') && p13n.getLanguage() in c.name);
            const lang = p13n.getLanguage();
            if (openingHours.length > 0) {
                data.opening_hours = _(openingHours)
                    .chain()
                    .sortBy('order')
                    .map(hours => {
                        return {
                            content: hours.name[lang],
                            url: (hours.www != null ? hours.www[lang] : undefined)
                        };
                })
                    .value();
            }

            const highlights = _.filter(this.get('connections'), c => (['OTHER_INFO', 'TOPICAL'].includes(c.section_type)) && p13n.getLanguage() in c.name);
            data.highlights = _.sortBy(highlights, c => c.order);

            const contact = _.filter(this.get('connections'), c => (['PHONE_OR_EMAIL'].includes(c.section_type)) && p13n.getLanguage() in c.name);
            data.contact = _.sortBy(contact, c => c.order);

            const links = _.filter(this.get('connections'), c => ['LINK', 'SOCIAL_MEDIA_LINK'].includes(c.section_type) && p13n.getLanguage() in c.name);
            data.links = _.sortBy(links, c => c.order);
            return data;
        }

        hasBboxFilter() {
            return (__guard__(this.collection != null ? this.collection.filters : undefined, x => x.bbox) != null);
        }

        hasAccessibilityData() {
            return __guard__(this.get('accessibility_properties'), x => x.length);
        }

        getTranslatedShortcomings() {
            let shortcomings, status;
            const profiles = p13n.getAccessibilityProfileIds();
            return {status, results: shortcomings} = accessibility.getTranslatedShortcomings(profiles, this);
        }

        getShortcomingCount() {
            if (!this.hasAccessibilityData()) {
                return Number.MAX_VALUE;
            }
            const shortcomings = this.getTranslatedShortcomings();
            this.shortcomingCount = 0;
            for (let __ in shortcomings.results) {
                const group = shortcomings.results[__];
                this.shortcomingCount += _.values(group).length;
            }
            return this.shortcomingCount;
        }

        isSelfProduced() {
            return this.get('provider_type') === 'SELF_PRODUCED';
        }
    }
    Unit.initClass();

    class UnitList extends SMCollection {
        static initClass() {
            this.prototype.model = Unit;
            this.prototype.comparator = null;
        }
        initialize(models, opts) {
            super.initialize(models, opts);
            return this.forcedPriority = opts != null ? opts.forcedPriority : undefined;
        }
        setOverrideComparatorKeys(keys, selectedKey) {
            let needle;
            this.overrideComparatorKeys = keys;
            if (selectedKey) {
                return this.setComparator(selectedKey);
            } else if ((needle = this.getComparatorKey(), !Array.from(this.getComparatorKeys()).includes(needle))) {
                return this.setDefaultComparator();
            }
        }
        getComparatorKeys() {
            const keys = [];
            if (p13n.hasAccessibilityIssues()) { keys.push('accessibility'); }
            if (this.overrideComparatorKeys != null) {
                return _(this.overrideComparatorKeys).union(keys);
            }
            return _(keys).union(['default', 'distance', 'alphabetic', 'alphabetic_reverse']);
        }
        hasReducedPriority() {
            const ret = this.forcedPriority ?
                false
            :
                ((this.filters != null ? this.filters.bbox : undefined) != null);
            return ret;
        }
    }
    UnitList.initClass();

    class Department extends SMModel {
        static initClass() {
            this.prototype.resourceName = 'department';
            this.prototype.translatedAttrs = ['name'];
        }
    }
    Department.initClass();

    class DepartmentList extends SMCollection {
        static initClass() {
            this.prototype.model = Department;
        }
    }
    DepartmentList.initClass();

    class Organization extends SMModel {
        static initClass() {
            this.prototype.resourceName = 'organization';
            this.prototype.translatedAttrs = ['name'];
        }
    }
    Organization.initClass();

    class OrganizationList extends SMCollection {
        static initClass() {
            this.prototype.model = Organization;
        }
    }
    OrganizationList.initClass();

    class AdministrativeDivision extends SMModel {
        static initClass() {
            this.prototype.resourceName = 'administrative_division';
            this.prototype.translatedAttrs = ['name'];
        }
        parse(resp, options) {
            const data = super.parse(resp, options);
            if ((data.start != null) && (data.end != null)) {
                data.start = moment(data.start);
                data.end = moment(data.end);
            }
            return data;
        }
        getEmergencyCareUnit() {
            if (this.get('type') === 'emergency_care_district') {
                switch (this.get('ocd_id')) {
                    case 'ocd-division/country:fi/kunta:helsinki/päivystysalue:haartmanin_päivystysalue':
                        return 11828; // Haartman
                        break;
                    case 'ocd-division/country:fi/kunta:helsinki/päivystysalue:marian_päivystysalue':
                        return 4060; // Malmi
                        break;
                    // The next ID anticipates a probable change in the division name
                    case 'ocd-division/country:fi/kunta:helsinki/päivystysalue:malmin_päivystysalue':
                        return 4060; // Malmi
                        break;
                }
            }
            return null;
        }
    }
    AdministrativeDivision.initClass();
    class AdministrativeDivisionList extends SMCollection {
        static initClass() {
            this.prototype.model = AdministrativeDivision;
        }
    }
    AdministrativeDivisionList.initClass();

    class PopulationStatistics extends SMModel {
        static initClass() {
            this.prototype.resourceName = 'population_statistics';
            this.prototype.url = '/static/data/area_statistics.json';
        }
        parse(response, options) {
            const data = {};
            const originIds = options.statistical_districts;
            Object.keys(response).map(type =>
                Object.keys(response[type]).map(
                    (function(key) {
                        const statistics = response[type][key];
                        const statisticsName = key;
                        const isHouseholdDwellingUnit = statisticsName === dataviz.getStatisticsLayer('household-dwelling_unit');
                        // Decide comparison value
                        const comparisonKey = (statistics[Object.keys(statistics)[0]].proportion !== undefined) && !isHouseholdDwellingUnit
                        ? 'proportion'
                        : 'value';
                        const maxVal = Math.max(...Array.from(Object.keys(statistics).map( function(id) {
                            if (isNaN(+statistics[id][comparisonKey])) { return 0; } else { return +statistics[id][comparisonKey]; }
                        }) || []));
                        return Object.keys(statistics).filter(id => originIds.indexOf(id) !== -1).map( function(id) {
                            const statistic = statistics[id];
                            const currentStatistic = {};
                            const value = isNaN(+statistic[comparisonKey]) ? 0 : statistic[comparisonKey];
                            // Filter out proportion for average household-dwelling unit sizes
                            const proportion = isHouseholdDwellingUnit
                            ? undefined
                            : statistic.proportion;
                            currentStatistic[key] = {
                                value: `${statistic.value}`,
                                normalized: value / maxVal,
                                proportion,
                                comparison: comparisonKey
                            };
                            data[id] = data[id] || {};
                            return data[id][type] = _.extend({}, data[id][type], currentStatistic);
                        });
                    }), {})
            );
            return data;
        }
    }
    PopulationStatistics.initClass();


    class AdministrativeDivisionType extends SMModel {
        static initClass() {
            this.prototype.resourceName = 'administrative_division_type';
        }
    }
    AdministrativeDivisionType.initClass();

    class AdministrativeDivisionTypeList extends SMCollection {
        static initClass() {
            this.prototype.model = AdministrativeDivision;
        }
    }
    AdministrativeDivisionTypeList.initClass();

    class Service extends SMModel {
        static initClass() {
            this.prototype.resourceName = 'service';
            this.prototype.translatedAttrs = ['name'];
        }
        initialize() {
            this.set('units', new models.UnitList(null, {setComparator: true}));
            const units = this.get('units');
            units.overrideComparatorKeys = ['alphabetic', 'alphabetic_reverse', 'distance'];
            return units.setDefaultComparator();
        }
        getSpecifierText() {
            let specifierText = '';
            if (this.get('ancestors') == null) {
                return specifierText;
            }
            const iterable = this.get('ancestors');
            for (let index = 0; index < iterable.length; index++) {
                const ancestor = iterable[index];
                if (index > 0) {
                    specifierText += ' • ';
                }
                specifierText += ancestor.name[p13n.getLanguage()];
            }
            return specifierText;
        }
        getComparisonKey() {
            return p13n.getTranslatedAttr(this.get('name'));
        }
    }
    Service.initClass();

    class Street extends SMModel {
        static initClass() {
            this.prototype.resourceName = 'street';
            this.prototype.translatedAttrs = ['name'];
        }
        humanAddress() {
            const name = p13n.getTranslatedAttr(this.get('name'));
            return `${name}, ${this.getMunicipalityName()}`;
        }
        getMunicipalityName() {
            return i18n.t(`municipality.${this.get('municipality')}`);
        }
    }
    Street.initClass();

    class StreetList extends SMCollection {
        static initClass() {
            this.prototype.model = Street;
        }
    }
    StreetList.initClass();

    class Position extends mixOf(SMModel, GeoModel) {
        static initClass() {
            this.prototype.resourceName = 'address';
        }
        origin() { return 'clicked'; }
        isPending() {
            return false;
        }
        parse(response, options) {
            const data = super.parse(response, options);
            const { street } = data;
            if (street) {
                data.street = new Street(street);
            }
            return data;
        }
        isDetectedLocation() {
            return false;
        }
        isReverseGeocoded() {
            return (this.get('street') != null);
        }
        reverseGeocode() {
            return withDeferred(deferred => {
                if (this.get('street') == null) {
                    const posList = models.PositionList.fromPosition(this);
                    return this.listenTo(posList, 'sync', () => {
                        const bestMatch = posList.first();
                        if (bestMatch.get('distance') > 500) {
                            bestMatch.set('name', i18n.t('map.unknown_address'));
                        }
                        this.set(bestMatch.toJSON());
                        deferred.resolve();
                        return this.trigger('reverse-geocode');
                    });
                }
            });
        }
        getSpecifierText() {
            return this.getMunicipalityName();
        }
        slugifyAddress() {
            const SEPARATOR = '-';
            const street = this.get('street');
            const municipality = street.getMunicipalityName().toLowerCase();

            const slug = [];
            const add = x => slug.push(x);

            const streetName = street.getText('name')
                .toLowerCase()
                // escape dashes by doubling them
                .replace(SEPARATOR, SEPARATOR + SEPARATOR)
                .replace(/\ +/g, SEPARATOR);
            add(this.get('number'));

            const numberEnd = this.get('number_end');
            const letter = this.get('letter');
            if (numberEnd) { add(`${SEPARATOR}${numberEnd}`); }
            if (letter) { slug[slug.length-1] += SEPARATOR + letter; }
            this.slug = `${municipality}/${streetName}/${slug.join(SEPARATOR)}`;
            return this.slug;
        }
        humanAddress(opts){
            const street = this.get('street');
            const result = [];
            if (street != null) {
                result.push(p13n.getTranslatedAttr(street.get('name')));
                result.push(this.humanNumber());
                if (!__guard__(opts != null ? opts.exclude : undefined, x => x.municipality) && street.get('municipality')) {
                    let last = result.pop();
                    last += ',';
                    result.push(last);
                    result.push(this.getMunicipalityName());
                }
                return result.join(' ');
            } else {
                return null;
            }
        }
        getMunicipalityName() {
            return this.get('street').getMunicipalityName();
        }
        getComparisonKey(model) {
            const street = this.get('street');
            const result = [];
            if (street != null) {
                result.push(i18n.t(`municipality.${street.get('municipality')}`));
                const [number, letter] = Array.from([this.get('number'), this.get('letter')]);
                result.push(pad(number));
                result.push(letter);
            }
            return result.join('');
        }

        _humanNumber() {
            const result = [];
            if (this.get('number')) {
                result.push(this.get('number'));
            }
            if (this.get('number_end')) {
                result.push('-');
                result.push(this.get('number_end'));
            }
            if (this.get('letter')) {
                result.push(this.get('letter'));
            }
            return result;
        }
        humanNumber() {
            return this._humanNumber().join('');
        }
    }
    Position.initClass();
        // otpSerializeLocation: (opts) ->
        //     coords = @get('location').coordinates
        //     "#{coords[1]},#{coords[0]}"

    class AddressList extends SMCollection {
        static initClass() {
            this.prototype.model = Position;
        }
    }
    AddressList.initClass();

    class CoordinatePosition extends Position {
        origin() {
            if (this.isDetectedLocation()) {
                return 'detected';
            } else {
                return super.origin();
            }
        }
        initialize(attrs) {
            return this.isDetected = ((attrs != null ? attrs.isDetected : undefined) != null) ? attrs.isDetected : false;
        }
        isDetectedLocation() {
            return this.isDetected;
        }
        isPending() {
            return (this.get('location') == null);
        }
    }

    class AddressPosition extends Position {
        origin() { return 'address'; }
        initialize(data) {
            if (data == null) {
                return;
            }
            super.initialize(...arguments);
            return this.set('location', {
                coordinates: data.location.coordinates,
                type: 'Point'
            }
            );
        }
        isDetectedLocation() {
            return false;
        }
    }

    class PositionList extends SMCollection {
        static initClass() {
            this.prototype.resourceName = 'address';
        }
        static fromPosition(position) {
            const instance = new PositionList();
            const name = __guard__(position.get('street'), x => x.get('name'));
            const location = position.get('location');
            instance.model = Position;
            if (location && !name) {
                instance.fetch({data: {
                    lat: location.coordinates[1],
                    lon: location.coordinates[0]
                }});
            } else if (name && !location) {
                let lang = p13n.getLanguage();
                if (!Array.from(appSettings.street_address_languages).includes(lang)) {
                    lang = appSettings.street_address_languages[0];
                }
                const data = {
                    language: lang,
                    number: position.get('number'),
                    street: name
                };
                const street = position.get('street');
                if (street.has('municipality_name')) {
                    data.municipality_name = street.get('municipality_name');
                } else if (street.has('municipality')) {
                    data.municipality = street.get('municipality');
                }
                instance.fetch({data});
            }
            return instance;
        }

        static fromSlug(municipality, streetName, numberPart) {
            const SEPARATOR = '-';
            const numberParts = numberPart.split(SEPARATOR);
            let number = numberParts[0];
            number = numberPart.replace(/-.*$/, '');
            const fn = (memo, value) => {
                if (value === '') {
                    // Double (escaped) dashes result in an empty
                    // element.
                    return `${memo}${SEPARATOR}`;
                } else if (memo.charAt(memo.length - 1) === SEPARATOR) {
                    return `${memo}${value}`;
                } else {
                    return `${memo} ${value}`;
                }
            };
            const street = new Street({
                name: _.reduce(streetName.split(SEPARATOR), fn),
                municipality_name: municipality
            });
            return this.fromPosition(new Position({
                street,
                number
            })
            );
        }
        getComparatorKeys() { return ['alphabetic']; }
        // parse: (resp, options) ->
        //     super resp.results, options
        url() {
            return `${BACKEND_BASE}/${this.resourceName}/`;
        }
    }
    PositionList.initClass();

    class RoutingParameters extends Backbone.Model {
        initialize(attributes){
            this.set('endpoints', (attributes != null ? attributes.endpoints.slice(0) : undefined) || [null, null]);
            this.set('origin_index', (attributes != null ? attributes.origin_index : undefined) || 0);
            this.set('time_mode', (attributes != null ? attributes.time_mode : undefined) || 'depart');
            this.pendingPosition = new CoordinatePosition({isDetected: false, preventPopup: true});
            return this.listenTo(this, 'change:time_mode', function() { return this.triggerComplete(); });
        }

        swapEndpoints(opts){
            this.set('origin_index', this._getDestinationIndex());
            if (!(opts != null ? opts.silent : undefined)) {
                this.trigger('change');
                return this.triggerComplete();
            }
        }
        setOrigin(object, opts) {
            const index = this.get('origin_index');
            this.get('endpoints')[index] = object;
            this.trigger('change');
            if (!(opts != null ? opts.silent : undefined)) {
                return this.triggerComplete();
            }
        }
        setDestination(object) {
            this.get('endpoints')[this._getDestinationIndex()] = object;
            this.trigger('change');
            return this.triggerComplete();
        }
        getDestination() {
            return this.get('endpoints')[this._getDestinationIndex()];
        }
        getOrigin() {
            return this.get('endpoints')[this._getOriginIndex()];
        }
        getEndpointName(object) {
            if ((object == null)) {
                return '';
            } else if (object.isDetectedLocation()) {
                if (object.isPending()) {
                    return i18n.t('transit.location_pending');
                } else {
                    return i18n.t('transit.current_location');
                }
            } else if (object instanceof CoordinatePosition) {
                return i18n.t('transit.user_picked_location');
            } else if (object instanceof Unit) {
                return object.getText('name');
            } else if (object instanceof Position) {
                return object.humanAddress();
            }
        }
        getEndpointLocking(object) {
            return object instanceof models.Unit;
        }
        isComplete() {
            for (let endpoint of Array.from(this.get('endpoints'))) {
                if (endpoint == null) { return false; }
                if (endpoint instanceof Position) {
                    if (endpoint.isPending()) {
                        return false;
                    }
                }
            }
            return true;
        }
        ensureUnitDestination() {
            if (this.getOrigin() instanceof Unit) {
                return this.swapEndpoints({
                    silent: true});
            }
        }
        triggerComplete() {
            if (this.isComplete()) {
                return this.trigger('complete');
            }
        }
        setTime(time, opts) {
            let datetime = this.getDatetime();
            const mt = moment(time);
            const m = moment(datetime);
            m.hours(mt.hours());
            m.minutes(mt.minutes());
            datetime = m.toDate();
            this.set('time', datetime, opts);
            return this.triggerComplete();
        }
        setDate(date, opts) {
            const datetime = this.getDatetime();
            const md = moment(date);
            datetime.setDate(md.date());
            datetime.setMonth(md.month());
            datetime.setYear(md.year());
            this.set('time', datetime, opts);
            return this.triggerComplete();
        }
        setTimeAndDate(date) {
            this.setTime(date);
            return this.setDate(date);
        }
        setDefaultDatetime() {
            this.set('time', this.getDefaultDatetime());
            return this.triggerComplete();
        }
        clearTime() {
            return this.set('time', null);
        }
        getDefaultDatetime(currentDatetime) {
            const time = moment(new Date());
            const mode = this.get('time_mode');
            if (mode === 'depart') {
                return time.toDate();
            }
            time.add(60, 'minutes');
            const minutes = time.minutes();
            // Round upwards to nearest 10 min
            time.minutes(((minutes - (minutes % 10)) + 10));
            return time.toDate();
        }
        getDatetime() {
            let time = this.get('time');
            if (time == null) {
                time = this.getDefaultDatetime();
            }
            return time;
        }

        isTimeSet() {
            return (this.get('time') != null);
        }
        setTimeMode(timeMode) {
            this.set('time_mode', timeMode);
            return this.triggerComplete();
        }

        _getOriginIndex() {
            return this.get('origin_index');
        }
        _getDestinationIndex() {
            return (this._getOriginIndex() + 1) % 2;
        }
    }

    class Language extends Backbone.Model {}

    class LanguageList extends Backbone.Collection {
        static initClass() {
            this.prototype.model = Language;
        }
    }
    LanguageList.initClass();

    class ServiceList extends SMCollection {
        static initClass() {
            this.prototype.model = Service;
        }
        initialize() {
            super.initialize(...arguments);
            this.chosenService = null;
            return this.pageSize = 1000;
        }
        expand(id, spinnerOptions) {
            if (spinnerOptions == null) { spinnerOptions = {}; }
            if (!id) {
                this.chosenService = null;
                return this.fetch({
                    data: {
                        level: 0
                    },
                    spinnerOptions,
                    success: () => {
                        return this.trigger('finished');
                    }
                });
            } else {
                this.chosenService = new Service({id});
                return this.chosenService.fetch({
                    success: () => {
                        return this.fetch({
                            data: {
                                parent: id
                            },
                            spinnerOptions,
                            success: () => {
                                return this.trigger('finished');
                            }
                        });
                    }
                });
            }
        }
    }
    ServiceList.initClass();

    class SearchList extends SMCollection {
        model(attrs, options) {
                const typeToModel = {
                    ontologytreenode: Service,
                    unit: Unit,
                    address: Position
                };

                const type = attrs.object_type;
                if (type in typeToModel) {
                    return new (typeToModel[type])(attrs, options);
                } else {
                    Raven.captureException(
                        new Error(`Unknown search result type '${type}', ${attrs.object_type}`)
                    );
                    return new Backbone.Model(attrs, options);
                }
            }

        search(query, options) {
            this.query = query;
            const opts = _.extend({}, options);
            return this.fetchPaginated(opts);
        }

        url() {
            const uri = URI(`${BACKEND_BASE}/search/`);
            uri.search({
                q: this.query,
                language: p13n.getLanguage(),
                only: 'unit.name,ontologytreenode.name,unit.location,unit.root_ontologytreenodes,unit.contract_type',
                include: 'unit.accessibility_properties,ontologytreenode.ancestors,unit.services'
            });
            const cities = _.map(p13n.getCities(), c => c.toLowerCase());
            if (cities && cities.length) {
                uri.addSearch({municipality: cities.join()});
            }
            return uri.toString();
        }

        restoreState(other) {
            super.restoreState(other);
            this.query = other.query;
            if (this.size() > 0) {
                return this.trigger('ready');
            }
        }
    }

    class LinkedEventsModel extends SMModel {
        urlRoot() { return LINKEDEVENTS_BASE; }
    }

    class LinkedEventsCollection extends SMCollection {
        urlRoot() { return LINKEDEVENTS_BASE; }

        parse(resp, options) {
            this.fetchState = {
                count: resp.meta.count,
                next: resp.meta.next,
                previous: resp.meta.previous
            };
            return RESTFrameworkCollection.__super__.parse.call(this, resp.data, options);
        }
    }


    class Event extends LinkedEventsModel {
        static initClass() {
            this.prototype.resourceName = 'event';
            this.prototype.translatedAttrs = ['name', 'info_url', 'description', 'short_description',
                               'location_extra_info'];
        }
        toJSON(options) {
            const data = super.toJSON();
            data.links = _.filter(this.get('external_links'), link => link.language === p13n.getLanguage());
            return data;
        }

        getUnit() {
            const unitId = this.get('location')['@id'].match(/^.*tprek%3A(\d+)/);
            if (unitId == null) {
                return null;
            }
            return new models.Unit({id: unitId[1]});
        }
    }
    Event.initClass();


    class EventList extends LinkedEventsCollection {
        static initClass() {
            this.prototype.model = Event;
        }
    }
    EventList.initClass();

    class Open311Model extends SMModel {
        sync(method, model, options) {
            _.defaults(options, {emulateJSON: true, data: {extensions: true}});
            return super.sync(method, model, options);
        }
        urlRoot() { return OPEN311_BASE; }
    }

    class FeedbackItem extends Open311Model {
        static initClass() {
            this.prototype.resourceName = 'requests.json';
        }
        parse(resp, options) {
            if (resp.length === 1) {
                return super.parse(resp[0], options);
            }
            return super.parse(resp, options);
        }
    }
    FeedbackItem.initClass();

    class FeedbackItemType extends Open311Model {}
        // incoming feedback

    class FeedbackList extends FilterableCollection {
        static initClass() {
            this.prototype.model = FeedbackItem;
        }
        urlRoot() { return OPEN311_BASE; }
        fetch(options) {
            options = options || {};
            _.defaults(options, {
                emulateJSON: true,
                data: { extensions: true
            }
            }
            );
            return super.fetch(options);
        }
    }
    FeedbackList.initClass();

    class FeedbackMessage extends SMModel {
        // outgoing feedback
        // TODO: combine the two?
        initialize() {
            this.set('can_be_published', false);
            this.set('service_request_type', 'OTHER');
            this.set('description', '');
            return this.get('internal_feedback', false);
        }

        _serviceCodeFromPersonalisation(type) {
            switch (type) {
                case 'hearing_aid': return 128;
                case 'visually_impaired': return 126;
                case 'wheelchair': return 121;
                case 'reduced_mobility': return 123;
                case 'rollator': return 124;
                case 'stroller': return 125;
                default: return 11;
            }
        }
        validate(attrs, options) {
            if (((options.fieldKey == null)) || (options.fieldKey === 'description')) {
                // Validate can be called per field, don't validate
                // other fields than the one in question.
                if (attrs.description === '') {
                    return {description: 'description_required'};
                } else if (attrs.description.trim().length < 10) {
                    this.set('description', attrs.description);
                    return {description: 'description_length'};
                }
            }
        }
        serialize() {
            let service_code;
            const json = _.pick(this.toJSON(), 'title', 'first_name', 'description',
                'email', 'service_request_type', 'can_be_published', 'internal_feedback');
            const viewpoints = this.get('accessibility_viewpoints');

            if (this.get('internal_feedback')) {
                service_code = 1363;
            } else {
                json.service_object_id = this.get('unit').get('id');
                json.service_object_type = 'http://www.hel.fi/servicemap/v2';
                if ((viewpoints != null ? viewpoints.length : undefined)) {
                    service_code = this._serviceCodeFromPersonalisation(viewpoints[0]);
                } else {
                    if (this.get('accessibility_enabled')) {
                        service_code = 11;
                    } else {
                        service_code = 1363;
                    }
                }
            }
            json.service_code = service_code;
            return json;
        }
        sync(method, model, options) {
            const json = this.serialize();
            if (!this.validationError) {
                if (method === 'create') {
                    return $.post(this.urlRoot(), this.serialize(), () => this.trigger('sent'));
                }
            }
        }
        urlRoot() { return OPEN311_WRITE_BASE; }
    }

    const exports = {
        Unit,
        Service,
        UnitList,
        Department,
        DepartmentList,
        Organization,
        OrganizationList,
        ServiceList,
        AdministrativeDivision,
        AdministrativeDivisionList,
        AdministrativeDivisionType,
        AdministrativeDivisionTypeList,
        PopulationStatistics,
        SearchList,
        Language,
        LanguageList,
        Event,
        WrappedModel,
        EventList,
        RoutingParameters,
        Position,
        CoordinatePosition,
        AddressPosition,
        PositionList,
        AddressList,
        FeedbackItem,
        FeedbackList,
        FeedbackMessage,
        Street,
        StreetList
    };

    // Expose models to browser console to aid in debugging
    window.models = exports;

    return exports;
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}