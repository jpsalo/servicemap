/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let BaseControl;
    const $          = require('jquery');
    const Marionette = require('backbone.marionette');
    const URI        = require('URI');
    const Raven      = require('raven');

    const sm         = require('app/base');
    const Models     = require('app/models');
    const Analytics  = require('app/analytics');

    const renderUnitsByOldServiceId = require('app/redirect');

    const GeocodeCleanup = require('app/geocode-cleanup');

    const PAGE_SIZE = appSettings.page_size;

    const UNIT_MINIMAL_ONLY_FIELDS = [
        'root_ontologytreenodes',
        'location',
        'name',
        'street_address',
        'contract_type',
    ].join(',');

    return (BaseControl = class BaseControl extends Marionette.Controller {
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.toggleDivision = this.toggleDivision.bind(this);
            super(...args);
        }

        initialize(appModels) {
            this.models = appModels;
            // Units currently on the map
            this.units = appModels.units;
            // Services in the cart
            this.services = appModels.selectedServices;
            // Selected units (always of length zero or one)
            this.selectedUnits = appModels.selectedUnits;
            this.selectedPosition = appModels.selectedPosition;
            this.searchResults = appModels.searchResults;
            this.divisions = appModels.divisions;
            this.statistics = appModels.statistics;
            this.selectedDivision = appModels.selectedDivision;
            this.selectedDataLayers = appModels.selectedDataLayers;
            this.level = appModels.level;
            this.dataLayers = appModels.dataLayers;
            return this.informationalMessage = appModels.informationalMessage;
        }

        setMapProxy(mapProxy) {
            this.mapProxy = mapProxy;
        }

        setUnits(units, filter) {
            this.services.set([]);
            this._setSelectedUnits();
            this.units.reset(units.toArray());
            if (filter != null) {
                return this.units.setFilter(filter, true);
            } else {
                return this.units.clearFilters();
            }
        }
            // Current cluster based map logic
            // requires batch reset signal.

        setUnit(unit) {
            this.services.set([]);
            return this.units.reset([unit]);
        }

        getUnit(id) {
            return this.units.get(id);
        }

        _setSelectedUnits(units, options) {
            this.selectedUnits.each(u => u.set('selected', false));
            if (units != null) {
                _(units).each(u => u.set('selected', true));
                return this.selectedUnits.reset(units, options);
            } else {
                if (this.selectedUnits.length) {
                    return this.selectedUnits.reset([], options);
                }
            }
        }

        _unselectPosition() {
            // unselected position is left on the map for user reference
            // but marked as unselected to help with event resolution
            // precedence
            return __guardMethod__(this.selectedPosition.value(), 'set', o => o.set('selected', false));
        }

        selectUnit(unit, opts) {
            const addUnit = unit => {
                if (opts != null ? opts.replace : undefined) {
                    this.units.reset([unit]);
                    return this.units.clearFilters();
                } else if ((opts != null ? opts.overwrite : undefined) || !this.units.contains(unit)) {
                    this.units.add(unit);
                    return this.units.trigger('reset', this.units);
                }
            };
            const hasObject = function(unit, key) {
                const o = unit.get(key);
                return (o != null) && (typeof o === 'object');
            };
            this.selectedDivision.clear();
            if (typeof this._setSelectedUnits === 'function') {
                this._setSelectedUnits([unit], {silent: true});
            }
            const requiredObjects = ['department', 'municipality', 'services', 'geometry'];
            if (!_(requiredObjects).find(x=> !hasObject(unit, x))) {
                addUnit(unit);
                this.selectedUnits.trigger('reset', this.selectedUnits);
                return sm.resolveImmediately();
            } else {
                return unit.fetch({
                    data: {
                        include: 'department,municipality,services',
                        geometry: true
                    },
                    success: () => {
                        addUnit(unit);
                        return this.selectedUnits.trigger('reset', this.selectedUnits);
                    }
                });
            }
        }

        addUnitsWithinBoundingBoxes(bboxStrings, level) {
            if (level === 'none') {
                return;
            }
            if (level == null) {
                level = 'customer_service';
            }
            const bboxCount = bboxStrings.length;
            if (bboxCount > 4) {
                null;
            }
                // TODO: handle case.
            if (__guard__(this.selectedPosition.value(), x => x.get('radiusFilter')) != null) {
                return;
            }
            this.units.clearFilters();
            var getBbox = bboxStrings => {
                // Fetch bboxes sequentially
                if (bboxStrings.length === 0) {
                    this.units.setFilter('bbox', true);
                    this.units.trigger('finished',
                        {keepViewport: true});
                    return;
                }
                const bboxString = _.first(bboxStrings);
                const unitList = new models.UnitList(null, {forcedPriority: false});
                var opts = {
                    data: {
                        only: UNIT_MINIMAL_ONLY_FIELDS,
                        geometry: 'true'
                    },
                    success: (coll, resp, options) => {
                        if (unitList.length) {
                            this.units.add(unitList.toArray());
                        }
                        if (!unitList.fetchNext(opts)) {
                            return unitList.trigger('finished',
                            {keepViewport: true});
                        }
                    }
                };
                unitList.pageSize = PAGE_SIZE;
                unitList.setFilter('bbox', bboxString);
                const layer = p13n.get('map_background_layer');
                unitList.setFilter('bbox_srid', ['servicemap', 'accessible_map'].includes(layer) ? 3067 : 3879);
                if (level != null) {
                    unitList.setFilter('level', level);
                }

                this.listenTo(unitList, 'finished', () => {
                    return getBbox(_.rest(bboxStrings));
                });
                return unitList.fetch(opts);
            };
            return getBbox(bboxStrings);
        }

        _clearRadius() {}
        clearSearchResults() {}
        clearUnits() {}
        reset() {}

        toggleDivision(division) {
            this._clearRadius();
            const old = this.selectedDivision.value();
            if (old != null) { old.set('selected', false); }
            if (division === old) {
                return this.selectedDivision.clear();
            } else {
                this.selectedDivision.wrap(division);
                const id = (this.selectedDivision.attributes.value.attributes.unit != null ? this.selectedDivision.attributes.value.attributes.unit.id : undefined) || null;
                // clear @units so the previous one doesn't persist if there is no new unit to draw
                if (id != null) { this.renderUnitById(id, false); } else { this.units.set([]); }
                return division.set('selected', true);
            }
        }

        renderUnitById(id, unitSelect) {
            if (unitSelect == null) { unitSelect = true; }
            const deferred = $.Deferred();
            const unit = new Models.Unit({id});
            unit.fetch({
                data: {
                    include: 'department,municipality,services',
                    geometry: 'true'
                },
                success: () => {
                    this.setUnit(unit);
                    if (unitSelect) { this.selectUnit(unit); }
                    return deferred.resolve(unit);
                }
            });
            return deferred.promise();
        }

        selectPosition(position) {
            position.set('selected', true);
            if (typeof this.clearSearchResults === 'function') {
                this.clearSearchResults();
            }
            if (typeof this._setSelectedUnits === 'function') {
                this._setSelectedUnits();
            }
            const previous = this.selectedPosition.value();
            if ((previous != null ? previous.get('radiusFilter') : undefined) != null) {
                this.units.reset([]);
                this.units.clearFilters();
            }
            if (position === previous) {
                this.selectedPosition.trigger('change:value', this.selectedPosition, this.selectedPosition.value());
            } else {
                this.selectedPosition.wrap(position);
            }
            return sm.resolveImmediately();
        }

        setRadiusFilter(radius, cancelToken) {
            this.services.reset([], {skip_navigate: true});
            this.units.reset([]);
            this.units.clearFilters();
            const keys = ['distance_precalculated', 'alphabetic', 'alphabetic_reverse'];
            this.units.setOverrideComparatorKeys(keys, 'distance_precalculated');
            if (this.selectedPosition.isEmpty()) {
                return;
            }

            const pos = this.selectedPosition.value();
            const unitList = new models.UnitList([], {pageSize: PAGE_SIZE})
                .setFilter('lat', pos.get('location').coordinates[1])
                .setFilter('lon', pos.get('location').coordinates[0])
                .setFilter('distance', radius);
            const opts = {
                data: {
                    only: UNIT_MINIMAL_ONLY_FIELDS,
                    include: 'services,accessibility_properties'
                },
                onPageComplete: () => {
                    this.units.add(unitList.toArray(), {merge: true});
                    return this.units.setFilters(unitList);
                },
                cancelToken
            };
            cancelToken.activate();
            return unitList.fetchPaginated(opts).done(() => {
                pos.set('radiusFilter', radius, {cancelToken});
                return this.units.trigger('finished', {refit: true});
            });
        }

        clearRadiusFilter() {
            this._clearRadius();
            if (!this.selectedPosition.isEmpty()) { return this.selectPosition(this.selectedPosition.value()); }
        }

        _addService(service, filters, cancelToken) {
            cancelToken.activate();
            this._clearRadius();
            this._setSelectedUnits();
            this.services.add(service);

            if (service.has('ancestors')) {
                const ancestor = this.services.find(function(s) {
                    let needle;
                    return (needle = s.id, Array.from(service.get('ancestors')).includes(needle));
                });
                if (ancestor != null) {
                    this.removeService(ancestor);
                }
            }
            return this._fetchServiceUnits(service, filters, cancelToken);
        }

        _fetchServiceUnits(service, filters, cancelToken) {
            let municipalityIds;
            const unitList = new models.UnitList([], {pageSize: PAGE_SIZE, setComparator: true});
            if (filters != null) { unitList.filters = filters; }
            unitList.setFilter('service', service.id);

            // MunicipalityIds come from explicit query parameters
            // and they always override the user p13n city setting.
            if (filters.municipality != null) {
                municipalityIds = filters.municipality;
            } else {
                // If no explicit parameters received, use p13n profile
                municipalityIds = p13n.getCities();
            }
            if (municipalityIds.length > 0) {
                unitList.setFilter('municipality', municipalityIds.join(','));
            }

            const opts = {
                // todo: re-enable
                //spinnerTarget: spinnerTarget
                data: {
                    only: UNIT_MINIMAL_ONLY_FIELDS,
                    include: 'services,accessibility_properties',
                    geometry: 'true'
                },
                onPageComplete() {},
                cancelToken
            };

            const maybe = op => {
                if (!cancelToken.canceled()) { return op(); }
            };
            return unitList.fetchPaginated(opts).done(collection => {
                if (this.services.length === 1) {
                    // Remove possible units
                    // that had been added through
                    // other means than service
                    // selection.
                    maybe(() => this.units.reset([]));
                    this.units.clearFilters();
                    this.clearSearchResults({navigate: false});
                }
                this.units.add(unitList.toArray(), {merge: true});
                maybe(() => service.get('units').add(unitList.toArray()));
                cancelToken.set('cancelable', false);
                cancelToken.set('status', 'rendering');
                cancelToken.set('progress', null);
                this.units.setOverrideComparatorKeys(([
                    'alphabetic', 'alphabetic_reverse', 'distance'])
                );
                return _.defer(() => {
                    // Defer needed to make sure loading indicator gets a change
                    // to re-render before drawing.
                    this._unselectPosition();
                    maybe(() => this.units.trigger('finished', {refit: true, cancelToken}));
                    return maybe(() => service.get('units').trigger('finished'));
                });
            });
        }

        addService(service, filters, cancelToken) {
            console.assert(__guard__(cancelToken != null ? cancelToken.constructor : undefined, x => x.name) === 'CancelToken', 'wrong canceltoken parameter');
            if (service.has('ancestors')) {
                return this._addService(service, filters, cancelToken);
            } else {
                return service.fetch({data: {include: 'ancestors'}}).then(() => {
                    return this._addService(service, filters, cancelToken);
                });
            }
        }

        addServices(services) {
            return sm.resolveImmediately();
        }

        setService(service, cancelToken) {
            this.services.set([]);
            return this.addService(service, {}, cancelToken);
        }

        _search(query, filters, cancelToken) {
            return sm.withDeferred(deferred => {
                let needle;
                if (this.searchResults.query === query) {
                    this.searchResults.trigger('ready');
                    deferred.resolve();
                    return;
                }

                cancelToken.activate();
                this._clearRadius();
                this.selectedPosition.clear();
                this.clearUnits({all: true});
                let canceled = false;
                this.listenToOnce(cancelToken, 'canceled', () => canceled = true);

                if ((needle = 'search', Array.from(_(this.units.filters).keys()).includes(needle))) {
                    this.units.reset([]);
                }
                if (!this.searchResults.isEmpty()) {
                    this.searchResults.reset([]);
                }

                let opts = {
                    onPageComplete: () => {
                        if (typeof _paq !== 'undefined' && _paq !== null) {
                            _paq.push(['trackSiteSearch', query, false, this.searchResults.models.length]);
                        }
                        this.units.add(this.searchResults.filter(r => r.get('object_type') === 'unit')
                        );
                        return this.units.setFilter('search', true);
                    },
                    cancelToken
                };

                if ((filters != null) && (_.size(filters) > 0)) {
                    opts.data = filters;
                }

                return opts = this.searchResults.search(query, opts).done(() => {
                    if (canceled) { return; }
                    this._unselectPosition();
                    if (canceled) { return; }
                    this.searchResults.trigger('ready');
                    if (canceled) { return; }
                    this.units.trigger('finished');
                    this.services.set([]);
                    return deferred.resolve();
                });
            });
        }

        search(query, filters, cancelToken) {
            console.assert(cancelToken.constructor.name === 'CancelToken', 'wrong canceltoken parameter');
            if (query == null) {
                ({ query } = this.searchResults);
            }
            if ((query != null) && (query.length > 0)) {
                return this._search(query, filters, cancelToken);
            } else {
                return sm.resolveImmediately();
            }
        }

        renderUnitsByServices(serviceIdString, queryParameters, cancelToken) {
            this._unselectPosition();
            console.assert(__guard__(cancelToken != null ? cancelToken.constructor : undefined, x => x.name) === 'CancelToken', 'wrong canceltoken parameter');
            const municipalityIds = __guard__(queryParameters != null ? queryParameters.municipality : undefined, x1 => x1.split(','));
            const providerTypes = __guard__(queryParameters != null ? queryParameters.provider_type : undefined, x2 => x2.split(','));
            const organizationUuid = queryParameters != null ? queryParameters.organization : undefined;

            const serviceIds = serviceIdString.split(',');
            const services = _.map(serviceIds, id => new models.Service({id}));
            // TODO: see if service is being added or removed,
            // then call corresponding app.request

            const serviceDeferreds = _.map(services, service =>
                sm.withDeferred(deferred =>
                    service.fetch({
                        data: { include: 'ancestors'
                    },
                        success() { return deferred.resolve(service); },
                        error() { return deferred.resolve(null); }
                    })
                )
            );

            const deferreds = _.map(services, () => $.Deferred());
            $.when(...Array.from(serviceDeferreds || [])).done((...serviceObjects) => {
                return _.each(serviceObjects, (srv, idx) => {
                    if (srv === null) {
                        // resolve with false: service was not found
                        deferreds[idx].resolve(false);
                        return;
                    }
                    // trackCommand needs to be called manually since
                    // commands don't return promises so
                    // we need to call @addService directly
                    Analytics.trackCommand('addService', [srv]);
                    return this.addService(srv, {organization: organizationUuid, municipality: municipalityIds, provider_type: providerTypes}, cancelToken).done(() => deferreds[idx].resolve(true));
                });
            });
            return $.when(...Array.from(deferreds || []));
        }

        _fetchDivisions(divisionIds, callback) {
            return this.divisions
                .setFilter('ocd_id', divisionIds.join(','))
                .setFilter('geometry', true)
                .fetch({success: callback});
        }

        _getLevel(context, defaultLevel) {
            if (defaultLevel == null) { defaultLevel = 'none'; }
            return __guard__(context != null ? context.query : undefined, x => x.level) || defaultLevel;
        }

        _renderDivisions(ocdIds, context) {
            let defaultLevel;
            const level = this._getLevel(context, (defaultLevel='none'));
            return sm.withDeferred(deferred => {
                return this._fetchDivisions(ocdIds, () => {
                    if (level === 'none') {
                        deferred.resolve();
                        return;
                    }
                    if (level !== 'all') {
                        this.units.setFilter('level', context.query.level);
                    }
                    this.units
                        .setFilter('division', ocdIds.join(','));
                    var opts = {
                        data: {
                            only: UNIT_MINIMAL_ONLY_FIELDS
                        },
                        success: () => {
                            if (!this.units.fetchNext(opts)) {
                                this.units.trigger('finished');
                                return deferred.resolve();
                            }
                        }
                    };
                    this.units.fetch(opts);
                    return this.units;
                });
            });
        }

        showDivisions(filters, statisticsPath ,cancelToken) {
            this.divisions.clearFilters();
            this.divisions.setFilter('geometry', true);
            this.divisions.setFilter('type', 'statistical_district');
            for (let key in filters) {
                const val = filters[key];
                this.divisions
                    .setFilter(key, val);
            }
            let options = {cancelToken, fetchType: 'data'};
            options.onPageComplete = () => null;
            cancelToken.activate();
            cancelToken.set('cancelable', false);
            return this.divisions.fetchPaginated(options).done(() => {
                options = {cancelToken, statistical_districts: this.divisions.models.map(div => div.get('origin_id'))};
                // Fetch statistics only when needed
                if ( _.isEmpty(this.statistics.attributes) ) {
                    return this.statistics.fetch(options).done(data => {
                        return this.divisions.trigger('finished', cancelToken, statisticsPath);
                    });
                } else {
                    return this.divisions.trigger('finished', cancelToken, statisticsPath);
                }
            });
        }

        renderDivision(municipality, divisionId, context) {
            return this._renderDivisions([`${municipality}/${divisionId}`], context);
        }
        renderMultipleDivisions(_path, context) {
            if (context.query.ocdId.length > 0) {
                return this._renderDivisions(context.query.ocdId, context);
            }
        }

        renderAddress(municipality, street, numberPart, context) {
            let defaultLevel;
            const [newUri, newAddress] = Array.from(GeocodeCleanup.cleanAddress({municipality, street, numberPart}));
            if (newUri) {
                ({municipality, street, numberPart} = newAddress);
                const relative = newUri.relativeTo(newUri.origin());
                this.router.navigate(relative.toString(), {replace: true});
            }
            const level = this._getLevel(context, (defaultLevel='none'));
            this.level = level;
            return sm.withDeferred(deferred => {
                const SEPARATOR = /-/g;
                let slug = `${municipality}/${street}/${numberPart}`;
                const positionList = models.PositionList.fromSlug(municipality, street, numberPart);
                const l = appSettings.street_address_languages;
                const address_languages = _.object(l, l);
                return this.listenTo(positionList, 'sync', (p, res, opts) => {
                    try {
                        let position;
                        if (p.length === 0) {
                            let lang = opts.data.language;
                            // If the street address slug isn't matching,
                            // the language is probably wrong.
                            // Try the possible address languages in order.
                            for (let address_language in address_languages) {
                                if (lang !== address_language) {
                                    lang = address_language;
                                    delete address_languages[lang];
                                    break;
                                }
                            }
                            if (opts.data.language !== lang) {
                                opts.data.language = lang;
                                p.fetch({data: opts.data});
                            } else {
                                throw new Error('Address slug not found', slug);
                            }
                        } else if (p.length === 1) {
                            position = p.pop();
                        } else if (p.length > 1) {
                            const exactMatch = p.filter(function(pos) {
                                const numberParts = numberPart.split(SEPARATOR);
                                const letter = pos.get('letter');
                                const number_end = pos.get('number_end');
                                if (numberParts.length === 1) {
                                    return (letter === null) && (number_end === null);
                                }
                                const letterMatch = () => letter && (letter.toLowerCase() === numberParts[1].toLowerCase());
                                const numberEndMatch = () => number_end && (number_end === numberParts[1]);
                                return letterMatch() || numberEndMatch();
                            });
                            if (exactMatch.length !== 1) {
                                throw new Error('Too many address matches');
                            } else {
                                position = exactMatch[0];
                            }
                        }

                        if (position != null) {
                            slug = position.slugifyAddress();
                            const newMunicipality = slug.split('/')[0];
                            if (newMunicipality !== municipality) {
                                // If the original slug was in the wrong language, run full
                                // command cycle including URL navigation to change the URL language.
                                // For example in Finland, the slug should be in Swedish if the UI is in Swedish,
                                // otherwise in Finnish (the default).
                                this.selectPosition(position).done(() => {
                                    return this.router.navigate(`address/${slug}`, {replace: true});
                                });
                            } else {
                                this.selectPosition(position);
                            }
                        }
                    } catch (err) {
                        const addressInfo =
                            {address: slug};

                        Raven.captureException(err, {extra: addressInfo});
                    }
                    if (!sm.getIeVersion() || !(sm.getIeVersion() < 10)) { this._checkLocationHash(); }
                    return deferred.resolve();
                });
            });
        }

        showAllUnits(level) {
            if (level == null) {
                ({ level } = this);
            }
            const transformedBounds = this.mapProxy.getTransformedBounds();
            const bboxes = [];
            for (let bbox of Array.from(transformedBounds)) {
                bboxes.push(`${bbox[0][0]},${bbox[0][1]},${bbox[1][0]},${bbox[1][1]}`);
            }
            return this.addUnitsWithinBoundingBoxes(bboxes, level);
        }

        renderHome(path, context) {
            let defaultLevel;
            if (!(path == null) &&
                (path !== '') &&
                (!(path instanceof Array) || !(path.length = 0))) {
                    context = path;
                }
            const level = this._getLevel(context, (defaultLevel='none'));
            this.reset();
            return sm.withDeferred(d => {
                return d.resolve({afterMapInit: () => {
                    if (level !== 'none') {
                        return this.showAllUnits(level);
                    }
                }
                });
            });
        }

        renderSearch(path, opts, cancelToken) {
            if ((opts.query != null ? opts.query.q : undefined) == null) {
                return;
            }
            const filters = {};
            for (let filter of ['municipality', 'service']) {
                const value = opts.query != null ? opts.query[filter] : undefined;
                if (value != null) {
                    filters[filter] = value;
                }
            }
            return this.search(opts.query.q, filters, cancelToken);
        }

        _matchResourceUrl(path) {
            const match = path.match(/^([0-9]+)/);
            if (match != null) {
                return match[0];
            }
        }

        _checkLocationHash() {
            const hash = window.location.hash.replace(/^#!/, '#');
            if (hash) {
                return app.vent.trigger('hashpanel:render', hash);
            }
        }

        renderUnit(path, opts, cancelToken) {
            console.assert(__guard__(cancelToken != null ? cancelToken.constructor : undefined, x => x.name) === 'CancelToken', 'wrong canceltoken parameter');
            const id = this._matchResourceUrl(path);
            if (id != null) {
                const def = $.Deferred();
                this.renderUnitById(id, true).done(unit => {
                    return def.resolve({
                        afterMapInit: () => {
                            if (appSettings.is_embedded) {
                                this.selectUnit(unit);
                            } else {
                                this.highlightUnit(unit);
                            }
                            if (!sm.getIeVersion() || !(sm.getIeVersion() < 10)) { return this._checkLocationHash(); }
                        }
                    });
                });
                return def.promise();
            }

            const { query } = opts;
            if (query != null ? query.service : undefined) {
                return renderUnitsByOldServiceId(opts.query, this, cancelToken);
            }

            if (query != null ? query.treenode : undefined) {
                const pr = this.renderUnitsByServices(opts.query.treenode, opts.query, cancelToken);
                pr.done(function(...results) {
                    if (!_.find(results, _.identity)) {
                        // There were no successful service retrievals
                        // (all results are 'false') -> display message to user.
                        return app.commands.execute('displayMessage', 'search.no_results');
                    }
                });
                return pr;
            }
        }

        _getRelativeUrl(uri) {
            return uri.toString().replace(/[a-z]+:\/\/[^/]*\//, '/');
        }
        _setQueryParameter(key, val) {
            const uri = URI(document.location.href);
            uri.setSearch(key, val);
            const url = this._getRelativeUrl(uri);
            return this.router.navigate(url);
        }
        _removeQueryParameter(key) {
            const uri = URI(document.location.href);
            uri.removeSearch(key);
            const url = this._getRelativeUrl(uri);
            return this.router.navigate(url);
        }

        addDataLayer(layer, layerId, leafletId) {
            const background = p13n.get('map_background_layer');
            if (['servicemap', 'accessible_map'].includes(background)) {
                this.dataLayers.add({
                    dataId: layerId,
                    layerName: layer,
                    leafletId
                });
            } else {
                p13n.setMapBackgroundLayer('servicemap');
            }
            this.selectedDataLayers.set(layer, layerId);
            return this._setQueryParameter(layer, layerId);
        }
        removeDataLayer(layer) {
            this.dataLayers.remove((this.dataLayers.where({
                layerName: layer})
            )
            );
            this.selectedDataLayers.unset(layer);
            return this._removeQueryParameter(layer);
        }

        displayMessage(messageId) {
            return this.informationalMessage.set('messageKey', messageId);
        }

        requestTripPlan(from, to, opts, cancelToken) {
            return this.route.requestPlan(from, to, opts, cancelToken);
        }
    });
});

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}
function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
