/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let ServiceCartView;
    const _       = require('underscore');

    const p13n    = require('app/p13n');
    const base    = require('app/views/base');

    return ServiceCartView = (function() {
        ServiceCartView = class ServiceCartView extends base.SMItemView {
            static initClass() {
                this.prototype.template = 'service-cart';
                this.prototype.tagName = 'ul';
                this.prototype.className = 'expanded container main-list';
            }
            events() {
                return {
                    'click .personalisation-container .maximizer': 'maximize',
                    'click .services.maximizer': 'maximize',
                    'keydown .personalisation-container .maximizer': this.keyboardHandler(this.maximize, ['space', 'enter']),
                    'click .button.cart-close-button': 'minimize',
                    'click .button.close-button': 'closeService',
                    'keydown .button.close-button': this.keyboardHandler(this.closeService, ['space', 'enter']),
                    'click .map-layer input': 'selectLayerInput',
                    'click .map-layer label': 'selectLayerLabel',
                    // 'click .data-layer a.toggle-layer': 'toggleDataLayer'
                    //'click .data-layer label': 'selectDataLayerLabel'
                    'click .data-layer-heatmap input'(ev) { return this.selectDataLayerInput('heatmap_layer', $(ev.currentTarget).prop('value')); },
                    'click .data-layer-statistics input': this.selectStatisticsLayerInput
                };
            }

            initialize({collection, selectedDataLayers}) {
                this.collection = collection;
                this.selectedDataLayers = selectedDataLayers;
                this.listenTo(this.collection, 'add', this.minimize);
                this.listenTo(this.collection, 'remove', () => {
                    if (this.collection.length) {
                        return this.render();
                    } else {
                        return this.minimize();
                    }
                });
                this.listenTo(this.collection, 'reset', this.render);
                this.listenTo(this.collection, 'minmax', this.render);
                this.listenTo(p13n, 'change', (path, value) => {
                    if (path[0] === 'map_background_layer') { return this.render(); }
                });
                this.listenTo(this.selectedDataLayers, 'change', this.render);
                this.listenTo(app.vent, 'statisticsDomainMax', function(max) {
                    this.statisticsDomainMax = max;
                    return this.render();
                });
                this.minimized = false;
                if (this.collection.length) {
                    return this.minimized = false;
                } else {
                    return this.minimized = true;
                }
            }
            maximize() {
                this.minimized = false;
                return this.collection.trigger('minmax');
            }
            minimize() {
                this.minimized = true;
                return this.collection.trigger('minmax');
            }
            onDomRefresh() {
                if (this.collection.length) {
                    this.$el.addClass('has-services');
                } else {
                    this.$el.removeClass('has-services');
                }
                if (this.minimized) {
                    this.$el.removeClass('expanded');
                    this.$el.parent().removeClass('expanded');
                    return this.$el.addClass('minimized');
                } else {
                    this.$el.addClass('expanded');
                    this.$el.parent().addClass('expanded');
                    this.$el.removeClass('minimized');
                    return _.defer(() => {
                        return this.$el.find('input:checked').first().focus();
                    });
                }
            }
            serializeData() {
                const data = super.serializeData();
                data.minimized = this.minimized;
                data.layers = p13n.getMapBackgroundLayers();
                data.selectedLayer = p13n.get('map_background_layer');
                data.heatmapLayers = p13n.getHeatmapLayers().map(layerPath => {
                    layerPath.selected = this.selectedDataLayers.get('heatmap_layer') === (layerPath != null ? layerPath.name : undefined);
                    return layerPath;
                });
                data.statisticsLayers = p13n.getStatisticsLayers().map(layerPath => {
                    return {
                        type: (layerPath != null ? layerPath.name : undefined) ? layerPath.name.split('.')[0] : null,
                        name: (layerPath != null ? layerPath.name : undefined) ? layerPath.name.split('.')[1] : null,
                        selected: this.selectedDataLayers.get('statistics_layer') === (layerPath != null ? layerPath.name : undefined)
                    };
            });
                data.selectedHeatmapLayer = this.selectedDataLayers.get('heatmap_layer') || null;
                const selectedStatisticsLayer = this.selectedDataLayers.get('statistics_layer');
                const [type, name] = Array.from(selectedStatisticsLayer ? selectedStatisticsLayer.split('.') : [null, null]);
                data.selectedStatisticsLayer = {
                    type,
                    name,
                    max: type && this.statisticsDomainMax
                };
                return data;
            }
            closeService(ev) {
                return app.request('removeService', $(ev.currentTarget).data('service'));
            }
            _selectLayer(value) {
                return p13n.setMapBackgroundLayer(value);
            }
            selectLayerInput(ev) {
                return this._selectLayer($(ev.currentTarget).attr('value'));
            }
            selectLayerLabel(ev) {
                return this._selectLayer($(ev.currentTarget).data('layer'));
            }
            selectDataLayerInput(dataLayer, value) {
                app.request('removeDataLayer', dataLayer);
                if (value !== 'null') {
                    app.request('addDataLayer', dataLayer, value);
                }
                return this.render();
            }
            selectStatisticsLayerInput(ev) {
                const value = $(ev.currentTarget).prop('value');
                app.request('removeDataLayer', 'statistics_layer');
                if (value !== 'null') {
                    return app.request('showDivisions', null, value);
                }
            }
        };
        ServiceCartView.initClass();
        return ServiceCartView;
    })();
});
