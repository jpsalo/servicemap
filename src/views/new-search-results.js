/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {

    const _                  = require('underscore');
    const i18n               = require('i18next');
    const Backbone           = require('backbone');

    const models             = require('app/models');
    const base               = require('app/views/base');
    const RadiusControlsView = require('app/views/radius');
    const SMSpinner          = require('app/spinner');

    const RESULT_TYPES = {
        unit: models.UnitList,
        ontologytreenode: models.ServiceList,
        // event: models.EventList
        address: models.PositionList
    };

    const EXPAND_CUTOFF = 3;
    const PAGE_SIZE = 20;

    const isElementInViewport = function(el) {
        if ((typeof jQuery === 'function') && el instanceof jQuery) {
            el = el[0];
        }
        const rect = el.getBoundingClientRect();
        return rect.bottom <= ((window.innerHeight || document.documentElement.clientHeight) + (el.offsetHeight * 0.5));
    };

    class LocationPromptView extends base.SMItemView {
        static initClass() {
            this.prototype.tagName = 'ul';
            this.prototype.className = 'main-list';
        }
        render() {
            this.$el.html(`<li id='search-unavailable-location-info'></li>`);
            return this;
        }
    }
    LocationPromptView.initClass();

    class SearchResultView extends base.SMItemView {
        static initClass() {
            this.prototype.template = 'search-result';
            this.prototype.tagName = 'li';
        }
        events() {
            const keyhandler = this.keyboardHandler(this.selectResult, ['enter']);
            return {
                'click': 'selectResult',
                'keydown': keyhandler,
                'focus': 'highlightResult',
                'mouseenter': 'highlightResult'
            };
        }
        initialize(opts) {
            this.order = opts.order;
            return this.selectedServices = opts.selectedServices;
        }
        selectResult(ev) {
            const object_type = this.model.get('object_type') || 'unit';
            switch (object_type) {
                case 'unit':
                    return app.request('selectUnit', this.model, {overwrite: true});
                case 'ontologytreenode':
                    return app.request('addService', this.model, {});
                case 'address':
                    return app.request('selectPosition', this.model);
            }
        }

        highlightResult(ev) {
            return app.request('highlightUnit', this.model);
        }

        serializeData() {
            const data = super.serializeData();
            // the selected services must be passed on to the model so we get proper specifier
            data.specifier_text = this.model.getSpecifierText(this.selectedServices);
            switch (this.order) {
                case 'distance':
                    var fn = this.model.getDistanceToLastPosition;
                    if (fn != null) {
                        data.distance = fn.apply(this.model);
                    }
                    break;
                case 'accessibility':
                    fn = this.model.getShortcomingCount;
                    if (fn != null) {
                        data.shortcomings = fn.apply(this.model);
                    }
                    break;
            }
            if (this.model.get('object_type') === 'address') {
                data.name = this.model.humanAddress({exclude: {municipality: true}});
            }
            return data;
        }
    }
    SearchResultView.initClass();

    class SearchResultsCompositeView extends base.SMCompositeView {
        static initClass() {
            this.prototype.template = 'new-search-results';
            this.prototype.childView = SearchResultView;
            this.prototype.childViewContainer = '.search-result-list';
            this.prototype.events = {
                'click .sort-item': 'setComparatorKeyOnClick',
                'click .collapse-button': 'toggleCollapse'
            };
            this.prototype.triggers =
                {'click .back-button': 'user:close'};
        }
        childViewOptions() {
            return {
                order: (this.fullCollection != null ? this.fullCollection.getComparatorKey() : undefined),
                selectedServices: this.selectedServices
            };
        }
        initialize({model, collection, fullCollection, selectedServices}) {
            this.model = model;
            this.collection = collection;
            this.fullCollection = fullCollection;
            this.selectedServices = selectedServices;
            this.expansion = 0;
            if (this.collection.length === 0) { this.nextPage(); }
            this.listenTo(p13n, 'accessibility-change', () => {
                const key = this.fullCollection.getComparatorKey();
                if (p13n.hasAccessibilityIssues()) {
                    this.setComparatorKey('accessibility');
                } else if (key === 'accessibility') {
                    this.setComparatorKey(null);
                }
                this.fullCollection.sort();
                return this.render();
            });
            return this.listenTo(this.fullCollection, 'finished', () => {
                this.expansion = 0;
                return this.nextPage();
            });
        }
        onDomRefresh() {
            return this.$more = $(this.el).find('.show-more');
        }
        toggleCollapse() {
            this.collapsed = !this.collapsed;
            if (this.collapsed) {
                this.$el.find('.result-contents').hide();
                return this.$el.find('.show-prompt').hide();
            } else {
                this.$el.find('.result-contents').show();
                return this.$el.find('.show-prompt').show();
            }
        }
        onScroll() {
            if (!(this.$more != null ? this.$more.length : undefined)) { return; }
            if (isElementInViewport(this.$more)) {
                this.$more.find('.text-content').html(i18n.t('accessibility.pending'));
                const spinner = new SMSpinner({
                    container: this.$more.find('.spinner-container').get(0),
                    radius: 5,
                    length: 3,
                    lines: 12,
                    width: 2
                });
                spinner.start();
                return this.nextPage();
            }
        }
        setComparatorKeyOnClick(ev) {
            return this.setComparatorKey($(ev.currentTarget).data('sort-key'));
        }
        setComparatorKey(key) {
            this.renderLocationPrompt = false;
            if (key === null) {
                key = this.fullCollection.setDefaultComparator();
            }
            const executeComparator = () => {
                this.collection.reset([], {silent: true});
                this.fullCollection.reSort(key);
                this.expansion = 0;
                this.nextPage();
                return this.render();
            };
            if (key === 'distance') {
                if (p13n.getLastPosition() == null) {
                    this.renderLocationPrompt = true;
                    this.listenTo(p13n, 'position', () => {
                        this.renderLocationPrompt = false;
                        return executeComparator();
                    });
                    this.listenTo(p13n, 'position_error', () => {
                        return this.renderLocationPrompt = false;
                    });
                    this.render();
                    p13n.requestLocation();
                    return;
                }
            }
            return executeComparator();
        }
        serializeData() {
            if (this.hidden || (this.collection == null)) {
                return {hidden: true};
            }
            let data = super.serializeData();
            if (this.collection.length) {
                const crumb = (() => { switch (data.collectionType) {
                    case 'search':
                        return i18n.t('sidebar.search_results');
                    case 'radius':
                        if (data.position != null) {
                            return data.position.humanAddress();
                        }
                        break;
                } })();
                data = {
                    collapsed: this.collapsed || false,
                    comparatorKeys: (this.fullCollection != null ? this.fullCollection.getComparatorKeys() : undefined),
                    comparatorKey: (this.fullCollection != null ? this.fullCollection.getComparatorKey() : undefined),
                    target: data.resultType,
                    expanded: this.collection.length > EXPAND_CUTOFF,
                    locationPrompt: this.renderLocationPrompt ? i18n.t('search.location_info') : null,
                    showMore: false,
                    onlyResultType: this.onlyResultType,
                    crumb,
                    header: i18n.t(`search.type.${data.resultType}.count`, {count: data.count}),
                    showAll: i18n.t(`search.type.${data.resultType}.show_all`,
                        {count: this.collection.length})
                };
            }
            if (((this.fullCollection != null ? this.fullCollection.length : undefined) > this.expansion) && !this.renderLocationPrompt) {
                data.showMore = true;
            }
            return data;
        }
        nextPage() {
            if (this.expansion > this.fullCollection.length) {
                this.render();
                return;
            }
            this.collection.add(this.fullCollection.slice(this.expansion, this.expansion + PAGE_SIZE));
            window.c = this.collection;
            return this.expansion = this.expansion + PAGE_SIZE;
        }
    }
    SearchResultsCompositeView.initClass();

    class MoreButton extends base.SMItemView {
        static initClass() {
            this.prototype.tagName = 'a';
            this.prototype.className = 'show-prompt show-all';
            this.prototype.attributes = {href: '#!'};
            this.prototype.triggers = {'click': 'show-all'};
        }
        getTemplate() { return ({type, count}) => {
            return i18n.t(`search.type.${type}.show_all`, {count});
        }; }
    }
    MoreButton.initClass();

    class UnitListingView extends base.SMLayout {
        static initClass() {
            this.prototype.template = 'unit-list';
            this.prototype.className = 'search-results navigation-element limit-max-height';
            this.prototype.events = {'scroll': 'onScroll'};
            this.prototype.regions = {
                unitListRegion: '#unit-list-region',
                controls: '#list-controls'
            };
        }
        initialize({model, collection, fullCollection, selectedServices, services}) {
            this.model = model;
            this.collection = collection;
            this.fullCollection = fullCollection;
            this.selectedServices = selectedServices;
            this.services = services;
            return this.listenTo(this.fullCollection, 'finished', this.render);
        }
        onScroll(event) { return (this.view != null ? this.view.onScroll(event) : undefined); }
        serializeData() {
            return {controls: this.model.get('collectionType') === 'radius'};
        }
        onShow() {
            this.view = new SearchResultsCompositeView({
                model: this.model,
                collection: new models.UnitList(null, {setComparator: false}),
                fullCollection: this.fullCollection,
                selectedServices: this.selectedServices
            });
            this.unitListRegion.show(this.view);
            this.listenToOnce(this.view, 'user:close', () => {
                this.unitListRegion.empty();
                if (this.services != null) {
                    return this.services.trigger('finished');
                } else if (this.model.get('position')) {
                    return app.request('clearRadiusFilter');
                }
            });
            if (this.model.get('collectionType') === 'radius') {
                return this.controls.show(new RadiusControlsView({radius: this.fullCollection.filters.distance}));
            }
        }
    }
    UnitListingView.initClass();
    class SearchResultsSummaryLayout extends base.SMLayout {
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
            this.onScroll = this.onScroll.bind(this);
        }

        static initClass() {
            // showing a summary of search results of all model types
            this.prototype.template = 'new-search-layout';
            this.prototype.className = 'search-results navigation-element limit-max-height';
            this.prototype.events =
                {'scroll': 'onScroll'};
        }
        _regionId(key, suffix) {
            if (suffix == null) { suffix = ''; }
            return `${key}Region${suffix}`;
        }
        _getRegionForType(key, suffix) {
            return this.getRegion(this._regionId(key, suffix));
        }
        _getArrayOfType(key, size) {
            const arr = this.collection.where({object_type: key});
            this.lengths[key] = arr.length;
            if (!size) { return arr; }
            return arr.slice(0, size);
        }
        onScroll(ev) { return (this.expandedView != null ? this.expandedView.onScroll(ev) : undefined); }
        disableAutoFocus() {
            return this.autoFocusDisabled = true;
        }
        initialize({collection, fullCollection, collectionType, resultType, onlyResultType, selectedServices}) {
            this.collection = collection;
            this.fullCollection = fullCollection;
            this.collectionType = collectionType;
            this.resultType = resultType;
            this.onlyResultType = onlyResultType;
            this.selectedServices = selectedServices;
            this.expanded = false;
            this.addRegion('expandedRegion', '#expanded-region');
            this.resultLayoutViews = {};
            this.collections = {};
            return this.lengths = {};
        }
        showAllOfSingleType(opts) {
            const target = opts.model.get('type');
            this.expanded = target;
            return this.showChildViews();
        }
        onShow() {
            return this.showChildViews();
        }
        onDomRefresh() {
            const view = this.expandedView || _.values(this.resultLayoutViews)[0];
            if (view == null) { return; }
        }
            //TODO test
        showChildViews() {
            if (this.expanded) {
                let region;
                _(RESULT_TYPES).each((ctor, key) => {
                    region = this._getRegionForType(key);
                    const moreRegion = this._getRegionForType(key, 'more');
                    if (region != null) {
                        region.empty();
                    }
                    return (moreRegion != null ? moreRegion.empty() : undefined);
                });
                const fullCollection = new (RESULT_TYPES[this.expanded])(this._getArrayOfType(this.expanded), {setComparator: true});
                this.expandedView = new SearchResultsCompositeView({
                    model: new Backbone.Model({
                        resultType: this.expanded,
                        collectionType: 'search',
                        onlyResultType: true,
                        parent: this,
                        count: fullCollection.length
                    }),
                    collection: new (RESULT_TYPES[this.expanded])(null, {setComparator: false}),
                    fullCollection,
                    selectedServices: this.selectedServices
                });
                region = this.getRegion('expandedRegion');
                if (!this.autoFocusDisabled) {
                    this.listenToOnce(this.expandedView, 'render', () => {
                        return _.defer(() => this.$el.find('.search-result').first().focus());
                    });
                }
                region.show(this.expandedView);
                this.listenToOnce(this.expandedView, 'user:close', () => {
                    this.expanded = false;
                    return this.showChildViews();
                });
                return;
            } else {
                this.expandedView = null;
                _(RESULT_TYPES).each((ctor, key) => {
                    this.collections[key] = new ctor(this._getArrayOfType(key, EXPAND_CUTOFF), {setComparator: true});
                    this.addRegion(this._regionId(key), `.${key}-region`);
                    return this.addRegion(this._regionId(key, 'more'), `#${key}-more`);
                });
                const resultTypeCount = _(this.collections).filter(c => c.length > 0).length;
                __guard__(this.getRegion('expandedRegion'), x => x.empty());
                let done = false;
                _(RESULT_TYPES).each((__, key) => {
                    if (this.collections[key].length) {
                        const view = new SearchResultsCompositeView({
                            model: new Backbone.Model({
                                resultType: key,
                                collectionType: 'search',
                                onlyResultType: resultTypeCount === 1,
                                parent: this,
                                count: this.lengths[key]}),
                            collection: this.collections[key],
                            selectedServices: this.selectedServices
                        });
                        this.resultLayoutViews[key] = view;
                        if (!this.autoFocusDisabled) {
                            if (!done) {
                                done = true;
                                this.listenToOnce(view, 'render', () => {
                                    return _.defer(() => this.$el.find('.search-result').first().focus());
                                });
                            }
                        }
                        __guard__(this._getRegionForType(key), x1 => x1.show(view));
                        if (this.lengths[key] > EXPAND_CUTOFF) {
                            const moreButton = new MoreButton({
                                model: new Backbone.Model({
                                    type: key,
                                    count: this.lengths[key]})});
                            __guard__(this._getRegionForType(key, 'more'), x2 => x2.show(moreButton));
                            return this.listenTo(moreButton, 'show-all', this.showAllOfSingleType);
                        }
                    }
                });
                return this.autoFocusDisabled = false;
            }
        }
    }
    SearchResultsSummaryLayout.initClass();

    return {SearchResultsSummaryLayout, UnitListingView};});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
