/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let ToolMenu;
    const _           = require('underscore');
    const URI         = require('URI');
    const Backbone    = require('backbone');
    const i18n        = require('i18next');

    const base        = require('app/views/base');
    const ContextMenu = require('app/views/context-menu');
    const p13n        = require('app/p13n');

    // TODO: rename to tool menu
    return ToolMenu = (function() {
        ToolMenu = class ToolMenu extends base.SMLayout {
            static initClass() {
                this.prototype.template = 'tool-menu';
                this.prototype.regions =
                    {toolContext: '#tool-context'};
                this.prototype.events =
                    {'click': 'openMenu'};
            }
            openMenu(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                if (this.toolContext.currentView != null) {
                    this.toolContext.empty();
                    return;
                }
                const models = [
                    // TODO: implement functionality
                    // new Backbone.Model
                    //     name: i18n.t 'tools.link_action'
                    //     action: _.bind @linkAction, @
                    //     icon: 'outbound-link'
                    // new Backbone.Model
                    //     name: i18n.t 'tools.share_action'
                    //     action: _.bind @shareAction, @
                    //     icon: 'outbound-link'
                    new Backbone.Model({
                        name: i18n.t('tools.print_action'),
                        action: _.bind(this.printAction, this),
                        icon: 'map-options'
                    }),
                    new Backbone.Model({
                        name: i18n.t('tools.measure_action'),
                        action: _.bind(this.measureAction, this),
                        icon: 'measuring-tool'
                    }),
                    new Backbone.Model({
                        name: i18n.t('tools.export_action'),
                        action: _.bind(this.exportAction, this),
                        icon: 'outbound-link'
                    }),
                    new Backbone.Model({
                        name: i18n.t('tools.embed_action'),
                        action: _.bind(this.embedAction, this),
                        icon: 'outbound-link'
                    }),
                    new Backbone.Model({
                        name: i18n.t('tools.feedback_action'),
                        action: _.bind(this.feedbackAction, this),
                        icon: 'feedback'
                    }),
                    new Backbone.Model({
                        name: i18n.t('tools.info_action'),
                        action: _.bind(this.infoAction, this),
                        icon: 'info'
                    })
                ];
                const menu = new ContextMenu({collection: new Backbone.Collection(models)});
                this.toolContext.show(menu);
                return $(document).one('click', ev => {
                    return this.toolContext.empty();
                });
            }
            printAction(ev) {
                return app.request('printMap');
            }
            measureAction(ev) {
                return app.request("activateMeasuringTool");
            }
            linkAction(ev) {
                return console.log('link action clicked');
            }
            shareAction(ev) {
                return console.log('share action clicked');
            }
            embedAction(ev) {
                const url = URI(window.location.href);
                let directory = url.directory();
                directory = `/embedder${directory}`;
                url.directory(directory);
                url.port('');
                const query = url.search(true);
                query.bbox = this.getMapBoundsBbox();
                const city = p13n.getCities();
                if (city != null) {
                    query.city = city;
                }
                const background = p13n.get('map_background_layer');
                if (!['servicemap', 'guidemap'].includes(background)) {
                    query.map = background;
                }
                query.ratio = parseInt((100 * window.innerHeight) / window.innerWidth);
                url.search(query);
                return window.location.href = url.toString();
            }
            exportAction(ev) {
                return app.request('showExportingView');
            }
            feedbackAction(ev) {
                return app.request('composeFeedback', null);
            }
            infoAction(ev) {
                return app.request('showServiceMapDescription');
            }
            getMapBoundsBbox() {
                // TODO: don't break architecture thusly
                const __you_shouldnt_access_me_like_this = window.mapView.map;
                const wrongBbox = __you_shouldnt_access_me_like_this._originalGetBounds().toBBoxString().split(',');
                const rightBbox = _.map([1,0,3,2], i => wrongBbox[i].slice(0,8));
                return rightBbox.join(',');
            }
            render() {
                super.render();
                return this.el;
            }
        };
        ToolMenu.initClass();
        return ToolMenu;
    })();
});
