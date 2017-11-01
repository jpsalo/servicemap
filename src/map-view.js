/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _                         = require('underscore');
    const leaflet                   = require('leaflet');
    const Backbone                  = require('backbone');
    const Marionette                = require('backbone.marionette');
    const markercluster             = require('leaflet.markercluster');
    const leaflet_activearea        = require('leaflet.activearea');
    const i18n                      = require('i18next');
    const URI                       = require('URI');

    const widgets                   = require('app/widgets');
    const models                    = require('app/models');
    const p13n                      = require('app/p13n');
    const jade                      = require('app/jade');
    const MapBaseView               = require('app/map-base-view');
    const TransitMapMixin           = require('app/transit-map');
    const map                       = require('app/map');
    const MapStateModel             = require('app/map-state-model');
    const ToolMenu                  = require('app/views/tool-menu');
    const LocationRefreshButtonView = require('app/views/location-refresh-button');
    const SMPrinter                 = require('app/map-printer');
    const MeasureTool               = require('app/measure-tool');
    const {mixOf}                   = require('app/base');
    const {getIeVersion}            = require('app/base');
    const {isFrontPage}             = require('app/util/navigation');
    const dataviz                   = require('app/data-visualization');


    let ICON_SIZE = 40;
    if (getIeVersion() && (getIeVersion() < 9)) {
        ICON_SIZE *= .8;
    }
    const MARKER_POINT_VARIANT = false;
    const DEFAULT_CENTER = [60.171944, 24.941389]; // todo: depends on city

    class MapView extends mixOf(MapBaseView, TransitMapMixin) {
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
            this.preAdapt = this.preAdapt.bind(this);
        }

        static initClass() {
            this.prototype.tagName = 'div';

            this.mapActiveAreaMaxHeight = () => {
                const screenWidth = $(window).innerWidth();
                const screenHeight = $(window).innerHeight();
                return Math.min(screenWidth * 0.4, screenHeight * 0.3);
            };

            this.setMapActiveAreaMaxHeight = options => {
                // Sets the height of the map shown in views that have a slice of
                // map visible on mobile.
                const defaults = {maximize: false};
                options = options || {};
                _.extend(defaults, options);
                options = defaults;
                if ($(window).innerWidth() <= appSettings.mobile_ui_breakpoint) {
                    const height = MapView.mapActiveAreaMaxHeight();
                    const $activeArea = $('.active-area');
                    if (options.maximize) {
                        $activeArea.css('height', 'auto');
                        return $activeArea.css('bottom', 0);
                    } else {
                        $activeArea.css('height', height);
                        return $activeArea.css('bottom', 'auto');
                    }
                } else {
                    $('.active-area').css('height', 'auto');
                    return $('.active-area').css('bottom', 0);
                }
            };
        }
        initialize(opts, mapOpts) {
            this.opts = opts;
            this.mapOpts = mapOpts;
            super.initialize(this.opts, this.mapOpts);
            this.selectedServices = this.opts.services;
            this.searchResults = this.opts.searchResults;
            //@listenTo @units, 'add', @drawUnits
            // @selectedPosition = @opts.selectedPosition
            this.selectedDivision = this.opts.selectedDivision;
            this.userPositionMarkers = {
                accuracy: null,
                position: null,
                clicked: null
            };

            this.listenTo(this.divisions, 'finished', (cancelToken, statisticsPath) => {
                cancelToken.set('status', 'rendering');
                const [type, layer] = Array.from(statisticsPath.split('.', 1));
                const lr = this.drawDivisionsAsGeoJSONWithDataAttached(
                    this.divisions,
                    this.statistics,
                    statisticsPath);
                this.visualizationLayer.addLayer(lr);
                this.closeAddressPopups();
                app.request('addDataLayer', 'statistics_layer', statisticsPath, lr._leaflet_id);

                return cancelToken.complete();
            });

            this.dataLayers = this.opts.dataLayers;

            this.listenTo(this.selectedServices, 'add', (service, collection) => {
                if (collection.size() === 1) {
                    return this.markers = {};
                }
        });
            this.listenTo(this.selectedServices, 'remove', (model, collection) => {
                if (collection.size() === 0) {
                    return this.markers = {};
                }
        });

            this.listenTo(this.selectedDivision, 'change:value', model => {
                this.divisionLayer.clearLayers();
                return this.drawDivision(model.value());
            });

            this.listenTo(this.units, 'unit:highlight', this.highlightUnselectedUnit);
            this.listenTo(this.units, 'batch-remove', this.removeUnits);
            this.listenTo(this.units, 'remove', this.removeUnit);
            this.listenTo(this.selectedUnits, 'reset', this.handleSelectedUnit);
            this.listenTo(p13n, 'position', this.handlePosition);

            this.listenTo(this.dataLayers, 'add', this.addDataLayer);
            this.listenTo(this.dataLayers, 'remove', this.removeDataLayer);

            if (this.selectedPosition.isSet()) {
                this.listenTo(this.selectedPosition.value(), 'change:radiusFilter', this.radiusFilterChanged);
            }
            this.listenTo(this.selectedPosition, 'change:value', (wrapper, value) => {
                const previous = wrapper.previous('value');
                if (previous != null) {
                    this.stopListening(previous);
                }
                if (value != null) {
                    this.listenTo(value, 'change:radiusFilter', this.radiusFilterChanged);
                }
                return this.handlePosition(value, {center: true});
            });

            MapView.setMapActiveAreaMaxHeight({
                maximize:
                    this.selectedPosition.isEmpty() && this.selectedUnits.isEmpty()
            });

            this.initializeTransitMap({
                route: this.opts.route,
                selectedUnits: this.selectedUnits,
                selectedPosition: this.selectedPosition
            });

            this.printer = new SMPrinter(this);
            //$(window).resize => _.defer(_.bind(@recenter, @))
            return this.previousBoundingBoxes = null;
        }

        onMapClicked(ev) {
            if ((this.measureTool && this.measureTool.isActive) || p13n.get('statistics_layer')) {
                return;
            }
            if (this.hasClickedPosition == null) { this.hasClickedPosition = false; }
            if (this.hasClickedPosition) {
                this.infoPopups.clearLayers();
                this.map.removeLayer(this.userPositionMarkers['clicked']);
                return this.hasClickedPosition = false;
            } else {
                let position;
                if (this.pendingPosition != null) {
                    position = this.pendingPosition;
                } else {
                    position = new models.CoordinatePosition({
                        isDetected: false});
                }
                position.set('location', {
                    coordinates: [ev.latlng.lng, ev.latlng.lat],
                    accuracy: 0,
                    type: 'Point'
                }
                );
                if (this.pendingPosition != null) {
                    this.pendingPosition = null;
                    $('#map').css('cursor', 'auto');
                } else {
                    position.set('name', null);
                    this.hasClickedPosition = true;
                }
                return this.handlePosition(position, {initial: true});
            }
        }

        requestLocation(position) {
            $('#map').css('cursor', 'crosshair');
            return this.pendingPosition = position;
        }

        radiusFilterChanged(position, radius, {cancelToken}) {
            this.divisionLayer.clearLayers();
            if (radius == null) {
                return;
            }
            const latLng = L.GeoJSON.geometryToLayer(position.get('location'));
            const poly = new widgets.CirclePolygon(latLng.getLatLng(), radius, {invert: true, stroke: false, worldLatLngs: MapBaseView.WORLD_LAT_LNGS});
            poly.circle.options.fill = false;
            poly.addTo(this.divisionLayer);
            return poly.circle.addTo(this.divisionLayer);
        }

        handleSelectedUnit(units, options) {
            if (units.isEmpty()) {
                // The previously selected unit might have been a bbox unit.
                this._removeBboxMarkers(this.map.getZoom(), map.MapUtils.getZoomlevelToShowAllMarkers());
                MapView.setMapActiveAreaMaxHeight({maximize: true});
                return;
            }
            const unit = units.first();

            const bounds = unit.geometry != null ? unit.geometry.getBounds() : undefined;
            if (bounds) {
                this.map.setMapView({
                    bounds});
            } else {
                const latLng = unit.marker != null ? unit.marker.getLatLng() : undefined;
                if (latLng != null) {
                    this.map.adaptToLatLngs([latLng]);
                }
            }

            if (!unit.hasBboxFilter()) {
                this._removeBboxMarkers();
                this._skipBboxDrawing = false;
            }
            return _.defer(() => this.highlightSelectedUnit(unit));
        }

        handlePosition(positionObject, opts) {
            // TODO: clean up this method
            let key;
            if (positionObject == null) {
                for (key of ['clicked', 'address']) {
                    const layer = this.userPositionMarkers[key];
                    if (layer) { this.map.removeLayer(layer); }
                }
            }

            const isSelected = positionObject === this.selectedPosition.value();

            key = positionObject != null ? positionObject.origin() : undefined;
            if (key !== 'detected') {
                this.infoPopups.clearLayers();
            }

            const prev = this.userPositionMarkers[key];
            if (prev) { this.map.removeLayer(prev); }

            if ((key === 'address') && (this.userPositionMarkers.clicked != null)) {
                this.map.removeLayer(this.userPositionMarkers.clicked);
            }
            if ((key === 'clicked') && isSelected && (this.userPositionMarkers.address != null)) {
                this.map.removeLayer(this.userPositionMarkers.address);
            }

            const location = positionObject != null ? positionObject.get('location') : undefined;
            if (!location) { return; }

            const { accuracy } = location;
            const accuracyMarker = L.circle(latLng, accuracy, {weight: 0});

            var latLng = map.MapUtils.latLngFromGeojson(positionObject);
            const marker = map.MapUtils.createPositionMarker(latLng, accuracy, positionObject.origin());
            marker.position = positionObject;
            marker.on('click', () => app.request('selectPosition', positionObject));
            if (isSelected || (opts != null ? opts.center : undefined)) {
                this.map.refitAndAddMarker(marker);
            } else {
                marker.addTo(this.map);
            }

            this.userPositionMarkers[key] = marker;

            if (isSelected) {
                this.infoPopups.clearLayers();
            }

            const popup = this.createPositionPopup(positionObject, marker);

            if (!(positionObject != null ? positionObject.isDetectedLocation() : undefined) ||
                (this.selectedUnits.isEmpty() && (
                    this.selectedPosition.isEmpty() ||
                    (this.selectedPosition.value() === positionObject)))) {
                const pop = () => this.infoPopups.addLayer(popup);
                if (!positionObject.get('preventPopup')) {
                    if (isSelected || ((opts != null ? opts.initial : undefined) && !positionObject.get('preventPopup'))) {
                        pop();
                        if (isSelected) {
                            $(popup._wrapper).addClass('selected');
                        }
                    }
                }
            }

            return positionObject.popup = popup;
        }

        width() {
            return this.$el.width();
        }
        height() {
            return this.$el.height();
        }

        removeUnits(options) {
            this.allMarkers.clearLayers();
            this.allGeometries.clearLayers();
            this.drawUnits(this.units);
            if (!this.selectedUnits.isEmpty()) {
                this.highlightSelectedUnit(this.selectedUnits.first());
            }
            if (this.units.isEmpty()) {
                return this.showAllUnitsAtHighZoom();
            }
        }

        removeUnit(unit, units, options) {
            if (unit.marker != null) {
                this.allMarkers.removeLayer(unit.marker);
                delete unit.marker;
            }

            if (unit.geometry != null) {
                this.allGeometries.removeLayer(unit.geometry);
                return delete unit.geometry;
            }
        }

        getServices() {
            return this.selectedServices;
        }

        createPositionPopup(positionObject, marker) {
            let offsetY, popup, popupContents;
            const latLng = map.MapUtils.latLngFromGeojson(positionObject);
            let address = positionObject.humanAddress();
            if (!address) {
                address = i18n.t('map.retrieving_address');
            }
            if (positionObject === this.selectedPosition.value()) {
                popupContents =
                    ctx => {
                        return `<div class=\"unit-name\">${ctx.name}</div>`;
                    };
                offsetY = (() => { switch (positionObject.origin()) {
                    case 'detected': return 10;
                    case 'address': return 10;
                    default: return 38;
                } })();
                popup = this.createPopup(null, null, L.point(0, offsetY))
                    .setContent(popupContents({
                        name: address})).setLatLng(latLng);
            } else {
                popupContents =
                    ctx => {
                        ctx.detected = positionObject != null ? positionObject.isDetectedLocation() : undefined;
                        const $popupEl = $(jade.template('position-popup', ctx));
                        $popupEl.on('click', e => {
                            if (positionObject !== this.selectedPosition.value()) {
                                e.stopPropagation();
                                this.listenTo(positionObject, 'reverse-geocode', () => {
                                    return app.request('selectPosition', positionObject);
                                });
                                marker.closePopup();
                                this.infoPopups.clearLayers();
                                this.map.removeLayer(positionObject.popup);
                                if (positionObject.isReverseGeocoded()) {
                                    return positionObject.trigger('reverse-geocode');
                                }
                            }
                        });

                        return $popupEl[0];
                    };
                offsetY = (() => { switch (positionObject.origin()) {
                    case 'detected': return -53;
                    case 'clicked': return -15;
                    case 'address': return -50;
                } })();
                const offset = L.point(0, offsetY);
                const popupOpts = {
                    closeButton: false,
                    className: 'position',
                    autoPan: false,
                    offset,
                    autoPanPaddingTopLeft: L.point(30, 80),
                    autoPanPaddingBottomRight: L.point(30, 80)
                };
                popup = L.popup(popupOpts)
                    .setLatLng(latLng)
                    .setContent(popupContents({
                        name: address})
                );
            }

            if (typeof positionObject.reverseGeocode === 'function') {
                positionObject.reverseGeocode().done(() => {
                return popup.setContent(popupContents({
                    name: positionObject.humanAddress()})
                );
            });
            }
            return popup;
        }

        createStatisticsPopup(positionObject, statistic) {
            let popup;
            const latLng = map.MapUtils.latLngFromGeojson(positionObject);
            const popupContents =
                ctx => {
                    const $popupEl = $(jade.template('statistic-popup', ctx));
                    return $popupEl[0];
                };
            const popupOpts = {
                closeButton: true,
                className: 'statistic'
            };
            return popup = L.popup(popupOpts)
                .setLatLng(latLng)
                .setContent(popupContents({
                    name: statistic.name,
                    value: statistic.value,
                    proportion: statistic.proportion
                })
            );
        }

        selectMarker(event) {
            const marker = event.target;
            const { unit } = marker;
            return app.request('selectUnit', unit, {});
        }

        drawUnit(unit, units, options) {
            const location = unit.get('location');
            if (location != null) {
                const marker = this.createMarker(unit);
                return this.allMarkers.addLayer(marker);
            }
        }

        getCenteredView() {
            if (this.selectedPosition.isSet()) {
                return {
                    center: map.MapUtils.latLngFromGeojson(this.selectedPosition.value()),
                    zoom: map.MapUtils.getZoomlevelToShowAllMarkers()
                };
            } else if (this.selectedUnits.isSet()) {
                return {
                    center: map.MapUtils.latLngFromGeojson(this.selectedUnits.first()),
                    zoom: Math.max(this.getMaxAutoZoom(), this.map.getZoom())
                };
            } else {
                return null;
            }
        }

        resetMap() {
            // With different projections the base layers cannot
            // be changed on a live map.
            if (!isFrontPage()) {
                window.location.reload(true);
                return;
            }
            const uri = URI(window.location.href);
            uri.addSearch({reset: 1});
            return window.location.href = uri.href();
        }

        handleP13nChange(path, newVal) {
            if (path[0] !== 'map_background_layer') {
                return;
            }

            const oldLayer = this.map._baseLayer;
            const oldCrs = this.map.crs;

            const mapStyle = p13n.get('map_background_layer');
            const {layer: newLayer, crs: newCrs} = map.MapMaker.makeBackgroundLayer({style: mapStyle});

            if (newCrs.code !== oldCrs.code) {
                this.resetMap();
                return;
            }

            this.map.addLayer(newLayer);
            newLayer.bringToBack();
            this.map.removeLayer(oldLayer);
            this.map._baseLayer = newLayer;
            return this.drawUnits(this.units);
        }

        addMapActiveArea() {
            this.map.setActiveArea('active-area');
            return MapView.setMapActiveAreaMaxHeight({
                maximize: this.selectedUnits.isEmpty() && this.selectedPosition.isEmpty()});
        }

        initializeMap() {
            this.setInitialView();
            window.debugMap = map;
            this.listenTo(p13n, 'change', this.handleP13nChange);
            // The line below is for debugging without clusters.
            // @allMarkers = L.featureGroup()
            this.popups = L.layerGroup();
            this.infoPopups = L.layerGroup();

            //L.control.scale(imperial: false).addTo(@map);

            L.control.zoom({
                position: 'bottomright',
                zoomInText: `<span class=\"icon-icon-zoom-in\"></span><span class=\"sr-only\">${i18n.t('assistive.zoom_in')}</span>`,
                zoomOutText: `<span class=\"icon-icon-zoom-out\"></span><span class=\"sr-only\">${i18n.t('assistive.zoom_out')}</span>`}).addTo(this.map);

            new widgets.ControlWrapper(new LocationRefreshButtonView(), {position: 'bottomright'}).addTo(this.map);
            new widgets.ControlWrapper(new ToolMenu(), {position: 'bottomright'}).addTo(this.map);

            this.popups.addTo(this.map);
            this.infoPopups.addTo(this.map);

            this.debugGrid = L.layerGroup().addTo(this.map);
            this.debugCircles = {};

            this._addMapMoveListeners();

            // If the user has allowed location requests before,
            // try to get the initial location now.
            if (p13n.getLocationRequested()) {
                p13n.requestLocation();
            }

            this.previousZoomlevel = this.map.getZoom();
            return this.drawInitialState();
        }

        _removeBboxMarkers(zoom, zoomLimit) {
            if (this.markers == null) {
                return;
            }
            if (this.markers.length === 0) {
                return;
            }
            if ((zoom != null) && (zoomLimit != null)) {
                if (zoom >= zoomLimit) {
                    return;
                }
            }
            this._skipBboxDrawing = true;
            if (this.selectedServices.isSet()) {
                return;
            }
            const toRemove = _.filter(this.markers, m => {
                let ret;
                const unit = m != null ? m.unit : undefined;
                return ret = __guard__(unit != null ? unit.collection : undefined, x => x.hasReducedPriority()) && !(unit != null ? unit.get('selected') : undefined);
            });
            if (this.units != null) {
                this.units.clearFilters('bbox');
            }
            this.allMarkers.removeLayers(toRemove);
            return this._clearOtherPopups(null, null);
        }

        _addMapMoveListeners() {
            const zoomLimit = map.MapUtils.getZoomlevelToShowAllMarkers();
            this.map.on('zoomanim', data => {
                this._skipBboxDrawing = false;
                return this._removeBboxMarkers(data.zoom, zoomLimit);
            });
            this.map.on('zoomend', () => {
                return this._removeBboxMarkers(this.map.getZoom(), zoomLimit);
            });
            return this.map.on('moveend', () => {
                // TODO: cleaner way to prevent firing from refit
                if (this.skipMoveend) {
                    this.skipMoveend = false;
                    return;
                }
                return this.showAllUnitsAtHighZoom();
            });
        }

        postInitialize() {
            this.addMapActiveArea();
            this.initializeMap();
            return this._addMouseoverListeners(this.allMarkers);
        }

        preAdapt() {
            return MapView.setMapActiveAreaMaxHeight();
        }

        recenter() {
            const view = this.getCenteredView();
            if (view == null) {
                return;
            }
            return this.map.setView(view.center, view.zoom, {pan: {duration: 0.5}});
        }

        refitBounds() {
            this.skipMoveend = true;
            return this.map.fitBounds(this.allMarkers.getBounds(), {
                maxZoom: this.getMaxAutoZoom(),
                animate: true
            }
            );
        }

        fitItinerary(layer) {
            return this.map.fitBounds(layer.getBounds(), {
                paddingTopLeft: [20,20],
                paddingBottomRight: [20,20]
            });
        }

        showAllUnitsAtHighZoom() {
            let level;
            if (this.map.getZoom() < map.MapUtils.getZoomlevelToShowAllMarkers()) {
                this.previousBoundingBoxes = null;
                return;
            }
            if (getIeVersion()) {
                return;
            }
            if ($(window).innerWidth() <= appSettings.mobile_ui_breakpoint) {
                return;
            }
            if (this.selectedUnits.isSet() && (__guard__(__guard__(this.selectedUnits.first().collection, x1 => x1.filters), x => x.bbox) == null)) {
                return;
            }
            if (this.selectedServices.isSet()) {
                return;
            }
            if (this.searchResults.isSet()) {
                return;
            }
            const transformedBounds = map.MapUtils.overlappingBoundingBoxes(this.map);
            const bboxes = [];
            for (let bbox of Array.from(transformedBounds)) {
                bboxes.push(`${bbox[0][0]},${bbox[0][1]},${bbox[1][0]},${bbox[1][1]}`);
            }
            const bboxstring = bboxes.join(';');
            if (this.previousBoundingBoxes === bboxstring) {
                return;
            }
            this.previousBoundingBoxes = bboxstring;
            if ((this.mapOpts != null ? this.mapOpts.level : undefined) != null) {
                ({ level } = this.mapOpts);
                delete this.mapOpts.level;
            }
            return app.request('addUnitsWithinBoundingBoxes', bboxes, level);
        }

        print() {
            return this.printer.printMap(true);
        }

        addDataLayer(layer) {
            if (layer.get('layerName') === 'heatmap_layer') {
                const lr = map.MapUtils.createHeatmapLayer(layer.get('dataId'));
                this.visualizationLayer.addLayer(lr);
                return layer.set('leafletId', lr._leaflet_id);
            }
        }

        removeDataLayer(layer) {
            return this.visualizationLayer.removeLayer(layer.get('leafletId'));
        }

        turnOnMeasureTool() {
            this.closeAddressPopups();
            if (!this.measureTool) {
                this.measureTool = new MeasureTool(this.map);
            }
            this.measureTool.activate();
            // Disable selecting units when measuring
            return _.values(this.markers).map(marker => {
                marker.off('click', this.selectMarker);
                // Enable measuring when clicking a unit marker
                return marker.on('click', this.measureTool.measureAddPoint);
            });
        }

        turnOffMeasureTool() {
            this.measureTool.deactivate();
            // Re-enable selecting units when measuring
            return _.values(this.markers).map(marker => {
                marker.on('click', this.selectMarker);
                return marker.off('click', this.measureTool.measureAddPoint);
            });
        }

        closeAddressPopups() {
            if (this.hasClickedPosition) {
                this.infoPopups.clearLayers();
                this.map.removeLayer(this.userPositionMarkers['clicked']);
                return this.hasClickedPosition = false;
            }
        }
    }
    MapView.initClass();

    return MapView;
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
