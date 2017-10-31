/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let AccessibilityPersonalisationView;
    const base = require('app/views/base');

    return AccessibilityPersonalisationView = (function() {
        AccessibilityPersonalisationView = class AccessibilityPersonalisationView extends base.SMItemView {
            static initClass() {
                this.prototype.className = 'accessibility-personalisation';
                this.prototype.template = 'accessibility-personalisation';
            }
            initialize({activeModes}) {
                this.activeModes = activeModes;
            }
            serializeData() {
                return {accessibility_viewpoints: this.activeModes};
            }
        };
        AccessibilityPersonalisationView.initClass();
        return AccessibilityPersonalisationView;
    })();
});
