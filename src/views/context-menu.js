/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const base = require('app/views/base');

    class ToolMenuItem extends base.SMItemView {
        static initClass() {
            this.prototype.className = 'context-menu-item';
            this.prototype.tagName = 'li';
            this.prototype.template = 'context-menu-item';
        }
        initialize(opts) {
            super.initialize(opts);
            return this.$el.on('click', this.model.get('action'));
        }
    }
    ToolMenuItem.initClass();

    class ContextMenuCollectionView extends base.SMCollectionView {
        static initClass() {
            this.prototype.className = 'context-menu';
            this.prototype.tagName = 'ul';
            this.prototype.childView = ToolMenuItem;
        }
    }
    ContextMenuCollectionView.initClass();

    class ContextMenuView extends base.SMLayout {
        static initClass() {
            this.prototype.className = 'context-menu-wrapper';
            this.prototype.template = 'context-menu-wrapper';
            this.prototype.regions =
                {contents: '.contents'};
        }
        initialize(opts) {
            this.opts = opts;
        }
        onShow() {
            return this.contents.show(new ContextMenuCollectionView(this.opts));
        }
    }
    ContextMenuView.initClass();

    return ContextMenuView;
});
