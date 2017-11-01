/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let TitleView;
    const URI  = require('URI');

    const p13n = require('app/p13n');
    const jade = require('app/jade');
    const base = require('app/views/base');

    return TitleView = (function() {
        TitleView = class TitleView extends base.SMItemView {
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
                this.render = this.render.bind(this);
            }

            static initClass() {
                this.prototype.className =
                    'title-control';
            }
            initialize({href}) {
                this.href = href;
            }
            render() {
                this.el.innerHTML = jade.template('embedded-title', {lang: p13n.getLanguage(), href: this.href});
                return this.el;
            }
        };
        TitleView.initClass();
        return TitleView;
    })();
});
