/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let CancelToken;
    const Backbone = require('backbone');

    return (CancelToken = class CancelToken extends Backbone.Model {
        initialize() {
            this.handlers = [];
            this.set('active', false);
            this.set('canceled', false);
            this.set('cancelable', true);
            return this.local = false;
        }
        addHandler(fn) {
            return this.handlers.push(fn);
        }
        activate(opts) {
            if (opts != null ? opts.local : undefined) { this.local = true; }
            this.set('active', true, opts);
            return this.trigger('activated');
        }
        cancel() {
            this.set('canceled', true);
            this.set('status', 'canceled');
            this.trigger('canceled');
            let i = this.handlers.length - 1;
            while (i > -1) {
                this.handlers[i--]();
            }
            return undefined;
        }
        complete() {
            this.set('active', false);
            this.set('complete', true);
            return this.trigger('complete');
        }
        canceled() {
            return this.get('canceled');
        }
    });
});
