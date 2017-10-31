/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let SMCollectionView, SMCompositeView, SMItemView, SMLayout;
    const Marionette = require('backbone.marionette');

    const jade       = require('app/jade');
    const {mixOf}    = require('app/base');

    class SMTemplateMixin {
        mixinTemplateHelpers(data) {
            jade.mixinHelpers(data);
            return data;
        }
        getTemplate() {
            return jade.getTemplate(this.template);
        }
    }

    class KeyboardHandlerMixin {
        constructor() {
            this.keyboardHandler = this.keyboardHandler.bind(this);
        }

        keyboardHandler(callback, keys) {
            const codes = _(keys).map(key => {
                switch (key) {
                    case 'enter': return 13;
                    case 'space': return 32;
                }
            });
            const handle = _.bind(callback, this);
            return event => {
                event.stopPropagation();
                if (Array.from(codes).includes(event.which)) { return handle(event); }
            };
        }
    }

    class ToggleMixin {
        toggleCollapse(ev) {
            ev.preventDefault();
            this.collapsed = !this.collapsed;
            if (this.collapsed) {
                this.hideContents();
            } else {
                this.showContents();
            }
            return this.setMaxHeight();
        }

        setMaxHeight() {
            const $limitedElement = this.$el.find('.limit-max-height');
            if (!$limitedElement.length) { return; }
            const maxHeight = $(window).innerHeight() - $limitedElement.offset().top;
            return $limitedElement.css({'max-height': maxHeight});
        }
    }

    class ReadyMixin {
        isReady() { return true; }
    }

    return {
        SMItemView: (SMItemView = class SMItemView extends mixOf(Marionette.ItemView, SMTemplateMixin, KeyboardHandlerMixin, ReadyMixin) {}),
        SMCollectionView: (SMCollectionView = class SMCollectionView extends mixOf(Marionette.CollectionView, SMTemplateMixin, KeyboardHandlerMixin, ReadyMixin) {}),
        SMLayout: (SMLayout = class SMLayout extends mixOf(Marionette.LayoutView, SMTemplateMixin, KeyboardHandlerMixin, ToggleMixin, ReadyMixin) {}),
        SMCompositeView: (SMCompositeView = class SMCompositeView extends mixOf(Marionette.CompositeView, SMTemplateMixin, ToggleMixin, ReadyMixin) {})
    };
});
