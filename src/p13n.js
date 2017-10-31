/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// Personalization support code
define(function(require) {
    const module   = require('module');
    const _        = require('underscore');
    const Backbone = require('backbone');
    const i18n     = require('i18next');
    const moment   = require('moment');

    // Moment languages. Imported variables
    // unused, but imports must not be removed.
    const _fi      = require('moment/fi');
    const _sv      = require('moment/sv');
    const _gb      = require('moment/en-gb');

    const models   = require('app/models');
    const dataviz  = require('app/data-visualization');

    const makeMomentLang = function(lang) {
        if (lang === 'en') {
            return 'en-gb';
        }
        return lang;
    };

    const SUPPORTED_LANGUAGES = appSettings.supported_languages;
    const LOCALSTORAGE_KEY = 'servicemap_p13n';
    const CURRENT_VERSION = 2;
    const LANGUAGE_NAMES = {
        fi: 'suomi',
        sv: 'svenska',
        en: 'English'
    };
    const HEATMAP_LAYERS = dataviz.getHeatmapLayers();

    const statistics_layers = dataviz.getStatisticsLayers().map(layer => `current.${layer}`);
    const forecast_layers = dataviz.getForecastsLayers().map(layer => `forecast.${layer}`);
    const STATISTICS_LAYERS = [...Array.from(statistics_layers), ...Array.from(forecast_layers)];

    const ACCESSIBILITY_GROUPS = {
        senses: ['hearing_aid', 'visually_impaired', 'colour_blind'],
        mobility: ['wheelchair', 'reduced_mobility', 'rollator', 'stroller'],
    };

    const ALLOWED_VALUES = {
        accessibility: {
            mobility: [null, 'wheelchair', 'reduced_mobility', 'rollator', 'stroller']
        },
        transport: ['by_foot', 'bicycle', 'public_transport', 'car'],
        transport_detailed_choices: {
            public: ['bus', 'tram', 'metro', 'train', 'ferry'],
            bicycle: ['bicycle_parked', 'bicycle_with']
        },
        language: SUPPORTED_LANGUAGES,
        map_background_layer: ['servicemap', 'ortographic', 'guidemap', 'accessible_map'],
        heatmap_layer: [null, ...Array.from(HEATMAP_LAYERS)],
        statistics_layer: [null, ...Array.from(STATISTICS_LAYERS)],
        city: [null, 'helsinki', 'espoo', 'vantaa', 'kauniainen']
    };

    const PROFILE_IDS = {
        'wheelchair': 1,
        'reduced_mobility': 2,
        'rollator': 3,
        'stroller': 4,
        'visually_impaired': 5,
        'hearing_aid': 6
    };

    // When adding a new personalization attribute, you must fill in a
    // sensible default.
    const DEFAULTS = {
        language: appSettings.default_language,
        first_visit: true,
        skip_tour: false,
        hide_tour: false,
        location_requested: false,
        map_background_layer: 'servicemap',
        accessibility: {
            hearing_aid: false,
            visually_impaired: false,
            colour_blind: false,
            mobility: null
        },
        city: {
            helsinki: false,
            espoo: false,
            vantaa: false,
            kauniainen: false
        },
        transport: {
            by_foot: false,
            bicycle: false,
            public_transport: true,
            car: false
        },
        transport_detailed_choices: {
            public: {
                bus: true,
                tram: true,
                metro: true,
                train: true,
                ferry: true
            },
            bicycle: {
                bicycle_parked: true,
                bicycle_with: false
            }
        },
        heatmap_layer: null,
        statistics_layer: null
    };

    const migrateCityFromV1ToV2 = function(source) {
        const { city } = source;
        source.city = _.clone(DEFAULTS.city);
        if (!city in source.city) {
            return;
        }
        return source.city[city] = true;
    };

    var deepExtend = (target, source, allowedValues) =>
        (() => {
            const result = [];
            for (let prop in target) {
                if (!(prop in source)) {
                    continue;
                }
                if ((prop === 'city') && ((typeof source.city === 'string') || (source.city === null))) {
                    migrateCityFromV1ToV2(source);
                }

                const sourceIsObject = !!source[prop] && (typeof source[prop] === 'object');
                const targetIsObject = !!target[prop] && (typeof target[prop] === 'object');
                if (targetIsObject !== sourceIsObject) {
                    console.error(`Value mismatch for ${prop}: ${typeof source[prop]} vs. ${typeof target[prop]}`);
                    continue;
                }

                if (targetIsObject) {
                    deepExtend(target[prop], source[prop], allowedValues[prop] || {});
                    continue;
                }
                if (prop in allowedValues) {
                    if (!Array.from(allowedValues[prop]).includes(target[prop])) {
                        console.error(`Invalid value for ${prop}: ${target[prop]}`);
                        continue;
                    }
                }
                result.push(target[prop] = source[prop]);
            }
            return result;
        })()
    ;

    class ServiceMapPersonalization {
        constructor() {
            this.testLocalStorageEnabled = this.testLocalStorageEnabled.bind(this);
            this._handleLocation = this._handleLocation.bind(this);
            this._handleLocationError = this._handleLocationError.bind(this);
            _.extend(this, Backbone.Events);

            this.attributes = _.clone(DEFAULTS);
            // FIXME: Autodetect language? Browser capabilities?
            if (module.config().localStorageEnabled === false) {
                this.localStorageEnabled = false;
            } else {
                this.localStorageEnabled = this.testLocalStorageEnabled();
            }
            this._fetch();

            this.deferred = i18n.init({
                lng: this.getLanguage(),
                resGetPath: appSettings.static_path + 'locales/__lng__.json',
                fallbackLng: []});

            //TODO: This should be moved to a more appropriate place (and made nicer)
            i18n.addPostProcessor("fixFinnishStreetNames", function(value, key, options) {
                const REPLACEMENTS = { "_allatiivi_": [
                    [/katu$/, "kadulle"],
                    [/polku$/, "polulle"],
                    [/ranta$/, "rannalle"],
                    [/ramppia$/, "rampille"],
                    [/$/, "lle"]
                ],
                "_partitiivi_": [
                    [/tie$/, "tietä"],
                    [/Kehä I/, "Kehä I:tä"],
                    [/Kehä III/, "Kehä III:a"],
                    [/ä$/, "ää"],
                    [/$/, "a"]
                ]
            };
                for (let grammaticalCase in REPLACEMENTS) {
                    const rules = REPLACEMENTS[grammaticalCase];
                    if (value.indexOf(grammaticalCase) > -1) {
                        for (let replacement of Array.from(rules)) {
                            if (options.street.match(replacement[0])) {
                                options.street = options.street.replace(replacement[0], replacement[1]);
                                return value.replace(grammaticalCase, options.street);
                            }
                        }
                    }
                }
            });

            moment.locale(makeMomentLang(this.getLanguage()));
            // debugging: make i18n available from JS console
            window.i18nDebug = i18n;
        }

        testLocalStorageEnabled() {
            const val = '_test';
            try {
                localStorage.setItem(val, val);
                localStorage.removeItem(val);
                return true;
            } catch (e) {
                return false;
            }
        }

        _handleLocation(pos, positionObject) {
            if (pos.coords.accuracy > 10000) {
                this.trigger('position_error');
                return;
            }
            if (positionObject == null) {
                positionObject = new models.CoordinatePosition({isDetected: true});
            }
            const cb = () => {
                const coords = pos['coords'];
                positionObject.set('location',
                    {coordinates: [coords.longitude, coords.latitude]});
                positionObject.set('accuracy', pos.coords.accuracy);
                this.lastPosition = positionObject;
                this.trigger('position', positionObject);
                if (!this.get('location_requested')) {
                    return this.set('location_requested', true);
                }
            };
            if (appSettings.user_location_delayed) {
                return setTimeout(cb, 3000);
            } else {
                return cb();
            }
        }

        _handleLocationError(error) {
            this.trigger('position_error');
            return this.set('location_requested', false);
        }

        setVisited() {
            return this._setValue(['first_visit'], false);
        }

        getLastPosition() {
            return this.lastPosition;
        }

        getLocationRequested() {
            return this.get('location_requested');
        }

        _setValue(path, val) {
            const pathStr = path.join('.');
            let vars = this.attributes;
            let allowed = ALLOWED_VALUES;
            const dirs = path.slice(0);
            const propName = dirs.pop();
            for (let name of Array.from(dirs)) {
                if (!(name in vars)) {
                    throw new Error(`Attempting to set invalid variable name: ${pathStr}`);
                }
                vars = vars[name];
                if (!allowed) {
                    continue;
                }
                if (!(name in allowed)) {
                    allowed = null;
                    continue;
                }
                allowed = allowed[name];
            }

            if (allowed && propName in allowed) {
                if (!Array.from(allowed[propName]).includes(val)) {
                    throw new Error(`Invalid value for ${pathStr}: ${val}`);
                }
            } else if (typeof val !== 'boolean') {
                throw new Error(`Invalid value for ${pathStr}: ${val} (should be boolean)`);
            }

            const oldVal = vars[propName];
            if (oldVal === val) {
                return;
            }
            vars[propName] = val;

            // save changes
            this._save();
            // notify listeners
            this.trigger('change', path, val);
            if (path[0] === 'accessibility') {
                this.trigger('accessibility-change');
            }
            return val;
        }

        toggleMobility(val) {
            const oldVal = this.getAccessibilityMode('mobility');
            if (val === oldVal) {
                return this._setValue(['accessibility', 'mobility'], null);
            } else {
                return this._setValue(['accessibility', 'mobility'], val);
            }
        }
        toggleAccessibilityMode(modeName) {
            const oldVal = this.getAccessibilityMode(modeName);
            return this._setValue(['accessibility', modeName], !oldVal);
        }
        setAccessibilityMode(modeName, val) {
            return this._setValue(['accessibility', modeName], val);
        }
        getAccessibilityMode(modeName) {
            const accVars = this.get('accessibility');
            if (!modeName in accVars) {
                throw new Error(`Attempting to get invalid accessibility mode: ${modeName}`);
            }
            return accVars[modeName];
        }
        toggleCity(val) {
            const oldVal = this.get('city');
            return this._setValue(['city', val], !oldVal[val]);
        }
        setCities(cities) {
            const oldVal = this.get('city');
            for (let key in oldVal) {
                const enabled = (Array.from(cities).includes(key)) || false;
                this._setValue(['city', key], enabled);
            }
            return oldVal;
        }

        getAllAccessibilityProfileIds() {
            const rawIds = _.invert(PROFILE_IDS);
            const ids = {};
            for (var rid in rawIds) {
                const name = rawIds[rid];
                const suffixes = (() => { switch (false) {
                    case !_.contains(["1", "2", "3"], rid): return ['A', 'B', 'C'];
                    case !_.contains(["4", "6"], rid): return ['A'];
                    case "5" !== rid: return ['A', 'B'];
                } })();
                for (let s of Array.from(suffixes)) {
                    ids[rid + s] = name;
                }
            }
            return ids;
        }

        getAccessibilityProfileIds(filterTransit) {
            // filterTransit: if true, only return profiles which
            // affect transit routing.
            const ids = {};
            const accVars = this.get('accessibility');
            const transport = this.get('transport');
            const mobility = accVars['mobility'];
            let key = PROFILE_IDS[mobility];
            if (key) {
                if ([1, 2, 3, 5].includes(key)) {
                    key += transport.car ? 'B' : 'A';
                } else {
                    key += 'A';
                }
                ids[key] = mobility;
            }
            const disabilities = ['visually_impaired'];
            if (!filterTransit) {
                disabilities.push('hearing_aid');
            }
            for (let disability of Array.from(disabilities)) {
                const val = this.getAccessibilityMode(disability);
                if (val) {
                    key = PROFILE_IDS[disability];
                    if (disability === 'visually_impaired') {
                        key += transport.car ? 'B' : 'A';
                    } else {
                        key += 'A';
                    }
                    ids[key] = disability;
                }
            }
            return ids;
        }

        hasAccessibilityIssues() {
            const ids = this.getAccessibilityProfileIds();
            return _.size(ids) > 0;
        }

        setTransport(modeName, val) {
            let m;
            const modes = this.get('transport');
            if (val) {
                if (modeName === 'by_foot') {
                    for (m in modes) {
                        modes[m] = false;
                    }
                } else if (['car', 'bicycle'].includes(modeName)) {
                    for (m in modes) {
                        if (m === 'public_transport') {
                            continue;
                        }
                        modes[m] = false;
                    }
                } else if (modeName === 'public_transport') {
                    modes.by_foot = false;
                }
            } else {
                let otherActive = false;
                for (m in modes) {
                    if (m === modeName) {
                        continue;
                    }
                    if (modes[m]) {
                        otherActive = true;
                        break;
                    }
                }
                if (!otherActive) {
                    return;
                }
            }

            return this._setValue(['transport', modeName], val);
        }

        getTransport(modeName) {
            const modes = this.get('transport');
            if (!modeName in modes) {
                throw new Error(`Attempting to get invalid transport mode: ${modeName}`);
            }
            return modes[modeName];
        }

        toggleTransport(modeName) {
            const oldVal = this.getTransport(modeName);
            return this.setTransport(modeName, !oldVal);
        }

        toggleTransportDetails(group, modeName) {
            const oldVal = this.get('transport_detailed_choices')[group][modeName];
            if (!oldVal) {
                if (modeName === 'bicycle_parked') {
                    this.get('transport_detailed_choices')[group].bicycle_with = false;
                }
                if (modeName === 'bicycle_with') {
                    this.get('transport_detailed_choices')[group].bicycle_parked = false;
                }
            }
            return this._setValue(['transport_detailed_choices', group, modeName], !oldVal);
        }

        requestLocation(positionModel) {
            if (appSettings.user_location_override) {
                const override = appSettings.user_location_override;
                const coords = {
                    latitude: override[0],
                    longitude: override[1],
                    accuracy: 10
                };
                this._handleLocation({coords});
                return;
            }

            if (!('geolocation' in navigator)) {
                return;
            }
            const posOpts = {
                enableHighAccuracy: false,
                timeout: 30000
            };
            return navigator.geolocation.getCurrentPosition((pos => this._handleLocation(pos, positionModel)),
                this._handleLocationError, posOpts);
        }

        set(attr, val) {
            if (!attr in this.attributes) {
                throw new Error(`attempting to set invalid attribute: ${attr}`);
            }
            this.attributes[attr] = val;
            this.trigger('change', attr, val);
            return this._save();
        }

        get(attr) {
            if (!attr in this.attributes) {
                return undefined;
            }
            return this.attributes[attr];
        }

        _verifyValidState() {
            const transportModesCount = _.filter(this.get('transport'), _.identity).length;
            if (transportModesCount === 0) {
                return this.setTransport('public_transport', true);
            }
        }

        _fetch() {
            if (!this.localStorageEnabled) {
                return;
            }

            const str = localStorage.getItem(LOCALSTORAGE_KEY);
            if (!str) {
                return;
            }

            const storedAttrs = JSON.parse(str);
            deepExtend(this.attributes, storedAttrs, ALLOWED_VALUES);
            return this._verifyValidState();
        }

        _save() {
            if (!this.localStorageEnabled) {
                return;
            }

            const data = _.extend(this.attributes, {version: CURRENT_VERSION});
            const str = JSON.stringify(data);
            return localStorage.setItem(LOCALSTORAGE_KEY, str);
        }

        getProfileElement(name) {
            return {
                icon: `icon-icon-${name.replace('_', '-')}`,
                text: i18n.t(`personalisation.${name}`)
            };
        }

        getProfileElements(profiles) {
            return _.map(profiles, this.getProfileElement);
        }

        getLanguage() {
            return appSettings.default_language;
        }

        getTranslatedAttr(attr) {
            if (!attr) {
                return attr;
            }

            if (!attr instanceof Object) {
                console.error("translated attribute didn't get a translation object", attr);
                return attr;
            }

            // Try primary choice first, fallback to whatever's available.
            const languages = [this.getLanguage()].concat(SUPPORTED_LANGUAGES);
            for (let lang of Array.from(languages)) {
                if (lang in attr) {
                    return attr[lang];
                }
            }

            console.error("no supported languages found", attr);
            return null;
        }

        getCity() {
            const cities = this.get('city');
            for (let city in cities) {
                const value = cities[city];
                if (value) {
                    return city;
                }
            }
        }
        getCities() {
            const cities = this.get('city');
            const ret = [];
            for (let city in cities) {
                const value = cities[city];
                if (value) {
                    ret.push(city);
                }
            }
            return ret;
        }

        getSupportedLanguages() {
            return _.map(SUPPORTED_LANGUAGES, l =>
                ({
                    code: l,
                    name: LANGUAGE_NAMES[l]
                })
        );
        }

        getHumanizedDate(time) {
            let humanize, s;
            const m = moment(time);
            const now = moment();
            const sod = now.startOf('day');
            const diff = m.diff(sod, 'days', true);
            if ((diff < -6) || (diff >= 7)) {
                humanize = false;
            } else {
                humanize = true;
            }
            if (humanize) {
                s = m.calendar();
                s = s.replace(/( (klo|at))* \d{1,2}[:.]\d{1,2}$/, '');
            } else {
                let format;
                if (now.year() !== m.year()) {
                    format = 'L';
                } else {
                    format = (() => { switch (this.getLanguage()) {
                        case 'fi': return 'Do MMMM[ta]';
                        case 'en': return 'D MMMM';
                        case 'sv': return 'D MMMM';
                    } })();
                }
                s = m.format(format);
            }
            return s;
        }

        setMapBackgroundLayer(layerName) {
            return this._setValue(['map_background_layer'], layerName);
        }

        getMapBackgroundLayers() {
            let a;
            return a =_(ALLOWED_VALUES.map_background_layer)
                .chain()
                .union(['accessible_map'])
                .map(layerName => {
                    return {
                        name: layerName,
                        selected: this.get('map_background_layer') === layerName
                    };
            }).value();
        }
        toggleDataLayer(layer, layerName) {
            if (layerName === 'null') {
                layerName = null;
            }
            return this._setValue([layer], layerName);
        }

        getHeatmapLayers() {
            const layers = [];
            ALLOWED_VALUES.heatmap_layer.map(layerName => {
                layers.push({name: layerName});
            });
            return layers;
        }

        getStatisticsLayers() {
            const layers = [];
            ALLOWED_VALUES.statistics_layer.map(layerName => {
                layers.push({name: layerName});
            });
            return layers;
        }
    }

    // Make it a globally accessible variable for convenience
    window.p13n = new ServiceMapPersonalization;
    return window.p13n;
});
