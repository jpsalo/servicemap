/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS201: Simplify complex destructure assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const leaflet = require('leaflet');
    const p4j     = require('proj4leaflet');
    const _       = require('underscore');

    const sm      = require('app/base');
    const dataviz = require('app/data-visualization');

    const RETINA_MODE = window.devicePixelRatio > 1;

    const getMaxBounds = layer => L.latLngBounds(L.latLng(59.4, 23.8), L.latLng(61.5, 25.8));

    const wmtsPath = function(style, language) {
        const stylePath =
            style === 'accessible_map' ?
                language === 'sv' ?
                    "osm-sm-visual-sv/etrs_tm35fin"
                :
                    "osm-sm-visual/etrs_tm35fin"
            : RETINA_MODE ?
                language === 'sv' ?
                    "osm-sm-sv-hq/etrs_tm35fin_hq"
                :
                    "osm-sm-hq/etrs_tm35fin_hq"
            :
                language === 'sv' ?
                    "osm-sm-sv/etrs_tm35fin"
                :
                    "osm-sm/etrs_tm35fin";
        const path = [
            "https://geoserver.hel.fi/mapproxy/wmts",
            stylePath,
            "{z}/{x}/{y}.png"
        ];
        return path.join('/');
    };

    const makeLayer = {
        tm35: {
            crs() {
                const crsName = 'EPSG:3067';
                const projDef = '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
                const bounds = L.bounds(L.point(-548576, 6291456), L.point(1548576, 8388608));
                const originNw = [bounds.min.x, bounds.max.y];
                const crsOpts = {
                    resolutions: [8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125],
                    bounds,
                    transformation: new L.Transformation(1, -originNw[0], -1, originNw[1])
                };
                return new L.Proj.CRS(crsName, projDef, crsOpts);
            },

            layer(opts) {
                return L.tileLayer(wmtsPath(opts.style, opts.language), {
                    maxZoom: 15,
                    minZoom: 6,
                    continuousWorld: true,
                    tms: false
                }
                );
            }
        },

        gk25: {
            crs() {
                const crsName = 'EPSG:3879';
                const projDef = '+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=25500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

                const bounds = [25440000, 6630000, 25571072, 6761072];
                return new L.Proj.CRS.TMS(crsName, projDef, bounds,
                    {resolutions: [256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125]});
            },

            layer(opts) {
                const geoserverUrl = (layerName, layerFmt) => `https://kartta.hel.fi/ws/geoserver/gwc/service/tms/1.0.0/${layerName}@ETRS-GK25@${layerFmt}/{z}/{x}/{y}.${layerFmt}`;
                if (opts.style === 'ortographic') {
                    return new L.Proj.TileLayer.TMS(geoserverUrl("kanslia_palvelukartta:Ortoilmakuva_2013_PKS", "jpeg"), opts.crs, {
                        maxZoom: 10,
                        minZoom: 2,
                        continuousWorld: true,
                        tms: false
                    }
                    );
                } else {
                    const guideMapUrl = geoserverUrl("kanslia_palvelukartta:Karttasarja", "gif");
                    const guideMapOptions = {
                        maxZoom: 12,
                        minZoom: 2,
                        continuousWorld: true,
                        tms: false
                    };
                    return (new L.Proj.TileLayer.TMS(guideMapUrl, opts.crs, guideMapOptions)).setOpacity(0.8);
                }
            }
        }
    };

    const SMap = L.Map.extend({
        refitAndAddLayer(layer) {
            this.mapState.adaptToLayer(layer);
            return this.addLayer(layer);
        },
        refitAndAddMarker(marker) {
            this.mapState.adaptToLatLngs([marker.getLatLng()]);
            return this.addLayer(marker);
        },
        adaptToLatLngs(latLngs) {
            return this.mapState.adaptToLatLngs(latLngs);
        },
        setMapView(viewOptions) {
            return this.mapState.setMapView(viewOptions);
        },
        adapt() {
            return this.mapState.adaptToBounds(null);
        }
    });

    class MapMaker {
        static makeBackgroundLayer(options) {
            const coordinateSystem = (() => { switch (options.style) {
                case 'guidemap': return 'gk25';
                case 'ortographic': return 'gk25';
                default: return 'tm35';
            } })();
            const layerMaker = makeLayer[coordinateSystem];
            const crs = layerMaker.crs();
            options.crs = crs;
            const tileLayer = layerMaker.layer(options);
            tileLayer.on('tileload', e => {
                return e.tile.setAttribute('alt', '');
            });
            return {
                layer: tileLayer,
                crs
            };
        }
        static createMap(domElement, options, mapOptions, mapState) {
            const {layer, crs} = MapMaker.makeBackgroundLayer(options);
            const defaultMapOptions = {
                crs,
                continuusWorld: true,
                worldCopyJump: false,
                zoomControl: false,
                closePopupOnClick: false,
                maxBounds: getMaxBounds(options.style),
                layers: [layer],
                preferCanvas: true
            };
            _.extend(defaultMapOptions, mapOptions);
            const map = new SMap(domElement, defaultMapOptions);
            if (mapState != null) {
                mapState.setMap(map);
            }
            map.crs = crs;
            map._baseLayer = layer;
            return map;
        }
    }

    class MapUtils {
        static createPositionMarker(latLng, accuracy, type, opts) {
            let marker;
            const Z_INDEX = -1000;
            switch (type) {
                case 'detected':
                    opts = {
                        icon: L.divIcon({
                            iconSize: L.point(40, 40),
                            iconAnchor: L.point(20, 39),
                            className: 'servicemap-div-icon',
                            html: '<span class="icon-icon-you-are-here"></span'
                        }),
                        zIndexOffset: Z_INDEX
                    };
                    marker = L.marker(latLng, opts);
                    break;
                case 'clicked':
                    marker = L.circleMarker(latLng, {
                        color: '#666',
                        weight: 2,
                        opacity: 1,
                        fill: false,
                        clickable: ((opts != null ? opts.clickable : undefined) != null) ? opts.clickable : false,
                        zIndexOffset: Z_INDEX
                    }
                    );
                    marker.setRadius(6);
                    break;
                case 'address':
                    opts = {
                        zIndexOffset: Z_INDEX,
                        icon: L.divIcon({
                            iconSize: L.point(40, 40),
                            iconAnchor: L.point(20, 39),
                            className: 'servicemap-div-icon',
                            html: '<span class="icon-icon-address"></span'
                        })
                    };
                    marker = L.marker(latLng, opts);
                    break;
            }
            return marker;
        }

        static overlappingBoundingBoxes(map) {
            let latLngBounds;
            let y;
            const { crs } = map;
            if (map._originalGetBounds != null) {
                latLngBounds = map._originalGetBounds();
            } else {
                latLngBounds = map.getBounds();
            }
            const METER_GRID = 1000;
            const DEBUG_GRID = false;
            let ne = crs.project(latLngBounds.getNorthEast());
            let sw = crs.project(latLngBounds.getSouthWest());
            const min = {x: ne.x, y: sw.y};
            const max = {y: ne.y, x: sw.x};

            const snapToGrid = coord => parseInt(coord / METER_GRID) * METER_GRID;
            const coordinates = {};
            for (let dim of ['x', 'y']) {
                coordinates[dim] = coordinates[dim] || {};
                for (let value = min[dim], end = max[dim], asc = min[dim] <= end; asc ? value <= end : value >= end; asc ? value++ : value--) {
                    coordinates[dim][parseInt(snapToGrid(value))] = true;
                }
            }

            const pairs = _.flatten(
                ((() => {
                const result = [];
                for (y of Array.from(_.keys(coordinates.y))) {                     result.push((() => {
                        const result1 = [];
                        for (let x of Array.from(_.keys(coordinates.x))) {                             result1.push([parseInt(x), parseInt(y)]);
                        }
                        return result1;
                    })());
                }
                return result;
            })()),
                true);

            const bboxes = _.map(pairs, function(...args) { let x, y; [x, y] = Array.from(args[0]); return [[x, y], [x + METER_GRID, y + METER_GRID]]; });
            if (DEBUG_GRID) {
                this.debugGrid.clearLayers();
                for (let bbox of Array.from(bboxes)) {
                    sw = crs.projection.unproject(L.point(...Array.from(bbox[0] || [])));
                    ne = crs.projection.unproject(L.point(...Array.from(bbox[1] || [])));
                    const sws = [sw.lat, sw.lng].join();
                    const nes = [ne.lat, ne.lng].join();
                    if (!this.debugCircles[sws]) {
                        this.debugGrid.addLayer(L.circle(sw, 10));
                        this.debugCircles[sws] = true;
                    }
                    if (!this.debugCircles[nes]) {
                        this.debugGrid.addLayer(L.circle(ne, 10));
                        this.debugCircles[nes] = true;
                    }
                }
            }
                    // rect = L.rectangle([sw, ne])
                    // @debugGrid.addLayer rect
            return bboxes;
        }

        static latLngFromGeojson(object) {
            return L.latLng(__guard__(__guard__(object != null ? object.get('location') : undefined, x1 => x1.coordinates), x => x.slice(0).reverse()));
        }

        static getZoomlevelToShowAllMarkers() {
            const layer = p13n.get('map_background_layer');
            if (layer === 'guidemap') {
                return 8;
            } else if (layer === 'ortographic') {
                return 8;
            } else {
                return 14;
            }
        }

        static createHeatmapLayer(id) {
            /*L.tileLayer.wms "http://geoserver.hel.fi/geoserver/popdensity/wms",
                layers: id,
                format: 'image/png',
                transparent: true*/
                // TODO: select data set with style: parameter
            return L.tileLayer(dataviz.heatmapLayerPath(id), { bounds: [[60.09781624004459, 24.502779123289532],
                [60.39870150471201, 25.247861779136283]]
        });
        }
    }

    const makeDistanceComparator = p13n => {
        const createFrom = position => {
            return obj => {
                const [a, b] = Array.from([MapUtils.latLngFromGeojson(position), MapUtils.latLngFromGeojson(obj)]);
                const result = a.distanceTo(b);
                return result;
            };
        };
        const position = p13n.getLastPosition();
        if (position != null) {
            return createFrom(position);
        }
    };

    return {
        MapMaker,
        MapUtils,
        makeDistanceComparator
    };
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}