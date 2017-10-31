/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const p13n = require('app/p13n');
    const jade = require('app/jade');
    const base = require('app/views/base');

    class TitleView extends base.SMItemView {
        static initClass() {
            this.prototype.template = 'title-view';
            this.prototype.className = 'title-control';
        }
        initialize() {
            return this.listenTo(p13n, 'change', function(path) {
                if (path[0] === 'map_background_layer') { return this.render(); }
            });
        }
        serializeData() {
            return {
                map_background: p13n.get('map_background_layer'),
                lang: p13n.getLanguage(),
                root: appSettings.url_prefix
            };
        }
    }
    TitleView.initClass();

    class LandingTitleView extends base.SMItemView {
        static initClass() {
            this.prototype.template = 'landing-title-view';
            this.prototype.id = 'title';
            this.prototype.className = 'landing-title-control';
        }
        initialize() {
            this.listenTo(app.vent, 'title-view:hide', this.hideTitleView);
            return this.listenTo(app.vent, 'title-view:show', this.unHideTitleView);
        }
        serializeData() {
            return {
                isHidden: this.isHidden,
                lang: p13n.getLanguage()
            };
        }
        hideTitleView() {
            $('body').removeClass('landing');
            this.isHidden = true;
            return this.render();
        }
        unHideTitleView() {
            $('body').addClass('landing');
            this.isHidden = false;
            return this.render();
        }
    }
    LandingTitleView.initClass();

    return {
        TitleView,
        LandingTitleView
    };
});
