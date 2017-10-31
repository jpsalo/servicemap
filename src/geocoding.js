/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let GeocoderSourceBackend, typeahead;
    const _typeahead = require('typeahead.bundle');
    const Backbone   = require('backbone');

    const sm         = require('app/base');
    const p13n       = require('app/p13n');
    const settings   = require('app/settings');
    const jade       = require('app/jade');
    const models     = require('app/models');

    const monkeyPatchTypeahead = $element => {
        typeahead = $element.data('ttTypeahead');
        const proto = Object.getPrototypeOf(typeahead);
        const originalSelect = proto._select;
        proto._select = function(datum) {
            this.input.setQuery(datum.value);
            this.input.setInputValue(datum.value, true);
            this._setLanguageDirection();
            return this.eventBus.trigger('selected', datum.raw, datum.datasetName);
        };
            // REMOVED CODE WHICH CLOSES THE DROPDOWN
        return proto.closeCompletely = function() {
            this.destroy();
            return _.defer(_.bind(this.dropdown.empty, this.dropdown));
        };
    };

    return {
        GeocoderSourceBackend: (GeocoderSourceBackend = class GeocoderSourceBackend {
            constructor(options) {
                this.setStreet = this.setStreet.bind(this);
                this.addressSource = this.addressSource.bind(this);
                this.getSource = this.getSource.bind(this);
                this.getDatasetOptions = this.getDatasetOptions.bind(this);
                this.options = options;
                _.extend(this, Backbone.Events);
                this.street = undefined;
                const geocoderStreetEngine = this._createGeocoderStreetEngine(p13n.getLanguage());
                this.geocoderStreetSource = geocoderStreetEngine.ttAdapter();
            }
            setOptions(options) {
                this.options = options;
                this.options.$inputEl.on('typeahead:selected', _.bind(this.typeaheadSelected, this));
                this.options.$inputEl.on('typeahead:autocompleted', _.bind(this.typeaheadSelected, this));
                return monkeyPatchTypeahead(this.options.$inputEl);
            }

            _createGeocoderStreetEngine(lang) {
                const e = new Bloodhound({
                    name: 'street_suggestions',
                    remote: {
                        url: appSettings.service_map_backend + "/street/?page_size=4",
                        replace: (url, query) => {
                            url += `&input=${query}`;
                            url += `&language=${lang !== 'sv' ? 'fi' : lang}`;
                            return url;
                        },
                        ajax: settings.applyAjaxDefaults({}),
                        filter: parsedResponse => {
                            const results = new models.StreetList(parsedResponse.results);
                            if (results.length === 1) {
                                this.setStreet(results.first());
                            }
                            return results.toArray();
                        },
                        rateLimitWait: 50
                    },
                    datumTokenizer(datum) {
                        return Bloodhound.tokenizers.whitespace(datum.name[lang]);
                    },
                    queryTokenizer: s => {
                        let res;
                        return res = [s];
                    }});
                e.initialize();
                return e;
            }

            typeaheadSelected(ev, data) {
                const objectType = data.object_type;
                if (objectType === 'address') {
                    if (data instanceof models.Position) {
                        this.options.$inputEl.typeahead('close');
                        return this.options.selectionCallback(ev, data);
                    } else {
                        return this.setStreet(data).done(() => {
                            // To support IE on typeahead < v11, we need to call internal API
                            // because typeahead listens to different events on IE compared to
                            // web browsers.
                            const typeaheadInput = this.options.$inputEl.data('ttTypeahead').input;
                            return typeaheadInput.setInputValue(this.options.$inputEl.val() + ' ');
                        });
                    }
                } else {
                    return this.setStreet(null);
                }
            }

            streetSelected() {
                if (this.street == null) {
                    return;
                }
                return _.defer(() => {
                    const streetName = p13n.getTranslatedAttr(this.street.name);
                    this.options.$inputEl.typeahead('val', '');
                    this.options.$inputEl.typeahead('val', streetName + ' ');
                    return this.options.$inputEl.trigger('input');
                });
            }

            setStreet(street) {
                return sm.withDeferred(deferred => {
                    if (street == null) {
                        this.street = undefined;
                        deferred.resolve();
                        return;
                    }
                    if (street.get('id') === (this.street != null ? this.street.get('id') : undefined)) {
                        deferred.resolve();
                        return;
                    }
                    this.street = street;
                    this.street.translatedName = (
                        this.street.get('name')[p13n.getLanguage()] || this.street.get('name').fi
                    ).toLowerCase();
                    this.street.addresses = new models.AddressList([], {pageSize: 200});
                    this.street.addresses.comparator = x => {
                        return parseInt(x.get('number'));
                    };
                    this.street.addressesFetched = false;
                    return this.street.addresses.fetch({
                        data: {
                            street: this.street.get('id')
                        },
                        success: () => {
                            if (this.street != null) {
                                this.street.addressesFetched = true;
                            }
                            return deferred.resolve();
                        }
                    });
                });
            }

            addressSource(query, callback) {
                // escape parentheses for regexp
                const streetName = this.street.translatedName
                    .replace(/([()])/g, '\\$1');
                const re = new RegExp(`^\\s*${streetName}(\\s+\\d.*)?`, 'i');
                const matches = query.match(re);
                if (matches != null) {
                    let [q, numberPart] = Array.from(matches);
                    // TODO: automatically make this search on focus
                    if (numberPart == null) {
                        numberPart = '';
                    }
                    numberPart = numberPart.replace(/\s+/g, '').replace(/[^0-9]+/g, '');
                    const done = () => {
                        if (this.street == null) {
                            callback([]);
                            return;
                        }
                        if (this.street.addresses.length === 1) {
                            callback(this.street.addresses.toArray());
                            return;
                        }
                        const filtered = this.street.addresses
                            .filter(a => {
                                return a.humanNumber().indexOf(numberPart) === 0;
                        });
                        const results = filtered.slice(0, 2);
                        const last = _(filtered).last();
                        if (!Array.from(results).includes(last)) {
                            if (last != null) {
                                results.push(last);
                            }
                        }
                        return callback(results);
                    };
                    if (this.street.addressesFetched) {
                        return done();
                    } else {
                        return this.listenToOnce(this.street.addresses, 'sync', () => {
                            return done();
                        });
                    }
                }
            }

            getSource() {
                return (query, cb) => {
                    if ((this.street != null) && (this.street.translatedName.length <= query.length)) {
                        return this.addressSource(query, cb);
                    } else {
                        return this.geocoderStreetSource(query, cb);
                    }
                };
            }

            getDatasetOptions() {
                return {
                    name: 'address',
                    displayKey(c) {
                        if (c instanceof models.Position) {
                            return c.humanAddress();
                        } else if (c instanceof models.Street) {
                            return c.getText('name');
                        } else {
                            return c;
                        }
                    },
                    source: this.getSource(),
                    templates: {
                        suggestion: c => {
                            if (c instanceof models.Position) {
                                c.set('street', this.street);
                            }
                            c.address = c.humanAddress();
                            c.object_type = 'address';
                            return jade.template('typeahead-suggestion', c);
                        }
                    }
                };
            }
        })
    };
});

