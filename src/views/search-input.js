/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let SearchInputView;
    const typeahead = require('typeahead.bundle');

    const models    = require('app/models');
    const jade      = require('app/jade');
    const search    = require('app/search');
    const geocoding = require('app/geocoding');
    const base      = require('app/views/base');

    return SearchInputView = (function() {
        SearchInputView = class SearchInputView extends base.SMItemView {
            static initClass() {
                this.prototype.classname = 'search-input-element';
                this.prototype.template = 'navigation-search';
                this.prototype.events = {
                    'typeahead:selected': 'autosuggestShowDetails',
                    // Important! The following ensures the click
                    // will only cause the intended typeahead selection,
                    // and doesn't affect the header state
                    'click .tt-suggestion'(e) {
                        return e.stopPropagation();
                    },
                    'click input': '_onInputClicked',
                    'click .typeahead-suggestion.fulltext': 'executeQuery',
                    'click .action-button.search-button': 'search',
                    'submit .input-container': 'search',
                    'input input': 'adaptToQuery',
                    'focus input': 'expand'
                };
            }
            initialize({model, searchResults, expandCallback}) {
                this.model = model;
                this.searchResults = searchResults;
                this.expandCallback = expandCallback;
                return this.listenTo(this.searchResults, 'ready', this.adaptToQuery);
            }
            adaptToQuery(model, value, opts) {
                const $container = this.$el.find('.action-button');
                const $icon = $container.find('span');
                if (this.isEmpty() || (this.getInputText() === this.searchResults.query)) {
                    $icon.removeClass('icon-icon-forward-bold');
                    $icon.addClass('icon-icon-close');
                    $container.removeClass('search-button');
                    return $container.addClass('close-button');
                } else {
                    $icon.addClass('icon-icon-forward-bold');
                    $icon.removeClass('icon-icon-close');
                    $container.removeClass('close-button');
                    return $container.addClass('search-button');
                }
            }

            search(e) {
                e.stopPropagation();
                e.preventDefault();
                if (this.isEmpty()) {
                    return;
                }
                this.$searchEl.typeahead('close');
                return this.executeQuery();
            }

            expand(e) {
                return this.expandCallback();
            }

            isEmpty() {
                const query = this.getInputText();
                if ((query != null) && (query.length > 0)) {
                    return false;
                }
                return true;
            }
            _onInputClicked(ev) {
                this.trigger('open');
                return ev.stopPropagation();
            }
            _getSearchEl() {
                if (this.$searchEl != null) {
                    return this.$searchEl;
                } else {
                    return this.$searchEl = this.$el.find('input.form-control[type=search]');
                }
            }
            setInputText(query) {
                const $el = this._getSearchEl();
                if ($el.length) {
                    return $el.typeahead('val', query);
                }
            }
            getInputText() {
                const $el = this._getSearchEl();
                if ($el.length) {
                    return $el.typeahead('val');
                } else {
                    return null;
                }
            }
            onDomRefresh() {
                this.enableTypeahead('input.form-control[type=search]');
                this.setTypeaheadWidth();
                return $(window).resize(() => this.setTypeaheadWidth());
            }
            setTypeaheadWidth() {
                const windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                if (windowWidth < appSettings.mobile_ui_breakpoint) {
                    const width = $('#navigation-header').width();
                    return this.$el.find('.tt-dropdown-menu').css({'width': width});
                } else {
                    return this.$el.find('.tt-dropdown-menu').css({'width': 'auto'});
                }
            }
            enableTypeahead(selector) {
                this.$searchEl = this.$el.find(selector);
                const serviceDataset = {
                    name: 'service',
                    source: search.servicemapEngine.ttAdapter(),
                    displayKey(c) { return c.name[p13n.getLanguage()]; },
                    templates: {
                        suggestion(ctx) { return jade.template('typeahead-suggestion', ctx); }
                    }
                };
                const eventDataset = {
                    name: 'event',
                    source: search.linkedeventsEngine.ttAdapter(),
                    displayKey(c) { return c.name[p13n.getLanguage()]; },
                    templates: {
                        suggestion(ctx) { return jade.template('typeahead-suggestion', ctx); }
                    }
                };


                // A hack needed to ensure the header is always rendered.
                const fullDataset = {
                    name: 'header',
                    // Source has to return non-empty list
                    source(q, c) { return c([{query: q, object_type: 'query'}]); },
                    displayKey(s) { return s.query; },
                    name: 'full',
                    templates: {
                        suggestion(s) { return jade.template('typeahead-fulltext', s); }
                    }
                };

                this.geocoderBackend = new geocoding.GeocoderSourceBackend();
                this.$searchEl.typeahead({hint: false}, [
                    fullDataset,
                    this.geocoderBackend.getDatasetOptions(),
                    serviceDataset,
                    eventDataset]);
                return this.geocoderBackend.setOptions({
                    $inputEl: this.$searchEl,
                    selectionCallback(ev, data) {
                        return app.request('selectPosition', data);
                    }
                });
            }
            getQuery() {
                return $.trim(this.$searchEl.val());
            }
            executeQuery() {
                this.geocoderBackend.street = null;
                this.$searchEl.typeahead('close');
                return app.request('search', this.getInputText(), {});
            }
            autosuggestShowDetails(ev, data, _) {
                // Remove focus from the search box to hide keyboards on touch devices.
                // TODO: re-enable in a compatible way
                //$('.search-container input').blur()
                let model = null;
                const objectType = data.object_type;
                if (objectType === 'address') {
                    return;
                }
                this.$searchEl.typeahead('val', '');
                app.request('clearSearchResults', {navigate: false});
                $('.search-container input').val('');
                this.$searchEl.typeahead('close');
                switch (objectType) {
                    case 'unit':
                        model = new models.Unit(data);
                        return app.request('selectUnit', model, {replace: true});
                    case 'ontologytreenode':
                        return app.request('addService',
                            new models.Service(data), {}); // TODO take municipalityids into account
                    case 'event':
                        return app.request('selectEvent',
                            new models.Event(data));
                    case 'query':
                        return app.request('search', data.query, {});
                }
            }
        };
        SearchInputView.initClass();
        return SearchInputView;
    })();});
