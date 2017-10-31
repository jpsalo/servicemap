/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let LocationRefreshButtonView;
    const base = require('app/views/base');

    return LocationRefreshButtonView = (function() {
        LocationRefreshButtonView = class LocationRefreshButtonView extends base.SMLayout {
            static initClass() {
                this.prototype.template = 'location-refresh-button';
                this.prototype.events =
                    {'click': 'resetPosition'};
            }
            resetPosition(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                return app.request('resetPosition', null);
            }
            render() {
                super.render();
                return this.el;
            }
        };
        LocationRefreshButtonView.initClass();
        return LocationRefreshButtonView;
    })();
});
