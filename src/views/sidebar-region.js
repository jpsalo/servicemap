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
    const _          = require('underscore');
    const Marionette = require('backbone.marionette');

    const jade       = require('app/jade');
    const animations = require('app/animations');

    var SidebarRegion = (function() {
        let SUPPORTED_ANIMATIONS = undefined;
        SidebarRegion = class SidebarRegion extends Marionette.Region {
            constructor(...args) {
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
                this._trigger = this._trigger.bind(this);
                this.show = this.show.bind(this);
            }

            static initClass() {

                SUPPORTED_ANIMATIONS = ['left', 'right'];
            }

            _trigger(eventName, view) {
                Marionette.triggerMethod.call(this, eventName, view);
                if (_.isFunction(view.triggerMethod)) {
                    return view.triggerMethod(eventName);
                } else {
                    return Marionette.triggerMethod.call(view, eventName);
                }
            }

            show(view, options) {
                const showOptions = options || {};
                this._ensureElement();
                const isViewClosed = view.isDestroyed || _.isUndefined(view.$el);
                const isDifferentView = view !== this.currentView;
                const preventClose =  !!showOptions.preventClose;
                const _shouldCloseView = !preventClose && isDifferentView;
                const { animationType } = showOptions;
                const $oldContent = this.currentView != null ? this.currentView.$el : undefined;

                const shouldAnimate = ($oldContent != null ? $oldContent.length : undefined) && Array.from(SUPPORTED_ANIMATIONS).includes(animationType) && (view.template != null);

                // RENDER WITH ANIMATIONS
                // ----------------------
                if (shouldAnimate) {
                    const data = (typeof view.serializeData === 'function' ? view.serializeData() : undefined) || {};
                    const templateString = jade.template(view.template, data);
                    const $container = this.$el;
                    const $newContent = view.$el.append($(templateString));

                    this._trigger('before:render', view);
                    this._trigger('before:show', view);

                    const animationCallback = () => {
                        if (_shouldCloseView) { this.close(); }
                        this.currentView = view;
                        this._trigger('render', view);
                        return this._trigger('show', view);
                    };

                    animations.render($container, $oldContent, $newContent, animationType, animationCallback);

                // RENDER WITHOUT ANIMATIONS
                // -------------------------
                } else {
                    // Close the old view
                    if (_shouldCloseView) { this.close(); }

                    view.render();
                    this._trigger('before:show', view);

                    // Attach the view's Html to the region's el
                    if (isDifferentView || isViewClosed) {
                        this.attachHtml(view);
                    }

                    this.currentView = view;
                    this._trigger('show', view);
                }

                return this;
            }

            // Close the currentView
            close() {
                const view = this.currentView;
                if (!view || view.isDestroyed) { return; }

                // call 'destroy' or 'remove', depending on which is found
                if (view.destroy) {
                    view.destroy();
                } else if (view.remove) {
                    view.remove();
                }

                Marionette.triggerMethod.call(this, 'destroy', view);
                return delete this.currentView;
            }
        };
        SidebarRegion.initClass();
        return SidebarRegion;
    })();

    return SidebarRegion;
});
