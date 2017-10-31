/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const {SMLayout} = require('app/views/base');

    class MessageLayout extends SMLayout {
        static initClass() {
            // used to render a message or hint in the navigation region (sidebar)
            this.prototype.template = 'message-layout';
            this.prototype.className = 'navigation-element';
            this.prototype.regions = {messageContents: '.main-list .info-box'};
        }
        initialize({model}) { return this.childView = new this.childClass({model}); }
        onShow() { return this.messageContents.show(this.childView); }
    }
    MessageLayout.initClass();

    class InformationalMessageLayout extends SMLayout {
        static initClass() {
            // show the user a notification informing
            // that the current url route contains no
            // units (eg. due to an empty/non-existent service)
            this.prototype.template = 'message-informational';
            this.prototype.className = 'message-contents message-informational';
            this.prototype.tagName = 'p';
        }
    }
    InformationalMessageLayout.initClass();

    class InformationalMessageView extends MessageLayout {
        static initClass() {
            this.prototype.childClass = InformationalMessageLayout;
        }
    }
    InformationalMessageView.initClass();

    return {InformationalMessageView};});
