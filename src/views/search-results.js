/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
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

    const models             = require('app/models');
    const base               = require('app/views/base');
    const RadiusControlsView = require('app/views/radius');
    const SMSpinner          = require('app/spinner');

    const RESULT_TYPES = {
        unit: models.UnitList,
        service: models.ServiceList,
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
                case 'service':
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

    class SearchResultsView extends base.SMCollectionView {
        static initClass() {
            this.prototype.tagName = 'ul';
            this.prototype.className = 'main-list';
            this.prototype.childView = SearchResultView;
        }
        childViewOptions() {
            return {
                order: this.parent.getComparatorKey(),
                selectedServices: this.parent.selectedServices
            };
        }
        initialize(opts) {
            super.initialize(opts);
            return this.parent = opts.parent;
        }
    }
    SearchResultsView.initClass();

    class LocationPromptView extends base.SMItemView {
        static initClass() {
            this.prototype.tagName = 'ul';
            this.prototype.className = 'main-list';
        }
        render() {
            this.$el.html(`<li id='search-unavailable-location-info'>${i18n.t('search.location_info')}</li>`);
            return this;
        }
    }
    LocationPromptView.initClass();

    class SearchResultsLayoutView extends base.SMLayout {
        static initClass() {
            this.prototype.template = 'search-results';
            this.prototype.regions = {
                results: '.result-contents',
                controls: '#list-controls'
            };
            this.prototype.className = 'search-results-container';
            this.prototype.events = {
                'click .back-button': 'goBack',
                'click .sort-item': 'setComparatorKey',
                'click .collapse-button': 'toggleCollapse'
            };
        }

        goBack(ev) {
            this.expansion = EXPAND_CUTOFF;
            this.requestedExpansion = 0;
            return this.parent.backToSummary();
        }

        setComparatorKey(ev) {
            const key = $(ev.currentTarget).data('sort-key');
            this.renderLocationPrompt = false;
            if (key === 'distance') {
                if (p13n.getLastPosition() == null) {
                    this.renderLocationPrompt = true;
                    this.listenTo(p13n, 'position', () => {
                        this.renderLocationPrompt = false;
                        return this.fullCollection.sort();
                    });
                    this.listenTo(p13n, 'position_error', () => {
                        return this.renderLocationPrompt = false;
                    });
                    p13n.requestLocation();
                }
            }
            this.expansion = 2 * PAGE_SIZE;
            return this.fullCollection.reSort(key);
        }

        getComparatorKey() {
            return this.fullCollection.getComparatorKey();
        }

        onBeforeRender() {
            return this.collection = new this.fullCollection.constructor(this.fullCollection.slice(0, this.expansion));
        }

        // onRender: ->
        //     @showChildren()

        nextPage(ev) {
            let delta;
            if (this.expansion === EXPAND_CUTOFF) {
                // Initial expansion
                delta = (2 * PAGE_SIZE) - EXPAND_CUTOFF;
            } else {
                // Already expanded, next page
                delta = PAGE_SIZE;
            }
            const newExpansion = this.expansion + delta;

            // Only handle repeated scroll events once.
            if (this.requestedExpansion === newExpansion) { return; }
            this.requestedExpansion = newExpansion;

            return this.expansion = this.requestedExpansion;
        }

        initialize({
            collectionType,
            fullCollection,
            resultType,
            parent,
            onlyResultType,
            position,
            selectedServices
        }) {
            this.collectionType = collectionType;
            this.fullCollection = fullCollection;
            this.resultType = resultType;
            this.parent = parent;
            this.onlyResultType = onlyResultType;
            this.position = position;
            this.selectedServices = selectedServices;
            this.expansion = EXPAND_CUTOFF;
            this.$more = null;
            this.requestedExpansion = 0;
            if (this.onlyResultType) {
                this.expansion = 2 * PAGE_SIZE;
                if (this.parent != null) {
                    this.parent.expand(this.resultType);
                }
            }
            this.listenTo(this.fullCollection, 'hide', () => {
                this.hidden = true;
                return this.render();
            });
            this.listenTo(this.fullCollection, 'show-all', () => {
                this.nextPage();
                this.onBeforeRender();
                return this.showChildren();
            });
            this.listenTo(this.fullCollection, 'sort', this.render);
            this.listenTo(this.fullCollection, 'batch-remove', this.render);
            return this.listenTo(p13n, 'accessibility-change', () => {
                const key = this.fullCollection.getComparatorKey();
                if (p13n.hasAccessibilityIssues()) {
                    this.fullCollection.setComparator('accessibility');
                } else if (key === 'accessibility') {
                    this.fullCollection.setDefaultComparator();
                }
                this.fullCollection.sort();
                return this.render();
            });
        }

        serializeData() {
            if (this.hidden || (this.collection == null)) {
                return {hidden: true};
            }
            let data = super.serializeData();
            if (this.collection.length) {
                const crumb = (() => { switch (this.collectionType) {
                    case 'search':
                        return i18n.t('sidebar.search_results');
                    case 'radius':
                        if (this.position != null) {
                            return this.position.humanAddress();
                        }
                        break;
                } })();
                data = {
                    collapsed: this.collapsed || false,
                    comparatorKeys: this.fullCollection.getComparatorKeys(),
                    comparatorKey: this.fullCollection.getComparatorKey(),
                    controls: this.collectionType === 'radius',
                    target: this.resultType,
                    expanded: this._expanded(),
                    showAll: false,
                    showMore: false,
                    onlyResultType: this.onlyResultType,
                    crumb,
                    header: i18n.t(`search.type.${this.resultType}.count`, {count: this.fullCollection.length})
                };
                if ((this.fullCollection.length > EXPAND_CUTOFF) && !this._expanded()) {
                    data.showAll = i18n.t(`search.type.${this.resultType}.show_all`,
                        {count: this.fullCollection.length});
                } else if ((this.fullCollection.length > this.expansion) && !this.renderLocationPrompt) {
                    data.showMore = true;
                }
            }
            return data;
        }

        showChildren() {
            // TODO: don't depend on dom refresh
            if (this.renderLocationPrompt) {
                this.results.show(new LocationPromptView());
                return;
            }
            const collectionView = new SearchResultsView({
                collection: this.collection,
                parent: this
            });
            this.listenToOnce(collectionView, 'dom:refresh', () => {
                return _.delay((() => {
                    this.$more = $(this.el).find('.show-more');
                    window.elz = this.el;
                    // Just in case the initial long list somehow
                    // fits inside the page:
                    this.tryNextPage();
                    return this.trigger('rendered');
                }), 1000);
            });
            if (this.collectionType === 'radius') {
                if (this.controls != null) {
                    this.controls.show(new RadiusControlsView({radius: this.fullCollection.filters.distance}));
                }
            }
            if (this.collapsed) { return; }
            return (this.results != null ? this.results.show(collectionView) : undefined);
        }

        onShow() {
            if (this.hidden) { return; }
            return this.showChildren();
        }

        tryNextPage() {
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
                this.nextPage();
                this.onBeforeRender();
                return this.showChildren();
            }
        }

        _expanded() {
            return this.expansion > EXPAND_CUTOFF;
        }
    }
    SearchResultsLayoutView.initClass();

    class BaseListingLayoutView extends base.SMLayout {
        className() { return 'search-results navigation-element limit-max-height'; }
        events() {
            return {'scroll': 'tryNextPage'};
        }
        disableAutoFocus() {
            return this.autoFocusDisabled = true;
        }
        onDomRefresh() {
            const view = this.getPrimaryResultLayoutView();
            if (view == null) {
                return;
            }
            if (this.autoFocusDisabled) {
                this.autoFocusDisabled = false;
                return;
            }
            //TODO test
            return this.listenToOnce(view, 'rendered', () => {
                return _.defer(() => this.$el.find('.search-result').first().focus());
            });
        }
    }

    class UnitListLayoutView extends BaseListingLayoutView {
        static initClass() {
            this.prototype.template = 'service-units';
            this.prototype.regions =
                {'unitRegion': '.unit-region'};
        }
        tryNextPage() {
            return this.resultLayoutView.tryNextPage();
        }
        initialize(opts, ...rest) {
            this.resultLayoutView = new SearchResultsLayoutView(opts, ...Array.from(rest));
            return this.listenTo(opts.fullCollection, 'reset', () => {
                if (opts.fullCollection.size() !== 0) { return this.render(); }
            });
        }
        onShow() {
            return this.unitRegion.show(this.resultLayoutView);
        }
        getPrimaryResultLayoutView() {
            return this.resultLayoutView;
        }
    }
    UnitListLayoutView.initClass();

    class SearchLayoutView extends BaseListingLayoutView {
        static initClass() {
            this.prototype.template = 'search-layout';
            this.prototype.type = 'search';
        }
        events() {
            return _.extend({}, super.events(), {'click .show-all': 'showAllOfSingleType'});
        }
        tryNextPage() {
            if (this.expanded) {
                return (this.resultLayoutViews[this.expanded] != null ? this.resultLayoutViews[this.expanded].tryNextPage() : undefined);
            }
        }
        expand(target) {
            return this.expanded = target;
        }
        showAllOfSingleType(ev) {
            if (ev != null) {
                ev.preventDefault();
            }
            const target = $(ev.currentTarget).data('target');
            this.expanded = target;
            return _(this.collections).each((collection, key) => {
                if (key === target) {
                    return collection.trigger('show-all');
                } else {
                    return collection.trigger('hide');
                }
            });
        }
        backToSummary() {
            this.expanded = null;
            this.render();
            return this.onShow();
        }

        _regionId(key) {
            return `${key}Region`;
        }
        _getRegionForType(key) {
            return this.getRegion(this._regionId(key));
        }

        initialize() {
            this.expanded = null;
            this.collections = {};
            this.resultLayoutViews = {};

            _(RESULT_TYPES).each((val, key) => {
                this.collections[key] = new val(null, {setComparator: true});
                return this.addRegion(this._regionId(key), `.${key}-region`);
            });

            return this.listenTo(this.collection, 'hide', () => this.$el.hide());
        }

        serializeData() {
            const data = super.serializeData();
            _(RESULT_TYPES).each((__, key) => {
                return this.collections[key].set(this.collection.where({object_type: key}));
            });
            //@collections.unit.sort()

            if (!this.collection.length) {
                if (this.collection.query) {
                    data.noResults = true;
                    data.query = this.collection.query;
                }
            }
            return data;
        }

        getPrimaryResultLayoutView() {
            return this.resultLayoutViews['unit'];
        }

        onShow() {
            const resultTypeCount = _(this.collections).filter(c => c.length > 0).length;
            return _(RESULT_TYPES).each((__, key) => {
                if (this.collections[key].length) {
                    this.resultLayoutViews[key] = new SearchResultsLayoutView({
                        resultType: key,
                        collectionType: 'search',
                        fullCollection: this.collections[key],
                        onlyResultType: resultTypeCount === 1,
                        parent: this
                    });
                    return __guard__(this._getRegionForType(key), x => x.show(this.resultLayoutViews[key]));
                }
        });
        }
        onDomRefresh() {
            return this.$el.show();
        }
    }
    SearchLayoutView.initClass();

    return {
        SearchLayoutView,
        UnitListLayoutView
    };
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}