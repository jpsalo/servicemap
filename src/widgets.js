/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const leaflet       = require('leaflet');
    const markercluster = require('leaflet.markercluster');
    const _             = require('underscore');
    const $             = require('jquery');
    const Backbone      = require('backbone');

    const draw          = require('app/draw');
    const jade          = require('app/jade');

    const anchor = function(size) {
        const x = (size.x/3) + 5;
        const y = (size.y/2) + 16;
        return new L.Point(x, y);
    };

    let SMMarker = L.Marker;
    let REDUCED_OPACITY = 1;

    const initializer = function() {
        // BEGIN hack to enable transparent markers
        REDUCED_OPACITY = 0.5;
        const OriginalMarkerCluster = L.MarkerCluster;
        const SMMarkerCluster = L.MarkerCluster.extend({
            setOpacity(opacity) {
                const children = this.getAllChildMarkers();
                let reducedProminence = false;
                if (children.length) {
                    reducedProminence = __guard__(children[0].unit != null ? children[0].unit.collection : undefined, x => x.hasReducedPriority());
                }
                if (reducedProminence && (opacity === 1)) {
                    opacity = REDUCED_OPACITY;
                }
                return OriginalMarkerCluster.prototype.setOpacity.call(this, opacity);
            }
        });
        L.MarkerCluster = SMMarkerCluster;

        return SMMarker = L.Marker.extend({
            setOpacity(opacity) {
                if (this.options.reducedProminence && (opacity === 1)) {
                    opacity = REDUCED_OPACITY;
                }
                return L.Marker.prototype.setOpacity.call(this, opacity);
            }
        });
    };
        // END hack
    const createMarker = (...args) => new SMMarker(...Array.from(args || []));

    const CanvasIcon = L.Icon.extend({
        initialize(dimension, options) {
            this.dimension = dimension;
            this.options.iconSize = new L.Point(this.dimension, this.dimension);
            this.options.iconAnchor = this.iconAnchor();
            this.options.reducedProminence = options != null ? options.reducedProminence : undefined;
            return this.options.pixelRatio = function(el) {
                const context = el.getContext('2d');
                const devicePixelRatio = window.devicePixelRatio || 1;
                const backingStoreRatio = context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio || context.msBackingStorePixelRatio || context.oBackingStorePixelRatio || context.backingStorePixelRatio || 1;
                return devicePixelRatio / backingStoreRatio;
            };
        },
        options: {
            className: 'leaflet-canvas-icon'
        },
        setupCanvas() {
            const el = document.createElement('canvas');
            const context = el.getContext('2d');
            // Set ratio based on device dpi
            const ratio = this.options.pixelRatio(el);
            // If the IE Canvas polyfill is installed, the element needs to be specially
            // initialized.
            if (typeof G_vmlCanvasManager !== 'undefined' && G_vmlCanvasManager !== null) {
                G_vmlCanvasManager.initElement(el);
            }
            this._setIconStyles(el, 'icon');
            const s = this.options.iconSize;
            // Set el width based on device dpi
            el.width = s.x * ratio;
            el.height = s.y * ratio;
            el.style.width = s.x + 'px';
            el.style.height = s.y + 'px';
            // Scale down to normal
            context.scale(ratio, ratio);
            if (this.options.reducedProminence) {
                L.DomUtil.setOpacity(el, REDUCED_OPACITY);
            }
            return el;
        },
        createIcon() {
            const el = this.setupCanvas();
            this.draw(el.getContext('2d'));
            return el;
        },
        createShadow() {
            return null;
        },
        iconAnchor() {
            return anchor(this.options.iconSize);
        }
    });

    const CirclePolygon = L.Polygon.extend({
        initialize(latLng, radius, options) {
            this.circle = L.circle(latLng, radius);
            const latLngs = this._calculateLatLngs();
            return L.Polygon.prototype.initialize.call(this, [latLngs], options);
        },
        _calculateLatLngs() {
            const bounds = this.circle.getBounds();
            const north = bounds.getNorth();
            const east = bounds.getEast();
            const center = this.circle.getLatLng();
            const lngRadius = east - center.lng;
            const latRadius = north - center.lat;
            const STEPS = 180;
            return (() => {
                const result = [];
                for (let i = 0, end = STEPS, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                    const rad = (2 * i * Math.PI) / STEPS;
                    result.push([center.lat + (Math.sin(rad) * latRadius),
                     center.lng + (Math.cos(rad) * lngRadius)]);
                }
                return result;
            })();
        }});

    return {
        PlantCanvasIcon: CanvasIcon.extend({
            initialize(dimension, color, id, options) {
                this.dimension = dimension;
                this.color = color;
                CanvasIcon.prototype.initialize.call(this, this.dimension, options);
                return this.plant = new draw.Plant(this.dimension, this.color, id);
            },
            draw(ctx) {
                return this.plant.draw(ctx);
            }
        }),

        PointCanvasIcon: CanvasIcon.extend({
            initialize(dimension, color, id) {
                this.dimension = dimension;
                this.color = color;
                CanvasIcon.prototype.initialize.call(this, this.dimension);
                return this.drawer = new draw.PointPlant(this.dimension, this.color, 2);
            },
            draw(ctx) {
                return this.drawer.draw(ctx);
            }
        }),

        CanvasClusterIcon: CanvasIcon.extend({
            initialize(count, dimension, colors, id, options) {
                this.count = count;
                this.dimension = dimension;
                this.colors = colors;
                CanvasIcon.prototype.initialize.call(this, this.dimension, options);
                this.options.iconSize = new L.Point(this.dimension + 30, this.dimension + 30);
                if (this.count > 5) {
                    this.count = 5;
                }
                const rotations = [130,110,90,70,50];
                const translations = [[0,5],[10, 7],[12,8],[15,10],[5, 12]];
                return this.plants = _.map(__range__(1, this.count, true), i => {
                    return new draw.Plant(this.dimension, this.colors[(i-1) % this.colors.length],
                        id, rotations[i-1], translations[i-1]);
                });
            },
            draw(ctx) {
                return Array.from(this.plants).map((plant) =>
                    plant.draw(ctx));
            }
        }),

        PointCanvasClusterIcon: CanvasIcon.extend({
            initialize(count, dimension, colors, id) {
                this.dimension = dimension;
                this.colors = colors;
                CanvasIcon.prototype.initialize.call(this, this.dimension);
                this.count = (Math.min(20, count) / 5) * 5;
                this.radius = 2;
                const range = () => {
                    return this.radius + (Math.random() * (this.dimension - (2 * this.radius)));
                };
                this.positions = _.map(__range__(1, this.count, true), i => {
                    return [range(), range()];
            });
                return this.clusterDrawer = new draw.PointCluster(this.dimension, this.colors, this.positions, this.radius);
            },
            draw(ctx) {
                return this.clusterDrawer.draw(ctx);
            }
        }),

        NumberCircleCanvasIcon: CanvasIcon.extend({
            initialize(number, dimension) {
                this.number = number;
                this.dimension = dimension;
                CanvasIcon.prototype.initialize.call(this, this.dimension);
                return this.drawer = new draw.NumberCircleMaker(this.dimension);
            },
            draw(ctx) {
                return this.drawer.drawNumberedCircle(ctx, this.number);
            }
        }),

        LeftAlignedPopup: L.Popup.extend({
            _updatePosition() {
                if (!this._map) {
                    return;
                }

                const pos = this._map.latLngToLayerPoint(this._latlng);
                const animated = this._animated;
                const offset = L.point(this.options.offset);

                const properOffset = {
                    x: 15,
                    y: -27
                };

                if (animated) {
                    pos.y = pos.y + properOffset.y;
                    pos.x = pos.x + properOffset.x;
                    L.DomUtil.setPosition(this._container, pos);
                }

                this._containerBottom = -offset.y - (animated ? 0 : pos.y + properOffset.y);
                this._containerLeft = offset.x + (animated ? 0 : pos.x + properOffset.x);

                // bottom position the popup in case the height of the popup changes (images loading etc)
                this._container.style.bottom = this._containerBottom + 'px';
                return this._container.style.left = this._containerLeft + 'px';
            }
        }),

        ControlWrapper: L.Control.extend({
            initialize(view, options) {
                this.view = view;
                return L.Util.setOptions(this, options);
            },
            onAdd(map) {
                return this.view.render();
            }
        }),

        initializer,
        createMarker,
        CirclePolygon
    };
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}