/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let RadiusControlsView;
    const base = require('app/views/base');

    return RadiusControlsView = (function() {
        RadiusControlsView = class RadiusControlsView extends base.SMItemView {
            static initClass() {
                this.prototype.template = 'radius-controls';
                this.prototype.className = 'radius-controls';
                this.prototype.events = {
                  change: 'onChange',
                  'click #close-radius': 'onUserClose'
              };
            }
            serializeData() {
                return {
                    selected: this.selected || 750,
                    values: [
                        250, 500, 750, 1000,
                        2000, 3000, 4000]
                };
            }
            initialize({radius: selected}) {
                this.selected = selected;
            }
            onChange(ev) {
                this.selected = $(ev.target).val();
                this.render();
                return app.request('setRadiusFilter', this.selected);
            }
            onUserClose(ev) {
                return app.request('clearRadiusFilter');
            }
        };
        RadiusControlsView.initClass();
        return RadiusControlsView;
    })();
});
