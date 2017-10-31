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
    const Backbone         = require('backbone');
    const Marionette       = require('backbone.marionette');
    const i18n             = require('i18next');
    const L                = require('leaflet');
    const markercluster    = require('leaflet.markercluster');
    const leaflet_snogylop = require('leaflet.snogylop');

    const map              = require('app/map');
    const widgets          = require('app/widgets');
    const jade             = require('app/jade');
    const MapStateModel    = require('app/map-state-model');
    const dataviz          = require('app/data-visualization');
    const {getIeVersion}   = require('app/base');

    // TODO: remove duplicates
    const MARKER_POINT_VARIANT = false;
    const DEFAULT_CENTER = {
        helsinki: [60.171944, 24.941389],
        espoo: [60.19792, 24.708885],
        vantaa: [60.309045, 25.004675],
        kauniainen: [60.21174, 24.729595]
    };
    let ICON_SIZE = 40;

    if (getIeVersion() && (getIeVersion() < 9)) {
        ICON_SIZE *= .8;
    }

    L.extend(L.LatLng, {MAX_MARGIN: 1.0e-7});

    class MapBaseView extends Backbone.Marionette.View {
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.fitBbox = this.fitBbox.bind(this);
            this.drawInitialState = this.drawInitialState.bind(this);
            super(...args);
        }

        static initClass() {
            this.WORLD_LAT_LNGS = [
                L.latLng([64, 32]),
                L.latLng([64, 21]),
                L.latLng([58, 21]),
                L.latLng([58, 32])
            ];
    
            this.prototype.mapOptions = {};
        }
        getIconSize() {
            return ICON_SIZE;
        }
        initialize({opts, mapOpts, embedded}) {
            this.opts = opts;
            this.mapOpts = mapOpts;
            this.embedded = embedded;
            this.markers = {};
            this.geometries = {};
            this.units = this.opts.units;
            this.selectedUnits = this.opts.selectedUnits;
            this.selectedPosition = this.opts.selectedPosition;
            this.divisions = this.opts.divisions;
            this.statistics = this.opts.statistics;
            this.listenTo(this.units, 'reset', this.drawUnits);
            return this.listenTo(this.units, 'finished', options => {
                // Triggered when all of the
                // pages of units have been fetched.
                this.drawUnits(this.units, options);
                if (this.selectedUnits.isSet()) {
                    return this.highlightSelectedUnit(this.selectedUnits.first());
                }
            });
        }

        getProxy() {
            const fn = () => map.MapUtils.overlappingBoundingBoxes(this.map);
            return {getTransformedBounds: fn};
        }

        render() {
            return this.$el.attr('id', 'map');
        }

        getMapStateModel() {
            return new MapStateModel(this.opts, this.embedded);
        }

        onShow() {
            // The map is created only after the element is added
            // to the DOM to work around Leaflet init issues.
            const mapStyle = p13n.get('map_background_layer');
            const options = {
                style: mapStyle,
                language: p13n.getLanguage()
            };
            this.map = map.MapMaker.createMap(this.$el.get(0), options, this.mapOptions, this.getMapStateModel());
            this.map.on('click', _.bind(this.onMapClicked, this));
            this.allMarkers = this.getFeatureGroup();
            this.allMarkers.addTo(this.map);
            this.allGeometries = L.featureGroup();
            this.allGeometries.addTo(this.map);
            this.divisionLayer = L.featureGroup();
            this.divisionLayer.addTo(this.map);
            this.visualizationLayer = L.featureGroup();
            this.visualizationLayer.addTo(this.map);
            return this.postInitialize();
        }

        onMapClicked(ev) {} // override

        calculateInitialOptions() {
            let city = p13n.getCity();
            if (city == null) {
                city = 'helsinki';
            }
            const center = DEFAULT_CENTER[city];
            // Default state without selections
            const defaults = {
                zoom: (p13n.get('map_background_layer') === 'servicemap') ? 10 : 5,
                center
            };
            if (this.selectedPosition.isSet()) {
                return {
                    zoom: map.MapUtils.getZoomlevelToShowAllMarkers(),
                    center: map.MapUtils.latLngFromGeojson(this.selectedPosition.value())
                };
            } else if (this.selectedUnits.isSet()) {
                const unit = this.selectedUnits.first();
                if (unit.get('location') != null) {
                    return {
                        zoom: this.getMaxAutoZoom(),
                        center: map.MapUtils.latLngFromGeojson(unit)
                    };
                } else {
                    return defaults;
                }
            } else if (this.divisions.isSet()) {
                const boundaries = this.divisions.map(d => {
                    return new L.GeoJSON(d.get('boundary'));
                });
                const iteratee = (memo, value) => memo.extend(value.getBounds());
                const bounds = _.reduce(boundaries, iteratee, L.latLngBounds([]));
                return {bounds};
            } else {
                return defaults;
            }
        }

        postInitialize() {
            this._addMouseoverListeners(this.allMarkers);
            this.popups = L.layerGroup();
            this.popups.addTo(this.map);
            this.setInitialView();
            return this.drawInitialState();
        }

        fitBbox(bbox) {
            const sw = L.latLng(bbox.slice(0,2));
            const ne = L.latLng(bbox.slice(2,4));
            const bounds = L.latLngBounds(sw, ne);
            return this.map.fitBounds(bounds);
        }

        getMaxAutoZoom() {
            const layer = p13n.get('map_background_layer');
            if (layer === 'guidemap') {
                return 7;
            } else if (layer === 'ortographic') {
                return 9;
            } else {
                return 12;
            }
        }


        setInitialView() {
            let bounds;
            if ((this.mapOpts != null ? this.mapOpts.bbox : undefined) != null) {
                return this.fitBbox(this.mapOpts.bbox);
            } else if (((this.mapOpts != null ? this.mapOpts.fitAllUnits : undefined) === true) && !this.units.isEmpty()) {
                const latlngs = this.units.map(u => u.getLatLng());
                bounds = L.latLngBounds(latlngs);
                return this.map.fitBounds(bounds);
            } else {
                const opts = this.calculateInitialOptions();
                if (opts.bounds != null) {
                    return this.map.fitBounds(opts.bounds);
                } else {
                    return this.map.setView(opts.center, opts.zoom);
                }
            }
        }

        drawInitialState() {
            if (this.selectedPosition.isSet()) {
                return this.handlePosition(this.selectedPosition.value(), {
                    center: false,
                    skipRefit: true,
                    initial: true
                }
                );
            } else if (this.selectedUnits.isSet()) {
                return this.drawUnits(this.units, {noRefit: true});
            } else {
                if (this.units.isSet()) {
                    this.drawUnits(this.units);
                }
                if (this.divisions.isSet()) {
                    this.divisionLayer.clearLayers();
                    return this.drawDivisions(this.divisions);
                }
            }
        }

        drawUnits(units, options) {
            let geometry;
            let cancelled = false;
            __guard__(options != null ? options.cancelToken : undefined, x => x.addHandler(() => cancelled = true));

            this.allMarkers.clearLayers();
            this.allGeometries.clearLayers();
            if ((units.filters != null ? units.filters.bbox : undefined) != null) {
                if (this._skipBboxDrawing) {
                    return;
                }
            }

            if (cancelled) { return; }
            const unitsWithLocation = units.filter(unit => (unit.get('location') != null));

            if (cancelled) { return; }
            const markers = unitsWithLocation.map(unit => this.createMarker(unit, options != null ? options.marker : undefined));

            if (cancelled) { return; }
            const unitsWithGeometry = units.filter(unit => {
              ({ geometry } = unit.attributes);
              if (geometry) {
                return ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(geometry.type);
              } else {
                return false;
            }
            });

            if (cancelled) { return; }
            const geometries = unitsWithGeometry.map(unit => this.createGeometry(unit, unit.attributes.geometry));

            if (units.length === 1) {
                this.highlightSelectedUnit(units.models[0]);
            } else {
                const latLngs = _(markers).map(m => m.getLatLng());
                if (!(options != null ? options.keepViewport : undefined)) {
                    if (typeof this.preAdapt === 'function') {
                        this.preAdapt();
                    }
                    this.map.adaptToLatLngs(latLngs);
                }
            }

            if (cancelled) { return; }
            return this.allMarkers.addLayers(markers);
        }

        highlightSelectedUnit(unit) {
            // Prominently highlight the marker whose details are being
            // examined by the user.
            if (unit == null) {
                return;
            }
            const { marker } = unit;
            const popup = marker != null ? marker.popup : undefined;
            if (!popup) {
                return;
            }
            popup.selected = true;
            this._clearOtherPopups(popup, {clearSelected: true});
            if (!this.popups.hasLayer(popup)) {
                popup.setLatLng(marker.getLatLng());
                this.popups.addLayer(popup);
            }
            this.listenToOnce(unit, 'change:selected', unit => {
                if (!unit.get('selected')) {
                    $(marker != null ? marker._icon : undefined).removeClass('selected');
                    $(marker != null ? marker.popup._wrapper : undefined).removeClass('selected');
                    this.popups.removeLayer(marker != null ? marker.popup : undefined);

                    if (unit.geometry != null) {
                        return this.allGeometries.removeLayer(unit.geometry);
                    }
                }
            });
            $(marker != null ? marker._icon : undefined).addClass('selected');
            $(marker != null ? marker.popup._wrapper : undefined).addClass('selected');

            if (unit.geometry != null) {
                return this.allGeometries.addLayer(unit.geometry);
            }
        }


        _combineMultiPolygons(multiPolygons) {
            return multiPolygons.map(mp => mp.coordinates[0]);
        }

        drawDivisionGeometry(geojson) {
            const mp = L.GeoJSON.geometryToLayer(geojson,
                null, null, {
                invert: true,
                worldLatLngs: MapBaseView.WORLD_LAT_LNGS,
                color: '#ff8400',
                weight: 3,
                strokeOpacity: 1,
                fillColor: '#000',
                fillOpacity: 0.2
            }
            );
            this.map.adapt();
            return mp.addTo(this.divisionLayer);
        }

        drawDivisionsAsGeoJSONWithDataAttached(divisions, statistics, statisticsPath) {
            const type = dataviz.getStatisticsType(statisticsPath.split('.')[0]);
            const layer = dataviz.getStatisticsLayer(statisticsPath.split('.')[1]);
            const domainMax = Math.max(...Array.from(Object.keys(statistics.attributes).map( function(id) {
                const comparisonKey = __guard__(__guard__(statistics.attributes[id] != null ? statistics.attributes[id][type] : undefined, x1 => x1[layer]), x => x.comparison);
                if (isNaN(+__guard__(__guard__(statistics.attributes[id] != null ? statistics.attributes[id][type] : undefined, x3 => x3[layer]), x2 => x2[comparisonKey]))) {
                return 0;
                } else { return +statistics.attributes[id][type][layer][comparisonKey]; }
            }) || []));
            app.vent.trigger('statisticsDomainMax', domainMax);
            const geojson = divisions.map(division => {
                return {
                    geometry: {
                        coordinates: division.get('boundary').coordinates,
                        type: 'MultiPolygon'
                    },
                    type: 'Feature',
                    properties:
                        _.extend({}, __guard__(__guard__(statistics.attributes[division.get('origin_id')], x1 => x1[type]), x => x[layer]), {name: division.get('name')})
                };
            });
            return L.geoJson(geojson, {
                weight: 1,
                color: '#000',
                fillColor: '#000',
                style(feature) {
                    return {fillOpacity: +(((feature.properties != null ? feature.properties.normalized : undefined) != null) && feature.properties.normalized)};
                },
                onEachFeature(feature, layer) {
                    const popupOpts = {
                        className: 'position',
                        offset: L.point(0, -15)
                    };
                    const popup = L.popup(popupOpts)
                        .setContent(jade.template('statistic-popup', feature.properties));
                    return layer.bindPopup(popup);
                }
            }
            ).addTo(this.map);
        }

        drawDivisions(divisions) {
            const geojson = {
                coordinates: this._combineMultiPolygons(divisions.pluck('boundary')),
                type: 'MultiPolygon'
            };
            return this.drawDivisionGeometry(geojson);
        }

        drawDivision(division) {
            if (division == null) {
                return;
            }
            return this.drawDivisionGeometry(division.get('boundary'));
        }

        highlightUnselectedUnit(unit) {
            // Transiently highlight the unit which is being moused
            // over in search results or otherwise temporarily in focus.
            const { marker } = unit;
            const popup = marker != null ? marker.popup : undefined;
            if (popup != null ? popup.selected : undefined) {
                return;
            }
            this._clearOtherPopups(popup, {clearSelected: true});
            if (popup != null) {
                $(marker.popup._wrapper).removeClass('selected');
                popup.setLatLng(marker != null ? marker.getLatLng() : undefined);
                return this.popups.addLayer(popup);
            }
        }

        clusterPopup(event) {
            const cluster = event.layer;
            // Maximum number of displayed names per cluster.
            const COUNT_LIMIT = 3;
            const childCount = cluster.getChildCount();
            let names = _.map(cluster.getAllChildMarkers(), marker => p13n.getTranslatedAttr(marker.unit.get('name'))).sort();
            const data = {};
            const overflowCount = childCount - COUNT_LIMIT;
            if (overflowCount > 1) {
                names = names.slice(0, COUNT_LIMIT);
                data.overflow_message = i18n.t('general.more_units',
                    {count: overflowCount});
            }
            data.names = names;
            const popuphtml = jade.getTemplate('popup_cluster')(data);
            const popup = this.createPopup();
            popup.setLatLng(cluster.getBounds().getCenter());
            popup.setContent(popuphtml);
            cluster.popup = popup;
            this.map.on('zoomstart', () => {
                return this.popups.removeLayer(popup);
            });
            return popup;
        }

        _addMouseoverListeners(markerClusterGroup){
            let icon;
            this.bindDelayedPopup(markerClusterGroup, null, {
                showEvent: 'clustermouseover',
                hideEvent: 'clustermouseout',
                popupCreateFunction: _.bind(this.clusterPopup, this)
            }
            );
            markerClusterGroup.on('spiderfied', e => {
                icon = $(e.target._spiderfied != null ? e.target._spiderfied._icon : undefined);
                return (icon != null ? icon.fadeTo('fast', 0) : undefined);
            });

            this._lastOpenedClusterIcon = null;
            return markerClusterGroup.on('spiderfied', e => {
                // Work around css hover forced opacity showing the
                // clicked cluster which should be hidden.
                if (this._lastOpenedClusterIcon) {
                    L.DomUtil.removeClass(this._lastOpenedClusterIcon, 'hidden');
                }
                icon = e.target._spiderfied._icon;
                L.DomUtil.addClass(icon, 'hidden');
                return this._lastOpenedClusterIcon = icon;
            });
        }

        getZoomlevelToShowAllMarkers() {
            const layer = p13n.get('map_background_layer');
            if (layer === 'guidemap') {
                return 8;
            } else if (layer === 'ortographic') {
                return 8;
            } else {
                return 14;
            }
        }

        getServices() {
            return null;
        }

        createClusterIcon(cluster) {
            let ctor;
            const count = cluster.getChildCount();
            const serviceIds = {};
            const serviceId = null;
            const markers = cluster.getAllChildMarkers();
            const services = this.getServices();
            _.each(markers, marker => {
                let root;
                if (marker.unit == null) {
                    return;
                }
                if (marker.popup != null) {
                    cluster.on('remove', event => {
                        return this.popups.removeLayer(marker.popup);
                    });
                }
                if (!services || services.isEmpty()) {
                    root = __guard__(marker.unit.get('root_ontologytreenodes'), x => x[0]) || 1400;
                } else {
                    const service = services.find(s => {
                        let needle;
                        return (needle = s.get('root'), Array.from(marker.unit.get('root_ontologytreenodes')).includes(needle));
                    });
                    root = (service != null ? service.get('root') : undefined) || 1400;
                }
                return serviceIds[root] = true;
            });
            cluster.on('remove', event => {
                if (cluster.popup != null) {
                    return this.popups.removeLayer(cluster.popup);
                }
            });
            const colors = _(serviceIds).map((val, id) => {
                return app.colorMatcher.serviceRootIdColor(id);
            });

            if (MARKER_POINT_VARIANT) {
                ctor = widgets.PointCanvasClusterIcon;
            } else {
                ctor = widgets.CanvasClusterIcon;
            }
            const iconOpts = {};
            if (_(markers).find(m => __guard__(__guard__(m != null ? m.unit : undefined, x1 => x1.collection), x => x.hasReducedPriority())) != null) {
                iconOpts.reducedProminence = true;
            }
            return new ctor(count, this.getIconSize(), colors, null,
                iconOpts);
        }

        getFeatureGroup() {
            const featureGroup = L.markerClusterGroup({
                showCoverageOnHover: false,
                maxClusterRadius: zoom => {
                    if (zoom >= map.MapUtils.getZoomlevelToShowAllMarkers()) { return 4; } else { return 30; }
                },
                iconCreateFunction: cluster => {
                    return this.createClusterIcon(cluster);
                },
                zoomToBoundsOnClick: true
            });
            featureGroup._getExpandedVisibleBounds = function() {
                const bounds = featureGroup._map._originalGetBounds();
                const sw = bounds._southWest;
                const ne = bounds._northEast;
                const latDiff = L.Browser.mobile ? 0 : Math.abs(sw.lat - ne.lat) / 4;
                const lngDiff = L.Browser.mobile ? 0 : Math.abs(sw.lng - ne.lng) / 4;
                return new L.LatLngBounds(
                    new L.LatLng(sw.lat - latDiff, sw.lng - lngDiff, true),
                    new L.LatLng(ne.lat + latDiff, ne.lng + lngDiff, true));
            };
            return featureGroup;
        }

        createMarker(unit, markerOptions) {
            let marker;
            const id = unit.get('id');
            if (id in this.markers) {
                marker = this.markers[id];
                marker.unit = unit;
                unit.marker = marker;
                return marker;
            }

            const icon = this.createIcon(unit, this.selectedServices);
            marker = widgets.createMarker(map.MapUtils.latLngFromGeojson(unit), {
                reducedProminence: (unit.collection != null ? unit.collection.hasReducedPriority() : undefined),
                icon,
                zIndexOffset: 100
            }
            );
            marker.unit = unit;
            unit.marker = marker;
            if (this.selectMarker != null) {
                marker.on('click', this.selectMarker);
            }

            marker.on('remove', event => {
                marker = event.target;
                if (marker.popup != null) {
                    return this.popups.removeLayer(marker.popup);
                }
            });

            const popup = this.createPopup(unit);
            popup.setLatLng(marker.getLatLng());
            this.bindDelayedPopup(marker, popup);

            return this.markers[id] = marker;
        }

        createGeometry(unit, geometry, opts) {
            const id = unit.get('id');
            if (id in this.geometries) {
                geometry = this.geometries[id];
                unit.geometry = geometry;
                return geometry;
            }

            geometry = L.geoJson(geometry, { style: feature => {
                return {
                    weight: 8,
                    color: '#cc2121',
                    opacity: 0.6
                };
            }
        }
            );

            unit.geometry = geometry;

            return this.geometries[id] = geometry;
        }


        _clearOtherPopups(popup, opts) {
            return this.popups.eachLayer(layer => {
                if (layer === popup) {
                    return;
                }
                if ((opts != null ? opts.clearSelected : undefined) || !layer.selected) {
                    return this.popups.removeLayer(layer);
                }
            });
        }

        bindDelayedPopup(marker, popup, opts) {
            let _popup;
            const showEvent = (opts != null ? opts.showEvent : undefined) || 'mouseover';
            const hideEvent = (opts != null ? opts.hideEvent : undefined) || 'mouseout';
            const delay = (opts != null ? opts.delay : undefined) || 600;
            if (marker && popup) {
                marker.popup = popup;
                popup.marker = marker;
            }

            let prevent = false;
            let createdPopup = null;

            const popupOn = event => {
                if (!prevent) {
                    if ((opts != null ? opts.popupCreateFunction : undefined) != null) {
                        _popup = opts.popupCreateFunction(event);
                        createdPopup = _popup;
                    } else {
                        _popup = popup;
                    }
                    this._clearOtherPopups(_popup, {clearSelected: false});
                    this.popups.addLayer(_popup);
                }
                return prevent = false;
            };

            const popupOff = event => {
                if ((opts != null ? opts.popupCreateFunction : undefined)) {
                    _popup = createdPopup;
                } else {
                    _popup = popup;
                }
                if (_popup != null) {
                    if ((this.selectedUnits != null) && ((_popup.marker != null ? _popup.marker.unit : undefined) === this.selectedUnits.first())) {
                        prevent = true;
                    } else {
                        this.popups.removeLayer(_popup);
                    }
                }
                return _.delay((() => prevent = false), delay);
            };

            marker.on(hideEvent, popupOff);
            return marker.on(showEvent, _.debounce(popupOn, delay));
        }

        createPopup(unit, opts, offset) {
            const popup = this.createPopupWidget(opts, offset);
            if (unit != null) {
                const htmlContent = `<div class='unit-name'>${unit.getText('name')}</div>`;
                popup.setContent(htmlContent);
            }
            return popup;
        }

        createPopupWidget(opts, offset) {
            const defaults = {
                closeButton: false,
                autoPan: false,
                zoomAnimation: false,
                className: 'unit',
                maxWidth: 500,
                minWidth: 150
            };
            if (opts != null) {
                opts = _.defaults(opts, defaults);
            } else {
                opts = defaults;
            }
            if (offset != null) { opts.offset = offset; }
            return new widgets.LeftAlignedPopup(opts);
        }

        createIcon(unit, services) {
            let ctor, icon;
            const color = app.colorMatcher.unitColor(unit) || 'rgb(255, 255, 255)';
            if (MARKER_POINT_VARIANT) {
                ctor = widgets.PointCanvasIcon;
            } else {
                ctor = widgets.PlantCanvasIcon;
            }
            const iconOptions = {};
            if (unit.collection != null ? unit.collection.hasReducedPriority() : undefined) {
                iconOptions.reducedProminence = true;
            }
            return icon = new ctor(this.getIconSize(), color, unit.id, iconOptions);
        }
    }
    MapBaseView.initClass();

    return MapBaseView;
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}