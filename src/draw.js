/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _              = require('underscore');

    const p13n           = require('app/p13n');
    const {getIeVersion} = require('app/base');

    // Define colors for berries by background-layer
    const COLORS = {
        servicemap: {
            strokeStyle: '#333',
            fillStyle: '#000'
        },
        ortographic: {
            strokeStyle: '#fff',
            fillStyle: '#000'
        },
        guidemap: {
            strokeStyle: '#333',
            fillStyle: '#000'
        },
        accessible_map: {
            strokeStyle: '#333',
            fillStyle: '#000'
        }
    };

    const getColor = function(property) {
        const background = p13n.get('map_background_layer');
        return COLORS[background][property];
    };

    class CanvasDrawer {
        static initClass() {
            this.prototype.referenceLength = 4500;
        }
        strokePath(c, callback) {
            c.beginPath();
            callback(c);
            c.stroke();
            return c.closePath();
        }
        dim(part) {
            return this.ratio * this.defaults[part];
        }
    }
    CanvasDrawer.initClass();

    class Stem extends CanvasDrawer {
        static initClass() {
            this.prototype.defaults = {
                width: 250,
                base: 370,
                top: 2670,
                control: 1030
            };
        }
        constructor(size, rotation) {
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
            this.size = size;
            this.rotation = rotation;
            this.ratio = this.size / this.referenceLength;
        }


        startingPoint() {
            return [this.size/2, this.size];
        }
        berryCenter(rotation) {
            rotation = (Math.PI * rotation) / 180;
            const x = (0.8 * Math.cos(rotation) * this.dim('top')) + (this.size / 2);
            const y = ((- Math.sin(rotation) * this.dim('top')) + this.size) - this.dim('base');
            return [x, y];
        }
        setup(c) {
            c.lineJoin = 'round';
            c.strokeStyle = getColor('strokeStyle');
            c.lineCap = 'round';
            return c.lineWidth = this.dim('width');
        }
        draw(c) {
            this.setup(c);
            c.fillStyle = '#000';
            let point = this.startingPoint();
            this.strokePath(c, c => {
                c.moveTo(...Array.from(point || []));
                point[1] -= this.dim('base');
                c.lineTo(...Array.from(point || []));
                const controlPoint = point;
                controlPoint[1] -= this.dim('control');
                point = this.berryCenter(this.rotation);
                return c.quadraticCurveTo(...Array.from(controlPoint), ...Array.from(point));
            });
            return point;
        }
    }
    Stem.initClass();

    class Berry extends CanvasDrawer {
        static initClass() {
            this.prototype.defaults = {
                radius: 1000,
                stroke: 125
            };
        }
        constructor(size, point, color) {
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
            this.size = size;
            this.point = point;
            this.color = color;
            this.ratio = this.size / this.referenceLength;
        }
        draw(c) {
            c.beginPath();
            c.fillStyle = this.color;
            c.arc(...Array.from(this.point), this.defaults.radius * this.ratio, 0, 2 * Math.PI);
            c.fill();
            if (!getIeVersion() || !(getIeVersion() < 9)) {
                c.strokeStyle = 'rgba(0,0,0,1.0)';
                const oldComposite = c.globalCompositeOperation;
                c.globalCompositeOperation = "destination-out";
                c.lineWidth = 1.5;
                c.stroke();
                c.globalCompositeOperation = oldComposite;
            }
            c.closePath();
            c.beginPath();
            c.arc(...Array.from(this.point), (this.defaults.radius * this.ratio) - 1, 0, 2 * Math.PI);
            c.strokeStyle = '#fcf7f5';
            c.lineWidth = 1;
            c.stroke();
            return c.closePath();
        }
    }
    Berry.initClass();

    class Plant extends CanvasDrawer {
        constructor(size, color, id,
                      rotation,
                      translation) {
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
            this.size = size;
            this.color = color;
            if (rotation == null) { rotation = 70 + (id % 40); }
            this.rotation = rotation;
            if (translation == null) { translation = [0, -3]; }
            this.translation = translation;
            this.stem = new Stem(this.size, this.rotation);
        }
        draw(context) {
            this.context = context;
            this.context.save();
            this.context.translate(...Array.from(this.translation || []));
            const berryPoint = this.stem.draw(this.context);
            this.berry = new Berry(this.size, berryPoint, this.color);
            this.berry.draw(this.context);
            return this.context.restore();
        }
    }

    const drawSimpleBerry = function(c, x, y, radius, color) {
        c.fillStyle = color;
        c.beginPath();
        c.arc(x, y, radius, 0, 2 * Math.PI);
        return c.fill();
    };

    class PointCluster extends CanvasDrawer {
        constructor(size, colors, positions, radius) {
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
            this.draw = this.draw.bind(this);
            this.size = size;
            this.colors = colors;
            this.positions = positions;
            this.radius = radius;
        }
        draw(c) {
            return _.each(this.positions, pos => {
                return drawSimpleBerry(c, ...Array.from(pos), this.radius, "#000");
            });
        }
    }

    class PointPlant extends CanvasDrawer {
        constructor(size, color, radius) {
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
            this.draw = this.draw.bind(this);
            this.size = size;
            this.color = color;
            this.radius = radius;
            true;
        }
        draw(c) {
            return drawSimpleBerry(c, 10, 10, this.radius, "#f00");
        }
    }

    const FONT_SIZE = 48;
    const PADDING = 15;

    class NumberCircleMaker {
        constructor(diameter) {
            this.diameter = diameter;
        }

        stroke(c, callback) {
            c.beginPath();
            callback(c);
            c.fill();
            return c.closePath();
        }

        drawNumber(ctx, num, width) {
            const position = (width / 2) + PADDING;
            return ctx.fillText(num, position, position);
        }

        drawCircle(ctx, diameter) {
            return this.stroke(ctx, function(ctx) {
                const radius = (diameter / 2) + PADDING;
                return ctx.arc(radius, radius, radius, 0, 2 * Math.PI);
            });
        }

        initContext(ctx) {
            ctx.font = `bold ${FONT_SIZE}px sans-serif`;
            ctx.textBaseline = 'middle';
            return ctx.textAlign = 'center';
        }

        drawNumberedCircle(ctx, num) {
            this.initContext(ctx);
            num = num.toString();
            ctx.fillStyle = '#ffffff';
            const numberDimensions = ctx.measureText(num);
            const { width } = numberDimensions;
            const scalingFactor = this.diameter / (width + (2 * PADDING));
            ctx.save();
            ctx.scale(scalingFactor, scalingFactor);
            this.drawNumber(ctx, num, numberDimensions.width);
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#000000';
            this.drawCircle(ctx, numberDimensions.width);
            return ctx.restore();
        }
    }

    const exports = {
        Plant,
        PointCluster,
        PointPlant,
        NumberCircleMaker
    };

    return exports;
});

