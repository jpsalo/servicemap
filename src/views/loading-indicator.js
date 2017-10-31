/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const i18n                   = require('i18next');
    const {SMItemView, SMLayout} = require('app/views/base');

    class LoadingIndicatorView extends SMItemView {
        static initClass() {
            this.prototype.className = 'loading-indicator';
            this.prototype.template = 'loading-indicator';
            this.prototype.events =
                {'click .cancel-button': 'onCancel'};
        }
        initialize({model}) {
            this.model = model;
            return this.listenTo(this.model, 'change', this.render);
        }
        serializeData() {
            const data = super.serializeData();
            if (data.status) {
                data.message = i18n.t(`progress.${data.status}`);
            } else {
                data.message = '';
            }
            return data;
        }
        onCancel(ev) {
            ev.preventDefault();
            return this.model.cancel();
        }
        onDomRefresh() {
            if (this.model.get('complete') || this.model.get('canceled')) {
                return this.$el.removeClass('active');
            } else {
                return this.$el.addClass('active');
            }
        }
    }
    LoadingIndicatorView.initClass();

    class SidebarLoadingIndicatorView extends SMLayout {
        static initClass() {
            this.prototype.template = 'sidebar-loading-indicator';
            this.prototype.regions =
                {indicator: '.loading-indicator-component'};
            this.prototype.isLoadingIndicator = true;
        }
        onDomRefresh() {
            const fn = () => {
                this.$el.find('.content').removeClass('hidden');
                return this.trigger('init');
            };
            return _.delay(fn, 250);
        }
        initialize() {
            return this.listenToOnce(this, 'init', () => {
                return this.indicator.show(new LoadingIndicatorView({model: this.model}));
            });
        }
    }
    SidebarLoadingIndicatorView.initClass();

    return {LoadingIndicatorView, SidebarLoadingIndicatorView};});

